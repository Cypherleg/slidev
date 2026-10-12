// Respostas FICTÍCIAS "sem risco" para os checklists (semente do servidor local e testes).
// Usa os ids estáveis dos modelos (dominio/modelos/ids.ts). Não é regra do POP: só escolhe, para
// dados de demonstração, a resposta que não gera alerta nem hard stop, e responde os itens
// condicionais (`exigidoQuando`) só quando a condição vale.

import { ADM, ALTA, D2, D7, SI, TO } from '../supabase/functions/_shared/dominio/modelos/ids.ts'
import type { ItemModelo, ModeloChecklist, Olho, ValorResposta } from '../supabase/functions/_shared/dominio/index.ts'

export interface ContextoPreenchimento {
  olho: Olho
  hoje: string
  dataCirurgia: string | null
  segundoOlho?: boolean
  /** 2º olho: data da cirurgia do 1º (POP §11). */
  dataPrimeiroOlho?: string | null
  semAlertasD7?: boolean
  /** Homônimo ou nome parecido no dia: itens do 3º identificador. */
  homonimo?: boolean
  /** Lente tórica no plano. */
  torica?: boolean
  /** Dot D (insulina ou sulfonilureia). */
  dotD?: boolean
  /** Respostas já registradas neste modelo (condições entre itens). */
  existentes?: Record<string, ValorResposta>
  /** Resposta de outro modelo (condições 'modelo:item'). */
  outroModelo?: (modelo: string, itemId: string) => ValorResposta | undefined
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
  ADM.acompanhantePresente,
  ADM.pulseira,
  ADM.alergias, // alergias reconfirmadas, sem alergia nova
  ADM.jejum, // jejum e medicações conforme orientação
  ADM.tcle,
  ADM.tcleOlho,
  SI.consentimento,
  SI.salaBiometria,
  TO.paciente,
  TO.marca,
  TO.procedimento,
  ALTA.acompanhante,
])

export const PESSOA_FICTICIA = { nome: 'Acompanhante Teste Ficticio', parentesco: 'filha', telefone: '00900000011' }

type Item = ItemModelo & { exigeSim?: boolean }

function valorPadrao(item: Item, c: ContextoPreenchimento): ValorResposta | undefined {
  switch (item.tipo) {
    case 'confirmacao':
      return true
    case 'sim_nao':
      return item.exigeSim || SIM_SEGURO.has(item.id) ? 'sim' : 'nao'
    case 'opcao':
      if (item.id === D7.primeiroSegundo) return c.segundoOlho ? 'segundo' : 'primeiro'
      if (item.id === D7.semOculos) return 'nao'
      if (item.id === D7.acompanhanteReservaSituacao) return 'registrado'
      if (item.id === SI.condutaAlertas) return c.semAlertasD7 === false ? 'presente' : 'nao_se_aplica'
      // Identificação (sim / acompanhante / não) e demais itens com "sim" exigido.
      if (item.exigeSim && item.opcoes?.some(o => o.valor === 'sim')) return 'sim'
      return item.opcoes?.[0]?.valor
    case 'multipla':
      return item.opcoes?.[0] ? [item.opcoes[0].valor] : []
    case 'texto':
      return 'Sem observações (fictício).'
    case 'data':
      if (item.id === D7.dataPrimeiroOlho) return c.dataPrimeiroOlho ?? c.hoje
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

function casa(valor: ValorResposta | undefined, valores: string[]): boolean {
  if (valor === undefined || valor === null) return false
  if (Array.isArray(valor)) return valor.some(v => valores.includes(v))
  return typeof valor === 'string' && valores.includes(valor)
}

/**
 * Respostas para os itens do modelo que algum dos papéis pode marcar.
 * Itens condicionais só quando a condição vale; itens opcionais sem condição ficam em branco.
 * `sobrepor`: valor por item (null = não responder). `filtro`: restringe itens (ex.: só uma seção).
 */
export function respostasDoModelo(
  modelo: ModeloChecklist,
  papeis: readonly string[],
  c: ContextoPreenchimento,
  sobrepor: Record<string, ValorResposta | null> = {},
  filtro: (itemId: string, secaoId: string) => boolean = () => true,
): { itemId: string; valor: ValorResposta }[] {
  const escolhidos: Record<string, ValorResposta> = { ...(c.existentes ?? {}) }
  const out: { itemId: string; valor: ValorResposta }[] = []
  const condicaoVale = (item: Item): boolean => {
    const q = item.exigidoQuando
    if (!q) return item.obrigatorio
    if ('contexto' in q) return q.contexto === 'homonimo_no_dia' ? Boolean(c.homonimo) : q.contexto === 'lente_torica' ? Boolean(c.torica) : Boolean(c.dotD)
    const [modeloRef, itemRef] = q.itemId.includes(':') ? q.itemId.split(':', 2) : [null, q.itemId]
    const valor = modeloRef ? c.outroModelo?.(modeloRef, itemRef) : escolhidos[itemRef]
    return casa(valor, q.valores)
  }
  for (const secao of modelo.secoes) {
    for (const item of secao.itens as Item[]) {
      if (!item.papeis.some(p => papeis.includes(p))) continue
      if (item.id in sobrepor) {
        const v = sobrepor[item.id]
        if (v !== null) {
          escolhidos[item.id] = v
          if (filtro(item.id, secao.id)) out.push({ itemId: item.id, valor: v })
        }
        continue
      }
      // Já respondido antes: não repete (correção só por `sobrepor`).
      if (c.existentes && item.id in c.existentes) continue
      if (!condicaoVale(item)) continue
      const v = valorPadrao(item, c)
      if (v === undefined) continue
      escolhidos[item.id] = v
      if (filtro(item.id, secao.id)) out.push({ itemId: item.id, valor: v })
    }
  }
  return out
}
