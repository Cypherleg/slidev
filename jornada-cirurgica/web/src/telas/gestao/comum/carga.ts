// Apoio comum às telas de gestão, impressão, resumo e pendências (agente web-apoio).
// Carregamento de dados com estado, mensagens de erro sem dado de paciente e título da aba.

import { useCallback, useEffect, useRef, useState } from 'react'

/** Código do erro da API (duck typing: funciona também quando o cliente é substituído em teste). */
export function codigoErro(e: unknown): string | null {
  if (e && typeof e === 'object' && 'erro' in e) {
    const erro = (e as { erro?: { codigo?: unknown } }).erro
    if (erro && typeof erro.codigo === 'string') return erro.codigo
  }
  return null
}

/** Mensagem para a tela. As mensagens do servidor são genéricas e não trazem dado de paciente (contrato). */
export function mensagemErro(e: unknown): string {
  const codigo = codigoErro(e)
  switch (codigo) {
    case 'nao_autenticado':
      return 'Sessão expirada. Entre novamente.'
    case 'sem_permissao':
      return 'O seu papel não tem permissão para esta ação.'
    case 'mfa_exigido':
      return 'Esta área exige o segundo fator de autenticação. Entre novamente e confirme o código.'
    case 'nao_encontrado':
      return 'Registro não encontrado.'
    case 'conflito_versao':
      return 'O registro mudou enquanto a tela estava aberta. Recarregue e confira antes de repetir.'
    case 'limite_taxa':
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'
    case 'indisponivel':
      return 'Servidor indisponível. Nenhuma ação externa foi disparada. Se necessário, siga o checklist em papel.'
    default:
      break
  }
  if (e && typeof e === 'object' && 'erro' in e) {
    const msg = (e as { erro?: { mensagem?: unknown } }).erro?.mensagem
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return 'Não foi possível concluir. Tente de novo.'
}

export interface Carga<T> {
  dados: T | undefined
  erro: unknown
  carregando: boolean
  recarregar: () => void
  /** Substitui os dados (ex.: com a resposta de um salvamento). */
  definir: (dados: T) => void
}

/**
 * Carrega dados ao montar e quando `deps` mudam. Ao recarregar, mantém os dados anteriores
 * na tela até a nova resposta chegar (evita perder a posição em tabelas longas).
 */
export function useCarga<T>(carregar: () => Promise<T>, deps: readonly unknown[]): Carga<T> {
  const [dados, setDados] = useState<T | undefined>(undefined)
  const [erro, setErro] = useState<unknown>(null)
  const [carregando, setCarregando] = useState(true)
  const [rodada, setRodada] = useState(0)
  const funcao = useRef(carregar)
  funcao.current = carregar

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    funcao.current().then(
      d => {
        if (!vivo) return
        setDados(d)
        setCarregando(false)
      },
      e => {
        if (!vivo) return
        setErro(e ?? new Error('erro'))
        setCarregando(false)
      },
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, rodada])

  const recarregar = useCallback(() => setRodada(r => r + 1), [])
  const definir = useCallback((d: T) => {
    setDados(d)
    setErro(null)
  }, [])
  return { dados, erro, carregando, recarregar, definir }
}

/** Título da aba do navegador (sem dado de paciente). */
export function useTitulo(titulo: string) {
  useEffect(() => {
    const anterior = document.title
    document.title = titulo
    return () => {
      document.title = anterior
    }
  }, [titulo])
}

/** Tempo decorrido em texto: 'há 5 min', 'há 3 h', 'há 2 dias'. */
export function tempoDecorrido(desdeIso: string, agora: number = Date.now()): string {
  const t = Date.parse(desdeIso)
  if (Number.isNaN(t)) return ''
  const minutos = Math.floor((agora - t) / 60000)
  if (minutos < 0) return 'agora'
  if (minutos < 1) return 'há menos de 1 min'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}
