// Matriz papel × tipo de evento (ARQUITETURA §4.4). O agente do banco reproduz esta matriz em
// `jornada_cirurgica.permissoes_evento`: manter as duas IDÊNTICAS.

import type { ModeloId, NovoEvento, Papel } from './tipos.ts'
import { PAPEIS } from './tipos.ts'

type TipoEventoNovo = NovoEvento['tipo']

const TODOS: Papel[] = [...PAPEIS]

/** Papéis por modelo para `checklist.item_respondido` e `bloco.concluido`. */
export const PAPEIS_POR_MODELO: Record<ModeloId, Papel[]> = {
  d7: ['concierge'],
  cp1: ['concierge'],
  cp2: ['conferente'],
  d2: ['conferente', 'concierge'],
  admissao: ['enfermagem'],
  sign_in: ['circulante', 'enfermagem', 'cirurgiao', 'anestesista'],
  anestesia: ['anestesista'],
  time_out: ['circulante', 'cirurgiao'],
  sign_out: ['circulante', 'cirurgiao', 'anestesista'],
  alta: ['enfermagem', 'cirurgiao'],
}

/** Eventos sem modelo. `[]` = somente `jornada_sistema` (autor 'paciente' ou 'sistema'). */
export const PAPEIS_POR_EVENTO: Record<Exclude<TipoEventoNovo, 'checklist.item_respondido' | 'bloco.concluido'>, Papel[]> = {
  'paciente.cadastrado': ['concierge', 'gestora'],
  'paciente.corrigido': ['concierge', 'gestora'],
  'episodio.aberto': ['concierge', 'gestora'],
  'episodio.agendado': ['concierge', 'gestora', 'cirurgiao'],
  'episodio.corrigido': ['concierge', 'gestora', 'cirurgiao'],
  'alerta.comunicado': ['concierge', 'conferente', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'],
  'alerta.conduta_registrada': ['cirurgiao'],
  'contato.salvo': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'contato.removido': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'contato.confirmado': ['concierge', 'conferente', 'gestora'],
  'orientacoes.teach_back': ['concierge', 'enfermagem'],
  'lente.plano_registrado': ['concierge'],
  'lente.chegada_registrada': ['concierge'],
  'lente.cp2_registrado': ['conferente'],
  'lente.cp2_resultado': ['conferente'],
  'lente.quarentena_aberta': ['concierge', 'conferente', 'circulante', 'cirurgiao'],
  'lente.quarentena_resolvida': ['cirurgiao'],
  'lente.troca_d0': ['cirurgiao'],
  'lente.time_out_resultado': ['circulante'],
  'anexo.adicionado': ['concierge', 'cirurgiao', 'gestora'],
  'tcle.status': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'material.enviado': ['concierge', 'gestora'],
  'link_paciente.criado': ['concierge', 'gestora'],
  'etiqueta.copiada': ['conferente', 'concierge', 'enfermagem'],
  'hardstop.resolvido': TODOS,
  'intercorrencia.registrada': ['enfermagem', 'circulante', 'anestesista', 'cirurgiao'],
  'episodio.suspenso': ['cirurgiao', 'gestora'],
  'episodio.cancelado': ['cirurgiao', 'gestora'],
  'avisos.atraso_solicitado': ['concierge', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'],
  'mensagem.enfileirada': TODOS,
  'quase_evento.registrado': TODOS,
  'membro.alterado': ['gestora'],
  'config.alterada': ['gestora'],
  'modelo.publicado': ['gestora'],
  'material.catalogo_alterado': ['gestora'],
  'material.aberto': [],
  'quiz.respondido': [],
}

/** Matriz papel × tipo de evento (espelhada na tabela `jornada_cirurgica.permissoes_evento`). */
export function papeisPermitidosParaEvento(tipo: TipoEventoNovo, modelo?: ModeloId | null): Papel[] {
  if (tipo === 'checklist.item_respondido' || tipo === 'bloco.concluido') {
    if (!modelo) return []
    return [...(PAPEIS_POR_MODELO[modelo] ?? [])]
  }
  return [...(PAPEIS_POR_EVENTO[tipo] ?? [])]
}

/** Linhas da matriz no formato da tabela (tipo, modelo, papeis), para o agente do banco conferir. */
export function linhasMatrizPermissoes(): { tipo: TipoEventoNovo; modelo: ModeloId | null; papeis: Papel[] }[] {
  const linhas: { tipo: TipoEventoNovo; modelo: ModeloId | null; papeis: Papel[] }[] = []
  for (const tipo of ['checklist.item_respondido', 'bloco.concluido'] as const) {
    for (const modelo of Object.keys(PAPEIS_POR_MODELO) as ModeloId[]) {
      linhas.push({ tipo, modelo, papeis: [...PAPEIS_POR_MODELO[modelo]] })
    }
  }
  for (const [tipo, papeis] of Object.entries(PAPEIS_POR_EVENTO)) {
    linhas.push({ tipo: tipo as TipoEventoNovo, modelo: null, papeis: [...papeis] })
  }
  return linhas
}

/** Visibilidade de leitura (ARQUITETURA §4.3). */
export const PAPEIS_LEITURA = {
  conferencia_1: ['concierge', 'cirurgiao', 'gestora'] as Papel[],
  conferencia_2: ['conferente', 'cirurgiao', 'gestora'] as Papel[],
  time_out: ['circulante', 'cirurgiao', 'gestora'] as Papel[],
  foto_plano: ['concierge', 'cirurgiao', 'gestora'] as Papel[],
}

export function temAlgumPapel(papeis: readonly Papel[], permitidos: readonly Papel[]): boolean {
  return papeis.some((p) => permitidos.includes(p))
}

/** Primeiro papel do ator que está entre os permitidos (determinístico pela ordem do ator). */
export function papelUsado(papeis: readonly Papel[], permitidos: readonly Papel[]): Papel | null {
  return papeis.find((p) => permitidos.includes(p)) ?? null
}
