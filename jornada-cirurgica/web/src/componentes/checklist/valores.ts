// Validação e descrição de respostas por tipo (exibição). O servidor valida de novo.
import type { ItemModelo, ValorAlergia, ValorMedicamento, ValorPessoa, ValorResposta } from '@dominio/tipos.ts'
import { OLHO_EXTENSO } from '@dominio/tipos.ts'
import { dataValida, formatarData, formatarNumero } from '../formato.ts'

export interface RespostaParaEnviar {
  itemId: string
  valor: ValorResposta
  observacao?: string | null
}

export const ROTULO_USO: Record<ValorMedicamento['uso'], string> = {
  nao: 'Não usa',
  usa: 'Usa',
  ja_usou: 'Já usou',
}

/**
 * Quais campos extras o item de medicamento pede (POP §1.B).
 * O modelo não marca isso explicitamente: a tela reconhece pelo id e pelo texto do item.
 */
export function camposExtrasMedicamento(item: Pick<ItemModelo, 'id' | 'texto'>): { glp1: boolean; insulina: boolean } {
  const t = `${item.id} ${item.texto}`.toLowerCase()
  return {
    glp1: /glp|tirzepatid|semaglut/.test(t),
    insulina: /insulin|antidiab/.test(t),
  }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function valorPreenchido(v: ValorResposta | undefined | null): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Devolve a mensagem de erro, ou null se a resposta está completa para o tipo do item. */
export function validarValor(item: ItemModelo, v: ValorResposta | undefined | null): string | null {
  if (!valorPreenchido(v)) return 'Resposta obrigatória: nenhum campo fica em branco.'
  switch (item.tipo) {
    case 'confirmacao':
      return v === true ? null : 'Marque como conferido.'
    case 'sim_nao':
      return v === 'sim' || v === 'nao' ? null : 'Escolha Sim ou Não.'
    case 'opcao': {
      const validos = (item.opcoes ?? []).map(o => o.valor)
      if (item.permiteNaoSabe) validos.push('nao_sabe')
      return typeof v === 'string' && validos.includes(v) ? null : 'Escolha uma das opções.'
    }
    case 'multipla': {
      const validos = (item.opcoes ?? []).map(o => o.valor)
      return Array.isArray(v) && v.length > 0 && v.every(x => validos.includes(x)) ? null : 'Marque pelo menos uma opção.'
    }
    case 'texto':
      return typeof v === 'string' && v.trim() !== '' ? null : 'Escreva a resposta.'
    case 'data':
      return typeof v === 'string' && dataValida(v) ? null : 'Data inválida.'
    case 'hora':
      return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? null : 'Hora inválida (hh:mm).'
    case 'numero':
      return typeof v === 'number' && Number.isFinite(v) ? null : 'Número inválido.'
    case 'olho': {
      if (v === 'OD' || v === 'OE') return null
      if (v === 'nao_sabe' && item.permiteNaoSabe) return null
      return 'Escolha o olho.'
    }
    case 'medicamento': {
      if (!ehObjeto(v)) return 'Responda o uso do medicamento.'
      const m = v as unknown as ValorMedicamento
      if (m.uso !== 'nao' && m.uso !== 'usa' && m.uso !== 'ja_usou') return 'Responda: não usa, usa ou já usou.'
      if (m.uso === 'nao') return null
      if (!m.nomes || m.nomes.trim() === '') return 'Escreva o nome comercial informado.'
      const extras = camposExtrasMedicamento(item)
      if (extras.glp1) {
        if (m.aplicacao !== 'semanal' && m.aplicacao !== 'diaria') return 'GLP-1: informe se a aplicação é semanal ou diária.'
        if (!dataValida(m.ultimaAplicacao)) return 'GLP-1: informe a data da última aplicação.'
        if (typeof m.inicioOuAumentoUltimos3Meses !== 'boolean') return 'GLP-1: responda se iniciou ou aumentou a dose nos últimos 3 meses.'
        if (typeof m.nauseaOuVomito !== 'boolean') return 'GLP-1: responda se tem náusea ou vômito.'
      }
      if (extras.insulina && typeof m.insulinaOuSulfonilureia !== 'boolean') return 'Responda se é insulina ou sulfonilureia.'
      return null
    }
    case 'alergia': {
      if (!ehObjeto(v)) return 'Responda se tem alergia.'
      const a = v as unknown as ValorAlergia
      if (typeof a.tem !== 'boolean') return 'Responda se tem alergia.'
      if (a.tem && (!a.reacao || a.reacao.trim() === '')) return 'Descreva a reação (obrigatório quando há alergia).'
      return null
    }
    case 'pessoa': {
      if (!ehObjeto(v)) return 'Informe a pessoa.'
      const p = v as unknown as ValorPessoa
      return p.nome && p.nome.trim() !== '' ? null : 'Informe o nome.'
    }
  }
  return null
}

/** Texto legível de uma resposta (histórico, leitura). */
export function descreverValor(item: ItemModelo, v: ValorResposta | undefined | null): string {
  if (!valorPreenchido(v)) return 'Sem resposta'
  switch (item.tipo) {
    case 'confirmacao':
      return v === true ? 'Conferido' : String(v)
    case 'sim_nao':
      return v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : String(v)
    case 'opcao':
      if (v === 'nao_sabe') return 'Não sabe'
      return item.opcoes?.find(o => o.valor === v)?.rotulo ?? String(v)
    case 'multipla':
      return Array.isArray(v) ? v.map(x => item.opcoes?.find(o => o.valor === x)?.rotulo ?? x).join('; ') : String(v)
    case 'data':
      return typeof v === 'string' ? formatarData(v) : String(v)
    case 'numero':
      return typeof v === 'number' ? formatarNumero(v) : String(v)
    case 'olho':
      if (v === 'OD' || v === 'OE') return OLHO_EXTENSO[v]
      if (v === 'nao_sabe') return 'NÃO SABE'
      return String(v)
    case 'medicamento': {
      if (!ehObjeto(v)) return String(v)
      const m = v as unknown as ValorMedicamento
      const partes = [ROTULO_USO[m.uso] ?? String(m.uso)]
      if (m.nomes) partes.push(m.nomes)
      if (m.detalhes) partes.push(m.detalhes)
      if (m.aplicacao) partes.push(m.aplicacao === 'semanal' ? 'aplicação semanal' : 'aplicação diária')
      if (m.ultimaAplicacao) partes.push(`última aplicação em ${formatarData(m.ultimaAplicacao)}`)
      if (m.inicioOuAumentoUltimos3Meses !== undefined) partes.push(m.inicioOuAumentoUltimos3Meses ? 'iniciou ou aumentou a dose nos últimos 3 meses' : 'sem início ou aumento de dose nos últimos 3 meses')
      if (m.nauseaOuVomito !== undefined) partes.push(m.nauseaOuVomito ? 'com náusea ou vômito' : 'sem náusea ou vômito')
      if (m.insulinaOuSulfonilureia !== undefined) partes.push(m.insulinaOuSulfonilureia ? 'insulina ou sulfonilureia' : 'não é insulina nem sulfonilureia')
      return partes.join('; ')
    }
    case 'alergia': {
      if (!ehObjeto(v)) return String(v)
      const a = v as unknown as ValorAlergia
      return a.tem ? `Sim. Reação: ${a.reacao ?? ''}` : 'Não'
    }
    case 'pessoa': {
      if (!ehObjeto(v)) return String(v)
      const p = v as unknown as ValorPessoa
      return [p.nome, p.parentesco ? `(${p.parentesco})` : '', p.telefone ?? '', p.observacao ?? ''].filter(Boolean).join(' ')
    }
    default:
      return typeof v === 'string' ? v : JSON.stringify(v)
  }
}

export function valoresIguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
