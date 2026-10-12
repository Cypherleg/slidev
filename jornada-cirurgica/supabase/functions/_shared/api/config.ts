// Leitura das variáveis de ambiente (ARQUITETURA §6). Recebe um leitor injetado
// (Deno.env.get no Deno, process.env no Node) para não depender de runtime.

export type Ambiente = 'desenvolvimento' | 'homologacao' | 'producao'

export interface ConfigDatasigh {
  baseUrl: string
  authHeader: string | null
  authValor: string | null
  /** Caminho relativo à base, com marcador {cpf} (11 dígitos) ou {cpf_formatado} (000.000.000-00). */
  caminhoBuscaCpf: string | null
  /** Mapa de campos (JSON). Ver datasigh.ts. */
  mapaCampos: MapaCamposDatasigh | null
  timeoutMs: number
}

export interface MapaCamposDatasigh {
  /** Caminho (com pontos) até a lista de resultados na resposta, se a resposta for uma lista. */
  lista?: string
  datasighId?: string
  nomeCompleto?: string
  dataNascimento?: string
  prontuario?: string
  /** Um caminho ou vários; valores string ou lista de strings. */
  telefones?: string | string[]
}

export interface ConfigMeta {
  token: string
  phoneId: string
  graphVersao: string
  timeoutMs: number
}

export interface ConfigApi {
  ambiente: Ambiente
  modoDev: boolean
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  supabaseServiceRoleKey: string | null
  origensPermitidas: string[]
  segredoCpf: string
  segredoAtor: string
  atorTtlMin: number
  cpfConsultasHora: number
  exigirMfa: boolean
  envioHabilitado: boolean
  urlPaginaPaciente: string | null
  linkValidadeDias: number
  datasigh: ConfigDatasigh | null
  meta: ConfigMeta | null
  /** Segredo exigido no cabeçalho da função de envio (chamada por agendador). */
  segredoEnvios: string | null
  /** Limite do corpo da requisição (bytes). O envio de foto usa o limite maior. */
  limiteCorpoBytes: number
  limiteCorpoAnexoBytes: number
  /** Iterações do PBKDF2 do PIN (padrão alto; testes podem reduzir). */
  iteracoesPin: number
  /** Limite de falhas de PIN por membro-alvo e por sessão em `janelaPinMin`. */
  falhasPinPorAlvo: number
  falhasPinPorSessao: number
  janelaPinMin: number
}

export class ErroConfig extends Error {
  constructor(public readonly variaveis: string[]) {
    super(`Configuração inválida: ${variaveis.join(', ')}`)
    this.name = 'ErroConfig'
  }
}

type Leitor = (nome: string) => string | undefined

const verdadeiro = (v: string | undefined) => (v ?? '').trim().toLowerCase() === 'true'

function inteiro(v: string | undefined, padrao: number, min: number, max: number): number {
  if (v === undefined || v.trim() === '') return padrao
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) return Number.NaN
  return n
}

