// Validação de forma das entradas (tipos e tamanhos). Regras do POP ficam no domínio.
// Mensagens citam o NOME do campo, nunca o valor recebido.

import { PAPEIS, type Olho, type Papel } from '../dominio/index.ts'
import { erro } from './erros.ts'

export type Obj = Record<string, unknown>

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const invalido = (campo: string) => erro('validacao', `Campo inválido: ${campo}.`, { campo })

export function objeto(v: unknown, campo = 'dados'): Obj {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) throw invalido(campo)
  return v as Obj
}

export function objetoObrigatorio(v: unknown, campo: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw invalido(campo)
  return v as Obj
}

export function texto(v: unknown, campo: string, opcoes: { max?: number; min?: number } = {}): string {
  if (typeof v !== 'string') throw invalido(campo)
  const t = v.trim()
  if (t.length < (opcoes.min ?? 1) || t.length > (opcoes.max ?? 2000)) throw invalido(campo)
  return t
}

export function textoOpcional(v: unknown, campo: string, opcoes: { max?: number } = {}): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') throw invalido(campo)
  const t = v.trim()
  if (t === '') return null
  if (t.length > (opcoes.max ?? 2000)) throw invalido(campo)
  return t
}

export function uuid(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !RE_UUID.test(v)) throw invalido(campo)
  return v.toLowerCase()
}

export function uuidOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null
  return uuid(v, campo)
}

export function dataValida(t: string): boolean {
  if (!RE_DATA.test(t)) return false
  const d = new Date(`${t}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t
}

export function data(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !dataValida(v)) throw invalido(campo)
  return v
}

export function dataOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null
  return data(v, campo)
}

export function horaOpcional(v: unknown, campo: string): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !RE_HORA.test(v)) throw invalido(campo)
  return v
}

export function inteiro(v: unknown, campo: string, min = 0, max = 1_000_000): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw invalido(campo)
  return v
}

export function inteiroOpcional(v: unknown, campo: string, min = 0, max = 1_000_000): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return inteiro(v, campo, min, max)
}

export function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== 'boolean') throw invalido(campo)
  return v
}

export function booleanoOuNull(v: unknown, campo: string): boolean | null {
  if (v === undefined || v === null) return null
  return booleano(v, campo)
}

export function umDe<T extends string>(v: unknown, campo: string, valores: readonly T[]): T {
  if (typeof v !== 'string' || !valores.includes(v as T)) throw invalido(campo)
  return v as T
}

export function olho(v: unknown, campo = 'olho'): Olho {
  return umDe(v, campo, ['OD', 'OE'] as const)
}

export function papel(v: unknown, campo = 'papel'): Papel {
  return umDe(v, campo, PAPEIS)
}

export function papeis(v: unknown, campo = 'papeis'): Papel[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > PAPEIS.length) throw invalido(campo)
  const out = [...new Set(v.map(p => papel(p, campo)))]
  return out
}

export function email(v: unknown, campo = 'email'): string {
  const t = texto(v, campo, { max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw invalido(campo)
  return t
}

/** Valor JSON genérico (respostas de checklist, dados de lente) com limite de profundidade. */
export function json(v: unknown, campo: string, profundidade = 6): unknown {
  const visitar = (x: unknown, d: number): void => {
    if (d > profundidade) throw invalido(campo)
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw invalido(campo)
      return
    }
    if (Array.isArray(x)) {
      if (x.length > 200) throw invalido(campo)
      for (const i of x) visitar(i, d + 1)
      return
    }
    if (typeof x === 'object') {
      const chaves = Object.keys(x as object)
      if (chaves.length > 100) throw invalido(campo)
      for (const k of chaves) visitar((x as Obj)[k], d + 1)
      return
    }
    throw invalido(campo)
  }
  if (v === undefined) throw invalido(campo)
  visitar(v, 0)
  return v
}

export function aparelho(v: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  return /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null
}
