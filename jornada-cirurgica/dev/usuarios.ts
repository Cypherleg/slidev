// Usuários FICTÍCIOS do servidor local de demonstração (nomes claramente fictícios).
// PIN de todos no modo dev: PIN_DEV (documentado em docs/notas-agentes/api.md).

import type { Papel } from '../supabase/functions/_shared/dominio/index.ts'

export interface UsuarioFicticio {
  id: string
  email: string
  nome: string
  papeis: Papel[]
}

const u = (n: number, chave: string, nome: string, papeis: Papel[]): UsuarioFicticio => ({
  id: `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  email: `${chave}@exemplo.test`,
  nome,
  papeis,
})

export const PIN_DEV = '135790'

export const USUARIOS_FICTICIOS = {
  concierge: u(1, 'concierge', 'Ana Ficticia (Concierge)', ['concierge']),
  concierge2: u(2, 'concierge2', 'Bruna Ficticia (Concierge substituta)', ['concierge']),
  conferente: u(3, 'conferente', 'Carla Ficticia (Segunda conferente)', ['conferente']),
  conferente2: u(4, 'conferente2', 'Debora Ficticia (Conferente substituta)', ['conferente']),
  enfermagem: u(5, 'enfermagem', 'Elisa Ficticia (Enfermagem)', ['enfermagem']),
  circulante: u(6, 'circulante', 'Fabio Ficticio (Circulante)', ['circulante']),
  anestesista: u(7, 'anestesista', 'Dr. Gil Ficticio (Anestesista)', ['anestesista']),
  cirurgiao: u(8, 'cirurgiao', 'Dr. Hugo Ficticio (Cirurgiao)', ['cirurgiao']),
  cirurgiao2: u(9, 'cirurgiao2', 'Dra. Iris Ficticia (Cirurgia)', ['cirurgiao']),
  gestora: u(10, 'gestora', 'Julia Ficticia (Gestora)', ['gestora']),
} as const satisfies Record<string, UsuarioFicticio>

export const LISTA_USUARIOS: UsuarioFicticio[] = Object.values(USUARIOS_FICTICIOS)
