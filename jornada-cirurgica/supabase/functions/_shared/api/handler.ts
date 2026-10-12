// Handler HTTP das Edge Functions `jornada-cirurgica` (equipe) e `jornada-paciente` (página do
// paciente). Fluxo: rota → CORS → corpo JSON com limite → autenticação → membro/ator → ação →
// JSON. Erros: códigos do contrato, mensagens genéricas, nada de dado de paciente em log.

import type { AcaoEquipe, AcaoPaciente, RespostaApi } from './contrato.ts'
import { acoesEquipe } from './acoes-equipe.ts'
import { acoesPaciente, validarLinkPaciente } from './acoes-paciente.ts'
import { extrairBearer } from './auth.ts'
import { uuid as novoUuid } from './cripto.ts'
import { camposLogErro, converterErro, erro, ErroApiHttp } from './erros.ts'
import { loggerConsole } from './logger.ts'
import { verificarTokenAtor } from './pin.ts'
import { buscarConvite, buscarMembro, buscarMembroPorEmail, comoSistema, inscreverMembro, S } from './repositorio.ts'
import type { ContextoReq, DepsApi } from './servico.ts'
import * as v from './validar.ts'

export type DepsHandler = Omit<DepsApi, 'logger' | 'relogio' | 'gerarId'> & Partial<Pick<DepsApi, 'logger' | 'relogio' | 'gerarId'>>

export type Funcao = 'equipe' | 'paciente'

const PAPEIS_MFA = ['cirurgiao', 'gestora'] as const

const CABECALHOS_SEGURANCA: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const CABECALHOS_PERMITIDOS = 'authorization, content-type, x-jornada-aparelho, x-jornada-ator, x-client-info, apikey'

/** Identifica a função pelo caminho: aceita `/functions/v1/<nome>` e `/<nome>`. */
export function rotaDe(pathname: string): Funcao | null {
  const p = pathname.replace(/\/+$/, '').replace(/^\/functions\/v1(?=\/)/, '')
  if (p === '/jornada-cirurgica') return 'equipe'
  if (p === '/jornada-paciente') return 'paciente'
  return null
}

function cabecalhosCors(origem: string | null, permitidas: string[]): Record<string, string> | null | 'proibida' {
  if (!origem) return null
  if (!permitidas.includes(origem)) return 'proibida'
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': CABECALHOS_PERMITIDOS,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function resposta(status: number, corpo: unknown, cors: Record<string, string> | null): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { ...CABECALHOS_SEGURANCA, ...(cors ?? {}), ...(cors ? {} : { Vary: 'Origin' }) } })
}

function respostaErro(e: ErroApiHttp, cors: Record<string, string> | null): Response {
  const corpo: RespostaApi<never> = { ok: false, erro: e.paraCorpo() }
  return resposta(e.status, corpo, cors)
}

async function lerCorpo(req: Request, limite: number): Promise<{ texto: string; bytes: number }> {
  const declarado = req.headers.get('content-length')
  if (declarado && Number(declarado) > limite) throw new ErroApiHttp('validacao', 'Requisição grande demais.', undefined, 413)
  if (!req.body) return { texto: '', bytes: 0 }
  const leitor = req.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.byteLength
    if (total > limite) {
      await leitor.cancel().catch(() => {})
      throw new ErroApiHttp('validacao', 'Requisição grande demais.', undefined, 413)
    }
    partes.push(value)
  }
  const tudo = new Uint8Array(total)
  let pos = 0
  for (const p of partes) {
    tudo.set(p, pos)
    pos += p.byteLength
  }
  return { texto: new TextDecoder('utf-8', { fatal: true }).decode(tudo), bytes: total }
}

const temAcao = (obj: object, acao: string) => Object.prototype.hasOwnProperty.call(obj, acao)

/** Membro e ator a partir do Auth verificado (nunca do corpo). */
async function contextoEquipe(deps: DepsApi, req: Request, acao: AcaoEquipe): Promise<ContextoReq> {
  const token = extrairBearer(req.headers.get('authorization'))
  if (!token) throw erro('nao_autenticado')
  const usuario = await deps.autenticador.verificar(token)
  if (!usuario.emailConfirmado) throw erro('nao_autenticado', 'E-mail ainda não confirmado.')
  const aparelhoId = v.aparelho(req.headers.get('x-jornada-aparelho'))
  const agora = deps.relogio()
  const cabecalhoAtor = req.headers.get('x-jornada-ator')

  const r = await deps.db.transacao(async tx => {
    await comoSistema(tx)
    let membro = await buscarMembro(tx, usuario.userId)
    if (!membro) {
      // Inscrição: e-mail do Auth verificado, nunca do corpo.
      const convite = await buscarConvite(tx, usuario.email)
      if (!convite || !convite.ativo || (convite.vinculadoUserId && convite.vinculadoUserId !== usuario.userId)) return { tipo: 'sem_acesso' as const }
      if (await buscarMembroPorEmail(tx, usuario.email)) return { tipo: 'sem_acesso' as const }
      await inscreverMembro(tx, convite, usuario.userId)
      membro = await buscarMembro(tx, usuario.userId)
    }
    if (!membro || !membro.ativo) return { tipo: 'sem_acesso' as const }
    let ator = membro
    let atorViaPin: ContextoReq['atorViaPin'] = null
    if (cabecalhoAtor) {
      const t = await verificarTokenAtor(deps.config.segredoAtor, cabecalhoAtor, { sessaoUsuarioId: membro.id, aparelhoId }, agora.getTime())
      if (!t) return { tipo: 'ator_invalido' as const }
      const encerrado = await tx.consulta(`select 1 from ${S}.acessos where recurso = 'ator_encerrado' and sessao_usuario_id = $1::uuid and detalhe->>'jti' = $2 limit 1`, [membro.id, t.jti])
      if (encerrado.length) return { tipo: 'ator_invalido' as const }
      const outro = t.membroId === membro.id ? membro : await buscarMembro(tx, t.membroId)
      if (!outro || !outro.ativo) return { tipo: 'ator_invalido' as const }
      ator = outro
      atorViaPin = { expiraEm: t.expiraEm, jti: t.jti }
    }
    return { tipo: 'ok' as const, membro, ator, atorViaPin }
  })
  if (r.tipo === 'sem_acesso') throw erro('sem_permissao', 'Usuário sem acesso a este painel.')
  if (r.tipo === 'ator_invalido') throw erro('nao_autenticado', 'A troca de usuário expirou. Informe o PIN de novo.', { motivo: 'ator' })

  // Segundo fator: exigido do usuário que fez o login (cirurgião e gestora). `sessao` responde
  // mesmo assim, para a interface saber que precisa pedir o código.
  if (deps.config.exigirMfa && acao !== 'sessao' && usuario.aal !== 'aal2' && r.membro.papeis.some(p => (PAPEIS_MFA as readonly string[]).includes(p))) {
    throw erro('mfa_exigido')
  }
  return {
    deps,
    usuario,
    membro: r.membro,
    ator: { id: r.ator.id, nome: r.ator.nome, papeis: r.ator.papeis, sessaoUsuarioId: r.membro.id, aparelhoId },
    atorViaPin: r.atorViaPin,
    aparelhoId,
    agora,
  }
}

