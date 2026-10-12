// Anexos (foto do plano de LIO assinado).
// Produção: Supabase Storage via REST com a service role (só no servidor), bucket privado
// `jornada-cirurgica`, URL assinada de curta duração. Dev/testes: memória ou disco local.

import type { FetchLike } from './auth.ts'
import { deBase64, hmac, base64url, iguaisTempoConstante, deBase64url, sha256Hex } from './cripto.ts'
import { erro } from './erros.ts'

export const BUCKET_ANEXOS = 'jornada-cirurgica'
export const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024
export const TIPOS_ANEXO = ['image/jpeg', 'image/png'] as const
export type TipoConteudoAnexo = (typeof TIPOS_ANEXO)[number]

export interface ArmazenamentoAnexos {
  salvar(caminho: string, conteudo: Uint8Array, contentType: TipoConteudoAnexo): Promise<void>
  urlAssinada(caminho: string, segundos: number): Promise<string>
}

export interface AnexoValidado {
  bytes: Uint8Array
  contentType: TipoConteudoAnexo
  sha256: string
  tamanho: number
  extensao: 'jpg' | 'png'
}

/** Valida base64, tamanho (5 MB), tipo declarado e assinatura do arquivo (magic bytes). */
export async function validarAnexo(base64: unknown, contentType: unknown): Promise<AnexoValidado> {
  if (contentType !== 'image/jpeg' && contentType !== 'image/png') throw erro('validacao', 'Só JPEG ou PNG.')
  if (typeof base64 !== 'string' || base64.length === 0) throw erro('validacao', 'Arquivo vazio.')
  const limpo = base64.replace(/^data:image\/(png|jpeg);base64,/, '').replace(/\s+/g, '')
  if (limpo.length > Math.ceil((LIMITE_ANEXO_BYTES * 4) / 3) + 4) throw erro('validacao', 'Arquivo maior que 5 MB.')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpo)) throw erro('validacao', 'Arquivo inválido.')
  let bytes: Uint8Array
  try {
    bytes = deBase64(limpo)
  } catch {
    throw erro('validacao', 'Arquivo inválido.')
  }
  if (bytes.length === 0) throw erro('validacao', 'Arquivo vazio.')
  if (bytes.length > LIMITE_ANEXO_BYTES) throw erro('validacao', 'Arquivo maior que 5 MB.')
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  if ((contentType === 'image/jpeg' && !jpeg) || (contentType === 'image/png' && !png)) throw erro('validacao', 'O conteúdo não corresponde ao tipo informado.')
  return { bytes, contentType, sha256: await sha256Hex(bytes), tamanho: bytes.length, extensao: contentType === 'image/png' ? 'png' : 'jpg' }
}

function caminhoSeguro(caminho: string): string {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,250}$/i.test(caminho) || caminho.includes('..')) throw erro('validacao', 'Caminho de anexo inválido.')
  return caminho
}

/** Supabase Storage (REST). A service role nunca sai do servidor. */
export function criarArmazenamentoSupabase(opcoes: { supabaseUrl: string; serviceRoleKey: string; bucket?: string; fetch?: FetchLike }): ArmazenamentoAnexos {
  const f = opcoes.fetch ?? ((u, i) => fetch(u, i))
  const base = opcoes.supabaseUrl.replace(/\/$/, '')
  const bucket = opcoes.bucket ?? BUCKET_ANEXOS
  const cab = { Authorization: `Bearer ${opcoes.serviceRoleKey}`, apikey: opcoes.serviceRoleKey }
  return {
    async salvar(caminho, conteudo, contentType) {
      const c = caminhoSeguro(caminho)
      const r = await f(`${base}/storage/v1/object/${bucket}/${c}`, {
        method: 'POST',
        headers: { ...cab, 'Content-Type': contentType, 'x-upsert': 'false', 'cache-control': 'no-store' },
        body: new Uint8Array(conteudo) as Uint8Array<ArrayBuffer>,
      })
      if (!r.ok) throw erro('indisponivel', 'Não foi possível guardar o arquivo. Nada foi registrado.')
    },
    async urlAssinada(caminho, segundos) {
      const c = caminhoSeguro(caminho)
      const r = await f(`${base}/storage/v1/object/sign/${bucket}/${c}`, {
        method: 'POST',
        headers: { ...cab, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: segundos }),
      })
      if (!r.ok) throw erro('indisponivel')
      const j = (await r.json()) as { signedURL?: string; signedUrl?: string }
      const rel = j.signedURL ?? j.signedUrl
      if (!rel) throw erro('indisponivel')
      return rel.startsWith('http') ? rel : `${base}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`
    },
  }
}

/**
 * Armazenamento local (dev e testes). Guarda em memória ou num diretório via funções
 * injetadas; a URL assinada aponta para `baseUrl` (servida pelo servidor de demonstração)
 * com expiração e assinatura HMAC.
 */
export function criarArmazenamentoLocal(opcoes: {
  segredo: string
  baseUrl?: string
  gravar?: (caminho: string, conteudo: Uint8Array) => Promise<void>
  ler?: (caminho: string) => Promise<Uint8Array | null>
  relogio?: () => number
}): ArmazenamentoAnexos & {
  ler(caminho: string): Promise<{ conteudo: Uint8Array; contentType: string } | null>
  verificarUrl(caminho: string, exp: string, assinatura: string): Promise<boolean>
  caminhos(): string[]
} {
  const memoria = new Map<string, { conteudo: Uint8Array; contentType: string }>()
  const tipos = new Map<string, string>()
  const relogio = opcoes.relogio ?? Date.now
  const assinar = async (caminho: string, exp: number) => base64url(await hmac(opcoes.segredo, 'anexo-local', `${caminho}|${exp}`))
  return {
    async salvar(caminho, conteudo, contentType) {
      const c = caminhoSeguro(caminho)
      if (memoria.has(c) || tipos.has(c)) throw erro('validacao', 'Anexo já existe.')
      if (opcoes.gravar) {
        await opcoes.gravar(c, conteudo)
        tipos.set(c, contentType)
      } else memoria.set(c, { conteudo: new Uint8Array(conteudo), contentType })
    },
    async urlAssinada(caminho, segundos) {
      const c = caminhoSeguro(caminho)
      const exp = Math.floor(relogio() / 1000) + segundos
      const base = (opcoes.baseUrl ?? 'memoria://anexos').replace(/\/$/, '')
      return `${base}/${c}?exp=${exp}&sig=${await assinar(c, exp)}`
    },
    async ler(caminho) {
      const m = memoria.get(caminho)
      if (m) return m
      if (opcoes.ler) {
        const conteudo = await opcoes.ler(caminho)
        if (!conteudo) return null
        const tipo = tipos.get(caminho) ?? (caminho.endsWith('.png') ? 'image/png' : 'image/jpeg')
        return { conteudo, contentType: tipo }
      }
      return null
    },
    async verificarUrl(caminho, exp, assinatura) {
      const n = Number(exp)
      if (!Number.isInteger(n) || n * 1000 < relogio()) return false
      try {
        return iguaisTempoConstante(deBase64url(await assinar(caminho, n)), deBase64url(assinatura))
      } catch {
        return false
      }
    },
    caminhos() {
      return [...memoria.keys(), ...tipos.keys()]
    },
  }
}
