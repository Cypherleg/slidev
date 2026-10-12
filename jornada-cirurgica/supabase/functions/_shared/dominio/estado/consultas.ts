// Consultas puras sobre o estado interno. Sem efeitos colaterais.

import type { RegistroLente } from '../contrato.ts'
import type {
  DadosChegadaLente,
  DadosPlanoLente,
  EstadoEpisodio,
  EtapaLente,
  ItemModelo,
  ModeloChecklist,
  ModeloId,
  ValoresLente,
  ValorResposta,
} from '../tipos.ts'
import { normalizarNome } from '../util/texto.ts'
import type { CicloLente, ConclusaoInterna, EstadoInterno, RegistroRef, RespostaInterna } from './tipos.ts'

export const RANK: Record<EstadoEpisodio, number> = {
  d7_em_andamento: 0,
  d7_concluido: 1,
  d2_concluido: 2,
  admitido: 3,
  sign_in_concluido: 4,
  time_out_concluido: 5,
  sign_out_concluido: 6,
  alta: 7,
  suspenso: -1,
  cancelado: -1,
}

export const ESTADO_APOS_CONCLUSAO: Partial<Record<ModeloId, EstadoEpisodio>> = {
  d7: 'd7_concluido',
  d2: 'd2_concluido',
  admissao: 'admitido',
  sign_in: 'sign_in_concluido',
  time_out: 'time_out_concluido',
  sign_out: 'sign_out_concluido',
  alta: 'alta',
}

export const MODELOS_D0: readonly ModeloId[] = ['admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta']
/** Sequência dos blocos do D0 que mudam o estado (hora real: bloco posterior concluído). */
export const SEQUENCIA_D0: readonly ModeloId[] = ['admissao', 'sign_in', 'time_out', 'sign_out', 'alta']

export function terminal(est: EstadoInterno): boolean {
  return est.estado === 'suspenso' || est.estado === 'cancelado'
}

export function rank(est: EstadoInterno): number {
  return RANK[est.estado]
}

export function ehModeloLente(modelo: ModeloId): modelo is 'cp1' | 'cp2' {
  return modelo === 'cp1' || modelo === 'cp2'
}

// ---------------------------------------------------------------------------
// Modelos e itens
// ---------------------------------------------------------------------------

export function modelo(est: EstadoInterno, id: ModeloId): ModeloChecklist {
  return est.entrada.modelos[id]
}

export function itensDoModelo(m: ModeloChecklist): ItemModelo[] {
  return m.secoes.flatMap((s) => s.itens)
}

export function itemDoModelo(est: EstadoInterno, modeloId: ModeloId, itemId: string): ItemModelo | undefined {
  const m = est.entrada.modelos[modeloId]
  if (!m) return undefined
  for (const s of m.secoes) for (const i of s.itens) if (i.id === itemId) return i
  return undefined
}

export function secaoDoItem(m: ModeloChecklist, itemId: string): string | undefined {
  return m.secoes.find((s) => s.itens.some((i) => i.id === itemId))?.id
}

// ---------------------------------------------------------------------------
// Lente: ciclos, herança, registros
// ---------------------------------------------------------------------------

export function cicloAtual(est: EstadoInterno): CicloLente {
  return est.ciclos[est.ciclos.length - 1]
}

export function cicloPorNumero(est: EstadoInterno, numero: number): CicloLente | undefined {
  return est.ciclos.find((c) => c.numero === numero)
}

/** Plano válido no ciclo (próprio ou herdado de ciclo anterior por "manter plano"). */
export function planoRef(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): RegistroRef | null {
  if (ciclo.plano) return ciclo.plano
  if (ciclo.herdaPlanoDe != null) {
    const anterior = cicloPorNumero(est, ciclo.herdaPlanoDe)
    return anterior ? planoRef(est, anterior) : null
  }
  return null
}

/** Ciclo cujo checkpoint 1 vale para este ciclo (o próprio ou o herdado). */
export function cicloCp1(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): CicloLente {
  if (ciclo.herdaCp1De != null) {
    const anterior = cicloPorNumero(est, ciclo.herdaCp1De)
    if (anterior) return cicloCp1(est, anterior)
  }
  return ciclo
}

export function chegadaRef(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): RegistroRef | null {
  return cicloCp1(est, ciclo).chegada
}

export function cp1Conclusao(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): ConclusaoInterna | null {
  return cicloCp1(est, ciclo).cp1
}

export function respostasCp1(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): Record<string, RespostaInterna> {
  return cicloCp1(est, ciclo).respostasCp1
}

export function cp1Herdado(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): boolean {
  return cicloCp1(est, ciclo) !== ciclo
}

export function registroLente(est: EstadoInterno, registroId: string | null | undefined): RegistroLente | undefined {
  if (!registroId) return undefined
  return est.entrada.lente.find((r) => r.id === registroId)
}

/** Valores do plano do ciclo atual (só se o registro estiver na entrada: depende de quem montou o estado). */
export function dadosPlano(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): DadosPlanoLente | null {
  const r = registroLente(est, planoRef(est, ciclo)?.registroId)
  return r ? (r.dados as DadosPlanoLente) : null
}

export function dadosChegada(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): DadosChegadaLente | null {
  const r = registroLente(est, chegadaRef(est, ciclo)?.registroId)
  return r ? (r.dados as DadosChegadaLente) : null
}

export function dadosCp2(est: EstadoInterno, ciclo: CicloLente = cicloAtual(est)): ValoresLente | null {
  const r = registroLente(est, ciclo.cp2Registro?.registroId)
  return r ? (r.dados as ValoresLente) : null
}

