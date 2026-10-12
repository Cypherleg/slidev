// Núcleo da API: contexto da requisição (usuário, membro, ator), pipeline de comandos
// (decidir com o estado COMPLETO, gravar como o ator, responder com a visão filtrada) e
// leituras com registro de acesso.

import {
  montarEstado,
  decidir,
  projetarVisao,
  resumoDia,
  type Ator,
  type Comando,
  type ConfigJornada,
  type ContextoDecisao,
  type EntradaEstado,
  type EpisodioVisao,
  type Estado,
  type Evento,
  type ResultadoDecisao,
  type Papel,
} from '../dominio/index.ts'
import type { ArmazenamentoAnexos } from './armazenamento.ts'
import type { Autenticador, UsuarioAuth } from './auth.ts'
import type { ConfigApi } from './config.ts'
import type { ClienteDatasigh } from './datasigh.ts'
import type { Db, Executor } from './db.ts'
import { erro } from './erros.ts'
import type { Logger } from './logger.ts'
import {
  atorViuConferencia1,
  atualizarProjecao,
  carregarEntrada,
  comoApi,
  comoSistema,
  inserirEventos,
  inserirMensagens,
  inserirRegistrosLente,
  lerConfigJornada,
  novoCache,
  registrarAcesso,
  registrarAparelho,
  travarEpisodio,
  type CamposAgenda,
  type CacheCarga,
  type ContextoAtorDb,
  type MembroDb,
  type MensagemDb,
  mensagemPublica,
} from './repositorio.ts'

export interface DepsApi {
  config: ConfigApi
  db: Db
  autenticador: Autenticador
  datasigh: ClienteDatasigh
  armazenamento: ArmazenamentoAnexos
  logger: Logger
  relogio: () => Date
  gerarId: () => string
}

export interface ContextoReq {
  deps: DepsApi
  usuario: UsuarioAuth
  /** Quem fez o login (sessão Supabase). */
  membro: MembroDb
  /** Quem age: o membro da sessão ou o membro identificado por PIN. */
  ator: Ator
  atorViaPin: { expiraEm: string; jti: string } | null
  aparelhoId: string | null
  agora: Date
}

export const atorDb = (ctx: ContextoReq): ContextoAtorDb => ({ atorId: ctx.ator.id, sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId })

export const agoraIso = (ctx: { agora: Date }) => ctx.agora.toISOString()

export function contextoDecisao(ctx: ContextoReq, config: ConfigJornada, extra: Partial<ContextoDecisao> = {}): ContextoDecisao {
  return {
    ator: ctx.ator,
    agora: agoraIso(ctx),
    gerarId: ctx.deps.gerarId,
    config,
    envioHabilitado: ctx.deps.config.envioHabilitado,
    ...(ctx.deps.config.urlPaginaPaciente ? { urlPaginaPaciente: ctx.deps.config.urlPaginaPaciente } : {}),
    ...extra,
  }
}

export function temPapel(ator: { papeis: Papel[] }, ...papeis: Papel[]): boolean {
  return ator.papeis.some(p => papeis.includes(p))
}

/** Ações de gestão: gestora, com o próprio login (sem troca por PIN). */
export function exigirGestora(ctx: ContextoReq): void {
  if (!temPapel(ctx.ator, 'gestora')) throw erro('sem_permissao')
  if (ctx.atorViaPin && ctx.ator.id !== ctx.membro.id) throw erro('sem_permissao', 'Ações de gestão exigem o login da própria gestora (sem troca por PIN).')
}

// ---------------------------------------------------------------------------
// Conferência cega: o que a resposta expôs do checkpoint 1
// ---------------------------------------------------------------------------

/** A entrada (já filtrada pela RLS) contém algo do checkpoint 1? */
export function entradaTemConferencia1(entrada: EntradaEstado): boolean {
  return entrada.eventos.some(e => e.visibilidade === 'conferencia_1') || entrada.lente.some(l => l.visibilidade === 'conferencia_1' || l.etapa === 'plano' || l.etapa === 'chegada')
}

/** Registra a leitura do episódio e, se a resposta podia conter valores do checkpoint 1, `lente_conferencia_1`. */
export async function registrarLeituraEpisodio(tx: Executor, ctx: ContextoReq, entradaFiltrada: EntradaEstado, recurso: 'episodio' | 'etiquetas' | 'anexo' = 'episodio', forcarCp1 = false): Promise<void> {
  const ator = atorDb(ctx)
  await registrarAcesso(tx, ator, recurso, { episodioId: entradaFiltrada.episodio.id, pacienteId: entradaFiltrada.paciente.id })
  if (forcarCp1 || entradaTemConferencia1(entradaFiltrada)) {
    await registrarAcesso(tx, ator, 'lente_conferencia_1', { episodioId: entradaFiltrada.episodio.id })
  }
}

/** Lê a visão do episódio como o ator (RLS + projeção do domínio) e registra o acesso. Deixa o papel em jornada_api. */
export async function lerVisao(tx: Executor, ctx: ContextoReq, episodioId: string, cache?: CacheCarga): Promise<EpisodioVisao> {
  const entrada = await carregarEntrada(tx, episodioId, { tipo: 'ator', ator: atorDb(ctx) }, cache)
  if (!entrada) throw erro('nao_encontrado')
  const visao = projetarVisao(montarEstado(entrada), ctx.ator, agoraIso(ctx))
  await registrarLeituraEpisodio(tx, ctx, entrada)
  return visao
}

