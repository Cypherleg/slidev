// Página do paciente (sem login): token longo do link, restrito ao episódio, com validade.
// Tudo como jornada_sistema; eventos com autor_papel 'paciente' e autor = ATOR_SISTEMA_ID.
// A página NÃO devolve o olho (a pergunta 1 do quiz confere o olho contra a agenda).

import {
  corrigirQuiz,
  montarEstado,
  perguntasQuiz,
  primeiroNome,
  projetarVisao,
  resumoDia,
  type Ator,
  type EntradaEstado,
  type EpisodioVisao,
  type NovoEvento,
} from '../dominio/index.ts'
import type { AcaoPaciente, AcoesPaciente } from './contrato.ts'
import type { Executor } from './db.ts'
import { erro } from './erros.ts'
import { formatoTokenValido, hashToken } from './link-paciente.ts'
import {
  ATOR_SISTEMA_ID,
  atualizarProjecao,
  buscarLinkPorHash,
  carregarEntrada,
  comoSistema,
  inserirEventos,
  materiaisPorIds,
  travarEpisodio,
} from './repositorio.ts'
import type { DepsApi } from './servico.ts'
import * as v from './validar.ts'

export interface ContextoPaciente {
  deps: DepsApi
  agora: Date
  link: { id: string; episodioId: string; expiraEm: string }
}

type Impl = { [A in AcaoPaciente]: (ctx: ContextoPaciente, dados: v.Obj) => Promise<AcoesPaciente[A]['S']> }

/** Leitor interno com visão completa: usado só no servidor para derivar o que a página mostra. */
const LEITOR_SISTEMA: Ator = { id: ATOR_SISTEMA_ID, nome: 'Sistema', papeis: ['gestora'], sessaoUsuarioId: ATOR_SISTEMA_ID, aparelhoId: null }

const LINK_INVALIDO = 'Link inválido ou expirado. Fale com a equipe do OFTA VITTA.'

export async function validarLinkPaciente(deps: DepsApi, token: unknown, agora: Date): Promise<ContextoPaciente['link']> {
  if (!formatoTokenValido(token)) throw erro('nao_encontrado', LINK_INVALIDO)
  const hash = await hashToken(token)
  const link = await deps.db.transacao(async tx => {
    await comoSistema(tx)
    return buscarLinkPorHash(tx, hash)
  })
  if (!link || link.revogadoEm || Date.parse(link.expiraEm) <= agora.getTime()) throw erro('nao_encontrado', LINK_INVALIDO)
  return { id: link.id, episodioId: link.episodioId, expiraEm: link.expiraEm }
}

interface Carga {
  entrada: EntradaEstado
  visao: EpisodioVisao
}

async function carregar(tx: Executor, ctx: ContextoPaciente): Promise<Carga> {
  await travarEpisodio(tx, ctx.link.episodioId)
  const entrada = await carregarEntrada(tx, ctx.link.episodioId, { tipo: 'completo' })
  if (!entrada) throw erro('nao_encontrado', LINK_INVALIDO)
  const visao = projetarVisao(montarEstado(entrada), LEITOR_SISTEMA, ctx.agora.toISOString())
  if (visao.episodio.estado === 'cancelado') throw erro('nao_encontrado', LINK_INVALIDO)
  return { entrada, visao }
}

/** Grava um evento do paciente (como jornada_sistema) e atualiza a projeção. */
async function gravarEventoPaciente(tx: Executor, ctx: ContextoPaciente, entrada: EntradaEstado, tipo: NovoEvento['tipo'], dados: Record<string, unknown>): Promise<EntradaEstado> {
  const ev: NovoEvento = {
    episodioId: entrada.episodio.id,
    pacienteId: entrada.paciente.id,
    tipo,
    dados,
    visibilidade: 'geral',
    autorId: ATOR_SISTEMA_ID,
    autorPapel: 'paciente',
    sessaoUsuarioId: null,
    aparelhoId: null,
    foraDeHora: false,
  }
  await comoSistema(tx)
  const eventos = await inserirEventos(tx, [ev], entrada.episodio.versao + 1)
  const nova: EntradaEstado = { ...entrada, episodio: { ...entrada.episodio, versao: entrada.episodio.versao + eventos.length }, eventos: [...entrada.eventos, ...eventos] }
  const estado = montarEstado(nova)
  await atualizarProjecao(tx, entrada.episodio.id, entrada.episodio.versao, { versao: nova.episodio.versao, estado: estado.estado, resumo: resumoDia(estado, ctx.agora.toISOString()) })
  return nova
}