function vazioParaNull(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Lê e valida a configuração. Lança ErroConfig com os NOMES das variáveis com problema
 * (nunca os valores).
 */
export function lerConfig(env: Leitor, opcoes: { exigirSegredos?: boolean } = {}): ConfigApi {
  const problemas: string[] = []
  const modoDev = verdadeiro(env('JORNADA_MODO_DEV'))

  const ambienteBruto = vazioParaNull(env('JORNADA_AMBIENTE'))
  let ambiente: Ambiente = modoDev ? 'desenvolvimento' : 'producao'
  if (ambienteBruto) {
    if (ambienteBruto === 'desenvolvimento' || ambienteBruto === 'homologacao' || ambienteBruto === 'producao') ambiente = ambienteBruto
    else problemas.push('JORNADA_AMBIENTE')
  }
  if (modoDev && ambiente === 'producao') problemas.push('JORNADA_MODO_DEV')

  const segredoCpf = env('JORNADA_SEGREDO_CPF') ?? ''
  const segredoAtor = env('JORNADA_SEGREDO_ATOR') ?? ''
  if (opcoes.exigirSegredos !== false) {
    if (segredoCpf.length < 32) problemas.push('JORNADA_SEGREDO_CPF')
    if (segredoAtor.length < 32) problemas.push('JORNADA_SEGREDO_ATOR')
    if (segredoCpf && segredoCpf === segredoAtor) problemas.push('JORNADA_SEGREDO_ATOR')
  }

  const atorTtlMin = inteiro(env('JORNADA_ATOR_TTL_MIN'), 15, 1, 240)
  if (Number.isNaN(atorTtlMin)) problemas.push('JORNADA_ATOR_TTL_MIN')
  const cpfConsultasHora = inteiro(env('JORNADA_CPF_CONSULTAS_HORA'), 30, 1, 10000)
  if (Number.isNaN(cpfConsultasHora)) problemas.push('JORNADA_CPF_CONSULTAS_HORA')
  const linkValidadeDias = inteiro(env('JORNADA_LINK_VALIDADE_DIAS'), 30, 1, 365)
  if (Number.isNaN(linkValidadeDias)) problemas.push('JORNADA_LINK_VALIDADE_DIAS')

  const origensPermitidas = (env('JORNADA_ORIGENS_PERMITIDAS') ?? '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
  for (const o of origensPermitidas) {
    try {
      const u = new URL(o)
      if (u.origin !== o || (u.protocol !== 'https:' && !(modoDev && u.protocol === 'http:'))) problemas.push('JORNADA_ORIGENS_PERMITIDAS')
    } catch {
      problemas.push('JORNADA_ORIGENS_PERMITIDAS')
    }
  }

  // Datasigh (somente GET). Sem base: não configurado.
  let datasigh: ConfigDatasigh | null = null
  const dsBase = vazioParaNull(env('DATASIGH_BASE_URL'))
  if (dsBase) {
    let mapaCampos: MapaCamposDatasigh | null = null
    const mapaBruto = vazioParaNull(env('DATASIGH_MAPA_CAMPOS'))
    if (mapaBruto) {
      try {
        const m = JSON.parse(mapaBruto)
        if (typeof m !== 'object' || m === null || Array.isArray(m)) throw new Error('mapa')
        mapaCampos = m as MapaCamposDatasigh
      } catch {
        problemas.push('DATASIGH_MAPA_CAMPOS')
      }
    }
    try {
      const u = new URL(dsBase)
      if (u.protocol !== 'https:' && !(modoDev && u.protocol === 'http:')) problemas.push('DATASIGH_BASE_URL')
    } catch {
      problemas.push('DATASIGH_BASE_URL')
    }
    datasigh = {
      baseUrl: dsBase.endsWith('/') ? dsBase : `${dsBase}/`,
      authHeader: vazioParaNull(env('DATASIGH_AUTH_HEADER')),
      authValor: vazioParaNull(env('DATASIGH_AUTH_VALOR')),
      caminhoBuscaCpf: vazioParaNull(env('DATASIGH_CAMINHO_BUSCA_CPF')),
      mapaCampos,
      timeoutMs: inteiro(env('DATASIGH_TIMEOUT_MS'), 8000, 500, 60000) || 8000,
    }
  }

  let meta: ConfigMeta | null = null
  const metaToken = vazioParaNull(env('META_WHATSAPP_TOKEN'))
  const metaPhone = vazioParaNull(env('META_WHATSAPP_PHONE_ID'))
  if (metaToken && metaPhone) {
    meta = { token: metaToken, phoneId: metaPhone, graphVersao: vazioParaNull(env('META_GRAPH_VERSAO')) ?? 'v21.0', timeoutMs: 10000 }
    if (!/^v\d+\.\d+$/.test(meta.graphVersao)) problemas.push('META_GRAPH_VERSAO')
    if (!/^\d+$/.test(metaPhone)) problemas.push('META_WHATSAPP_PHONE_ID')
  }

  const envioHabilitado = verdadeiro(env('ENVIO_PACIENTES_HABILITADO'))
  // Envio real exige produção ou homologação explícita e credenciais da Meta; nunca no modo dev.
  if (envioHabilitado && (modoDev || !meta)) problemas.push('ENVIO_PACIENTES_HABILITADO')

  const urlPaginaPaciente = vazioParaNull(env('JORNADA_URL_PAGINA_PACIENTE'))
  if (urlPaginaPaciente) {
    try {
      new URL(urlPaginaPaciente)
    } catch {
      problemas.push('JORNADA_URL_PAGINA_PACIENTE')
    }
  }

  const iteracoesPin = inteiro(env('JORNADA_PIN_ITERACOES'), 310000, 1000, 5000000)
  if (Number.isNaN(iteracoesPin)) problemas.push('JORNADA_PIN_ITERACOES')
  if (!modoDev && iteracoesPin < 100000) problemas.push('JORNADA_PIN_ITERACOES')

  if (problemas.length) throw new ErroConfig([...new Set(problemas)])

  return {
    ambiente,
    modoDev,
    supabaseUrl: vazioParaNull(env('SUPABASE_URL'))?.replace(/\/$/, '') ?? null,
    supabaseAnonKey: vazioParaNull(env('SUPABASE_ANON_KEY')),
    supabaseServiceRoleKey: vazioParaNull(env('SUPABASE_SERVICE_ROLE_KEY')),
    origensPermitidas,
    segredoCpf,
    segredoAtor,
    atorTtlMin,
    cpfConsultasHora,
    exigirMfa: verdadeiro(env('JORNADA_EXIGIR_MFA')),
    envioHabilitado,
    urlPaginaPaciente: urlPaginaPaciente ? (urlPaginaPaciente.endsWith('/') ? urlPaginaPaciente : `${urlPaginaPaciente}/`) : null,
    linkValidadeDias,
    datasigh,
    meta,
    segredoEnvios: vazioParaNull(env('JORNADA_SEGREDO_ENVIOS')),
    limiteCorpoBytes: 256 * 1024,
    limiteCorpoAnexoBytes: 7_200_000,
    iteracoesPin,
    falhasPinPorAlvo: 5,
    falhasPinPorSessao: 10,
    janelaPinMin: 15,
  }
}
