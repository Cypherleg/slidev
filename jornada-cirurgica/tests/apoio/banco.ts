// Banco descartável para testes: cria um banco novo no Postgres local, aplica o stub do
// Supabase e todas as migrations em ordem. Requer `npm run pg:iniciar`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

export const URL_ADMIN = process.env.JC_PG_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres'
const RAIZ = join(import.meta.dirname, '..', '..')

export type Sql = ReturnType<typeof postgres>

export interface BancoTeste {
  nome: string
  url: string
  sql: Sql
  encerrar: () => Promise<void>
}

export function arquivosMigration(): string[] {
  const dir = join(RAIZ, 'supabase', 'migrations')
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => join(dir, f))
}

export async function criarBancoTeste(opcoes: { semMigrations?: boolean } = {}): Promise<BancoTeste> {
  const nome = `jc_teste_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const admin = postgres(URL_ADMIN, { max: 1, onnotice: () => {} })
  try {
    await admin.unsafe(`create database ${nome}`)
  } finally {
    await admin.end()
  }
  const url = URL_ADMIN.replace(/\/[^/]*$/, `/${nome}`)
  const sql = postgres(url, { max: 5, onnotice: () => {}, prepare: false })
  await sql.unsafe(readFileSync(join(RAIZ, 'tests', 'apoio', 'supabase-stub.sql'), 'utf8'))
  if (!opcoes.semMigrations) {
    for (const arq of arquivosMigration()) await sql.unsafe(readFileSync(arq, 'utf8'))
  }
  return {
    nome,
    url,
    sql,
    async encerrar() {
      await sql.end({ timeout: 5 })
      const adm = postgres(URL_ADMIN, { max: 1, onnotice: () => {} })
      try {
        await adm.unsafe(`drop database if exists ${nome} with (force)`)
      } finally {
        await adm.end()
      }
    },
  }
}
