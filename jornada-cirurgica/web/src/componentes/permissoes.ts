// Habilitar/desabilitar ações na tela. O servidor decide; a tela só antecipa e explica o motivo.
// Fonte primária: `EpisodioVisao.permissoes` (calculada pelo servidor para o ator atual).
// Se a chave não vier, usa a matriz de papéis da ARQUITETURA §4.4 apenas para explicar.
import type { EpisodioVisao, ModeloChecklist, Papel } from '@dominio/tipos.ts'
import { rotuloPapeis } from './rotulos.ts'

export interface Permissao {
  permitido: boolean
  motivo?: string
}

/** Matriz de papéis por ação (espelho da ARQUITETURA §4.4, só para exibição). */
export const PAPEIS_POR_ACAO: Record<string, Papel[]> = {
  'episodio.agendar': ['concierge', 'gestora', 'cirurgiao'],
  'alerta.comunicar': ['concierge', 'conferente', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'],
  'alerta.conduta': ['cirurgiao'],
  'contato.salvar': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'contato.remover': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'contato.confirmar': ['concierge', 'conferente', 'gestora'],
  'orientacoes.teach_back': ['concierge', 'enfermagem'],
  'lente.plano': ['concierge'],
  'lente.chegada': ['concierge'],
  'lente.cp2': ['conferente'],
  'lente.time_out': ['circulante'],
  'lente.resolver_quarentena': ['cirurgiao'],
  'lente.troca_d0': ['cirurgiao'],
  'anexo.enviar': ['concierge', 'cirurgiao', 'gestora'],
  'tcle.status': ['concierge', 'conferente', 'enfermagem', 'gestora'],
  'materiais.enviar': ['concierge', 'gestora'],
  'materiais.previa': ['concierge', 'gestora'],
  'etiquetas.gerar': ['conferente', 'concierge', 'enfermagem'],
  'etiqueta.copiada': ['conferente', 'concierge', 'enfermagem'],
  'intercorrencia.registrar': ['enfermagem', 'circulante', 'anestesista', 'cirurgiao'],
  'episodio.suspender': ['cirurgiao', 'gestora'],
  'episodio.cancelar': ['cirurgiao', 'gestora'],
  'avisos.atraso': ['concierge', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'],
  'quase_evento.registrar': ['concierge', 'conferente', 'enfermagem', 'circulante', 'anestesista', 'cirurgiao', 'gestora'],
}

/** Procura a permissão calculada pelo servidor, tentando as formas de chave mais prováveis. */
export function permissaoDoServidor(visao: Pick<EpisodioVisao, 'permissoes'> | null | undefined, acao: string, alvo?: string): Permissao | null {
  const p = visao?.permissoes
  if (!p) return null
  const chaves = alvo ? [`${acao}:${alvo}`, `${acao}.${alvo}`, `${acao}/${alvo}`, `${alvo}:${acao}`] : [acao]
  for (const c of chaves) {
    if (p[c]) return p[c]
  }
  if (alvo && p[acao]) return p[acao]
  return null
}

export function temAlgumPapel(papeis: readonly Papel[], permitidos: readonly Papel[]): boolean {
  return permitidos.some(p => papeis.includes(p))
}

/** Permissão combinada: servidor primeiro; sem resposta do servidor, a matriz de papéis. */
export function permissao(
  visao: Pick<EpisodioVisao, 'permissoes'> | null | undefined,
  papeisAtor: readonly Papel[],
  acao: string,
  opcoes?: { alvo?: string; papeis?: readonly Papel[] },
): Permissao {
  const servidor = permissaoDoServidor(visao, acao, opcoes?.alvo)
  if (servidor) return servidor
  const permitidos = opcoes?.papeis ?? PAPEIS_POR_ACAO[acao]
  if (permitidos && !temAlgumPapel(papeisAtor, permitidos)) {
    return { permitido: false, motivo: `Só ${rotuloPapeis(permitidos)} pode fazer isto.` }
  }
  return { permitido: true }
}

/** Papéis que respondem a pelo menos um item do modelo. */
export function papeisDoModelo(modelo: ModeloChecklist): Papel[] {
  const s = new Set<Papel>()
  for (const secao of modelo.secoes) for (const item of secao.itens) for (const p of item.papeis) s.add(p)
  return [...s]
}

export function permissaoResponder(visao: Pick<EpisodioVisao, 'permissoes'> | null | undefined, papeisAtor: readonly Papel[], modelo: ModeloChecklist): Permissao {
  return permissao(visao, papeisAtor, 'checklist.responder', { alvo: modelo.id, papeis: papeisDoModelo(modelo) })
}

export function permissaoConcluir(visao: Pick<EpisodioVisao, 'permissoes'> | null | undefined, papeisAtor: readonly Papel[], modelo: ModeloChecklist): Permissao {
  return permissao(visao, papeisAtor, 'bloco.concluir', { alvo: modelo.id, papeis: modelo.papeisConclusao })
}