export function quarentenaAberta(est: EstadoInterno): boolean {
  return !!cicloAtual(est).quarentena?.aberta
}

export function etapaLente(est: EstadoInterno): EtapaLente {
  const c = cicloAtual(est)
  if (c.quarentena?.aberta) return 'quarentena'
  if (c.timeOutResultado?.confere) return 'time_out_confere'
  if (c.cp2) return 'cp2_confere'
  if (cp1Conclusao(est, c)) return 'chegada_conferida'
  if (planoRef(est, c)) return 'plano_registrado'
  return 'sem_plano'
}

/** Lente tórica: pelo plano do ciclo (se visível) ou pelo tipo de lente do episódio. */
export function lenteTorica(est: EstadoInterno): boolean {
  const p = dadosPlano(est)
  if (p) return !!p.torica
  return normalizarNome(est.entrada.episodio.tipoLente).includes('TORIC')
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export function respostasDoModelo(est: EstadoInterno, modeloId: ModeloId): Record<string, RespostaInterna> {
  if (modeloId === 'cp1') return respostasCp1(est)
  if (modeloId === 'cp2') return cicloAtual(est).respostasCp2
  return est.respostas[modeloId] ?? {}
}

export function resposta(est: EstadoInterno, modeloId: ModeloId, itemId: string): RespostaInterna | undefined {
  return respostasDoModelo(est, modeloId)[itemId]
}

export function valor(est: EstadoInterno, modeloId: ModeloId, itemId: string): ValorResposta | undefined {
  return resposta(est, modeloId, itemId)?.valor
}

export function ehSim(est: EstadoInterno, modeloId: ModeloId, itemId: string): boolean {
  return valor(est, modeloId, itemId) === 'sim'
}

export function ehNao(est: EstadoInterno, modeloId: ModeloId, itemId: string): boolean {
  return valor(est, modeloId, itemId) === 'nao'
}

export function marcado(est: EstadoInterno, modeloId: ModeloId, itemId: string): boolean {
  const v = valor(est, modeloId, itemId)
  return v !== undefined && v !== null && v !== ''
}

// ---------------------------------------------------------------------------
// Conclusões e datas
// ---------------------------------------------------------------------------

export function conclusao(est: EstadoInterno, modeloId: ModeloId): ConclusaoInterna | null {
  if (modeloId === 'cp1') return cp1Conclusao(est)
  if (modeloId === 'cp2') return cicloAtual(est).cp2
  return est.conclusoes[modeloId] ?? null
}

export function concluido(est: EstadoInterno, modeloId: ModeloId): boolean {
  return conclusao(est, modeloId) !== null
}

/** Data da cirurgia (ou a sugerida, quando ainda não agendada). */
export function dataReferencia(est: EstadoInterno): string | null {
  return est.agenda.dataCirurgia ?? est.agenda.dataSugerida ?? null
}

export function nomeMembro(est: EstadoInterno, id: string | null | undefined): string {
  if (!id) return ''
  return est.entrada.membros[id]?.nome ?? 'Membro não identificado'
}

export function nomeMae(est: EstadoInterno): string | null {
  if (est.entrada.paciente.nomeMae && est.entrada.paciente.nomeMae.trim()) return est.entrada.paciente.nomeMae.trim()
  const v = valor(est, 'd7', 'A.nome_mae')
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// ---------------------------------------------------------------------------
// Condições de itens (exigidoQuando por item; referência entre modelos 'modelo:ITEM.id')
// ---------------------------------------------------------------------------

/** Separa 'modelo:ITEM.id' (outro modelo) de 'ITEM.id' (mesmo modelo). */
export function referenciaItem(modeloAtual: ModeloId, ref: string): { modelo: ModeloId; itemId: string } {
  const i = ref.indexOf(':')
  if (i > 0) {
    const m = ref.slice(0, i) as ModeloId
    if (m in RANK_MODELOS) return { modelo: m, itemId: ref.slice(i + 1) }
  }
  return { modelo: modeloAtual, itemId: ref }
}

const RANK_MODELOS: Record<ModeloId, true> = {
  d7: true, cp1: true, cp2: true, d2: true, admissao: true, sign_in: true, anestesia: true, time_out: true, sign_out: true, alta: true,
}

/** Condição por item: o valor (aplicável) do item referido está entre os valores; 'multipla': basta um em comum. */
export function condicaoItemVale(est: EstadoInterno, modeloAtual: ModeloId, cond: { itemId: string; valores: string[] }, profundidade = 0): boolean {
  const ref = referenciaItem(modeloAtual, cond.itemId)
  const v = valorAplicavel(est, ref.modelo, ref.itemId, profundidade + 1)
  if (typeof v === 'string') return cond.valores.includes(v)
  if (Array.isArray(v)) return v.some((x) => cond.valores.includes(x))
  return false
}

/**
 * Valor de um item só quando ele se aplica: item condicional (exigidoQuando por item) cuja condição não vale
 * não conta (ex.: "qual braço" respondido mas doença renal = não). Condições por contexto não são avaliadas aqui.
 */
export function valorAplicavel(est: EstadoInterno, modeloId: ModeloId, itemId: string, profundidade = 0): ValorResposta | undefined {
  const v = valor(est, modeloId, itemId)
  if (v === undefined || profundidade > 4) return v
  const item = itemDoModelo(est, modeloId, itemId)
  const cond = item?.exigidoQuando
  if (cond && 'itemId' in cond && !condicaoItemVale(est, modeloId, cond, profundidade)) return undefined
  return v
}
