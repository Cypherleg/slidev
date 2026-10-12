// Inicialização comum das Edge Functions (Deno). Pasta com "_": não é uma função.
// Fino de propósito: lê o ambiente, cria a conexão (postgres.js, prepare: false por causa do
// pooler) e entrega o handler de `_shared/api`. Nunca usa autenticação fictícia.

import postgres from 'npm:postgres@3.4.9'
import {
  adaptadorPostgres,
  criarArmazenamentoSupabase,
  criarAutenticadorSupabase,
  criarClienteDatasigh,
  criarHandler,
  erro,
  ErroConfig,
  lerConfig,
  loggerConsole,
  type ArmazenamentoAnexos,
  type ConfigApi,
  type Db,
  type Funcao,
} from '../_shared/api/index.ts'

export const logger = loggerConsole()

const CABECALHOS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function respostaIndisponivel(): Response {
  return new Response(JSON.stringify({ ok: false, erro: { codigo: 'indisponivel', mensagem: 'Serviço indisponível. Nenhuma ação externa foi disparada.' } }), {
    status: 503,
    headers: CABECALHOS,
  })
}

const armazenamentoAusente: ArmazenamentoAnexos = {
  salvar() {
    throw erro('indisponivel', 'Armazenamento de anexos não configurado. Nada foi registrado.')
  },
  urlAssinada() {
    throw erro('indisponivel')
  },
}

let conexao: { config: ConfigApi; db: Db } | null = null

/** Config + conexão únicas por instância. Lança ErroConfig (só nomes de variáveis). */
export function ambiente(): { config: ConfigApi; db: Db } {
  if (conexao) return conexao
  const config = lerConfig(nome => Deno.env.get(nome))
  if (config.modoDev) throw new ErroConfig(['JORNADA_MODO_DEV'])
  const url = Deno.env.get('SUPABASE_DB_URL')
  if (!url) throw new ErroConfig(['SUPABASE_DB_URL'])
  const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })
  conexao = { config, db: adaptadorPostgres(sql) }
  return conexao
}

/** Handler da função (equipe ou paciente). Configuração inválida: 503 em toda requisição. */
export function criarServico(funcao: Funcao): (req: Request) => Promise<Response> {
  try {
    const { config, db } = ambiente()
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new ErroConfig(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
    const handler = criarHandler({
      config,
      db,
      autenticador: criarAutenticadorSupabase({ supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey }),
      datasigh: criarClienteDatasigh(config.datasigh),
      armazenamento: config.supabaseServiceRoleKey
        ? criarArmazenamentoSupabase({ supabaseUrl: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey })
        : armazenamentoAusente,
      logger,
      funcoes: [funcao],
    })
    return handler
  } catch (e) {
    logger.erro('configuracao', { funcao, variaveis: e instanceof ErroConfig ? e.variaveis.join(',') : 'erro_inesperado' })
    return () => Promise.resolve(respostaIndisponivel())
  }
}
