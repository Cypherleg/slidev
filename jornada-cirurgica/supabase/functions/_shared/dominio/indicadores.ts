// Indicadores de adesão ao POP (§12), calculados dos episódios do período (data da cirurgia em [de, ate]).
// 2 (Time Out real, observação direta) e 8 (acurácia refrativa, prontuário aos 30 dias) exigem dado externo.

import type { Estado, Indicador } from './contrato.ts'
import { interno } from './estado/montar.ts'
import { cicloCp1, RANK } from './estado/consultas.ts'
import type { CicloLente, EstadoInterno } from './estado/tipos.ts'
import { dataLocal, somarDias } from './util/datas.ts'

const CODIGOS_DIVERGENCIA = new Set(['HS1_DIVERGENCIA_LIO', 'HS3_DIVERGENCIA_IDENTIDADE_OLHO', 'HS_LIO_TIME_OUT'])
const CAUSAS_EVITAVEIS = new Set(['sem_acompanhante', 'colirio_nao_usado', 'medicacao_nao_ajustada', 'olho_vermelho_nao_avisado', 'tcle_ausente', 'lio_indisponivel'])

const fracao = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 10000) / 10000 : null)
const operado = (e: EstadoInterno) => RANK[e.estado] >= RANK.time_out_concluido

/** Ciclo da lente usado na cirurgia: o que tinha o Time Out conferido, senão o atual. */
function cicloUsado(e: EstadoInterno): CicloLente {
  return [...e.ciclos].reverse().find((c) => c.timeOutResultado?.confere) ?? e.ciclos[e.ciclos.length - 1]
}

export function calcularIndicadores(estados: Estado[], de: string, ate: string): Indicador[] {
  const todos = estados.map(interno)
  const doPeriodo = todos.filter((e) => e.agenda.dataCirurgia && e.agenda.dataCirurgia >= de && e.agenda.dataCirurgia <= ate)
  const operados = doPeriodo.filter(operado)

  // 1. Checklist D0 completo: os 4 blocos (admissão, Sign In, Time Out, Sign Out) concluídos e assinados.
  const completos = operados.filter((e) => ['admissao', 'sign_in', 'time_out', 'sign_out'].every((m) => !!e.conclusoes[m as 'admissao']))
  // 3. Dupla conferência: checkpoints 1 e 2 por pessoas diferentes, concluídos antes do D0.
  const dupla = operados.filter((e) => {
    const c = cicloUsado(e)
    const cp1 = cicloCp1(e, c).cp1
    const cp2 = c.cp2
    const data = e.agenda.dataCirurgia!
    return !!cp1 && !!cp2 && cp1.porId !== cp2.porId && dataLocal(cp1.em) < data && dataLocal(cp2.em) < data
  })
  // 4. Divergências interceptadas por etapa (quase-eventos de identidade, olho ou LIO e os registrados à mão).
  const porEtapa: Record<string, number> = { chegada: 0, d2: 0, d0: 0 }
  for (const e of todos) {
    for (const q of e.quaseEventos) {
      const d = dataLocal(q.em)
      if (d < de || d > ate) continue
      if (q.automatico && (!q.codigo || !CODIGOS_DIVERGENCIA.has(q.codigo))) continue
      if (q.etapa in porEtapa) porEtapa[q.etapa]++
    }
  }
  const totalDiv = porEtapa.chegada + porEtapa.d2 + porEtapa.d0
  // 5. Never events registrados (intercorrência marcada como never event).
  const never = todos.flatMap((e) => e.intercorrencias.filter((i) => i.neverEvent && dataLocal(i.em) >= de && dataLocal(i.em) <= ate))
  // 6. Cancelamentos evitáveis no D0 (suspensão ou cancelamento registrado na data da cirurgia).
  const evitaveis = doPeriodo.filter((e) =>
    e.suspensoes.some((s) => dataLocal(s.em) === e.agenda.dataCirurgia && (s.evitavel === true || (s.evitavel === null && s.causa !== null && CAUSAS_EVITAVEIS.has(s.causa)))),
  )
  // 7. TCLE no prazo: assinado até D-2.
  const tcleNoPrazo = doPeriodo.filter((e) => {
    const assinatura = e.tcle.historico.find((h) => h.status === 'assinado' || h.status === 'olho_conferido')
    return !!assinatura && dataLocal(assinatura.em) <= somarDias(e.agenda.dataCirurgia!, -2)
  })
  // Complementar: aprovação no quiz na 1ª tentativa e perguntas mais erradas.
  const comQuiz = doPeriodo.filter((e) => e.materiais.quiz.length)
  const aprovados1a = comQuiz.filter((e) => e.materiais.quiz[0].tentativa.aprovado)
  const erros: Record<number, number> = {}
  for (const e of comQuiz) for (const t of e.materiais.quiz) for (const n of t.erradas) erros[n] = (erros[n] ?? 0) + 1
  const maisErradas = Object.entries(erros)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, 3)
    .map(([n, q]) => `pergunta ${n} (${q})`)

  return [
    { numero: 1, nome: 'Checklist D0 completo', numerador: completos.length, denominador: operados.length, valor: fracao(completos.length, operados.length), meta: '100%', observacao: 'Cirurgias com admissão, Sign In, Time Out e Sign Out concluídos e assinados ÷ cirurgias realizadas.' },
    { numero: 2, nome: 'Time Out real', numerador: null, denominador: null, valor: null, meta: '≥ 95%', observacao: 'Exige observação direta (5 por mês): registrar fora do painel.' },
    { numero: 3, nome: 'Dupla conferência de LIO', numerador: dupla.length, denominador: operados.length, valor: fracao(dupla.length, operados.length), meta: '100%', observacao: 'LIOs com checkpoints 1 e 2 por pessoas diferentes antes do D0 ÷ cirurgias realizadas.' },
    { numero: 4, nome: 'Divergências interceptadas', numerador: totalDiv, denominador: null, valor: null, meta: 'Sem meta de zero', observacao: `Chegada: ${porEtapa.chegada} · D-2: ${porEtapa.d2} · D0: ${porEtapa.d0}.` },
    { numero: 5, nome: 'Never events', numerador: never.length, denominador: null, valor: null, meta: '0', observacao: 'Intercorrências registradas como never event (olho errado, paciente errado, LIO errada implantada). A fonte oficial é a notificação.' },
    { numero: 6, nome: 'Cancelamentos evitáveis no D0', numerador: evitaveis.length, denominador: doPeriodo.length, valor: fracao(evitaveis.length, doPeriodo.length), meta: 'Definir após linha de base', observacao: 'Suspensos ou cancelados no dia da cirurgia por causa evitável ÷ agendados.' },
    { numero: 7, nome: 'TCLE no prazo', numerador: tcleNoPrazo.length, denominador: doPeriodo.length, valor: fracao(tcleNoPrazo.length, doPeriodo.length), meta: '≥ 90%', observacao: 'TCLE assinados até D-2 ÷ agendados.' },
    { numero: 8, nome: 'Acurácia refrativa', numerador: null, denominador: null, valor: null, meta: 'Meta própria', observacao: 'Exige refração aos 30 dias (prontuário): dado externo ao painel.' },
    {
      numero: 9,
      nome: 'Complementar: aprovação no quiz na 1ª tentativa',
      numerador: aprovados1a.length,
      denominador: comQuiz.length,
      valor: fracao(aprovados1a.length, comQuiz.length),
      meta: 'Sem meta',
      observacao: maisErradas.length ? `Perguntas mais erradas: ${maisErradas.join(', ')}.` : 'Sem erros registrados.',
    },
  ]
}
