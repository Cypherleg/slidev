// Repositório SQL do schema `jornada_cirurgica` (ARQUITETURA §4).
// Papéis de banco por transação:
//  - `jornada_sistema`: carrega o estado COMPLETO para decidir; tarefas sem usuário.
//  - `jornada_api` + set_config('jornada.ator'|'jornada.sessao'|'jornada.aparelho'): grava e lê
//    a resposta; a RLS filtra as conferências (visibilidade) pelo papel do ator.
// Nenhuma função aqui registra log; nenhuma mensagem de erro carrega valores.

import {
  configPadrao,
  modelosPadrao,
  ORDEM_MODELOS,
  type ConfigJornada,
  type EntradaEstado,
  type Evento,
  type MensagemSaida,
  type ModeloChecklist,
  type ModeloId,
  type NovaMensagem,
  type NovoEvento,
  type NovoRegistroLente,
  type Olho,
  type Paciente,
  type Papel,
  type RegistroLente,
  type EstadoEpisodio,
  type DadosEpisodioBase,
  type EstadoMensagem,
  type GatilhoAviso,
  type MaterialCatalogo,
  mascararTelefone,
} from '../dominio/index.ts'
import type { Executor } from './db.ts'
import { iso, isoOuNull, textoOuNull } from './db.ts'
import { erro } from './erros.ts'
import { textoParaExibicao } from './link-paciente.ts'

export const S = 'jornada_cirurgica'

/**
 * Ator "sistema": autor dos eventos sem pessoa (página do paciente, fila de saída).
 * UUID fixo e documentado (docs/notas-agentes/api.md). Nunca é um membro.
 */
export const ATOR_SISTEMA_ID = '00000000-0000-4000-8000-000000000000'

export interface ContextoAtorDb {
  atorId: string
  sessaoUsuarioId: string
  aparelhoId: string | null
}

export async function comoSistema(tx: Executor): Promise<void> {
  await tx.consulta('set local role jornada_sistema')
}

export async function comoApi(tx: Executor, ator: ContextoAtorDb): Promise<void> {
  await tx.consulta('set local role jornada_api')
  await tx.consulta(
    `select set_config('jornada.ator', $1, true), set_config('jornada.sessao', $2, true), set_config('jornada.aparelho', $3, true)`,
    [ator.atorId, ator.sessaoUsuarioId, ator.aparelhoId ?? ''],
  )
}

/** Serializa escritas no mesmo episódio (não exige privilégio de UPDATE). */
export async function travarEpisodio(tx: Executor, episodioId: string): Promise<void> {
  await tx.consulta(`select pg_advisory_xact_lock(hashtextextended($1::text, 7351))`, [episodioId])
}

// ---------------------------------------------------------------------------
// Membros e convites
// ---------------------------------------------------------------------------

export interface MembroDb {
  id: string
  email: string
  nome: string
  papeis: Papel[]
  ativo: boolean
  temPin: boolean
}

const COLS_MEMBRO = 'user_id, email, nome, papeis, ativo, tem_pin'

function linhaMembro(l: Record<string, unknown>): MembroDb {
  return {
    id: String(l.user_id),
    email: String(l.email ?? ''),
    nome: String(l.nome ?? ''),
    papeis: (l.papeis as Papel[]) ?? [],
    ativo: Boolean(l.ativo),
    temPin: Boolean(l.tem_pin),
  }
}

export async function buscarMembro(tx: Executor, userId: string): Promise<MembroDb | null> {
  const r = await tx.consulta(`select ${COLS_MEMBRO} from ${S}.membros where user_id = $1::uuid`, [userId])
  return r[0] ? linhaMembro(r[0]) : null
}

export async function buscarMembroPorEmail(tx: Executor, email: string): Promise<MembroDb | null> {
  const r = await tx.consulta(`select ${COLS_MEMBRO} from ${S}.membros where email = $1`, [email])
  return r[0] ? linhaMembro(r[0]) : null
}

/** Hash do PIN: só como jornada_sistema (jornada_api não lê a coluna). */
export async function pinHashDoMembro(tx: Executor, userId: string): Promise<string | null> {
  const r = await tx.consulta(`select pin_hash from ${S}.membros where user_id = $1::uuid and ativo`, [userId])
  return r[0] ? textoOuNull(r[0].pin_hash) : null
}

export interface ConviteDb {
  email: string
  nome: string
  papeis: Papel[]
  ativo: boolean
  vinculadoUserId: string | null
}

export async function buscarConvite(tx: Executor, email: string): Promise<ConviteDb | null> {
  const r = await tx.consulta(`select email, nome, papeis, ativo, vinculado_user_id from ${S}.convites where email = $1`, [email])
  const l = r[0]
  if (!l) return null
  return { email: String(l.email), nome: String(l.nome), papeis: l.papeis as Papel[], ativo: Boolean(l.ativo), vinculadoUserId: textoOuNull(l.vinculado_user_id) }
}

/**
 * Inscrição no primeiro acesso (como jornada_sistema), pela função do banco
 * `inscrever_por_email`: e-mail do Auth verificado, nunca do corpo. Sem convite ativo: null.
 */
