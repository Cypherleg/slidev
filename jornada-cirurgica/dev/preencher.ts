// Respostas FICTÍCIAS "sem risco" para os checklists (semente do servidor local e testes).
// Usa os ids estáveis dos modelos v1 (dominio/modelos/ids.ts). Não é regra do POP: só escolhe,
// para dados de demonstração, a resposta que não gera alerta nem hard stop.

import { ADM, ALTA, D2, D7, SI, TO } from '../supabase/functions/_shared/dominio/modelos/ids.ts'
import type { ItemModelo, ModeloChecklist, Olho, ValorResposta } from '../supabase/functions/_shared/dominio/index.ts'

export interface ContextoPreenchimento {
  olho: Olho
  hoje: string
  dataCirurgia: string | null
  segundoOlho?: boolean
  semAlertasD7?: boolean
}

/** sim_nao em que "sim" é a resposta sem risco (além dos itens com `exigeSim`). */
const SIM_SEGURO = new Set<string>([
  D7.deitar,
  D7.compreende,
  D7.nenhumaAlergia,
  D7.quemInstilaOrientacao,
  D2.presenca,
  D2.acompanhanteConfirmado,
  D2.colirios,
  ADM.identificacao,
  ADM.acompanhantePresente,
  ADM.pulseira,
  ADM.tcle,
  SI.identificacao,
  SI.consentimento,
  SI.salaBiometria,
  TO.paciente,
  TO.marca,
  ALTA.acompanhante,
])

export const PESSOA_FICTICIA = { nome: 'Acompanhante Teste Ficticio', parentesco: 'filha', telefone: '00900000011' }

function valorPadrao(item: ItemModelo & { exigeSim?: boolean }, c: ContextoPreenchimento): ValorResposta | undefined {
  switch (item.tipo) {
    case 'confirmacao':
      return true
    case 'sim_nao':
      return item.exigeSim || SIM_SEGURO.has(item.id) ? 'sim' : 'nao'
    case 'opcao':
      if (item.id === D7.primeiroSegundo) return c.segundoOlho ? 'segundo' : 'primeiro'
      if (item.id === SI.condutaAlertas) return c.semAlertasD7 === false ? 'presente' : 'nao_se_aplica'
      return item.opcoes?.[0]?.valor
    case 'multipla':
      return item.opcoes?.[0] ? [item.opcoes[0].valor] : []
    case 'texto':
      return 'Sem observações (fictício).'
    case 'data':
      return c.dataCirurgia ?? c.hoje
    case 'hora':
      return '07:00'
    case 'numero':
      return 1
    case 'olho':
      return c.olho
    case 'medicamento':
      return { uso: 'nao' }
    case 'alergia':
      return { tem: false }
    case 'pessoa':
      return { ...PESSOA_FICTICIA }
    default:
      return undefined
  }
}

/**
 * Respostas para os itens do modelo que algum dos papéis pode marcar.
 * `sobrepor`: valor por item (null = não responder). `filtro`: restringe itens (ex.: só uma seção).
 */
export function respostasDoModelo(
  modelo: ModeloChecklist,
  papeis: readonly string[],
  c: ContextoPreenchimento,
  sobrepor: Record<string, ValorResposta | null> = {},
  filtro: (itemId: string, secaoId: string) => boolean = () => true,
): { itemId: string; valor: ValorResposta }[] {
  const out: { itemId: string; valor: ValorResposta }[] = []
  for (const secao of modelo.secoes) {
    for (const item of secao.itens) {
      if (!filtro(item.id, secao.id)) continue
      if (!item.papeis.some(p => papeis.includes(p))) continue
      if (item.id in sobrepor) {
        const v = sobrepor[item.id]
        if (v !== null) out.push({ itemId: item.id, valor: v })
        continue
      }
      const v = valorPadrao(item, c)
      if (v !== undefined) out.push({ itemId: item.id, valor: v })
    }
  }
  return out
}