function aprovou(visao: EpisodioVisao): boolean {
  return visao.materiais.quiz.some(t => t.aprovado)
}

function podeResponder(visao: EpisodioVisao): boolean {
  const contato = visao.materiais.contatoHumano?.motivo
  return !aprovou(visao) && visao.materiais.quiz.length < 2 && contato !== 'reprovacao_dupla' && contato !== 'erro_olho'
}

export const acoesPaciente: Impl = {
  async 'pagina.obter'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      let { entrada, visao } = await carregar(tx, ctx)
      if (!visao.materiais.abertoEm) {
        entrada = await gravarEventoPaciente(tx, ctx, entrada, 'material.aberto', { origem: 'pagina', linkId: ctx.link.id })
        visao = projetarVisao(montarEstado(entrada), LEITOR_SISTEMA, ctx.agora.toISOString())
      }
      const ids = [...new Set(visao.materiais.enviados.map(m => m.materialId))]
      const catalogo = await materiaisPorIds(tx, ids)
      const tentativas = visao.materiais.quiz
      const ultima = tentativas[tentativas.length - 1]
      return {
        primeiroNome: primeiroNome(entrada.paciente.nomeCompleto),
        materiais: catalogo.map(m => ({ id: m.id, titulo: m.titulo, tipo: m.tipo, url: m.url, conteudo: m.conteudo })),
        tcleLink: visao.tcle.link ?? null,
        quiz: perguntasQuiz(),
        tentativas: tentativas.length,
        podeResponder: podeResponder(visao),
        ultimaTentativa: ultima ? { aprovado: ultima.aprovado, em: ultima.em } : null,
        telefones: entrada.config.telefones,
      }
    })
  },

  async 'material.visualizado'(ctx, d) {
    const materialId = v.uuid(d.materialId, 'materialId')
    await ctx.deps.db.transacao(async tx => {
      const { entrada, visao } = await carregar(tx, ctx)
      const enviado = visao.materiais.enviados.find(m => m.materialId === materialId)
      if (!enviado) throw erro('nao_encontrado')
      await gravarEventoPaciente(tx, ctx, entrada, 'material.aberto', { origem: 'material', materialId, versao: enviado.versao, linkId: ctx.link.id })
    })
    return { ok: true }
  },

  async 'quiz.responder'(ctx, d) {
    const bruto = v.objetoObrigatorio(d.respostas, 'respostas')
    const respostas: Record<number, string> = {}
    for (const [k, valor] of Object.entries(bruto)) {
      if (!/^\d{1,2}$/.test(k)) throw erro('validacao', 'Resposta inválida.')
      respostas[Number(k)] = v.texto(valor, 'resposta', { max: 200 })
    }
    let quemInstila: { eu: boolean; nome?: string } | undefined
    if (d.quemInstila !== undefined && d.quemInstila !== null) {
      const q = v.objetoObrigatorio(d.quemInstila, 'quemInstila')
      const nome = v.textoOpcional(q.nome, 'quemInstila.nome', { max: 200 })
      quemInstila = { eu: v.booleano(q.eu, 'quemInstila.eu'), ...(nome ? { nome } : {}) }
    }
    return ctx.deps.db.transacao(async tx => {
      const { entrada, visao } = await carregar(tx, ctx)
      if (!podeResponder(visao)) throw erro('validacao', 'O questionário não está disponível. A equipe entrará em contato.')
      const tentativa = { ...corrigirQuiz(respostas, entrada.episodio.olho, quemInstila), em: ctx.agora.toISOString() }
      const nova = await gravarEventoPaciente(tx, ctx, entrada, 'quiz.respondido', { tentativa, respostas, linkId: ctx.link.id })
      const depois = projetarVisao(montarEstado(nova), LEITOR_SISTEMA, ctx.agora.toISOString())
      const proximaAcao = tentativa.aprovado ? 'concluido' : podeResponder(depois) ? 'rever_video_e_tentar_de_novo' : 'aguardar_contato_da_equipe'
      return { aprovado: tentativa.aprovado, proximaAcao }
    })
  },
}

export const ACOES_PACIENTE = Object.keys(acoesPaciente) as AcaoPaciente[]
