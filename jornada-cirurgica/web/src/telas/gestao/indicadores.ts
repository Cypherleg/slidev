// Apresentação de um indicador do POP §12 (valores vêm do servidor; aqui só a formatação).

import type { Indicador } from '@dominio/index.ts'

const RE_OBSERVACAO_DIRETA = /observa[cç][aã]o direta|registr(o|ar) manual/i

/** Fração 0..1 em porcentagem com vírgula: 0.9523 → '95,2%'. */
export function formatarPercentual(fracao: number | null | undefined): string {
  if (fracao === null || fracao === undefined || !Number.isFinite(fracao)) return '—'
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`
}

export interface IndicadorApresentado {
  numerador: string
  denominador: string
  valor: string
  /** Indicador que exige observação direta ou fonte fora do painel. */
  manual: boolean
}

export function apresentarIndicador(i: Indicador): IndicadorApresentado {
  const semNumeros = i.numerador === null && i.denominador === null && i.valor === null
  const manual = semNumeros || RE_OBSERVACAO_DIRETA.test(i.observacao ?? '')
  const n = (v: number | null) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'))
  let valor: string
  if (manual) valor = 'Registro manual'
  else if (i.valor !== null) valor = formatarPercentual(i.valor)
  else if (i.numerador !== null && i.denominador === null) valor = `${n(i.numerador)} (contagem)`
  else if (i.denominador === 0) valor = 'Sem casos no período'
  else valor = '—'
  return { numerador: manual && i.numerador === null ? '—' : n(i.numerador), denominador: n(i.denominador), valor, manual }
}