export async function inscreverPorEmail(tx: Executor, userId: string, email: string): Promise<MembroDb | null> {
  const r = await tx.consulta(`select ${COLS_MEMBRO} from ${S}.inscrever_por_email($1::uuid, $2)`, [userId, email])
  return r[0] ? linhaMembro(r[0]) : null
}

export async function membrosAtivos(tx: Executor): Promise<{ id: string; nome: string; papeis: Papel[] }[]> {
  const r = await tx.consulta(`select user_id, nome, papeis from ${S}.membros where ativo order by nome`)
  return r.map(l => ({ id: String(l.user_id), nome: String(l.nome), papeis: l.papeis as Papel[] }))
}

export async function todosMembros(tx: Executor): Promise<Record<string, { id: string; nome: string; papeis: Papel[] }>> {
  const r = await tx.consulta(`select user_id, nome, papeis from ${S}.membros`)
  const out: Record<string, { id: string; nome: string; papeis: Papel[] }> = {}
  for (const l of r) out[String(l.user_id)] = { id: String(l.user_id), nome: String(l.nome), papeis: l.papeis as Papel[] }
  return out
}

// ---------------------------------------------------------------------------
// Acessos (registro que só cresce; sem dado de paciente no detalhe)
// ---------------------------------------------------------------------------

export type RecursoAcesso =
  | 'episodio'
  | 'paciente'
  | 'cpf_consulta'
  | 'dia'
  | 'pin_falha'
  | 'anexo'
  | 'etiquetas'
  | 'lente_conferencia_1'
  | 'pendencias'
  | 'indicadores'
  | 'mensagens'
  | 'materiais_previa'
  | 'ator_encerrado'
  | 'pin_tentativa'
  | 'pin_ok'
  | 'confirmacao_usada'
  | 'pagina_paciente'

export async function registrarAcesso(
  tx: Executor,
  ator: ContextoAtorDb,
  recurso: RecursoAcesso,
  alvo: { episodioId?: string | null; pacienteId?: string | null; detalhe?: Record<string, string | number | boolean | null> } = {},
): Promise<void> {
  await tx.consulta(
    `insert into ${S}.acessos (ator_id, sessao_usuario_id, aparelho_id, recurso, episodio_id, paciente_id, detalhe) values ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::jsonb)`,
    [ator.atorId, ator.sessaoUsuarioId, ator.aparelhoId, recurso, alvo.episodioId ?? null, alvo.pacienteId ?? null, alvo.detalhe ?? {}],
  )
}

/** Contagem (como jornada_sistema: a leitura de `acessos` pela API é só da gestora). */
export async function contarAcessos(
  tx: Executor,
  filtro: { recurso: RecursoAcesso; desde: string; sessaoUsuarioId?: string; atorId?: string; alvo?: string },
): Promise<number> {
  const cond = ['recurso = $1', 'registrado_em >= $2::timestamptz']
  const p: unknown[] = [filtro.recurso, filtro.desde]
  if (filtro.sessaoUsuarioId) {
    p.push(filtro.sessaoUsuarioId)
    cond.push(`sessao_usuario_id = $${p.length}::uuid`)
  }
  if (filtro.atorId) {
    p.push(filtro.atorId)
    cond.push(`ator_id = $${p.length}::uuid`)
  }
  if (filtro.alvo) {
    p.push(filtro.alvo)
    cond.push(`detalhe->>'alvo' = $${p.length}`)
  }
  const r = await tx.consulta<{ n: string }>(`select count(*)::text as n from ${S}.acessos where ${cond.join(' and ')}`, p)
  return Number(r[0]?.n ?? 0)
}

export async function atorViuConferencia1(tx: Executor, atorId: string, episodioId: string): Promise<boolean> {
  const r = await tx.consulta(`select 1 from ${S}.acessos where ator_id = $1::uuid and episodio_id = $2::uuid and recurso = 'lente_conferencia_1' limit 1`, [atorId, episodioId])
  return r.length > 0
}

// ---------------------------------------------------------------------------
// Config e modelos
// ---------------------------------------------------------------------------

export async function lerConfigJornada(tx: Executor): Promise<ConfigJornada> {
  const base = configPadrao()
  const r = await tx.consulta(`select chave, valor from ${S}.config`)
  const out: Record<string, unknown> = { ...base }
  for (const l of r) {
    const chave = String(l.chave)
    if (chave in base) out[chave] = l.valor
  }
  return out as unknown as ConfigJornada
}

export interface ModeloLinha {
  id: ModeloId
  versao: string
  publicadoEm: string
  conteudo: ModeloChecklist
}

export async function listarModelos(tx: Executor): Promise<ModeloLinha[]> {
  const r = await tx.consulta(`select id, versao, conteudo, publicado_em from ${S}.modelos_checklist order by id, publicado_em, versao`)
  return r.map(l => ({ id: l.id as ModeloId, versao: String(l.versao), publicadoEm: iso(l.publicado_em), conteudo: l.conteudo as ModeloChecklist }))
}

/**
 * Versão ativa de cada modelo (a última publicada). Se a tabela não tiver um modelo,
 * grava a versão de `modelosPadrao()` como jornada_sistema (em savepoint: sem a concessão,
 * usa o padrão em memória — `carregarModelosVersoes` reconhece a mesma versão).
 * Deixa o papel em jornada_sistema.
 */
