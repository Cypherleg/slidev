// Texto legível de uma resposta de checklist, para o registro impresso do episódio.

import type { ItemModelo, ValorAlergia, ValorMedicamento, ValorPessoa, ValorResposta } from '@dominio/tipos.ts'
import { OLHO_EXTENSO } from '@dominio/tipos.ts'
import { formatarData, formatarNumero } from '../../componentes/formato.ts'

const USO: Record<ValorMedicamento['uso'], string> = { nao: 'Não usa', usa: 'Usa', ja_usou: 'Já usou' }

function rotuloOpcao(item: ItemModelo | undefined, valor: string): string {
  return item?.opcoes?.find(o => o.valor === valor)?.rotulo ?? valor
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function medicamento(v: ValorMedicamento): string {
  const partes = [USO[v.uso] ?? String(v.uso)]
  if (v.nomes) partes.push(`Nomes: ${v.nomes}`)
  if (v.detalhes) partes.push(`Detalhes: ${v.detalhes}`)
  if (v.aplicacao) partes.push(`Aplicação ${v.aplicacao === 'semanal' ? 'semanal' : 'diária'}`)
  if (v.ultimaAplicacao) partes.push(`Última aplicação: ${formatarData(v.ultimaAplicacao)}`)
  if (v.inicioOuAumentoUltimos3Meses !== undefined) partes.push(`Início ou aumento de dose nos últimos 3 meses: ${v.inicioOuAumentoUltimos3Meses ? 'sim' : 'não'}`)
  if (v.nauseaOuVomito !== undefined) partes.push(`Náusea ou vômito: ${v.nauseaOuVomito ? 'sim' : 'não'}`)
  if (v.insulinaOuSulfonilureia !== undefined) partes.push(`Insulina ou sulfonilureia: ${v.insulinaOuSulfonilureia ? 'sim' : 'não'}`)
  return partes.join(' · ')
}

function alergia(v: ValorAlergia): string {
  if (!v.tem) return 'Não'
  return v.reacao ? `Sim. Reação: ${v.reacao}` : 'Sim'
}

function pessoa(v: ValorPessoa): string {
  const partes = [v.nome]
  if (v.parentesco) partes.push(v.parentesco)
  if (v.telefone) partes.push(v.telefone)
  if (v.observacao) partes.push(v.observacao)
  return partes.filter(Boolean).join(' · ')
}

/** Converte a resposta em texto, segundo o tipo do item (ou pela forma do valor, se o item não vier). */
export function formatarResposta(item: ItemModelo | undefined, valor: ValorResposta | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (item?.tipo) {
    case 'confirmacao':
      return valor === true ? 'Conferido' : String(valor)
    case 'sim_nao':
      return valor === 'sim' ? 'Sim' : valor === 'nao' ? 'Não' : String(valor)
    case 'opcao':
      return typeof valor === 'string' ? rotuloOpcao(item, valor) : String(valor)
    case 'multipla':
      return Array.isArray(valor) ? (valor.length ? valor.map(v => rotuloOpcao(item, v)).join(', ') : 'Nenhuma') : String(valor)
    case 'data':
      return typeof valor === 'string' ? formatarData(valor) : String(valor)
    case 'numero':
      return typeof valor === 'number' ? formatarNumero(valor) : String(valor)
    case 'olho':
      if (valor === 'OD' || valor === 'OE') return OLHO_EXTENSO[valor]
      if (valor === 'nao_sabe') return 'Não sabe'
      return String(valor)
    case 'medicamento':
      return ehObjeto(valor) && 'uso' in valor ? medicamento(valor as unknown as ValorMedicamento) : String(valor)
    case 'alergia':
      return ehObjeto(valor) && 'tem' in valor ? alergia(valor as unknown as ValorAlergia) : String(valor)
    case 'pessoa':
      return ehObjeto(valor) && 'nome' in valor ? pessoa(valor as unknown as ValorPessoa) : String(valor)
    case 'texto':
    case 'hora':
      return String(valor)
    default:
      break
  }
  // Sem item: pela forma do valor.
  if (valor === true) return 'Conferido'
  if (valor === 'sim') return 'Sim'
  if (valor === 'nao') return 'Não'
  if (Array.isArray(valor)) return valor.join(', ')
  if (typeof valor === 'number') return formatarNumero(valor)
  if (ehObjeto(valor)) {
    if ('uso' in valor) return medicamento(valor as unknown as ValorMedicamento)
    if ('tem' in valor) return alergia(valor as unknown as ValorAlergia)
    if ('nome' in valor) return pessoa(valor as unknown as ValorPessoa)
    return JSON.stringify(valor)
  }
  return String(valor)
}
