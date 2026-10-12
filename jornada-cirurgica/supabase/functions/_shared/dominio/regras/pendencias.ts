// "O que falta" (briefing §6.6): motor determinístico, sem modelo de linguagem.
// Para cada episódio: o que falta, de quem depende e desde quando.

import { D2, D7 } from '../modelos/ids.ts'
import type { Papel, Pendencia, SeveridadePendencia } from '../tipos.ts'
import {
  cicloAtual,
  concluido,
  cp1Conclusao,
  chegadaRef,
  dadosChegada,
  dataReferencia,
  itensDoModelo,
  planoRef,
  quarentenaAberta,
  rank,
  RANK,
  resposta,
  terminal,
  valor,
} from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import { dataLocal, fimDoDiaLocal, inicioDoDiaLocal, proximoDiaUtil, somarDias } from '../util/datas.ts'
import { ALERTAS_HS6, alertaComunicado, alertasDoEstado } from './alertas.ts'
import { faltam } from './blocos.ts'
import { hardStopsAbertos } from './hardstops.ts'
import { validadePosterior } from './lente.ts'

const ORDEM_SEVERIDADE: Record<SeveridadePendencia, number> = { hard_stop: 0, alerta: 1, pendencia: 2 }

export function pendenciasDoEstado(est: EstadoInterno, agora: string): Pendencia[] {
  const ep = est.entrada.episodio
  const r: Pendencia[] = []
  const add = (codigo: string, descricao: string, responsavel: Papel[], desde: string, severidade: SeveridadePendencia, extra: { prazo?: string; local?: string } = {}) =>
    r.push({ id: `${ep.id}:${codigo}`, episodioId: ep.id, codigo, descricao, responsavel, desde, severidade, ...extra })

  if (terminal(est)) return []

  // Hard stops abertos
  for (const h of hardStopsAbertos(est)) {
    add(`hardstop:${h.codigo}`, `${h.titulo}. ${h.comoResolver}`, h.resolvivelPor, h.abertoDesde, 'hard_stop', { local: 'hardstops' })
  }

  // D-7: itens em branco por seção ("nenhum campo fica em branco")
  if (!concluido(est, 'd7')) {
    const m = est.entrada.modelos.d7
    const falta = new Set(faltam(est, 'd7'))
    for (const s of m.secoes) {
      const n = s.itens.filter((i) => falta.has(i.id)).length
      if (n) add(`d7.em_branco:${s.id}`, `D-7, ${s.titulo}: ${n} item(ns) em branco.`, ['concierge'], ep.abertoEm, 'pendencia', { local: `d7.${s.id}` })
    }
    if (!falta.size) add('d7.concluir', 'D-7 respondido: concluir o bloco (alertas comunicados ao cirurgião).', ['concierge'], ep.abertoEm, 'pendencia', { local: 'd7' })
  }

  // Alertas: comunicação no mesmo dia e conduta escrita do cirurgião
  const data = est.agenda.dataCirurgia
  for (const a of alertasDoEstado(est)) {
    if (a.nivel !== 'alerta') continue
    if (!alertaComunicado(est, a.id)) {
      const resp: Papel[] = a.origem.modelo === 'admissao' ? ['enfermagem'] : a.origem.modelo === 'sistema' ? ['concierge', 'enfermagem'] : ['concierge']
      add(`alerta.nao_comunicado:${a.id}`, `Alerta não comunicado ao cirurgião: ${a.titulo}.`, resp, a.geradoEm, 'alerta', {
        prazo: fimDoDiaLocal(dataLocal(a.geradoEm)),
        local: 'alertas',
      })
    }
    if (!a.conduta && rank(est) < RANK.alta) {
      const prazoD0 = ALERTAS_HS6.includes(a.id) && data ? { prazo: inicioDoDiaLocal(data) } : {}
      add(`alerta.sem_conduta:${a.id}`, `Alerta sem conduta escrita do cirurgião: ${a.titulo}.`, ['cirurgiao'], a.comunicado?.em ?? a.geradoEm, 'alerta', {
        ...prazoD0,
        local: 'alertas',
      })
    }
  }

  // Lente (até o Time Out)
  if (rank(est) < RANK.time_out_concluido && !quarentenaAberta(est)) {
    const c = cicloAtual(est)
    const prazoD2 = data ? { prazo: fimDoDiaLocal(somarDias(data, -2)) } : {}
    if (!planoRef(est)) {
      add('lente.sem_plano', 'Plano da LIO não registrado (transcrever da biometria original com o plano assinado).', ['concierge'], c.iniciadoEm, 'pendencia', { local: 'lente.plano' })
    } else if (!chegadaRef(est)) {
      add('lente.sem_chegada', 'Chegada da LIO não registrada (data, lote, validade).', ['concierge'], planoRef(est)!.em, 'pendencia', { local: 'lente.chegada' })
    } else if (!cp1Conclusao(est)) {
      add('lente.cp1', 'Checkpoint 1 (chegada da LIO) não concluído.', ['concierge'], chegadaRef(est)!.em, 'pendencia', { local: 'lente.cp1' })
    } else if (!c.cp2) {
      add('lente.cp2', 'Checkpoint 2 (conferência independente, cega) não concluído.', ['conferente'], cp1Conclusao(est)!.em, 'pendencia', { ...prazoD2, local: 'lente.cp2' })
    }
    const ch = dadosChegada(est)
    if (ch && validadePosterior(ch.validade, dataReferencia(est)) === false) {
      add('lente.validade', 'Validade da LIO não é posterior à data da cirurgia.', ['concierge', 'cirurgiao'], chegadaRef(est)!.em, 'alerta', { local: 'lente.chegada' })
    }
    if (planoRef(est) && !est.anexos.some((a) => a.tipoAnexo === 'foto_plano' && a.ciclo === c.numero)) {
      add('lente.foto_plano', 'Foto do plano assinado não anexada.', ['concierge'], planoRef(est)!.em, 'pendencia', { local: 'lente.plano' })
    }
  }

  // Agenda
  if (!data && rank(est) < RANK.d2_concluido) add('episodio.sem_data', 'Data da cirurgia não agendada.', ['concierge'], ep.abertoEm, 'pendencia', { local: 'episodio' })

  // TCLE (prazo-alvo [S]: até D-2) e lembrete no D-3
  if (rank(est) < RANK.admitido && est.tcle.status !== 'assinado' && est.tcle.status !== 'olho_conferido') {
    const desde = est.tcle.historico[0]?.em ?? ep.abertoEm
    const prazo = data ? fimDoDiaLocal(somarDias(data, -2)) : undefined
    const atrasado = !!prazo && agora > prazo
    add('tcle.nao_assinado', 'TCLE não assinado (prazo-alvo: até D-2).', ['concierge'], desde, atrasado ? 'alerta' : 'pendencia', { ...(prazo ? { prazo } : {}), local: 'tcle' })
    if (data && agora >= inicioDoDiaLocal(somarDias(data, -3)) && est.tcle.status === 'enviado') {
      add('tcle.lembrete_d3', 'D-3 sem assinatura: enviar o lembrete do TCLE (texto aprovado) ou oferecer a assinatura no hospital.', ['concierge'], inicioDoDiaLocal(somarDias(data, -3)), 'alerta', { local: 'tcle' })
    }
  }

  // Link não aberto até D-3 → ligação ativa (POP §6)
  if (data && rank(est) < RANK.admitido && est.materiais.enviados.length && !est.materiais.abertoEm) {
    const d3 = inicioDoDiaLocal(somarDias(data, -3))
    const ligou = est.teachBacks.some((t) => t.em >= d3)
    if (agora >= d3 && !ligou) {
      add('materiais.link_nao_aberto_d3', 'Link não aberto até D-3: ligação ativa; vídeo exibido na recepção no D-2 ou D0, antes da assinatura.', ['concierge'], d3, 'alerta', { local: 'materiais' })
    }
  }

  // Quiz: reprovação dupla ou erro do olho → contato humano em até 1 dia útil (POP §6)
  const contato = contatoHumanoQuiz(est)
  if (contato && rank(est) < RANK.admitido) {
    const prazo = fimDoDiaLocal(proximoDiaUtil(dataLocal(contato.desde), est.entrada.config.feriados ?? []))
    add(
      `quiz.contato_humano:${contato.motivo}`,
      contato.motivo === 'erro_olho'
        ? 'Quiz: erro na pergunta do olho. Ligação da concierge ou enfermagem com teach-back oral.'
        : 'Quiz: reprovação dupla. Ligação da concierge ou enfermagem com teach-back oral.',
      ['concierge', 'enfermagem'],
      contato.desde,
      'alerta',
      { prazo, local: 'materiais' },
    )
  }

  // Contatos e autorizações
  if (rank(est) < RANK.alta) {
    for (const c of Object.values(est.contatos)) {
      if (c.tipo !== 'familiar_avisos' && c.tipo !== 'whatsapp_paciente') continue
      if (!c.anuenciaPaciente) add(`contato.sem_anuencia:${c.id}`, 'Contato sem anuência do paciente registrada: não recebe mensagens.', ['concierge'], ep.abertoEm, 'pendencia', { local: 'contatos' })
      else if (!c.confirmadoEm) add(`contato.nao_confirmado:${c.id}`, 'Contato não confirmado por resposta do próprio número.', ['concierge'], ep.abertoEm, 'pendencia', { local: 'contatos' })
    }
    if (rank(est) < RANK.d7_concluido && !Object.values(est.contatos).some((c) => c.tipo === 'whatsapp_paciente')) {
      add('contato.whatsapp_ausente', 'WhatsApp do paciente não cadastrado nos contatos (vídeo e TCLE).', ['concierge'], ep.abertoEm, 'pendencia', { local: 'contatos' })
    }
  }

  // Orientações (teach-back) e acompanhante reserva no D-7
  if (rank(est) < RANK.admitido) {
    if (!est.teachBack) add('orientacoes.teach_back', 'Revisão das orientações com teach-back não registrada.', ['concierge'], ep.abertoEm, 'pendencia', { local: 'orientacoes' })
    if (!resposta(est, 'd7', D7.acompanhanteReserva)) {
      add('d7.acompanhante_reserva', 'Acompanhante reserva não registrado (POP §8, prevenção).', ['concierge'], ep.abertoEm, 'pendencia', { local: 'd7.E' })
    }
  }

  // D-2
  if (data && rank(est) < RANK.d2_concluido) {
    const d2 = inicioDoDiaLocal(somarDias(data, -2))
    const vespera = inicioDoDiaLocal(somarDias(data, -1))
    if (agora >= d2) {
      add('d2.nao_concluido', agora >= vespera ? 'D-2 não concluído na véspera da cirurgia.' : 'D-2 não concluído.', ['conferente', 'concierge'], d2, agora >= vespera ? 'alerta' : 'pendencia', {
        prazo: vespera,
        local: 'd2',
      })
    }
  }
  if (rank(est) < RANK.admitido) {
    const confirmado = resposta(est, 'd2', D2.acompanhanteConfirmado)
    if (confirmado?.valor === 'nao') {
      add('d2.sem_acompanhante', 'D-2: acompanhante adulto não confirmado. Sem acompanhante a cirurgia não é realizada (POP §8).', ['concierge'], confirmado.registradoEm, 'alerta', { local: 'd2' })
    }
    const presenca = resposta(est, 'd2', D2.presenca)
    if (presenca?.valor === 'nao') add('d2.presenca', 'D-2: presença não confirmada.', ['concierge'], presenca.registradoEm, 'alerta', { local: 'd2' })
  }

  // Blocos do D0 com itens marcados pendentes (lista do dia)
  if (data && dataLocal(agora) >= data) {
    for (const m of ['admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta'] as const) {
      if (concluido(est, m)) continue
      const f = faltam(est, m)
      const iniciado = itensDoModelo(est.entrada.modelos[m]).some((i) => valor(est, m, i.id) !== undefined)
      if (iniciado && f.length) add(`${m}.em_aberto`, `${est.entrada.modelos[m].titulo}: ${f.length} item(ns) sem marcação.`, est.entrada.modelos[m].papeisConclusao, inicioDoDiaLocal(data), 'pendencia', { local: m })
    }
  }

  return r.sort((a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade] || a.desde.localeCompare(b.desde) || a.id.localeCompare(b.id))
}

/** Contato humano pelo quiz (POP §6): reprovação dupla ou erro na pergunta 1, até um teach-back posterior. */
export function contatoHumanoQuiz(est: EstadoInterno): { motivo: 'reprovacao_dupla' | 'erro_olho'; desde: string } | null {
  const q = est.materiais.quiz
  const erroOlho = q.find((t) => t.tentativa.olhoConfere === false)
  const reprovacoes = q.filter((t) => !t.tentativa.aprovado)
  let gatilho: { motivo: 'reprovacao_dupla' | 'erro_olho'; desde: string } | null = null
  if (erroOlho) gatilho = { motivo: 'erro_olho', desde: erroOlho.em }
  else if (reprovacoes.length >= 2) gatilho = { motivo: 'reprovacao_dupla', desde: reprovacoes[1].em }
  if (!gatilho) return null
  if (est.teachBacks.some((t) => t.em >= gatilho!.desde)) return null
  return gatilho
}
