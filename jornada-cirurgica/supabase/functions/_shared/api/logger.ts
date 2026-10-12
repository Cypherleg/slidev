// Log estruturado e restrito: só campos técnicos (ação, código, duração, status).
// Nunca: corpo da requisição, CPF, nome, telefone, valores de lente, mensagens de erro do banco.

export type ValorLog = string | number | boolean | null

export interface Logger {
  info(evento: string, campos?: Record<string, ValorLog>): void
  erro(evento: string, campos?: Record<string, ValorLog>): void
}

const CAMPOS_PERMITIDOS = new Set([
  'acao',
  'funcao',
  'status',
  'codigo',
  'tipo',
  'restricao',
  'ms',
  'quantidade',
  'enviadas',
  'falhas',
  'desconhecidas',
  'canceladas',
  'variaveis',
  'porta',
  'banco',
  'resultado',
  'http',
  'sqlstate',
])

/** Remove qualquer campo fora da lista e trunca textos (defesa contra uso indevido). */
export function filtrarCampos(campos: Record<string, ValorLog> = {}): Record<string, ValorLog> {
  const out: Record<string, ValorLog> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (!CAMPOS_PERMITIDOS.has(k)) continue
    out[k] = typeof v === 'string' ? v.slice(0, 120) : v
  }
  return out
}

export function loggerConsole(): Logger {
  return {
    info(evento, campos) {
      console.log(JSON.stringify({ nivel: 'info', evento, ...filtrarCampos(campos) }))
    },
    erro(evento, campos) {
      console.error(JSON.stringify({ nivel: 'erro', evento, ...filtrarCampos(campos) }))
    },
  }
}

export const loggerSilencioso: Logger = { info() {}, erro() {} }

/** Logger que guarda as linhas (testes). */
export function loggerCapturado(): Logger & { linhas: string[] } {
  const linhas: string[] = []
  return {
    linhas,
    info(evento, campos) {
      linhas.push(JSON.stringify({ nivel: 'info', evento, ...filtrarCampos(campos) }))
    },
    erro(evento, campos) {
      linhas.push(JSON.stringify({ nivel: 'erro', evento, ...filtrarCampos(campos) }))
    },
  }
}
