// Blocos do episódio: disponibilidade, itens exigidos, o que falta e impedimentos de conclusão.

import { ADM, D7, ITENS_ALERGIA, SO } from '../modelos/ids.ts'
import type { BlocoVisao, ItemModelo, ModeloId, SituacaoBloco, ValorAlergia } from '../tipos.ts'
import { ORDEM_MODELOS } from '../tipos.ts'
import {
  cicloAtual,
  concluido,
  condicaoItemVale,
  conclusao,
  cp1Conclusao,
  dadosChegada,
  dataReferencia,
  etapaLente,
  itensDoModelo,
  lenteTorica,
  marcado,
  nomeMembro,
  planoRef,
  chegadaRef,
  quarentenaAberta,
  rank,
  RANK,
  resposta,
  respostasDoModelo,
  terminal,
  valor,
} from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import { alertasSemComunicacao } from './alertas.ts'
import { glp1Efetivo, mudancasInformadas } from './medicamentos.ts'
import { calcularDots } from './dots.ts'
import { bloqueiosPara } from './hardstops.ts'
import { calcularIdentificacao } from './identificacao.ts'
import { validadePosterior } from './lente.ts'

/** Item exigido agora (obrigatório ou com condição satisfeita). */
export function itemExigido(est: EstadoInterno, modeloId: ModeloId, item: ItemModelo): boolean {
  if (item.obrigatorio) return true
  // Item pendente (decisão em aberto no POP) e não obrigatório nunca é exigido: a condição só diz quando aparece.
  if (item.pendente) return false
  const cond = item.exigidoQuando
  if (!cond) return false
  if ('itemId' in cond) return condicaoItemVale(est, modeloId, cond)
  switch (cond.contexto) {
    case 'homonimo_no_dia':
      return calcularIdentificacao(est).exigeNomeMae
    case 'lente_torica':
      return lenteTorica(est)
    case 'dot_D':
      return calcularDots(est).some((d) => d.letra === 'D')
  }
  return false
}

/** Itens exigidos ainda sem resposta. */
export function faltam(est: EstadoInterno, modeloId: ModeloId): string[] {
  const m = est.entrada.modelos[modeloId]
  if (!m) return []
  const resp = respostasDoModelo(est, modeloId)
  return itensDoModelo(m)
    .filter((i) => itemExigido(est, modeloId, i) && !(i.id in resp && resp[i.id].valor !== '' && resp[i.id].valor !== null))
    .map((i) => i.id)
}

/** Motivo pelo qual o bloco ainda não pode ser respondido (pré-requisito), ou null. */
export function motivoIndisponivel(est: EstadoInterno, modeloId: ModeloId): string | null {
  if (terminal(est)) return est.estado === 'suspenso' ? 'Episódio suspenso.' : 'Episódio cancelado.'
  switch (modeloId) {
    case 'd7':
      return null
    case 'cp1':
      if (!planoRef(est)) return 'Registre o plano da lente (transcrito da biometria original com o plano assinado).'
      if (quarentenaAberta(est)) return 'Lente em quarentena: aguarda resolução escrita do cirurgião.'
      return null
    case 'cp2':
      if (quarentenaAberta(est)) return 'Lente em quarentena: aguarda resolução escrita do cirurgião.'
      if (!cp1Conclusao(est)) return 'Checkpoint 1 (chegada da LIO) não concluído.'
      return null
    case 'd2':
      return concluido(est, 'd7') ? null : 'D-7 não concluído.'
    case 'admissao':
      return rank(est) >= RANK.d2_concluido ? null : 'D-2 não concluído.'
    case 'sign_in':
    case 'anestesia':
      return rank(est) >= RANK.admitido ? null : 'Admissão não concluída.'
    case 'time_out':
      return rank(est) >= RANK.sign_in_concluido ? null : 'Sign In não concluído.'
    case 'sign_out':
      return rank(est) >= RANK.time_out_concluido ? null : 'Time Out não concluído.'
    case 'alta':
      return rank(est) >= RANK.sign_out_concluido ? null : 'Sign Out não concluído.'
  }
}

function tituloItem(est: EstadoInterno, modeloId: ModeloId, itemId: string): string {
  const m = est.entrada.modelos[modeloId]
  return itensDoModelo(m).find((i) => i.id === itemId)?.texto ?? itemId
}

/** Coerência das alergias do D-7 (POP §1.D: "nenhuma alergia conhecida" marcada explicitamente). */
export function incoerenciaAlergias(est: EstadoInterno): string | null {
  const nenhuma = valor(est, 'd7', D7.nenhumaAlergia)
  const alguma = ITENS_ALERGIA.some((id) => (valor(est, 'd7', id) as ValorAlergia | undefined)?.tem === true)
  const todasRespondidas = ITENS_ALERGIA.every((id) => resposta(est, 'd7', id) !== undefined)
  if (nenhuma === 'sim' && alguma) return '"Nenhuma alergia conhecida" marcada, mas há alergia registrada.'
  if (nenhuma === 'nao' && todasRespondidas && !alguma) return '"Nenhuma alergia conhecida" = não, mas nenhuma alergia foi registrada.'
  return null
}