export async function modelosAtivos(tx: Executor): Promise<Record<ModeloId, ModeloLinha>> {
  await comoSistema(tx)
  const todos = await listarModelos(tx)
  const ativos = {} as Record<ModeloId, ModeloLinha>
  for (const m of todos) ativos[m.id] = m // ordenado por publicado_em: o último vence
  const faltam = ORDEM_MODELOS.filter(id => !ativos[id])
  if (faltam.length) {
    const padrao = modelosPadrao()
    for (const id of faltam) {
      const modelo = padrao[id]
      if (!modelo) continue
      let publicadoEm = new Date().toISOString()
      await tx.consulta('savepoint jc_modelo_padrao')
      try {
        const r = await tx.consulta(
          `insert into ${S}.modelos_checklist (id, versao, conteudo, publicado_por) values ($1, $2, $3::jsonb, null)
           on conflict do nothing returning publicado_em`,
          [id, modelo.versao, modelo],
        )
        if (r[0]) publicadoEm = iso(r[0].publicado_em)
        await tx.consulta('release savepoint jc_modelo_padrao')
      } catch {
        await tx.consulta('rollback to savepoint jc_modelo_padrao')
        await comoSistema(tx)
      }
      ativos[id] = { id, versao: modelo.versao, publicadoEm, conteudo: modelo }
    }
  }
  return ativos
}

