import type { ItemModelo, OpcaoItem, Papel, TipoResposta } from '../../tipos.ts'
import { CLASSES_MEDICAMENTO } from '../ids.ts'
import type { ClasseMedicamento } from '../ids.ts'

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

/**
 * Mudança de medicação depois do D-7 (POP §0 "reconferir no D0"; §9.A; §13 procedimento 5): quais classes da
 * lista crítica (§1.B) mudaram e, para cada classe, o registro no mesmo formato do D-7. As classes alimentam as
 * mesmas regras do D-7 (alertas, dots, HS6, janela do GLP-1).
 */
export function itensMudancaMedicacao(opcoes: {
  idClasses: string
  idMudou: string
  idItem: (c: ClasseMedicamento) => string
  textoClasses: string
  papeis: Papel[]
  fonte: string
  itensD7: ItemModelo[]
  incluirEstadoSaude: boolean
}): ItemModelo[] {
  const lista: OpcaoItem[] = CLASSES_MEDICAMENTO.map((c) => ({ valor: c.classe, rotulo: c.rotulo }))
  lista.push({ valor: 'outra', rotulo: 'Outro remédio (descrever na observação)' })
  if (opcoes.incluirEstadoSaude) lista.push({ valor: 'estado_saude', rotulo: 'Mudou o estado de saúde (descrever na observação)' })
  const itens: ItemModelo[] = [
    item(opcoes.idClasses, opcoes.textoClasses, 'multipla', opcoes.papeis, opcoes.fonte, {
      obrigatorio: false,
      exigidoQuando: { itemId: opcoes.idMudou, valores: ['sim'] },
      opcoes: lista,
      ajuda: 'Marque as classes da lista crítica do D-7 que mudaram; cada classe marcada pede o registro atualizado. "Outro" e "estado de saúde": descrever na observação.',
    }),
  ]
  for (const c of CLASSES_MEDICAMENTO) {
    const d7 = opcoes.itensD7.find((i) => i.id === c.itemD7)
    itens.push(
      item(opcoes.idItem(c.classe), `${c.rotulo}: registro atualizado`, 'medicamento', opcoes.papeis, `${opcoes.fonte}; POP §1.B`, {
        obrigatorio: false,
        exigidoQuando: { itemId: opcoes.idClasses, valores: [c.classe] },
        ...(d7?.ajuda ? { ajuda: d7.ajuda } : {}),
        ...(d7?.camposMedicamento ? { camposMedicamento: [...d7.camposMedicamento] } : {}),
        ...(d7?.alerta ? { alerta: { ...d7.alerta } } : {}),
      }),
    )
  }
  return itens
}

export const PENDENTE_OLHO_UNICO = '[S] POP §11 (olho único): depende do diretor técnico.'
