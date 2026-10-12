// Servidor local de demonstração (Node): `npx tsx dev/servidor.ts` ou `npm run dev:api`.
// - Porta 8787 (JORNADA_DEV_PORTA). Rotas: /functions/v1/jornada-cirurgica, /functions/v1/jornada-paciente,
//   GET /dev/usuarios, POST /dev/login {userId} → {token}, GET /dev/links (links do paciente gerados),
//   GET /dev/datasigh/pacientes?cpf= (Datasigh FICTÍCIO), GET /dev/anexos/... (URL assinada local).
// - Banco: JORNADA_DEV_BANCO (padrão jornada_dev) no Postgres local (npm run pg:iniciar).
//   Cria se não existir; JORNADA_DEV_RECRIAR=true derruba e recria. Aplica stub + migrations
//   (idempotentes) a cada partida e semeia dados FICTÍCIOS quando o banco está vazio.
// - Sempre modo dev e modo ensaio: ENVIO_PACIENTES_HABILITADO=false (forçado).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import postgres from 'postgres'
import {
  adaptadorPostgres,
  criarArmazenamentoLocal,
  criarAutenticadorDev,
  criarClienteDatasigh,
  criarHandler,
  emitirTokenDev,
  lerConfig,
  loggerConsole,
  restaurarToken,
  type ConfigApi,
} from '../supabase/functions/_shared/api/index.ts'
import { MAPA_CAMPOS_FICTICIO, responderDatasighFicticio } from './datasigh-ficticio.ts'
import { semear } from './semente.ts'
import { LISTA_USUARIOS } from './usuarios.ts'

const RAIZ = join(import.meta.dirname, '..')
const PORTA = Number(process.env.JORNADA_DEV_PORTA ?? 8787)
const HOST = process.env.JORNADA_DEV_HOST ?? '127.0.0.1'
const BANCO = process.env.JORNADA_DEV_BANCO ?? 'jornada_dev'
const RECRIAR = process.env.JORNADA_DEV_RECRIAR === 'true'
const URL_ADMIN = process.env.JC_PG_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres'
const SEGREDO_DEV = process.env.JORNADA_DEV_SEGREDO ?? 'segredo-somente-desenvolvimento-local-0001'
const BASE = `http://${HOST}:${PORTA}`

if (!/^[a-z_][a-z0-9_]{0,62}$/.test(BANCO)) {
  console.error('JORNADA_DEV_BANCO inválido (use letras minúsculas, dígitos e _).')
  process.exit(1)
}

function ambienteDev(): Record<string, string> {
  const origens = process.env.JORNADA_ORIGENS_PERMITIDAS ?? ['5173', '4173'].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]).join(',')
  return {
    JORNADA_MODO_DEV: 'true',
    JORNADA_AMBIENTE: 'desenvolvimento',
    JORNADA_SEGREDO_CPF: process.env.JORNADA_SEGREDO_CPF ?? 'segredo-cpf-somente-desenvolvimento-local-01',
    JORNADA_SEGREDO_ATOR: process.env.JORNADA_SEGREDO_ATOR ?? 'segredo-ator-somente-desenvolvimento-local-1',
    JORNADA_ATOR_TTL_MIN: process.env.JORNADA_ATOR_TTL_MIN ?? '15',
    JORNADA_CPF_CONSULTAS_HORA: process.env.JORNADA_CPF_CONSULTAS_HORA ?? '30',
    JORNADA_EXIGIR_MFA: 'false',
    ENVIO_PACIENTES_HABILITADO: 'false', // sempre: nada sai do servidor local
    JORNADA_ORIGENS_PERMITIDAS: origens,
    JORNADA_URL_PAGINA_PACIENTE: process.env.JORNADA_URL_PAGINA_PACIENTE ?? 'http://127.0.0.1:5173/p/',
    JORNADA_LINK_VALIDADE_DIAS: '30',
    JORNADA_PIN_ITERACOES: process.env.JORNADA_PIN_ITERACOES ?? '100000',
    DATASIGH_BASE_URL: `${BASE}/dev/datasigh/`,
    DATASIGH_CAMINHO_BUSCA_CPF: 'pacientes?cpf={cpf}',
    DATASIGH_MAPA_CAMPOS: MAPA_CAMPOS_FICTICIO,
    DATASIGH_TIMEOUT_MS: '4000',
  }
}

async function prepararBanco(): Promise<string> {
  const admin = postgres(URL_ADMIN, { max: 1, onnotice: () => {} })
  try {
    const existe = (await admin`select 1 from pg_database where datname = ${BANCO}`).length > 0
    if (existe && RECRIAR) {
      await admin.unsafe(`drop database ${BANCO} with (force)`)
      console.log(`[dev] banco ${BANCO} removido (JORNADA_DEV_RECRIAR=true)`)
    }
    if (!existe || RECRIAR) {
      await admin.unsafe(`create database ${BANCO}`)
      console.log(`[dev] banco ${BANCO} criado`)
    }
  } finally {
    await admin.end()
  }
  const url = URL_ADMIN.replace(/\/[^/]*$/, `/${BANCO}`)
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(readFileSync(join(RAIZ, 'tests', 'apoio', 'supabase-stub.sql'), 'utf8'))
    const dir = join(RAIZ, 'supabase', 'migrations')
    const arquivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    for (const f of arquivos) await sql.unsafe(readFileSync(join(dir, f), 'utf8'))
    console.log(`[dev] ${arquivos.length} migrations aplicadas`)
  } finally {
    await sql.end()
  }
  return url
}

async function lerCorpo(req: IncomingMessage, limite = 8_000_000): Promise<Buffer> {
  const partes: Buffer[] = []
  let total = 0
  for await (const c of req) {
    total += (c as Buffer).length
    if (total > limite) throw new Error('corpo grande demais')
    partes.push(c as Buffer)
  }
  return Buffer.concat(partes)
}

