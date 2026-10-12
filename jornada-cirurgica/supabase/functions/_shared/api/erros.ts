// Erros da API: código do contrato + status HTTP + mensagem genérica.
// Regra: nenhuma mensagem de erro contém dado de paciente; nada do corpo da requisição
// entra em mensagem ou log.

import type { CodigoErroApi, ErroApi } from './contrato.ts'
import { ErroDominio } from '../dominio/index.ts'

export const STATUS_POR_CODIGO: Record<CodigoErroApi, number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  mfa_exigido: 403,
  nao_encontrado: 404,
  validacao: 400,
  conflito_versao: 409,
  hard_stop: 409,
  ordem: 409,
  conferencia_cega: 403,
  limite_taxa: 429,
  indisponivel: 503,
}

export const MENSAGEM_PADRAO: Record<CodigoErroApi, string> = {
  nao_autenticado: 'Sessão inválida ou expirada. Entre novamente.',
  sem_permissao: 'Seu papel não permite esta ação.',
  mfa_exigido: 'Esta conta exige o segundo fator de autenticação.',
  nao_encontrado: 'Registro não encontrado.',
  validacao: 'Dados inválidos.',
  conflito_versao: 'O episódio foi alterado por outra pessoa. Recarregue antes de continuar.',
  hard_stop: 'Há um hard stop aberto que impede esta passagem.',
  ordem: 'A ordem obrigatória das etapas não foi respeitada.',
  conferencia_cega: 'A conferência independente não pode ser feita por quem viu ou registrou a primeira conferência.',
  limite_taxa: 'Limite de tentativas atingido. Aguarde e tente de novo.',
  indisponivel: 'Serviço indisponível. Nenhuma ação externa foi disparada.',
}

/** Erro que a API devolve ao cliente. `mensagem` deve ser genérica (sem dado de paciente). */
export class ErroApiHttp extends Error {
  constructor(
    public readonly codigo: CodigoErroApi,
    mensagem?: string,
    public readonly detalhes?: Record<string, unknown>,
    public readonly status: number = STATUS_POR_CODIGO[codigo],
  ) {
    super(mensagem ?? MENSAGEM_PADRAO[codigo])
    this.name = 'ErroApiHttp'
  }

  paraCorpo(): ErroApi {
    return { codigo: this.codigo, mensagem: this.message, ...(this.detalhes ? { detalhes: this.detalhes } : {}) }
  }
}

export const erro = (codigo: CodigoErroApi, mensagem?: string, detalhes?: Record<string, unknown>) =>
  new ErroApiHttp(codigo, mensagem, detalhes)

/** Erro do Postgres (postgres.js expõe `code`, `constraint_name`). */
interface ErroPg {
  code?: string
  constraint_name?: string
  constraint?: string
}

function ehErroPg(e: unknown): e is ErroPg & Error {
  return typeof e === 'object' && e !== null && typeof (e as ErroPg).code === 'string' && /^[0-9A-Z]{5}$/.test((e as ErroPg).code ?? '')
}

/**
 * Converte qualquer erro em ErroApiHttp.
 * - ErroDominio: mensagem do domínio (o domínio também não põe dado de paciente em mensagem).
 * - Erro do Postgres: só o código; a mensagem do banco pode conter valores e nunca é repassada.
 * - Qualquer outro: indisponível, mensagem genérica.
 */
export function converterErro(e: unknown): ErroApiHttp {
  if (e instanceof ErroApiHttp) return e
  if (e instanceof ErroDominio) {
    const detalhes = e.detalhes
    switch (e.codigo) {
      case 'SEM_PERMISSAO':
        return new ErroApiHttp('sem_permissao', e.message, detalhes)
      case 'HARD_STOP':
        return new ErroApiHttp('hard_stop', e.message, detalhes)
      case 'ORDEM':
        return new ErroApiHttp('ordem', e.message, detalhes)
      case 'VALIDACAO':
        return new ErroApiHttp('validacao', e.message, detalhes)
      case 'ESTADO':
        // Comando incompatível com o estado atual: 409 (o cliente deve recarregar), código de validação.
        return new ErroApiHttp('validacao', e.message, { ...(detalhes ?? {}), motivo: 'estado' }, 409)
      case 'CONFERENCIA_CEGA':
        return new ErroApiHttp('conferencia_cega', e.message, detalhes)
      case 'NAO_IMPLEMENTADO':
      default:
        return new ErroApiHttp('indisponivel', 'Função ainda não disponível neste ambiente. Nenhuma ação externa foi disparada.')
    }
  }
  if (ehErroPg(e)) {
    const restricao = e.constraint_name ?? e.constraint ?? ''
    switch (e.code) {
      case '23505':
        if (/seq/.test(restricao)) return new ErroApiHttp('conflito_versao')
        return new ErroApiHttp('validacao', 'Registro duplicado.')
      case '40001':
      case '40P01':
        return new ErroApiHttp('conflito_versao')
      case '42501': // permissão negada / RLS
        return new ErroApiHttp('sem_permissao')
      case '23514':
      case '23502':
      case '23503':
      case '22P02':
      case '22007':
      case '22008':
      case '22003':
      case '22023':
        return new ErroApiHttp('validacao')
      case 'P0001': // raise exception em trigger (ex.: tabela que só cresce)
        return new ErroApiHttp('sem_permissao', 'Operação não permitida.')
      default:
        return new ErroApiHttp('indisponivel')
    }
  }
  return new ErroApiHttp('indisponivel')
}

/** Campos seguros para log de um erro (sem mensagem livre, que pode conter dado). */
export function camposLogErro(e: unknown): Record<string, string> {
  if (e instanceof ErroApiHttp) return { tipo: 'api', codigo: e.codigo }
  if (e instanceof ErroDominio) return { tipo: 'dominio', codigo: e.codigo }
  if (ehErroPg(e)) return { tipo: 'postgres', codigo: e.code ?? '', restricao: e.constraint_name ?? '' }
  if (e instanceof Error) return { tipo: e.name || 'Error' }
  return { tipo: typeof e }
}