/** Tudo o que impede concluir o bloco agora (exceto papel do ator e leitura em voz alta). */
export function impedimentosConclusao(est: EstadoInterno, modeloId: ModeloId): string[] {
  const r: string[] = []
  const indisp = motivoIndisponivel(est, modeloId)
  if (indisp) r.push(indisp)
  if (concluido(est, modeloId)) r.push('Bloco já concluído.')
  const m = est.entrada.modelos[modeloId]
  if (!m) return [...r, 'Modelo de checklist ausente.']
  const falta = faltam(est, modeloId)
  if (falta.length) r.push(`${falta.length} item(ns) exigido(s) sem resposta.`)
  for (const i of itensDoModelo(m)) {
    if (i.exigeSim && marcado(est, modeloId, i.id) && valor(est, modeloId, i.id) === 'nao') {
      r.push(`Respondido "não": ${i.texto}.`)
    }
  }
  // Alertas: comunicados ao cirurgião antes de concluir (POP §1; "como no D-7" também no D-2 e na admissão).
  if (modeloId === 'd7' || modeloId === 'd2' || modeloId === 'admissao') {
    for (const a of alertasSemComunicacao(est)) {
      r.push(`${a.inativo ? 'Correção de alerta' : 'Alerta'} não comunicado ao cirurgião: ${a.titulo}.`)
    }
  }
  for (const h of bloqueiosPara(est, `concluir:${modeloId}`)) r.push(`Hard stop: ${h.titulo}.`)

  switch (modeloId) {
    case 'd7': {
      const inc = incoerenciaAlergias(est)
      if (inc) r.push(inc)
      break
    }
    case 'cp1': {
      if (!chegadaRef(est)) r.push('Registre a chegada da LIO (data, lote e validade).')
      const ch = dadosChegada(est)
      if (ch) {
        const ok = validadePosterior(ch.validade, dataReferencia(est))
        if (ok === false) r.push('Validade da LIO não é posterior à data da cirurgia.')
      }
      break
    }
    case 'cp2': {
      const c = cicloAtual(est)
      if (!c.cp2Registro && !c.cp2Resultado) r.push('Digite olho, modelo, dioptria, cilindro e eixo (conferência cega).')
      else if (c.cp2Resultado && !c.cp2Resultado.confere) r.push('Conferência cega com divergência.')
      break
    }
    case 'd2': {
      const e = etapaLente(est)
      if (e !== 'cp2_confere' && e !== 'time_out_confere') r.push('Lente sem checkpoint 2 concluído sem divergência.')
      break
    }
    case 'admissao': {
      // Reconferência do GLP-1 no D0: "não usa" contra registro "usa" sem a mudança registrada.
      const g = glp1Efetivo(est)
      if (valor(est, 'admissao', ADM.usaGlp1) === 'nao' && g?.valor.uso === 'usa' && !mudancasInformadas(est, 'admissao').classes.includes('glp1')) {
        r.push('GLP-1 registrado em uso, mas a admissão diz que não usa: registre a mudança de medicação (classe GLP-1) ou corrija a resposta.')
      }
      break
    }
    case 'time_out': {
      if (!cicloAtual(est).timeOutResultado?.confere) r.push('Leitura da LIO da caixa não registrada ou não conferida.')
      break
    }
    case 'sign_out': {
      if (valor(est, 'sign_out', SO.intercorrencias) === 'sem_intercorrencia' && est.intercorrencias.length) {
        r.push('Há intercorrência registrada no painel: o item de intercorrências não pode ser "sem intercorrência".')
      }
      break
    }
    case 'alta': {
      if (!concluido(est, 'anestesia')) r.push('Bloco de anestesia não concluído (liberação da recuperação).')
      break
    }
    default:
      break
  }
  return [...new Set(r)]
}

export function situacaoBloco(est: EstadoInterno, modeloId: ModeloId): SituacaoBloco {
  if (concluido(est, modeloId)) return 'concluido'
  if (motivoIndisponivel(est, modeloId)) return 'bloqueado'
  return Object.keys(respostasDoModelo(est, modeloId)).length ? 'em_andamento' : 'disponivel'
}

export function blocoVisao(est: EstadoInterno, modeloId: ModeloId): BlocoVisao {
  const c = conclusao(est, modeloId)
  const situacao = situacaoBloco(est, modeloId)
  const imp = situacao === 'concluido' ? [] : impedimentosConclusao(est, modeloId).filter((x) => x !== 'Bloco já concluído.')
  const v: BlocoVisao = { modelo: modeloId, situacao, faltam: situacao === 'concluido' ? [] : faltam(est, modeloId), impedimentos: imp }
  if (c) {
    v.concluido = {
      em: c.em,
      porId: c.porId,
      porNome: nomeMembro(est, c.porId),
      foraDeHora: c.foraDeHora,
      ...(c.leitorId ? { leitorNome: nomeMembro(est, c.leitorId) } : {}),
      ...(c.confirmadorId ? { confirmadorNome: nomeMembro(est, c.confirmadorId) } : {}),
    }
  }
  return v
}

export function blocosVisao(est: EstadoInterno): Record<ModeloId, BlocoVisao> {
  const r = {} as Record<ModeloId, BlocoVisao>
  for (const id of ORDEM_MODELOS) r[id] = blocoVisao(est, id)
  return r
}

export { tituloItem }