async function paraRequest(req: IncomingMessage, corpo: Buffer): Promise<Request> {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  const metodo = req.method ?? 'GET'
  return new Request(`${BASE}${req.url ?? '/'}`, { method: metodo, headers, body: metodo === 'GET' || metodo === 'HEAD' ? undefined : new Uint8Array(corpo) })
}

async function enviar(res: ServerResponse, r: Response): Promise<void> {
  res.statusCode = r.status
  r.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await r.arrayBuffer()))
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(corpo))
}

async function principal(): Promise<void> {
  const env = ambienteDev()
  const config: ConfigApi = lerConfig(n => env[n])
  const url = await prepararBanco()
  const sql = postgres(url, { max: 10, prepare: false, onnotice: () => {} })
  const db = adaptadorPostgres(sql)
  const dirAnexos = join(tmpdir(), 'jornada-dev-anexos', BANCO)
  const armazenamento = criarArmazenamentoLocal({
    segredo: SEGREDO_DEV,
    baseUrl: `${BASE}/dev/anexos`,
    gravar: async (caminho, conteudo) => {
      const destino = join(dirAnexos, caminho)
      await mkdir(dirname(destino), { recursive: true })
      await writeFile(destino, conteudo)
    },
    ler: async caminho => readFile(join(dirAnexos, caminho)).then(b => new Uint8Array(b)).catch(() => null),
  })
  const handler = criarHandler({
    config,
    db,
    autenticador: criarAutenticadorDev(config, SEGREDO_DEV),
    datasigh: criarClienteDatasigh(config.datasigh),
    armazenamento,
    logger: loggerConsole(),
  })

  const tokenDe = (userId: string) => {
    const u = LISTA_USUARIOS.find(x => x.id === userId)
    return u ? emitirTokenDev(SEGREDO_DEV, { id: u.id, email: u.email, aal: 'aal2' }) : null
  }

  // Semente (dados fictícios) antes de abrir a porta: /dev/usuarios só responde com tudo pronto.
  await semear({ sql, handler, config, tokenDe })

  const servidor = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', BASE)
      if (u.pathname.startsWith('/functions/v1/')) {
        const corpo = await lerCorpo(req)
        return await enviar(res, await handler(await paraRequest(req, corpo)))
      }
      if (u.pathname === '/dev/usuarios' && req.method === 'GET') return json(res, 200, LISTA_USUARIOS)
      if (u.pathname === '/dev/saude') return json(res, 200, { ok: true, banco: BANCO })
      if (u.pathname === '/dev/login' && req.method === 'POST') {
        let userId: unknown
        try {
          userId = (JSON.parse((await lerCorpo(req, 10_000)).toString('utf8')) as { userId?: unknown }).userId
        } catch {
          return json(res, 400, { erro: 'JSON inválido' })
        }
        const token = typeof userId === 'string' ? await tokenDe(userId) : null
        return token ? json(res, 200, { token }) : json(res, 404, { erro: 'Usuário fictício não encontrado' })
      }
      if (u.pathname.startsWith('/dev/datasigh/') && req.method === 'GET') {
        const r = await responderDatasighFicticio(u)
        return json(res, r.status, r.corpo)
      }
      if (u.pathname.startsWith('/dev/anexos/') && req.method === 'GET') {
        const caminho = decodeURIComponent(u.pathname.slice('/dev/anexos/'.length))
        const ok = await armazenamento.verificarUrl(caminho, u.searchParams.get('exp') ?? '', u.searchParams.get('sig') ?? '')
        if (!ok) return json(res, 403, { erro: 'URL inválida ou expirada' })
        const arq = await armazenamento.ler(caminho)
        if (!arq) return json(res, 404, { erro: 'não encontrado' })
        res.statusCode = 200
        res.setHeader('Content-Type', arq.contentType)
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        return res.end(Buffer.from(arq.conteudo))
      }
      if (u.pathname === '/dev/links' && req.method === 'GET') {
        // Só no servidor local: mostra os links da página do paciente gerados (modo ensaio, nada saiu).
        const linhas = await sql`select episodio_id, texto, parametros, criado_em from jornada_cirurgica.mensagens_saida
          where parametros ? '_link_token_cifrado' order by criado_em desc limit 50`
        const links: { episodioId: string; url: string; criadoEm: string }[] = []
        const vistos = new Set<string>()
        for (const l of linhas) {
          const r = await restaurarToken('{{LINK_TOKEN}}', l.parametros as Record<string, string>, config.segredoAtor)
          if (!r || vistos.has(r.texto)) continue
          vistos.add(r.texto)
          links.push({ episodioId: String(l.episodio_id), url: `${config.urlPaginaPaciente ?? ''}${r.texto}`, criadoEm: new Date(l.criado_em as string).toISOString() })
        }
        return json(res, 200, links)
      }
      json(res, 404, { erro: 'rota não encontrada' })
    } catch {
      if (!res.headersSent) json(res, 500, { erro: 'erro interno' })
    }
  })
  servidor.listen(PORTA, HOST, () => {
    console.log(`[dev] API local em ${BASE}/functions/v1/ (banco ${BANCO}; modo ensaio; usuários: ${BASE}/dev/usuarios)`)
  })
  const fechar = () => {
    servidor.close()
    void sql.end({ timeout: 2 }).finally(() => process.exit(0))
  }
  process.on('SIGINT', fechar)
  process.on('SIGTERM', fechar)
}

principal().catch(e => {
  console.error('[dev] falha ao iniciar:', e instanceof Error ? e.message : 'erro')
  process.exit(1)
})
