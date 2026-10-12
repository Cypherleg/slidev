// Apoio dos testes da API: banco descartável real (Postgres local), autenticação fictícia,
// Datasigh e Meta falsos, armazenamento em memória e logger capturado.
// Só dados fictícios. CPFs de teste: dígitos verificadores válidos e prefixo reservado 900.

import {
  configPadrao,
  decidir,
  ErroDominio,
  modelosPadrao,
  montarEstado,
  ORDEM_MODELOS,
  papeisPermitidosParaEvento,
  projetarVisao,
  validarCpf,
  type Papel,
} from '../../supabase/functions/_shared/dominio/index.ts'
import type { AcaoEquipe, AcaoPaciente, AcoesEquipe, AcoesPaciente, RespostaApi } from '../../supabase/functions/_shared/api/contrato.ts'
import {
  adaptadorPostgres,
  criarArmazenamentoLocal,
  criarAutenticadorDev,
  criarClienteDatasigh,
  criarHandler,
  emitirTokenDev,
  gerarHashPin,
  lerConfig,
  loggerCapturado,
  type ConfigApi,
  type Db,
  type FetchLike,
} from '../../supabase/functions/_shared/api/index.ts'
import postgres from 'postgres'
import { arquivosMigration, criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import { roteiro, type Chamar } from '../../dev/roteiro.ts'

export const SEGREDO_DEV = 'segredo-dev-somente-testes-0123456789'
export const PIN = '135790'
export const ORIGEM = 'http://127.0.0.1:5173'

export interface UsuarioTeste {
  id: string
  email: string
  nome: string
  papeis: Papel[]
}

const u = (n: number, chave: string, nome: string, papeis: Papel[]): UsuarioTeste => ({
  id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  email: `${chave}@exemplo.test`,
  nome,
  papeis,
})

export const U = {
  concierge: u(1, 'concierge', 'Concierge Teste Ana', ['concierge']),
  conferente: u(2, 'conferente', 'Conferente Teste Beatriz', ['conferente']),
  conferente2: u(3, 'conferente2', 'Conferente Substituta Teste Carla', ['conferente']),
  enfermagem: u(4, 'enfermagem', 'Enfermagem Teste Diana', ['enfermagem']),
  circulante: u(5, 'circulante', 'Circulante Teste Eduardo', ['circulante']),
  anestesista: u(6, 'anestesista', 'Anestesista Teste Fabio', ['anestesista']),
  cirurgiao: u(7, 'cirurgiao', 'Cirurgiao Teste Gustavo', ['cirurgiao']),
  cirurgiao2: u(8, 'cirurgiao2', 'Cirurgia Teste Helena', ['cirurgiao']),
  gestora: u(9, 'gestora', 'Gestora Teste Isabel', ['gestora']),
  /** Concierge e conferente ao mesmo tempo (conferência cega por pessoa). */
  dupla: u(10, 'dupla', 'Dupla Funcao Teste Joana', ['concierge', 'conferente']),
} as const

/** Convidada mas ainda não inscrita (inscrição no primeiro acesso). */
export const CONVIDADA = u(20, 'convidada', 'Convidada Teste Karina', ['enfermagem'])
/** Sem convite. */
export const SEM_CONVITE = u(21, 'semconvite', 'Sem Convite Teste Lucas', ['enfermagem'])
/** Membro desativado. */
export const INATIVO = u(22, 'inativo', 'Inativo Teste Mario', ['concierge'])

/** CPF de teste com dígitos verificadores válidos (prefixo 900). */
export function cpfTeste(n: number): string {
  const base = `900${String(n).padStart(6, '0')}`
  const d = base.split('').map(Number)
  const dv = (arr: number[]) => {
    const soma = arr.reduce((s, x, i) => s + x * (arr.length + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(d)
  const d2 = dv([...d, d1])
  return `${base}${d1}${d2}`
}

// ---------------------------------------------------------------------------
// O domínio já está implementado? (o agente domínio trabalha em paralelo)
// ---------------------------------------------------------------------------

function implementado(fn: () => unknown): boolean {
  try {
    fn()
    return true
  } catch (e) {
    return !(e instanceof ErroDominio && e.codigo === 'NAO_IMPLEMENTADO')
  }
}

export const dominioUtil = implementado(() => validarCpf('00000000000')) && implementado(() => configPadrao())
export const dominioPronto =
  dominioUtil &&
  implementado(() => modelosPadrao()) &&
  implementado(() => montarEstado({ episodio: { id: 'x' } } as never)) &&
  implementado(() => decidir({ estado: 'x' } as never, { tipo: 'x' } as never, { ator: { id: 'x' } } as never)) &&
  implementado(() => projetarVisao({ estado: 'x' } as never, { id: 'x' } as never, '')) &&
  implementado(() => papeisPermitidosParaEvento('episodio.aberto'))
export const bancoPronto = arquivosMigration().length > 0

// ---------------------------------------------------------------------------
// Falsos
// ---------------------------------------------------------------------------

export interface RegistroDatasighFalso {
  id: string
  nome?: string
  nascimento?: string
  prontuario?: string
  celulares?: string[]
}

/** Datasigh falso (formato FICTÍCIO, configurado pelo mapa de campos). Registra métodos usados. */
export function datasighFalso(registros: Record<string, RegistroDatasighFalso>, opcoes: { atraso?: number; status?: number } = {}) {
  const chamadas: { metodo: string; url: string }[] = []
  const f: FetchLike = async (url, init) => {
    chamadas.push({ metodo: init?.method ?? 'GET', url })
    if (opcoes.atraso) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, opcoes.atraso)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('abortado'))
        })
      })
    }
    if (opcoes.status) return new Response('{}', { status: opcoes.status })
    const cpf = new URL(url).searchParams.get('cpf') ?? ''
    const r = registros[cpf]
    return new Response(JSON.stringify({ pacientes: r ? [r] : [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch: f, chamadas }
}

export const MAPA_DATASIGH = JSON.stringify({ lista: 'pacientes', datasighId: 'id', nomeCompleto: 'nome', dataNascimento: 'nascimento', prontuario: 'prontuario', telefones: 'celulares' })

export function envTeste(extra: Record<string, string> = {}): Record<string, string> {
  return {
    JORNADA_MODO_DEV: 'true',
    JORNADA_AMBIENTE: 'desenvolvimento',
    JORNADA_SEGREDO_CPF: 'segredo-cpf-somente-testes-0123456789abcdef',
    JORNADA_SEGREDO_ATOR: 'segredo-ator-somente-testes-0123456789abcdef',
    JORNADA_ORIGENS_PERMITIDAS: ORIGEM,
    JORNADA_PIN_ITERACOES: '2000',
    JORNADA_URL_PAGINA_PACIENTE: 'https://exemplo.invalid/p/',
    JORNADA_CPF_CONSULTAS_HORA: '30',
    DATASIGH_BASE_URL: 'https://datasigh.exemplo.invalid/api/',
    DATASIGH_CAMINHO_BUSCA_CPF: 'pacientes?cpf={cpf}',
    DATASIGH_MAPA_CAMPOS: MAPA_DATASIGH,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Ambiente com banco
// ---------------------------------------------------------------------------

export interface Resposta<T> {
  status: number
  corpo: RespostaApi<T>
  cabecalhos: Headers
}

export interface OpcoesChamada {
  ator?: string | null
  aparelho?: string | null
  origem?: string | null
  aal?: 'aal1' | 'aal2'
}

export interface Ambiente {
  banco: BancoTeste
  db: Db
  config: ConfigApi
  logger: ReturnType<typeof loggerCapturado>
  armazenamento: ReturnType<typeof criarArmazenamentoLocal>
  datasigh: ReturnType<typeof datasighFalso>
  handler: (req: Request) => Promise<Response>
  token(usuario: Pick<UsuarioTeste, 'id' | 'email'>, aal?: 'aal1' | 'aal2'): Promise<string>
  chamar<A extends AcaoEquipe>(usuario: Pick<UsuarioTeste, 'id' | 'email'>, acao: A, dados: AcoesEquipe[A]['E'] | Record<string, unknown>, opcoes?: OpcoesChamada): Promise<Resposta<AcoesEquipe[A]['S']>>
  ok<A extends AcaoEquipe>(usuario: Pick<UsuarioTeste, 'id' | 'email'>, acao: A, dados: AcoesEquipe[A]['E'] | Record<string, unknown>, opcoes?: OpcoesChamada): Promise<AcoesEquipe[A]['S']>
  paciente<A extends AcaoPaciente>(token: string, acao: A, dados: AcoesPaciente[A]['E'] | Record<string, unknown>): Promise<Resposta<AcoesPaciente[A]['S']>>
  /** Troca de ator por PIN (mesma sessão e aparelho). */
  pin(sessao: UsuarioTeste, alvo: UsuarioTeste, aparelho?: string): Promise<string>
  encerrar(): Promise<void>
}

export const APARELHO = 'aparelho-teste-0001'

export async function criarAmbiente(
  opcoes: {
    env?: Record<string, string>
    datasigh?: ReturnType<typeof datasighFalso>
    semModelos?: boolean
    configExtra?: Partial<ConfigApi>
    /** Pool próprio com mais conexões (testes de concorrência; cada Edge Function tem a sua conexão). */
    poolMax?: number
  } = {},
): Promise<Ambiente> {
  const banco = await criarBancoTeste()
  const env = envTeste(opcoes.env)
  const config: ConfigApi = { ...lerConfig(n => env[n]), ...opcoes.configExtra }
  const logger = loggerCapturado()
  const armazenamento = criarArmazenamentoLocal({ segredo: SEGREDO_DEV })
  const datasigh = opcoes.datasigh ?? datasighFalso({})
  const pool = opcoes.poolMax ? postgres(banco.url, { max: opcoes.poolMax, prepare: false, onnotice: () => {} }) : null
  const db = adaptadorPostgres(pool ?? banco.sql)
  const handler = criarHandler({
    config,
    db,
    autenticador: criarAutenticadorDev(config, SEGREDO_DEV),
    datasigh: criarClienteDatasigh(config.datasigh, datasigh.fetch),
    armazenamento,
    logger,
  })
  await semearMembros(banco, config)
  if (!opcoes.semModelos && dominioPronto) await semearModelos(banco)
  await banco.sql`insert into jornada_cirurgica.materiais (codigo, versao, titulo, tipo, url, momento, publico, ativo)
    values ('video_preparo', 1, 'Video de preparo (exemplo)', 'video', 'https://exemplo.invalid/video-preparo', 'd7', 'paciente', true)`

  const token = (usuario: Pick<UsuarioTeste, 'id' | 'email'>, aal: 'aal1' | 'aal2' = 'aal2') => emitirTokenDev(SEGREDO_DEV, { id: usuario.id, email: usuario.email, aal })

  async function chamar<A extends AcaoEquipe>(usuario: Pick<UsuarioTeste, 'id' | 'email'>, acao: A, dados: unknown, o: OpcoesChamada = {}): Promise<Resposta<AcoesEquipe[A]['S']>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${await token(usuario, o.aal)}` }
    const aparelho = o.aparelho === undefined ? APARELHO : o.aparelho
    if (aparelho) headers['x-jornada-aparelho'] = aparelho
    if (o.ator) headers['x-jornada-ator'] = o.ator
    if (o.origem) headers.Origin = o.origem
    const r = await handler(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'POST', headers, body: JSON.stringify({ acao, dados }) }))
    return { status: r.status, corpo: (await r.json()) as RespostaApi<AcoesEquipe[A]['S']>, cabecalhos: r.headers }
  }

  const amb: Ambiente = {
    banco,
    db,
    config,
    logger,
    armazenamento,
    datasigh,
    handler,
    token,
    chamar,
    async ok(usuario, acao, dados, o) {
      const r = await chamar(usuario, acao, dados, o)
      if (!r.corpo.ok) throw new Error(`${acao} falhou: ${r.status} ${r.corpo.erro.codigo} ${r.corpo.erro.mensagem} ${JSON.stringify(r.corpo.erro.detalhes ?? {})}`)
      return r.corpo.dados
    },
    async paciente(tokenLink, acao, dados) {
      const r = await handler(
        new Request('http://localhost/functions/v1/jornada-paciente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, token: tokenLink, dados }) }),
      )
      return { status: r.status, corpo: (await r.json()) as never, cabecalhos: r.headers }
    },
    async pin(sessao, alvo, aparelho = APARELHO) {
      const r = await amb.ok(sessao, 'ator.pin', { membroId: alvo.id, pin: PIN }, { aparelho })
      return r.token
    },
    encerrar: async () => {
      if (pool) await pool.end({ timeout: 5 })
      await banco.encerrar()
    },
  }
  return amb
}

/** Membros fictícios (como dono do banco: dado de partida, não ação da API). */
export async function semearMembros(banco: BancoTeste, config: ConfigApi): Promise<void> {
  const hash = await gerarHashPin(config.segredoAtor, PIN, config.iteracoesPin)
  for (const m of Object.values(U)) {
    await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo, vinculado_user_id) values (${m.email}, ${m.nome}, ${m.papeis}, true, ${m.id})`
    await banco.sql`insert into jornada_cirurgica.membros (user_id, email, nome, papeis, ativo, pin_hash, pin_atualizado_em) values (${m.id}, ${m.email}, ${m.nome}, ${m.papeis}, true, ${hash}, now())`
  }
  await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo) values (${CONVIDADA.email}, ${CONVIDADA.nome}, ${CONVIDADA.papeis}, true)`
  await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo, vinculado_user_id) values (${INATIVO.email}, ${INATIVO.nome}, ${INATIVO.papeis}, true, ${INATIVO.id})`
  await banco.sql`insert into jornada_cirurgica.membros (user_id, email, nome, papeis, ativo) values (${INATIVO.id}, ${INATIVO.email}, ${INATIVO.nome}, ${INATIVO.papeis}, false)`
}

/** Modelos v1 do POP (como dono), caso a API não tenha concessão para semear como jornada_sistema. */
export async function semearModelos(banco: BancoTeste): Promise<void> {
  const modelos = modelosPadrao()
  for (const id of ORDEM_MODELOS) {
    const m = modelos[id]
    if (!m) continue
    await banco.sql`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo) values (${id}, ${m.versao}, ${banco.sql.json(m as never)}) on conflict do nothing`
  }
}

/** Todo o conteúdo textual do banco (para procurar valores que não podem estar lá). */
export async function despejoBanco(banco: BancoTeste): Promise<string> {
  const tabelas = await banco.sql<{ t: string }[]>`select table_name as t from information_schema.tables where table_schema = 'jornada_cirurgica'`
  let tudo = ''
  for (const { t } of tabelas) {
    const linhas = await banco.sql.unsafe(`select * from jornada_cirurgica.${t}`)
    tudo += JSON.stringify(linhas)
  }
  return tudo
}

/** Roteiro de episódio (dev/roteiro.ts) com a equipe de teste. */
export function roteiroTeste(amb: Ambiente) {
  const chamar: Chamar = (quem, acao, dados, ator) => amb.ok(quem, acao, dados, { ator })
  return roteiro(chamar, U, PIN)
}
