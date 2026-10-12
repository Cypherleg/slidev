import type { ItemModelo, OpcaoItem, Papel, TipoResposta } from '../../tipos.ts'

/** Item obrigatório por padrão ("nenhum campo fica em branco"). */
export function item(
  id: string,
  texto: string,
  tipo: TipoResposta,
  papeis: Papel[],
  fonte: string,
  extra: Partial<ItemModelo> = {},
): ItemModelo {
  return { id, texto, tipo, obrigatorio: true, papeis: [...papeis], fonte, ...extra }
}

export const SIM_NAO: OpcaoItem[] = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
]

export const NOME_MAE_CONFERENCIA = 'Homônimo ou nome parecido no dia: nome da mãe conferido (3º identificador)'
export const FONTE_HOMONIMO = 'POP §0 (lacunas), §3 (hard stops: homônimo) e briefing §8 regra 1'