export function criarHandler(entrada: DepsHandler): (req: Request) => Promise<Response> {
  const deps: DepsApi = {
    ...entrada,
    logger: entrada.logger ?? loggerConsole(),
    relogio: entrada.relogio ?? (() => new Date()),
    gerarId: entrada.gerarId ?? novoUuid,
  }
  const { config, logger } = deps

  return async (req: Request): Promise<Response> => {
    const inicio = Date.now()
    let funcao: Funcao | null = null
    let acaoLog = '-'
    let cors: Record<string, string> | null = null
    try {
      const url = new URL(req.url)
      funcao = rotaDe(url.pathname)
      const c = cabecalhosCors(req.headers.get('origin'), config.origensPermitidas)
      if (c === 'proibida') {
        logger.info('requisicao', { funcao: funcao ?? '-', status: 403, codigo: 'origem' })
        return resposta(403, { ok: false, erro: { codigo: 'sem_permissao', mensagem: 'Origem não permitida.' } }, null)
      }
      cors = c
      if (req.method === 'OPTIONS') return resposta(204, null, cors)
      if (!funcao) throw new ErroApiHttp('nao_encontrado', 'Rota não encontrada.')
      if (req.method !== 'POST') throw new ErroApiHttp('validacao', 'Método não permitido.', undefined, 405)
      const tipo = (req.headers.get('content-type') ?? '').toLowerCase()
      if (!tipo.startsWith('application/json')) throw new ErroApiHttp('validacao', 'Envie JSON.', undefined, 415)

      const { texto, bytes } = await lerCorpo(req, config.limiteCorpoAnexoBytes)
      let corpo: unknown
      try {
        corpo = JSON.parse(texto)
      } catch {
        throw erro('validacao', 'JSON inválido.')
      }
      if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) throw erro('validacao', 'Corpo inválido.')
      const { acao, dados } = corpo as { acao?: unknown; dados?: unknown }
      if (typeof acao !== 'string') throw erro('validacao', 'Ação ausente.')
      const dadosObj = v.objeto(dados, 'dados')

      if (funcao === 'equipe') {
        if (!temAcao(acoesEquipe, acao)) throw erro('nao_encontrado', 'Ação desconhecida.')
        acaoLog = acao
        if (acao !== 'anexo.enviar' && bytes > config.limiteCorpoBytes) throw new ErroApiHttp('validacao', 'Requisição grande demais.', undefined, 413)
        const ctx = await contextoEquipe(deps, req, acao as AcaoEquipe)
        const fn = acoesEquipe[acao as AcaoEquipe] as (c: ContextoReq, d: v.Obj) => Promise<unknown>
        const saida = await fn(ctx, dadosObj)
        logger.info('requisicao', { funcao, acao: acaoLog, status: 200, ms: Date.now() - inicio })
        return resposta(200, { ok: true, dados: saida }, cors)
      }

      // Página do paciente
      if (!temAcao(acoesPaciente, acao)) throw erro('nao_encontrado', 'Ação desconhecida.')
      acaoLog = acao
      if (bytes > config.limiteCorpoBytes) throw new ErroApiHttp('validacao', 'Requisição grande demais.', undefined, 413)
      const agora = deps.relogio()
      const link = await validarLinkPaciente(deps, (corpo as { token?: unknown }).token, agora)
      const fn = acoesPaciente[acao as AcaoPaciente] as (c: { deps: DepsApi; agora: Date; link: typeof link }, d: v.Obj) => Promise<unknown>
      const saida = await fn({ deps, agora, link }, dadosObj)
      logger.info('requisicao', { funcao, acao: acaoLog, status: 200, ms: Date.now() - inicio })
      return resposta(200, { ok: true, dados: saida }, cors)
    } catch (e) {
      const api = converterErro(e)
      const campos = camposLogErro(e)
      const nivel = api.status >= 500 ? 'erro' : 'info'
      logger[nivel]('requisicao', {
        funcao: funcao ?? '-',
        acao: acaoLog,
        status: api.status,
        codigo: api.codigo,
        tipo: campos.tipo,
        sqlstate: campos.tipo === 'postgres' ? campos.codigo : null,
        restricao: campos.restricao ?? null,
        ms: Date.now() - inicio,
      })
      return respostaErro(api, cors)
    }
  }
}
