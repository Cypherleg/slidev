// Onde resolver cada pendência: o campo `local` do domínio vira a aba do episódio.

export type Aba = 'd7' | 'lente' | 'd2' | 'd0' | 'historico'

/** Converte o `local` da pendência (ex.: 'd7.B', 'lente.cp2', 'alertas') na aba do episódio. */
export function abaDoLocal(local: string | undefined): Aba | undefined {
  if (!local) return undefined
  const raiz = local.split(/[.:/]/)[0].toLowerCase()
  if (raiz === 'd7' || raiz === 'materiais' || raiz === 'quiz' || raiz === 'contatos' || raiz === 'orientacoes' || raiz === 'teach_back') return 'd7'
  if (raiz === 'lente' || raiz === 'cp1' || raiz === 'cp2' || raiz === 'anexo' || raiz === 'quarentena') return 'lente'
  if (raiz === 'd2' || raiz === 'tcle' || raiz === 'etiquetas') return 'd2'
  if (['d0', 'admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta', 'hardstop', 'hard_stop', 'avisos', 'intercorrencia'].includes(raiz)) return 'd0'
  if (raiz === 'historico') return 'historico'
  return undefined
}
