// Link da página do paciente: token aleatório de 32 bytes (base64url).
// No banco: só o SHA-256 (links_paciente.token_hash). Na fila de saída o texto guarda um
// marcador no lugar do token e o token vai cifrado (AES-GCM, chave derivada do segredo do
// servidor) em `parametros._link_token_cifrado`; a função de envio restaura na hora de enviar.

import type { NovaMensagem } from '../dominio/index.ts'
import { aleatorio, base64url, cifrar, decifrar, sha256Hex } from './cripto.ts'

export const MARCADOR_TOKEN = '{{LINK_TOKEN}}'
export const PARAM_TOKEN_CIFRADO = '_link_token_cifrado'
const ROTULO = 'link-paciente'
const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function gerarTokenLink(): string {
  return base64url(aleatorio(32))
}

export const formatoTokenValido = (t: unknown): t is string => typeof t === 'string' && RE_TOKEN.test(t)

export const hashToken = (token: string) => sha256Hex(token)

/** Troca o token pelo marcador no texto e nos parâmetros e anexa o token cifrado. */
export async function protegerMensagens(mensagens: NovaMensagem[], token: string, segredo: string): Promise<NovaMensagem[]> {
  const out: NovaMensagem[] = []
  for (const m of mensagens) {
    const temNoTexto = m.texto.includes(token)
    const parametros: Record<string, string> = {}
    let temNosParametros = false
    for (const [k, v] of Object.entries(m.parametros ?? {})) {
      if (typeof v === 'string' && v.includes(token)) {
        temNosParametros = true
        parametros[k] = v.split(token).join(MARCADOR_TOKEN)
      } else parametros[k] = v
    }
    if (!temNoTexto && !temNosParametros) {
      out.push(m)
      continue
    }
    parametros[PARAM_TOKEN_CIFRADO] = await cifrar(segredo, ROTULO, token)
    out.push({ ...m, texto: m.texto.split(token).join(MARCADOR_TOKEN), parametros })
  }
  return out
}

/** Restaura o token (somente na função de envio e, no modo dev, na listagem de links). */
export async function restaurarToken(texto: string, parametros: Record<string, string>, segredo: string): Promise<{ texto: string; parametros: Record<string, string> } | null> {
  const cifrado = parametros[PARAM_TOKEN_CIFRADO]
  const limpos: Record<string, string> = {}
  for (const [k, v] of Object.entries(parametros)) if (!k.startsWith('_')) limpos[k] = v
  if (!cifrado) return texto.includes(MARCADOR_TOKEN) ? null : { texto, parametros: limpos }
  const token = await decifrar(segredo, ROTULO, cifrado)
  if (!token || !RE_TOKEN.test(token)) return null
  for (const k of Object.keys(limpos)) limpos[k] = limpos[k].split(MARCADOR_TOKEN).join(token)
  return { texto: texto.split(MARCADOR_TOKEN).join(token), parametros: limpos }
}

/** Texto exibido à equipe (o link não aparece em listas). */
export const textoParaExibicao = (texto: string) => texto.split(MARCADOR_TOKEN).join('[link do paciente]')
