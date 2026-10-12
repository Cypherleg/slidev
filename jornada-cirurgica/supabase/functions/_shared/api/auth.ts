// Autenticação da equipe.
// Produção: o JWT da sessão Supabase é validado pelo próprio Auth (`GET {SUPABASE_URL}/auth/v1/user`,
// como no painel de pré-consulta). O `aal` é lido do payload do MESMO JWT, depois que o Auth o aceitou.
// Desenvolvimento: token fictício assinado por HMAC, aceito só com JORNADA_MODO_DEV=true.
// O ator vem sempre do Auth verificado, nunca do corpo da requisição.

import type { ConfigApi } from './config.ts'
import { assinarToken, deBase64url, deUtf8, verificarToken } from './cripto.ts'
import { erro } from './erros.ts'

export interface UsuarioAuth {
  userId: string
  email: string
  emailConfirmado: boolean
  aal: 'aal1' | 'aal2'
}

export interface Autenticador {
  /** Lança ErroApiHttp('nao_autenticado') ou ('indisponivel'). */
  verificar(token: string): Promise<UsuarioAuth>
}

export type FetchLike = (entrada: string, init?: RequestInit) => Promise<Response>

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lê o payload de um JWT SEM validar a assinatura (usar só depois de o Auth aceitar o token). */
export function payloadJwt(token: string): Record<string, unknown> | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const p = JSON.parse(deUtf8(deBase64url(partes[1])))
    return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function extrairBearer(cabecalho: string | null): string | null {
  if (!cabecalho) return null
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(cabecalho.trim())
  return m && m[1].length <= 8192 ? m[1] : null
}

/** Adaptador de produção: Supabase Auth. */
export function criarAutenticadorSupabase(opcoes: { supabaseUrl: string; anonKey: string; fetch?: FetchLike; timeoutMs?: number }): Autenticador {
  const f = opcoes.fetch ?? ((u, i) => fetch(u, i))
  const base = opcoes.supabaseUrl.replace(/\/$/, '')
  return {
    async verificar(token) {
      const payload = payloadJwt(token)
      if (!payload) throw erro('nao_autenticado')
      const controle = new AbortController()
      const timer = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? 5000)
      let resposta: Response
      try {
        resposta = await f(`${base}/auth/v1/user`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, apikey: opcoes.anonKey },
          signal: controle.signal,
        })
      } catch {
        throw erro('indisponivel')
      } finally {
        clearTimeout(timer)
      }
      if (resposta.status === 401 || resposta.status === 403) throw erro('nao_autenticado')
      if (!resposta.ok) throw erro('indisponivel')
      let usuario: Record<string, unknown>
      try {
        usuario = (await resposta.json()) as Record<string, unknown>
      } catch {
        throw erro('indisponivel')
      }
      const id = typeof usuario.id === 'string' ? usuario.id : ''
      const email = typeof usuario.email === 'string' ? usuario.email.trim().toLowerCase() : ''
      if (!RE_UUID.test(id) || !email) throw erro('nao_autenticado')
      // O payload precisa ser do mesmo usuário que o Auth devolveu.
      if (payload.sub !== id) throw erro('nao_autenticado')
      // Só `email_confirmed_at` (confirmação do e-mail); `confirmed_at` também cobre telefone.
      const emailConfirmado = typeof usuario.email_confirmed_at === 'string' && usuario.email_confirmed_at !== ''
      return { userId: id.toLowerCase(), email, emailConfirmado, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1' }
    },
  }
}

// ---------------------------------------------------------------------------
// Desenvolvimento
// ---------------------------------------------------------------------------

const PREFIXO_DEV = 'dev1'

export interface UsuarioDev {
  id: string
  email: string
  nome: string
  papeis: string[]
  aal?: 'aal1' | 'aal2'
}

/** Emite um token fictício (servidor local de demonstração e testes). */
export async function emitirTokenDev(segredo: string, usuario: Pick<UsuarioDev, 'id' | 'email' | 'aal'>, validadeMin = 12 * 60, agora = Date.now()): Promise<string> {
  return assinarToken(segredo, PREFIXO_DEV, {
    sub: usuario.id,
    email: usuario.email.toLowerCase(),
    aal: usuario.aal ?? 'aal2',
    exp: Math.floor(agora / 1000) + validadeMin * 60,
  })
}

/** Adaptador de desenvolvimento. Recusa ser criado fora do modo dev. */
export function criarAutenticadorDev(config: Pick<ConfigApi, 'modoDev' | 'ambiente'>, segredo: string, relogio: () => number = Date.now): Autenticador {
  if (!config.modoDev || config.ambiente === 'producao') throw new Error('Autenticação fictícia só com JORNADA_MODO_DEV=true fora de produção.')
  if (segredo.length < 16) throw new Error('Segredo do modo dev curto demais.')
  return {
    async verificar(token) {
      const p = await verificarToken(segredo, PREFIXO_DEV, token)
      if (!p) throw erro('nao_autenticado')
      if (typeof p.exp !== 'number' || p.exp * 1000 < relogio()) throw erro('nao_autenticado')
      if (typeof p.sub !== 'string' || !RE_UUID.test(p.sub) || typeof p.email !== 'string') throw erro('nao_autenticado')
      return { userId: p.sub.toLowerCase(), email: p.email.toLowerCase(), emailConfirmado: true, aal: p.aal === 'aal2' ? 'aal2' : 'aal1' }
    },
  }
}