export async function carregarModelosVersoes(tx: Executor, versoes: Partial<Record<ModeloId, string>>, cache: Map<string, ModeloChecklist>): Promise<Record<ModeloId, ModeloChecklist>> {
  const out = {} as Record<ModeloId, ModeloChecklist>
  const faltam: { id: string; versao: string }[] = []
  for (const [id, versao] of Object.entries(versoes)) {
    if (!versao) continue
    const c = cache.get(`${id}@${versao}`)
    if (c) out[id as ModeloId] = c
    else faltam.push({ id, versao })
  }
  if (faltam.length) {
    const r = await tx.consulta(
      `select m.id, m.versao, m.conteudo from ${S}.modelos_checklist m
       join jsonb_to_recordset($1::jsonb) as f(id text, versao text) on f.id = m.id and f.versao = m.versao`,
      [faltam],
    )
    for (const l of r) {
      cache.set(`${l.id}@${l.versao}`, l.conteudo as ModeloChecklist)
      out[l.id as ModeloId] = l.conteudo as ModeloChecklist
    }
    // Versão do padrão ainda não gravada na tabela: usa o padrão em memória.
    const pendentes = faltam.filter(f => !out[f.id as ModeloId])
    if (pendentes.length) {
      const padrao = modelosPadrao()
      for (const f of pendentes) {
        const m = padrao[f.id as ModeloId]
        if (m && m.versao === f.versao) {
          cache.set(`${f.id}@${f.versao}`, m)
          out[f.id as ModeloId] = m
        }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------

const COLS_PACIENTE = `id, nome_completo, data_nascimento::text as data_nascimento, nome_mae, prontuario, datasigh_id, conferido_datasigh`

function linhaPaciente(l: Record<string, unknown>): Paciente {
  return {
    id: String(l.id),
    nomeCompleto: String(l.nome_completo),
    dataNascimento: String(l.data_nascimento),
    nomeMae: textoOuNull(l.nome_mae),
    prontuario: textoOuNull(l.prontuario),
    datasighId: textoOuNull(l.datasigh_id),
    conferidoDatasigh: Boolean(l.conferido_datasigh),
  }
}

export async function buscarPaciente(tx: Executor, id: string): Promise<Paciente | null> {
  const r = await tx.consulta(`select ${COLS_PACIENTE} from ${S}.pacientes where id = $1::uuid`, [id])
  return r[0] ? linhaPaciente(r[0]) : null
}

export async function buscarPacientePorChave(tx: Executor, chave: { cpfHmac?: string | null; datasighId?: string | null }): Promise<Paciente | null> {
  if (chave.cpfHmac) {
    const r = await tx.consulta(`select ${COLS_PACIENTE} from ${S}.pacientes where cpf_hmac = $1`, [chave.cpfHmac])
    if (r[0]) return linhaPaciente(r[0])
  }
  if (chave.datasighId) {
    const r = await tx.consulta(`select ${COLS_PACIENTE} from ${S}.pacientes where datasigh_id = $1`, [chave.datasighId])
    if (r[0]) return linhaPaciente(r[0])
  }
  return null
}

export async function inserirPaciente(
  tx: Executor,
  p: Paciente & { cpfHmac: string | null; nomeNormalizado: string; criadoPor: string },
): Promise<void> {
  await tx.consulta(
    `insert into ${S}.pacientes (id, datasigh_id, cpf_hmac, nome_completo, nome_normalizado, data_nascimento, nome_mae, prontuario, conferido_datasigh, criado_por)
     values ($1::uuid, $2, $3, $4, $5, $6::date, $7, $8, $9, $10::uuid)`,
    [p.id, p.datasighId, p.cpfHmac, p.nomeCompleto, p.nomeNormalizado, p.dataNascimento, p.nomeMae, p.prontuario, p.conferidoDatasigh, p.criadoPor],
  )
}

const COLUNA_PACIENTE: Record<'nomeCompleto' | 'dataNascimento' | 'nomeMae' | 'prontuario', string> = {
  nomeCompleto: 'nome_completo',
  dataNascimento: 'data_nascimento',
  nomeMae: 'nome_mae',
  prontuario: 'prontuario',
}

export async function atualizarCampoPaciente(
  tx: Executor,
  pacienteId: string,
  campo: keyof typeof COLUNA_PACIENTE,
  valor: string | null,
  nomeNormalizado: string | null,
): Promise<void> {
  const col = COLUNA_PACIENTE[campo]
  const cast = campo === 'dataNascimento' ? '::date' : ''
  const extra = nomeNormalizado !== null ? `, nome_normalizado = $3` : ''
  const p: unknown[] = [pacienteId, valor]
  if (nomeNormalizado !== null) p.push(nomeNormalizado)
  const r = await tx.consulta(`update ${S}.pacientes set ${col} = $2${cast}${extra}, atualizado_em = now() where id = $1::uuid returning id`, p)
  if (!r.length) throw erro('nao_encontrado')
}

export async function episodiosDoPaciente(tx: Executor, pacienteId: string): Promise<{ id: string; olho: Olho; estado: string; dataCirurgia: string | null }[]> {
  const r = await tx.consulta(`select id, olho, estado, data_cirurgia::text as data_cirurgia from ${S}.episodios where paciente_id = $1::uuid order by aberto_em`, [pacienteId])
  return r.map(l => ({ id: String(l.id), olho: l.olho as Olho, estado: String(l.estado), dataCirurgia: textoOuNull(l.data_cirurgia) }))
}

// ---------------------------------------------------------------------------
// Episódios: carga do estado (EntradaEstado), em lote
// ---------------------------------------------------------------------------

interface LinhaEpisodio {
  base: DadosEpisodioBase
  estado: EstadoEpisodio
  resumo: unknown
}

const COLS_EPISODIO = `id, paciente_id, olho, cirurgiao_id, tipo_cirurgia, tipo_lente, data_sugerida::text as data_sugerida,
  data_cirurgia::text as data_cirurgia, to_char(horario, 'HH24:MI') as horario, ordem, estado, versao, versoes_modelos, aberto_em, resumo`

function linhaEpisodio(l: Record<string, unknown>): LinhaEpisodio {
  return {
    base: {
      id: String(l.id),
      pacienteId: String(l.paciente_id),
      olho: l.olho as Olho,
      cirurgiaoId: String(l.cirurgiao_id),
      tipoCirurgia: String(l.tipo_cirurgia),
      tipoLente: String(l.tipo_lente),
      dataSugerida: textoOuNull(l.data_sugerida),
      dataCirurgia: textoOuNull(l.data_cirurgia),
      horario: textoOuNull(l.horario),
      ordem: l.ordem === null || l.ordem === undefined ? null : Number(l.ordem),
      versao: Number(l.versao),
      abertoEm: iso(l.aberto_em),
      versoesModelos: (l.versoes_modelos ?? {}) as Record<ModeloId, string>,
    },
    estado: l.estado as EstadoEpisodio,
    resumo: l.resumo,
  }
}

export async function buscarEpisodioBase(tx: Executor, id: string): Promise<LinhaEpisodio | null> {
  const r = await tx.consulta(`select ${COLS_EPISODIO} from ${S}.episodios where id = $1::uuid`, [id])
  return r[0] ? linhaEpisodio(r[0]) : null
}

function linhaEvento(l: Record<string, unknown>): Evento {
  return {
    id: String(l.id),
    episodioId: textoOuNull(l.episodio_id),
    pacienteId: textoOuNull(l.paciente_id),
    seq: l.seq === null || l.seq === undefined ? null : Number(l.seq),
    tipo: l.tipo as Evento['tipo'],
    dados: (l.dados ?? {}) as Record<string, unknown>,
    visibilidade: l.visibilidade as Evento['visibilidade'],
    autorId: String(l.autor_id),
    autorPapel: l.autor_papel as Evento['autorPapel'],
    sessaoUsuarioId: textoOuNull(l.sessao_usuario_id),
    aparelhoId: textoOuNull(l.aparelho_id),
    registradoEm: iso(l.registrado_em),
    foraDeHora: Boolean(l.fora_de_hora),
    motivoForaDeHora: textoOuNull(l.motivo_fora_de_hora),
    versaoModelo: textoOuNull(l.versao_modelo),
  }
}

function linhaLente(l: Record<string, unknown>): RegistroLente {
  return {
    id: String(l.id),
    episodioId: String(l.episodio_id),
    ciclo: Number(l.ciclo),
    etapa: l.etapa as RegistroLente['etapa'],
    dados: l.dados as RegistroLente['dados'],
    autorId: String(l.autor_id),
    registradoEm: iso(l.registrado_em),
    visibilidade: l.visibilidade as RegistroLente['visibilidade'],
  }
}

export interface MensagemDb extends MensagemSaida {
  telefone: string
  chaveIdempotencia: string
  tentativas: number
  provedorId: string | null
  parametros: Record<string, string>
}

function linhaMensagem(l: Record<string, unknown>): MensagemDb {
  const telefone = String(l.telefone ?? '')
  return {
    id: String(l.id),
    episodioId: String(l.episodio_id),
    gatilho: l.gatilho as GatilhoAviso,
    contatoId: String(l.contato_id),
    destinoMascarado: telefone ? mascararTelefone(telefone) : '',
    texto: String(l.texto),
    modeloMeta: textoOuNull(l.modelo_meta),
    estado: l.estado as EstadoMensagem,
    criadoEm: iso(l.criado_em),
    atualizadoEm: iso(l.atualizado_em),
    telefone,
    chaveIdempotencia: String(l.chave_idempotencia ?? ''),
    tentativas: Number(l.tentativas ?? 0),
    provedorId: textoOuNull(l.provedor_id),
    parametros: (l.parametros ?? {}) as Record<string, string>,
  }
}

/** MensagemSaida sem o telefone completo (o que sai na resposta). */
export function mensagemPublica(m: MensagemDb): MensagemSaida {
  return {
    id: m.id,
    episodioId: m.episodioId,
    gatilho: m.gatilho,
    contatoId: m.contatoId,
    destinoMascarado: m.destinoMascarado,
    texto: textoParaExibicao(m.texto),
    modeloMeta: m.modeloMeta,
    estado: m.estado,
    criadoEm: m.criadoEm,
    atualizadoEm: m.atualizadoEm,
  }
}

export async function mensagensDosEpisodios(tx: Executor, ids: string[]): Promise<MensagemDb[]> {
  if (!ids.length) return []
  const r = await tx.consulta(
    `select id, episodio_id, gatilho, contato_id, telefone, texto, modelo_meta, parametros, chave_idempotencia, estado, tentativas, provedor_id, criado_em, atualizado_em
     from ${S}.mensagens_saida where episodio_id = any($1::uuid[]) order by criado_em, id`,
    [ids],
  )
  return r.map(linhaMensagem)
}

export type ModoCarga = { tipo: 'completo' } | { tipo: 'ator'; ator: ContextoAtorDb }

export interface CacheCarga {
  modelos: Map<string, ModeloChecklist>
  config?: ConfigJornada
  membros?: Record<string, { id: string; nome: string; papeis: Papel[] }>
}

export const novoCache = (): CacheCarga => ({ modelos: new Map() })

/**
 * Carrega o estado de entrada de vários episódios.
 * Episódio, paciente, mensagens, membros, contexto e config são lidos como jornada_sistema
 * (não carregam conferências). Eventos e registros de lente: completos (`completo`) ou
 * filtrados pela RLS do ator (`ator`). Ao final o papel fica em jornada_api no modo `ator`
 * e em jornada_sistema no modo `completo`.
 */
export async function carregarEntradas(tx: Executor, ids: string[], modo: ModoCarga, cache: CacheCarga = novoCache()): Promise<Map<string, EntradaEstado>> {
  const out = new Map<string, EntradaEstado>()
  await comoSistema(tx)
  if (!ids.length) {
    if (modo.tipo === 'ator') await comoApi(tx, modo.ator)
    return out
  }
  const eps = (await tx.consulta(`select ${COLS_EPISODIO} from ${S}.episodios where id = any($1::uuid[])`, [ids])).map(linhaEpisodio)
  if (!eps.length) {
    if (modo.tipo === 'ator') await comoApi(tx, modo.ator)
    return out
  }
  const pacIds = [...new Set(eps.map(e => e.base.pacienteId))]
  const pacientes = new Map(
    (await tx.consulta(`select ${COLS_PACIENTE} from ${S}.pacientes where id = any($1::uuid[])`, [pacIds])).map(l => [String(l.id), linhaPaciente(l)] as const),
  )
  cache.config ??= await lerConfigJornada(tx)
  cache.membros ??= await todosMembros(tx)
  const mensagens = await mensagensDosEpisodios(tx, eps.map(e => e.base.id))

  // Contexto: mesmo dia e episódios anteriores do paciente.
  const datas = [...new Set(eps.map(e => e.base.dataCirurgia).filter((d): d is string => Boolean(d)))]
  const mesmoDia = datas.length
    ? await tx.consulta(
        `select e.id, e.paciente_id, e.data_cirurgia::text as data_cirurgia, p.nome_completo, p.data_nascimento::text as data_nascimento
         from ${S}.episodios e join ${S}.pacientes p on p.id = e.paciente_id
         where e.data_cirurgia = any($1::date[]) and e.estado <> 'cancelado'`,
        [datas],
      )
    : []
  const anteriores = await tx.consulta(
    `select id, paciente_id, olho, data_cirurgia::text as data_cirurgia, estado, aberto_em from ${S}.episodios where paciente_id = any($1::uuid[]) order by aberto_em`,
    [pacIds],
  )

  // Modelos por versão
  const versoes: Record<string, string>[] = eps.map(e => e.base.versoesModelos as Record<string, string>)
  const modelosPorEp = new Map<string, Record<ModeloId, ModeloChecklist>>()
  for (let i = 0; i < eps.length; i++) modelosPorEp.set(eps[i].base.id, await carregarModelosVersoes(tx, versoes[i] as Record<ModeloId, string>, cache.modelos))

  if (modo.tipo === 'ator') await comoApi(tx, modo.ator)
  const epIds = eps.map(e => e.base.id)
  const eventos = (
    await tx.consulta(
      `select id::text as id, episodio_id, paciente_id, seq, tipo, dados, visibilidade, autor_id, autor_papel, sessao_usuario_id, aparelho_id,
              registrado_em, fora_de_hora, motivo_fora_de_hora, versao_modelo
       from ${S}.eventos where episodio_id = any($1::uuid[]) order by episodio_id, seq`,
      [epIds],
    )
  ).map(linhaEvento)
  const lente = (
    await tx.consulta(
      `select id, episodio_id, ciclo, etapa, dados, visibilidade, autor_id, registrado_em from ${S}.lente_registros
       where episodio_id = any($1::uuid[]) order by registrado_em, id`,
      [epIds],
    )
  ).map(linhaLente)

  for (const ep of eps) {
    const paciente = pacientes.get(ep.base.pacienteId)
    if (!paciente) continue
    out.set(ep.base.id, {
      episodio: ep.base,
      paciente,
      eventos: eventos.filter(e => e.episodioId === ep.base.id),
      lente: lente.filter(l => l.episodioId === ep.base.id),
      modelos: modelosPorEp.get(ep.base.id) ?? ({} as Record<ModeloId, ModeloChecklist>),
      membros: cache.membros,
      mensagens: mensagens.filter(m => m.episodioId === ep.base.id).map(mensagemPublica),
      contexto: {
        mesmoDia: ep.base.dataCirurgia
          ? mesmoDia
              .filter(l => String(l.data_cirurgia) === ep.base.dataCirurgia && String(l.id) !== ep.base.id)
              .map(l => ({ episodioId: String(l.id), pacienteId: String(l.paciente_id), nomeCompleto: String(l.nome_completo), dataNascimento: String(l.data_nascimento) }))
          : [],
        anterioresDoPaciente: anteriores
          .filter(l => String(l.paciente_id) === ep.base.pacienteId && String(l.id) !== ep.base.id && iso(l.aberto_em) <= ep.base.abertoEm)
          .map(l => ({ episodioId: String(l.id), olho: l.olho as Olho, dataCirurgia: textoOuNull(l.data_cirurgia), estado: l.estado as EstadoEpisodio })),
      },
      config: cache.config,
    })
  }
  return out
}

export async function carregarEntrada(tx: Executor, id: string, modo: ModoCarga, cache?: CacheCarga): Promise<EntradaEstado | null> {
  return (await carregarEntradas(tx, [id], modo, cache)).get(id) ?? null
}

/** Ids de episódios por filtro (como jornada_sistema). */
export async function idsEpisodios(
  tx: Executor,
  filtro: { data?: string | null; de?: string | null; ate?: string | null; estado?: string | null; termoNormalizado?: string | null; abertos?: boolean; limite?: number },
): Promise<string[]> {
  const cond: string[] = []
  const p: unknown[] = []
  if (filtro.data) {
    p.push(filtro.data)
    cond.push(`e.data_cirurgia = $${p.length}::date`)
  }
  if (filtro.de) {
    p.push(filtro.de)
    cond.push(`coalesce(e.data_cirurgia, e.aberto_em::date) >= $${p.length}::date`)
  }
  if (filtro.ate) {
    p.push(filtro.ate)
    cond.push(`coalesce(e.data_cirurgia, e.aberto_em::date) <= $${p.length}::date`)
  }
  if (filtro.estado) {
    p.push(filtro.estado)
    cond.push(`e.estado = $${p.length}`)
  }
  if (filtro.abertos) cond.push(`e.estado not in ('alta', 'cancelado')`)
  if (filtro.termoNormalizado) {
    p.push(`%${filtro.termoNormalizado.replace(/[%_\\]/g, m => `\\${m}`)}%`)
    cond.push(`p.nome_normalizado like $${p.length}`)
  }
  p.push(Math.min(Math.max(filtro.limite ?? 200, 1), 5000))
  const r = await tx.consulta(
    `select e.id from ${S}.episodios e join ${S}.pacientes p on p.id = e.paciente_id
     ${cond.length ? `where ${cond.join(' and ')}` : ''}
     order by e.data_cirurgia nulls last, e.ordem nulls last, e.horario nulls last, e.aberto_em
     limit $${p.length}`,
    p,
  )
  return r.map(l => String(l.id))
}

// ---------------------------------------------------------------------------
// Escrita: eventos, lente, mensagens, projeção
// ---------------------------------------------------------------------------

/** Insere eventos com `seq` contínuo a partir de `seqInicial` (null para eventos sem episódio). */
export async function inserirEventos(tx: Executor, eventos: NovoEvento[], seqInicial: number | null): Promise<Evento[]> {
  const out: Evento[] = []
  let seq = seqInicial
  for (const ev of eventos) {
    const r = await tx.consulta(
      `insert into ${S}.eventos (episodio_id, paciente_id, seq, tipo, dados, visibilidade, autor_id, autor_papel, sessao_usuario_id, aparelho_id, fora_de_hora, motivo_fora_de_hora, versao_modelo)
       values ($1::uuid, $2::uuid, $3::int, $4, $5::jsonb, $6, $7::uuid, $8, $9::uuid, $10, $11, $12, $13)
       returning id::text as id, registrado_em`,
      [
        ev.episodioId,
        ev.pacienteId,
        ev.episodioId ? seq : null,
        ev.tipo,
        ev.dados ?? {},
        ev.visibilidade,
        ev.autorId,
        ev.autorPapel,
        ev.sessaoUsuarioId,
        ev.aparelhoId,
        Boolean(ev.foraDeHora),
        ev.motivoForaDeHora ?? null,
        ev.versaoModelo ?? null,
      ],
    )
    out.push({ ...ev, id: String(r[0].id), seq: ev.episodioId ? seq : null, registradoEm: iso(r[0].registrado_em) })
    if (ev.episodioId && seq !== null) seq++
  }
  return out
}

export async function inserirRegistrosLente(tx: Executor, registros: NovoRegistroLente[]): Promise<RegistroLente[]> {
  const out: RegistroLente[] = []
  for (const reg of registros) {
    const r = await tx.consulta(
      `insert into ${S}.lente_registros (id, episodio_id, ciclo, etapa, dados, visibilidade, autor_id) values ($1::uuid, $2::uuid, $3::int, $4, $5::jsonb, $6, $7::uuid) returning registrado_em`,
      [reg.id, reg.episodioId, reg.ciclo, reg.etapa, reg.dados, reg.visibilidade, reg.autorId],
    )
    out.push({ ...reg, registradoEm: iso(r[0].registrado_em) })
  }
  return out
}

/** Insere mensagens na fila. Com envio desligado, todas nascem `ensaio` (defesa em profundidade). */
export async function inserirMensagens(tx: Executor, episodioId: string, mensagens: NovaMensagem[], criadoPor: string, envioHabilitado: boolean): Promise<MensagemDb[]> {
  const out: MensagemDb[] = []
  for (const m of mensagens) {
    const estado = envioHabilitado ? m.estadoInicial : 'ensaio'
    const r = await tx.consulta(
      `insert into ${S}.mensagens_saida (id, episodio_id, gatilho, contato_id, telefone, texto, modelo_meta, parametros, chave_idempotencia, estado, tentativas, criado_por)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 0, $11::uuid)
       on conflict (chave_idempotencia) do nothing
       returning criado_em, atualizado_em`,
      [m.id, episodioId, m.gatilho, m.contatoId, m.telefone, m.texto, m.modeloMeta, m.parametros ?? {}, m.chaveIdempotencia, estado, criadoPor],
    )
    if (!r.length) continue // já enfileirada (idempotência)
    out.push(
      linhaMensagem({
        id: m.id,
        episodio_id: episodioId,
        gatilho: m.gatilho,
        contato_id: m.contatoId,
        telefone: m.telefone,
        texto: m.texto,
        modelo_meta: m.modeloMeta,
        parametros: m.parametros,
        chave_idempotencia: m.chaveIdempotencia,
        estado,
        tentativas: 0,
        provedor_id: null,
        criado_em: r[0].criado_em,
        atualizado_em: r[0].atualizado_em,
      }),
    )
  }
  return out
}

export async function inserirEpisodio(
  tx: Executor,
  e: { id: string; pacienteId: string; olho: Olho; cirurgiaoId: string; tipoCirurgia: string; tipoLente: string; dataSugerida: string | null; versoesModelos: Record<string, string>; abertoPor: string; estado: EstadoEpisodio },
): Promise<string> {
  const r = await tx.consulta(
    `insert into ${S}.episodios (id, paciente_id, olho, cirurgiao_id, tipo_cirurgia, tipo_lente, data_sugerida, estado, versao, versoes_modelos, resumo, aberto_por)
     values ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::date, $8, 0, $9::jsonb, '{}'::jsonb, $10::uuid) returning aberto_em`,
    [e.id, e.pacienteId, e.olho, e.cirurgiaoId, e.tipoCirurgia, e.tipoLente, e.dataSugerida, e.estado, e.versoesModelos, e.abertoPor],
  )
  return iso(r[0].aberto_em)
}

export interface CamposAgenda {
  dataCirurgia: string | null
  horario: string | null
  ordem: number | null
}

/** Atualiza a projeção com checagem de versão. Lança conflito_versao. */
export async function atualizarProjecao(
  tx: Executor,
  episodioId: string,
  versaoEsperada: number,
  novo: { versao: number; estado?: EstadoEpisodio; resumo: unknown; agenda?: CamposAgenda | null },
): Promise<void> {
  // `estado` ausente: escrita como jornada_sistema (página do paciente), que só pode mudar versao/resumo.
  const p: unknown[] = [episodioId, versaoEsperada, novo.versao, novo.resumo]
  const sets = ['versao = $3::int', 'resumo = $4::jsonb', 'atualizado_em = now()']
  if (novo.estado) {
    p.push(novo.estado)
    sets.push(`estado = $${p.length}`)
  }
  if (novo.agenda) {
    p.push(novo.agenda.dataCirurgia, novo.agenda.horario, novo.agenda.ordem)
    sets.push(`data_cirurgia = $${p.length - 2}::date`, `horario = $${p.length - 1}::time`, `ordem = $${p.length}::int`)
  }
  const r = await tx.consulta(`update ${S}.episodios set ${sets.join(', ')} where id = $1::uuid and versao = $2::int returning id`, p)
  if (!r.length) throw erro('conflito_versao')
}

/** Só o resumo (correção de nome do paciente, homônimo no dia). Sem mudar a versão. */
export async function atualizarResumo(tx: Executor, episodioId: string, resumo: unknown): Promise<void> {
  await tx.consulta(`update ${S}.episodios set resumo = $2::jsonb where id = $1::uuid`, [episodioId, resumo])
}

export async function registrarAparelho(tx: Executor, aparelhoId: string | null): Promise<void> {
  if (!aparelhoId) return
  await tx.consulta(
    `insert into ${S}.aparelhos (id, ultimo_acesso) values ($1, now()) on conflict (id) do update set ultimo_acesso = excluded.ultimo_acesso`,
    [aparelhoId],
  )
}

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

function linhaMaterial(l: Record<string, unknown>): MaterialCatalogo {
  return {
    id: String(l.id),
    codigo: String(l.codigo),
    versao: Number(l.versao),
    titulo: String(l.titulo),
    tipo: l.tipo as MaterialCatalogo['tipo'],
    url: textoOuNull(l.url),
    conteudo: textoOuNull(l.conteudo),
    momento: l.momento as MaterialCatalogo['momento'],
    publico: l.publico as MaterialCatalogo['publico'],
    ativo: Boolean(l.ativo),
  }
}

/** Última versão de cada código (ativos ou não). */
export async function materiaisCatalogo(tx: Executor, somenteAtivos = false): Promise<MaterialCatalogo[]> {
  const r = await tx.consulta(
    `select distinct on (codigo) id, codigo, versao, titulo, tipo, url, conteudo, momento, publico, ativo
     from ${S}.materiais order by codigo, versao desc`,
  )
  const lista = r.map(linhaMaterial)
  return somenteAtivos ? lista.filter(m => m.ativo) : lista
}

export async function materiaisPorIds(tx: Executor, ids: string[]): Promise<MaterialCatalogo[]> {
  if (!ids.length) return []
  const r = await tx.consulta(`select id, codigo, versao, titulo, tipo, url, conteudo, momento, publico, ativo from ${S}.materiais where id = any($1::uuid[])`, [ids])
  return r.map(linhaMaterial)
}

export async function inserirMaterial(tx: Executor, m: Omit<MaterialCatalogo, 'id' | 'versao'>, id: string, criadoPor: string): Promise<MaterialCatalogo> {
  const r = await tx.consulta(
    `insert into ${S}.materiais (id, codigo, versao, titulo, tipo, url, conteudo, momento, publico, ativo, criado_por)
     values ($1::uuid, $2, coalesce((select max(versao) from ${S}.materiais where codigo = $2), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
     returning id, codigo, versao, titulo, tipo, url, conteudo, momento, publico, ativo`,
    [id, m.codigo, m.titulo, m.tipo, m.url, m.conteudo, m.momento, m.publico, m.ativo, criadoPor],
  )
  return linhaMaterial(r[0])
}

// ---------------------------------------------------------------------------
// Links do paciente
// ---------------------------------------------------------------------------

export async function inserirLinkPaciente(tx: Executor, l: { id: string; episodioId: string; tokenHash: string; expiraEm: string; criadoPor: string }): Promise<void> {
  await tx.consulta(
    `insert into ${S}.links_paciente (id, episodio_id, token_hash, expira_em, criado_por) values ($1::uuid, $2::uuid, $3, $4::timestamptz, $5::uuid)`,
    [l.id, l.episodioId, l.tokenHash, l.expiraEm, l.criadoPor],
  )
}

export async function buscarLinkPorHash(tx: Executor, tokenHash: string): Promise<{ id: string; episodioId: string; expiraEm: string; revogadoEm: string | null } | null> {
  const r = await tx.consulta(`select id, episodio_id, expira_em, revogado_em from ${S}.links_paciente where token_hash = $1`, [tokenHash])
  const l = r[0]
  if (!l) return null
  return { id: String(l.id), episodioId: String(l.episodio_id), expiraEm: iso(l.expira_em), revogadoEm: isoOuNull(l.revogado_em) }
}

export async function revogarLinksEpisodio(tx: Executor, episodioId: string): Promise<void> {
  await tx.consulta(`update ${S}.links_paciente set revogado_em = now() where episodio_id = $1::uuid and revogado_em is null`, [episodioId])
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

export async function inserirAnexo(
  tx: Executor,
  a: { id: string; episodioId: string; tipo: 'foto_plano'; storagePath: string; sha256: string; contentType: string; tamanho: number; autorId: string },
): Promise<void> {
  await tx.consulta(
    `insert into ${S}.anexos (id, episodio_id, tipo, storage_path, sha256, content_type, tamanho, autor_id) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::int, $8::uuid)`,
    [a.id, a.episodioId, a.tipo, a.storagePath, a.sha256, a.contentType, a.tamanho, a.autorId],
  )
}

export async function buscarAnexo(tx: Executor, episodioId: string, anexoId: string): Promise<{ id: string; tipo: string; storagePath: string } | null> {
  const r = await tx.consulta(`select id, tipo, storage_path from ${S}.anexos where id = $1::uuid and episodio_id = $2::uuid`, [anexoId, episodioId])
  const l = r[0]
  return l ? { id: String(l.id), tipo: String(l.tipo), storagePath: String(l.storage_path) } : null
}
