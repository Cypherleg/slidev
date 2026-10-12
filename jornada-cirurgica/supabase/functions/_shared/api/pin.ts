// PIN da troca rápida de usuário e token de ator (`x-jornada-ator`).
// PIN: 6 dígitos; hash PBKDF2-SHA256 (WebCrypto) com sal aleatório, iterações altas e
// "pepper" (HMAC com o segredo do servidor), de modo que um vazamento só do banco não
// permite testar os 10^6 PINs possíveis.
// Token de ator: HMAC, curta duração, preso ao usuário da sessão e ao aparelho.

import { assinarToken, base64, deBase64, hmac, iguaisTempoConstante, pbkdf2, aleatorio, base64url, verificarToken } from './cripto.ts'

const RE_PIN = /^\d{6}$/

/** Valida formato e recusa PINs triviais (todos iguais, sequências). */
export function pinAceitavel(pin: unknown): pin is string {
  if (typeof pin !== 'string' || !RE_PIN.test(pin)) return false
  if (/^(\d)\1{5}$/.test(pin)) return false
  const seq = '0123456789012345'
  const inv = '9876543210987654'
  if (seq.includes(pin) || inv.includes(pin)) return false
  return true
}

export function formatoPinValido(pin: unknown): pin is string {
  return typeof pin === 'string' && RE_PIN.test(pin)
}

async function material(segredo: string, pin: string) {
  return hmac(segredo, 'pin', pin)
}

/** Formato: pbkdf2-sha256$<iteracoes>$<sal b64>$<hash b64> */
export async function gerarHashPin(segredo: string, pin: string, iteracoes: number): Promise<string> {
  const sal = aleatorio(16)
  const h = await pbkdf2(await material(segredo, pin), sal, iteracoes)
  return `pbkdf2-sha256$${iteracoes}$${base64(sal)}$${base64(h)}`
}

export async function verificarHashPin(segredo: string, pin: string, armazenado: string | null): Promise<boolean> {
  if (!armazenado || !formatoPinValido(pin)) return false
  const partes = armazenado.split('$')
  if (partes.length !== 4 || partes[0] !== 'pbkdf2-sha256') return false
  const iter = Number(partes[1])
  if (!Number.isInteger(iter) || iter < 1000 || iter > 10_000_000) return false
  try {
    const sal = deBase64(partes[2])
    const esperado = deBase64(partes[3])
    const h = await pbkdf2(await material(segredo, pin), sal, iter, esperado.length)
    return iguaisTempoConstante(h, esperado)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Token de ator
// ---------------------------------------------------------------------------

const PREFIXO_ATOR = 'at1'

export interface TokenAtor {
  membroId: string
  sessaoUsuarioId: string
  aparelhoId: string | null
  expiraEm: string
  jti: string
}

export async function emitirTokenAtor(
  segredo: string,
  dados: { membroId: string; sessaoUsuarioId: string; aparelhoId: string | null },
  ttlMin: number,
  agoraMs: number,
): Promise<{ token: string; expiraEm: string; jti: string }> {
  const exp = Math.floor(agoraMs / 1000) + ttlMin * 60
  const jti = base64url(aleatorio(12))
  const token = await assinarToken(segredo, PREFIXO_ATOR, { f: 'ator', m: dados.membroId, s: dados.sessaoUsuarioId, d: dados.aparelhoId, exp, j: jti })
  return { token, expiraEm: new Date(exp * 1000).toISOString(), jti }
}

/**
 * Verifica assinatura, validade, usuário da sessão e aparelho.
 * Devolve null se inválido (o chamador decide o erro).
 */
export async function verificarTokenAtor(
  segredo: string,
  token: string,
  esperado: { sessaoUsuarioId: string; aparelhoId: string | null },
  agoraMs: number,
): Promise<TokenAtor | null> {
  const p = await verificarToken(segredo, PREFIXO_ATOR, token)
  if (!p || p.f !== 'ator') return null
  if (typeof p.exp !== 'number' || p.exp * 1000 <= agoraMs) return null
  if (typeof p.m !== 'string' || typeof p.s !== 'string' || typeof p.j !== 'string') return null
  if (p.s !== esperado.sessaoUsuarioId) return null
  const aparelho = typeof p.d === 'string' ? p.d : null
  if (aparelho !== esperado.aparelhoId) return null
  return { membroId: p.m, sessaoUsuarioId: p.s, aparelhoId: aparelho, expiraEm: new Date(p.exp * 1000).toISOString(), jti: p.j }
}

// ---------------------------------------------------------------------------
// Token de confirmação da leitura em voz alta (Sign In, Time Out)
// Finalidade própria (prefixo e campo `f`), preso a episódio, bloco, sessão e aparelho, curto e de
// uso único (o `jti` é consumido em `acessos` pelo bloco.concluir). Nunca vale como `x-jornada-ator`.
// ---------------------------------------------------------------------------

const PREFIXO_CONFIRMACAO = 'cf1'

export interface TokenConfirmacao {
  membroId: string
  jti: string
  expiraEm: string
}

export async function emitirTokenConfirmacao(
  segredo: string,
  dados: { membroId: string; sessaoUsuarioId: string; aparelhoId: string | null; episodioId: string; modelo: string },
  ttlMin: number,
  agoraMs: number,
): Promise<{ token: string; expiraEm: string; jti: string }> {
  const exp = Math.floor(agoraMs / 1000) + ttlMin * 60
  const jti = base64url(aleatorio(12))
  const token = await assinarToken(segredo, PREFIXO_CONFIRMACAO, {
    f: 'confirmacao',
    m: dados.membroId,
    s: dados.sessaoUsuarioId,
    d: dados.aparelhoId,
    e: dados.episodioId,
    mo: dados.modelo,
    exp,
    j: jti,
  })
  return { token, expiraEm: new Date(exp * 1000).toISOString(), jti }
}

export async function verificarTokenConfirmacao(
  segredo: string,
  token: string,
  esperado: { sessaoUsuarioId: string; aparelhoId: string | null; episodioId: string; modelo: string },
  agoraMs: number,
): Promise<TokenConfirmacao | null> {
  const p = await verificarToken(segredo, PREFIXO_CONFIRMACAO, token)
  if (!p || p.f !== 'confirmacao') return null
  if (typeof p.exp !== 'number' || p.exp * 1000 <= agoraMs) return null
  if (typeof p.m !== 'string' || typeof p.j !== 'string') return null
  if (p.s !== esperado.sessaoUsuarioId || p.e !== esperado.episodioId || p.mo !== esperado.modelo) return null
  if ((typeof p.d === 'string' ? p.d : null) !== esperado.aparelhoId) return null
  return { membroId: p.m, jti: p.j, expiraEm: new Date(p.exp * 1000).toISOString() }
}
