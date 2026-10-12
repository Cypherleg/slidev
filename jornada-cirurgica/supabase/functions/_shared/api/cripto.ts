// Primitivas criptográficas sobre WebCrypto (Deno, Node >= 20 e navegador).
// Sem dependência de pacote.

export type Bytes = Uint8Array<ArrayBuffer>

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export const utf8 = (texto: string): Bytes => codificador.encode(texto) as Bytes
export const deUtf8 = (bytes: Uint8Array): string => decodificador.decode(bytes)

export function hex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function base64(bytes: Uint8Array): string {
  let bin = ''
  const passo = 0x8000
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo))
  return btoa(bin)
}

export function deBase64(texto: string): Bytes {
  const bin = atob(texto)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const base64url = (bytes: Uint8Array): string => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function deBase64url(texto: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) throw new Error('base64url inválido')
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  return deBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

export function aleatorio(n: number): Bytes {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return b
}

export const uuid = (): string => crypto.randomUUID()

export async function sha256(dados: Uint8Array | string): Promise<Bytes> {
  const entrada = typeof dados === 'string' ? utf8(dados) : (new Uint8Array(dados) as Bytes)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', entrada))
}

export async function sha256Hex(dados: Uint8Array | string): Promise<string> {
  return hex(await sha256(dados))
}

const cacheChaves = new Map<string, Promise<CryptoKey>>()

function chaveHmac(segredo: string): Promise<CryptoKey> {
  let k = cacheChaves.get(segredo)
  if (!k) {
    k = crypto.subtle.importKey('raw', utf8(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    cacheChaves.set(segredo, k)
  }
  return k
}

/** HMAC-SHA256. `rotulo` separa usos do mesmo segredo (ex.: 'cpf', 'ator', 'pin'). */
export async function hmac(segredo: string, rotulo: string, mensagem: string | Uint8Array): Promise<Bytes> {
  const chave = await chaveHmac(segredo)
  const msg = typeof mensagem === 'string' ? utf8(mensagem) : mensagem
  const dados = new Uint8Array(rotulo.length + 1 + msg.length)
  dados.set(utf8(rotulo), 0)
  dados[rotulo.length] = 0
  dados.set(msg, rotulo.length + 1)
  return new Uint8Array(await crypto.subtle.sign('HMAC', chave, dados))
}

/** Comparação em tempo constante (para o mesmo comprimento). */
export function iguaisTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]
  return r === 0
}

export function textosIguaisTempoConstante(a: string, b: string): boolean {
  return iguaisTempoConstante(utf8(a), utf8(b))
}

// ---------------------------------------------------------------------------
// Tokens assinados (HMAC): prefixo.payload.assinatura (base64url)
// ---------------------------------------------------------------------------

export async function assinarToken(segredo: string, prefixo: string, payload: Record<string, unknown>): Promise<string> {
  const corpo = base64url(utf8(JSON.stringify(payload)))
  const assinatura = base64url(await hmac(segredo, `token:${prefixo}`, `${prefixo}.${corpo}`))
  return `${prefixo}.${corpo}.${assinatura}`
}

/** Devolve o payload se a assinatura confere; null caso contrário. Não confere validade. */
export async function verificarToken(segredo: string, prefixo: string, token: string): Promise<Record<string, unknown> | null> {
  if (typeof token !== 'string' || token.length > 2048) return null
  const partes = token.split('.')
  if (partes.length !== 3 || partes[0] !== prefixo) return null
  try {
    const esperado = await hmac(segredo, `token:${prefixo}`, `${prefixo}.${partes[1]}`)
    const recebido = deBase64url(partes[2])
    if (!iguaisTempoConstante(esperado, recebido)) return null
    const payload = JSON.parse(deUtf8(deBase64url(partes[1])))
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Cifra simétrica (AES-GCM) com chave derivada do segredo do servidor.
// Uso: guardar na fila de saída o token do link do paciente sem texto claro no banco.
// ---------------------------------------------------------------------------

async function chaveAes(segredo: string, rotulo: string): Promise<CryptoKey> {
  const material = await hmac(segredo, `chave-aes:${rotulo}`, '')
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function cifrar(segredo: string, rotulo: string, texto: string): Promise<string> {
  const iv = aleatorio(12)
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(segredo, rotulo), utf8(texto)))
  return `g1.${base64url(iv)}.${base64url(c)}`
}

export async function decifrar(segredo: string, rotulo: string, cifrado: string): Promise<string | null> {
  const p = cifrado.split('.')
  if (p.length !== 3 || p[0] !== 'g1') return null
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64url(p[1]) }, await chaveAes(segredo, rotulo), deBase64url(p[2]))
    return deUtf8(new Uint8Array(claro))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PBKDF2 (PIN)
// ---------------------------------------------------------------------------

export async function pbkdf2(senha: Uint8Array, sal: Uint8Array, iteracoes: number, bytes = 32): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', new Uint8Array(senha) as Bytes, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(sal) as Bytes, iterations: iteracoes }, base, bytes * 8)
  return new Uint8Array(bits)
}
