// Regras de exibição de itens que dependem de outros itens (mesmas regras do domínio; o servidor decide).
import { ITENS_CRITICOS_D7 } from '@dominio/regras/alertas.ts'
import { ADM, D7, SI } from '@dominio/modelos/ids.ts'
import type { ItemModelo, ModeloId, OpcaoItem, RespostaAtual, ValorResposta } from '@dominio/tipos.ts'
import { ORDEM_MODELOS } from '@dominio/tipos.ts'

/** `exigidoQuando.itemId` pode apontar para outro modelo: 'd7:C.olho_unico_qual'. */
export function referenciaItem(itemId: string, modeloAtual: ModeloId): { modelo: ModeloId; itemId: string } {
  const i = itemId.indexOf(':')
  if (i > 0) {
    const prefixo = itemId.slice(0, i)
    if ((ORDEM_MODELOS as readonly string[]).includes(prefixo)) return { modelo: prefixo as ModeloId, itemId: itemId.slice(i + 1) }
  }
  return { modelo: modeloAtual, itemId }
}

/** A condição vale com este valor? (item 'multipla': basta um valor em comum). */
export function condicaoValeCom(valor: ValorResposta | undefined, valores: string[]): boolean {
  if (typeof valor === 'string') return valores.includes(valor)
  if (Array.isArray(valor)) return valor.some(v => valores.includes(v))
  return false
}

/**
 * Opções visíveis de um item de opção. Identificação ativa (admissão e Sign In): "confirmado com o acompanhante"
 * só aparece com demência registrada no D-7 (POP §11). Uma resposta já registrada continua visível.
 */
export function opcoesVisiveis(
  item: ItemModelo,
  modeloId: ModeloId,
  valorAtual: ValorResposta | undefined,
  respostasPorModelo: Partial<Record<ModeloId, Record<string, RespostaAtual>>> | undefined,
): OpcaoItem[] | undefined {
  const ehIdentificacao = (modeloId === 'admissao' && item.id === ADM.identificacao) || (modeloId === 'sign_in' && item.id === SI.identificacao)
  if (!ehIdentificacao || !item.opcoes) return item.opcoes
  const demencia = respostasPorModelo?.d7?.[D7.demencia]?.valor === 'sim'
  if (demencia) return item.opcoes
  return item.opcoes.filter(o => o.valor !== 'acompanhante' || valorAtual === 'acompanhante')
}

/**
 * Observação obrigatória (o servidor recusa sem ela):
 * - opção escolhida cujo rótulo pede a observação ("descrever na observação", "explicar na observação"...);
 * - correção de item crítico do D-7 depois do D-7 concluído (o cirurgião precisa ser avisado de novo).
 */
export function observacaoExigida(
  item: ItemModelo,
  modeloId: ModeloId,
  valor: ValorResposta | undefined,
  jaRespondido: boolean,
  blocosConcluidos: readonly ModeloId[],
): string | null {
  const escolhidos = typeof valor === 'string' ? [valor] : Array.isArray(valor) ? valor : []
  const pedeObservacao = (item.opcoes ?? []).filter(o => escolhidos.includes(o.valor) && /observa[çc][ãa]o/i.test(o.rotulo))
  if ((item.tipo === 'opcao' || item.tipo === 'multipla') && pedeObservacao.length) return `"${pedeObservacao.map(o => o.rotulo).join('; ')}": descreva na observação.`
  if (modeloId === 'd7' && jaRespondido && blocosConcluidos.includes('d7') && (ITENS_CRITICOS_D7 as readonly string[]).includes(item.id)) {
    return 'Correção de item crítico depois do D-7 concluído: registre o motivo na observação. O cirurgião precisa ser avisado de novo.'
  }
  return null
}