// ---------------------------------------------------------------------------
// Pipeline de comando sobre um episódio
// ---------------------------------------------------------------------------

export interface OpcoesComando {
  /** Executado depois da decisão e antes de gravar (ex.: subir anexo, criar link). Papel: jornada_api. */
  antesDeGravar?: (tx: Executor, r: ResultadoDecisao, estado: Estado, entrada: EntradaEstado) => Promise<void>
  /** Campos da agenda a projetar em `episodios` (episodio.agendar). */
  agenda?: (entrada: EntradaEstado) => CamposAgenda | null
  /** Extra no ContextoDecisao. */
  ctxExtra?: Partial<ContextoDecisao>
  /** Executado depois de gravar, como jornada_api (ex.: revogar links no cancelamento). */
  depoisDeGravar?: (tx: Executor, eventos: Evento[], estadoNovo: Estado) => Promise<void>
}

/**
 * 1) trava o episódio; 2) como jornada_sistema carrega o estado COMPLETO e confere a versão;
 * 3) domínio decide; 4) como jornada_api grava eventos (seq contínuo), lente e mensagens;
 * 5) atualiza a projeção `episodios` com checagem de versão; 6) lê a resposta como o ator.
 */
export async function executarComando(
  ctx: ContextoReq,
  episodioId: string,
  versaoEsperada: number,
  construir: (estado: Estado, entrada: EntradaEstado) => Comando | Promise<Comando>,
  opcoes: OpcoesComando = {},
): Promise<EpisodioVisao> {
  if (!Number.isInteger(versaoEsperada) || versaoEsperada < 0) throw erro('validacao', 'Versão inválida.')
  return ctx.deps.db.transacao(async tx => {
    await travarEpisodio(tx, episodioId)
    const cache = novoCache()
    const entrada = await carregarEntrada(tx, episodioId, { tipo: 'completo' }, cache)
    if (!entrada) throw erro('nao_encontrado')
    if (entrada.episodio.versao !== versaoEsperada) throw erro('conflito_versao', undefined, { versaoAtual: entrada.episodio.versao })
    const viu = await atorViuConferencia1(tx, ctx.ator.id, episodioId)
    const estado = montarEstado(entrada)
    const comando = await construir(estado, entrada)
    const resultado = decidir(estado, comando, contextoDecisao(ctx, entrada.config, { atorViuConferencia1: viu, ...opcoes.ctxExtra }))
    const { estadoNovo, eventos } = await gravarResultado(tx, ctx, entrada, resultado, opcoes)
    if (opcoes.depoisDeGravar) await opcoes.depoisDeGravar(tx, eventos, estadoNovo)
    return lerVisao(tx, ctx, episodioId, cache)
  })
}

/** Grava o resultado da decisão como o ator e atualiza a projeção. Deixa o papel em jornada_api. */
export async function gravarResultado(
  tx: Executor,
  ctx: ContextoReq,
  entrada: EntradaEstado,
  resultado: ResultadoDecisao,
  opcoes: Pick<OpcoesComando, 'antesDeGravar' | 'agenda'> = {},
): Promise<{ estadoNovo: Estado; eventos: Evento[]; mensagens: MensagemDb[] }> {
  await comoApi(tx, atorDb(ctx))
  if (opcoes.antesDeGravar) await opcoes.antesDeGravar(tx, resultado, montarEstado(entrada), entrada)
  const episodioId = entrada.episodio.id
  const eventosDoEpisodio = resultado.eventos.filter(e => e.episodioId === episodioId)
  const outros = resultado.eventos.filter(e => e.episodioId !== episodioId)
  if (outros.some(e => e.episodioId !== null)) throw erro('indisponivel') // o domínio só grava no episódio do comando
  if (eventosDoEpisodio.length || resultado.lente.length || resultado.mensagens.length) await registrarAparelho(tx, ctx.aparelhoId)
  const eventos = await inserirEventos(tx, eventosDoEpisodio, entrada.episodio.versao + 1)
  if (outros.length) await inserirEventos(tx, outros, null)
  const lente = await inserirRegistrosLente(tx, resultado.lente)
  const mensagens = await inserirMensagens(tx, episodioId, resultado.mensagens, ctx.ator.id, ctx.deps.config.envioHabilitado)
  const novaVersao = entrada.episodio.versao + eventos.length
  const entradaNova: EntradaEstado = {
    ...entrada,
    episodio: { ...entrada.episodio, versao: novaVersao },
    eventos: [...entrada.eventos, ...eventos],
    lente: [...entrada.lente, ...lente],
    mensagens: [...entrada.mensagens, ...mensagens.map(mensagemPublica)],
  }
  const agenda = opcoes.agenda ? opcoes.agenda(entradaNova) : null
  if (agenda) entradaNova.episodio = { ...entradaNova.episodio, ...agenda }
  const estadoNovo = montarEstado(entradaNova)
  await atualizarProjecao(tx, episodioId, entrada.episodio.versao, {
    versao: novaVersao,
    estado: estadoNovo.estado,
    resumo: resumoDia(estadoNovo, agoraIso(ctx)),
    agenda,
  })
  return { estadoNovo, eventos, mensagens }
}

/** Config da jornada (tabela sobre o padrão), lida como jornada_sistema. */
export async function configJornada(tx: Executor): Promise<ConfigJornada> {
  await comoSistema(tx)
  return lerConfigJornada(tx)
}
