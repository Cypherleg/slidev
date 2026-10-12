// Interface mínima de banco: consulta parametrizada + transação.
// Adaptador para postgres.js (o mesmo pacote roda no Node — `import postgres from 'postgres'` —
// e no Deno — `npm:postgres@3.4.9`). `_shared` não importa o pacote: recebe a instância.
//
// Convenções de parâmetros (postgres.js com prepare: false):
//  - jsonb: passar o VALOR JS (objeto/array) com cast explícito `$n::jsonb` (o pacote serializa).
//  - text[]: passar array JS com cast `$n::text[]`.
//  - date/time: passar texto e fazer cast; nas leituras, converter para texto no SQL (`::text`).

export type Linha = Record<string, unknown>

export interface Executor {
  consulta<T extends Linha = Linha>(texto: string, parametros?: unknown[]): Promise<T[]>
}

export interface Db extends Executor {
  transacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T>
}

/** Forma mínima de uma instância postgres.js usada aqui. */
export interface PostgresJsLike {
  unsafe(texto: string, parametros?: unknown[]): PromiseLike<unknown>
  begin<T>(fn: (tx: { unsafe(texto: string, parametros?: unknown[]): PromiseLike<unknown> }) => Promise<T>): PromiseLike<unknown>
}

function executor(alvo: { unsafe(texto: string, parametros?: unknown[]): PromiseLike<unknown> }): Executor {
  return {
    async consulta<T extends Linha = Linha>(texto: string, parametros: unknown[] = []) {
      const r = await alvo.unsafe(texto, parametros as never[])
      return Array.from(r as Iterable<T>)
    },
  }
}

export function adaptadorPostgres(sql: PostgresJsLike): Db {
  const raiz = executor(sql)
  return {
    consulta: raiz.consulta,
    async transacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
      const r = await sql.begin(tx => fn(executor(tx)))
      return r as T
    },
  }
}

/** Converte Date ou texto de timestamptz para ISO 8601 UTC. */
export function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d.toISOString()
  }
  return ''
}

export function isoOuNull(v: unknown): string | null {
  return v === null || v === undefined ? null : iso(v)
}

export function textoOuNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v)
}
