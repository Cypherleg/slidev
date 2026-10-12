// Cliente do Datasigh: SOMENTE LEITURA (GET). Briefing §2 e §4.
// A documentação do fornecedor ainda não chegou: caminho da busca por CPF e mapa de campos
// vêm de variáveis de ambiente. Nada aqui supõe nomes de parâmetros ou de campos da API.
// Sem caminho ou mapa configurados → `nao_configurado`. Falha ou timeout → `indisponivel`.
// O CPF nunca é registrado em log; a URL montada (que contém o CPF) nunca é registrada.

import type { ResultadoBuscaCpf } from './contrato.ts'
import type { ConfigDatasigh, MapaCamposDatasigh } from './config.ts'
import type { FetchLike } from './auth.ts'

export class ErroMetodoProibido extends Error {
  constructor(metodo: string) {
    super(`Datasigh é somente leitura: método ${metodo} recusado.`)
    this.name = 'ErroMetodoProibido'
  }
}

/**
 * Envolve um fetch para permitir SOMENTE GET. Qualquer outro método lança ErroMetodoProibido
 * antes de chegar à rede. Também recusa corpo na requisição.
 */
export function fetchSomenteGet(f: FetchLike): FetchLike {
  return (url, init) => {
    const metodo = (init?.method ?? 'GET').toUpperCase()
    if (metodo !== 'GET') throw new ErroMetodoProibido(metodo)
    if (init?.body !== undefined && init.body !== null) throw new ErroMetodoProibido('GET com corpo')
    return f(url, { ...init, method: 'GET' })
  }
}

export interface ClienteDatasigh {
  /** `cpf` = 11 dígitos já validados. */
  buscarPorCpf(cpf: string): Promise<ResultadoBuscaCpf['datasigh']>
}

export function formatarCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`
}

function valorNoCaminho(obj: unknown, caminho: string): unknown {
  let atual: unknown = obj
  for (const parte of caminho.split('.').filter(Boolean)) {
    if (atual === null || atual === undefined) return undefined
    if (Array.isArray(atual) && /^\d+$/.test(parte)) atual = atual[Number(parte)]
    else if (typeof atual === 'object') atual = (atual as Record<string, unknown>)[parte]
    else return undefined
  }
  return atual
}

function textoOuNada(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/** Aceita 'aaaa-mm-dd', 'aaaa-mm-ddThh:mm...' e 'dd/mm/aaaa'. Outros formatos: omitido. */
export function normalizarDataDatasigh(v: unknown): string | undefined {
  const t = textoOuNada(v)
  if (!t) return undefined
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return undefined
}

/** Extrai os campos conforme o mapa. Só devolve os que vieram. */
export function mapearRegistro(registro: unknown, mapa: MapaCamposDatasigh): NonNullable<ResultadoBuscaCpf['datasigh']['campos']> {
  const campos: NonNullable<ResultadoBuscaCpf['datasigh']['campos']> = {}
  if (mapa.datasighId) {
    const v = textoOuNada(valorNoCaminho(registro, mapa.datasighId))
    if (v) campos.datasighId = v
  }
  if (mapa.nomeCompleto) {
    const v = textoOuNada(valorNoCaminho(registro, mapa.nomeCompleto))
    if (v) campos.nomeCompleto = v
  }
  if (mapa.dataNascimento) {
    const v = normalizarDataDatasigh(valorNoCaminho(registro, mapa.dataNascimento))
    if (v) campos.dataNascimento = v
  }
  if (mapa.prontuario) {
    const v = textoOuNada(valorNoCaminho(registro, mapa.prontuario))
    if (v) campos.prontuario = v
  }
  if (mapa.telefones) {
    const caminhos = Array.isArray(mapa.telefones) ? mapa.telefones : [mapa.telefones]
    const tels: string[] = []
    for (const c of caminhos) {
      const v = valorNoCaminho(registro, c)
      const lista = Array.isArray(v) ? v : [v]
      for (const item of lista) {
        const t = textoOuNada(item)
        if (t && !tels.includes(t)) tels.push(t)
      }
    }
    if (tels.length) campos.telefones = tels
  }
  return campos
}

export function criarClienteDatasigh(config: ConfigDatasigh | null, f: FetchLike = (u, i) => fetch(u, i)): ClienteDatasigh {
  const somenteGet = fetchSomenteGet(f)
  return {
    async buscarPorCpf(cpf) {
      if (!config || !config.caminhoBuscaCpf || !config.mapaCampos) return { status: 'nao_configurado' }
      if (!/^\d{11}$/.test(cpf)) return { status: 'nao_encontrado' }
      const caminho = config.caminhoBuscaCpf
        .replace(/\{cpf\}/g, encodeURIComponent(cpf))
        .replace(/\{cpf_formatado\}/g, encodeURIComponent(formatarCpf(cpf)))
      let url: URL
      try {
        url = new URL(caminho.replace(/^\//, ''), config.baseUrl)
      } catch {
        return { status: 'nao_configurado' }
      }
      // O caminho configurado não pode sair do host da base.
      if (url.origin !== new URL(config.baseUrl).origin) return { status: 'nao_configurado' }
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (config.authHeader && config.authValor) headers[config.authHeader] = config.authValor
      const controle = new AbortController()
      const timer = setTimeout(() => controle.abort(), config.timeoutMs)
      let resposta: Response
      try {
        resposta = await somenteGet(url.toString(), { method: 'GET', headers, signal: controle.signal, redirect: 'error' })
      } catch (e) {
        if (e instanceof ErroMetodoProibido) throw e
        return { status: 'indisponivel' }
      } finally {
        clearTimeout(timer)
      }
      if (resposta.status === 404) return { status: 'nao_encontrado' }
      if (!resposta.ok) return { status: 'indisponivel' }
      let corpo: unknown
      try {
        corpo = await resposta.json()
      } catch {
        return { status: 'indisponivel' }
      }
      const mapa = config.mapaCampos
      let registros: unknown[]
      if (mapa.lista) {
        const lista = valorNoCaminho(corpo, mapa.lista)
        if (lista === undefined || lista === null) return { status: 'nao_encontrado' }
        registros = Array.isArray(lista) ? lista : [lista]
      } else {
        registros = Array.isArray(corpo) ? corpo : corpo === null || corpo === undefined ? [] : [corpo]
      }
      if (registros.length === 0) return { status: 'nao_encontrado' }
      const mapeados = registros.map(r => mapearRegistro(r, mapa))
      // Mais de um cadastro distinto para o mesmo CPF: não escolher por conta própria.
      const ids = new Set(mapeados.map(m => m.datasighId ?? JSON.stringify(m)))
      if (ids.size > 1) return { status: 'indisponivel' }
      const campos = mapeados[0]
      if (Object.keys(campos).length === 0) return { status: 'nao_encontrado' }
      return { status: 'encontrado', campos }
    },
  }
}
