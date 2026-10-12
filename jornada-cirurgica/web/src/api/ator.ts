// Troca rápida de usuário por PIN em aparelho compartilhado.
// O token do ator fica só em memória (nunca em localStorage) e expira no servidor.

import type { Papel } from '@dominio/tipos.ts'

export interface AtorAtual {
  token: string
  expiraEm: string
  id: string
  nome: string
  papeis: Papel[]
}

let atual: AtorAtual | null = null
const ouvintes = new Set<(a: AtorAtual | null) => void>()

export function definirAtor(ator: AtorAtual | null) {
  atual = ator
  for (const f of ouvintes) f(atual)
}

export function atorAtual(): AtorAtual | null {
  if (atual && Date.parse(atual.expiraEm) <= Date.now()) definirAtor(null)
  return atual
}

export function tokenAtorAtual(): string | null {
  return atorAtual()?.token ?? null
}

export function ouvirAtor(f: (a: AtorAtual | null) => void): () => void {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}
