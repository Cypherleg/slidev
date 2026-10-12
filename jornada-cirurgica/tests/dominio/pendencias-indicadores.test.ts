import { describe, expect, it } from 'vitest'
import {
  calcularIndicadores,
  corrigirQuiz,
  D7,
  eventoMaterialAberto,
  eventoQuizRespondido,
  pendenciasDoEpisodio,
  questoesErradas,
  resumoDia,
  resumoVespera,
  visaoLeituraDia,
} from '../../supabase/functions/_shared/dominio/index.ts'
import {
  admitir,
  ateD2,
  concluirD7,
  D0_INSTANTE,
  D2_INSTANTE,
  fazerCp1,
  fazerCp2,
  fazerD7,
  jornadaCompleta,
  MEMBROS,
  PLANO,
  prepararContatos,
  Simulador,
} from './apoio.ts'

const codigos = (sim: Simulador) => pendenciasDoEpisodio(sim.estado(), sim.agora).map((p) => p.codigo)
const pend = (sim: Simulador, codigo: string) => pendenciasDoEpisodio(sim.estado(), sim.agora).find((p) => p.codigo === codigo)

const RESPOSTAS_CERTAS: Record<number, string> = { 1: 'OD', 2: 'F', 3: 'a', 4: 'b', 5: 'F', 6: 'F', 7: 'b', 8: 'd', 9: 'F', 10: 'b', 11: 'F' }

function registrarQuiz(sim: Simulador, respostas: Record<number, string>) {
  const tentativa = corrigirQuiz(respostas, sim.entrada.episodio.olho)
  const ev = eventoQuizRespondido({
    episodioId: sim.entrada.episodio.id,
    pacienteId: sim.entrada.paciente.id,
    autorId: '00000000-0000-4000-8000-000000000000',
    tentativa: { ...tentativa, em: sim.agora },
    erradas: questoesErradas(respostas, sim.entrada.episodio.olho),
  })
  sim.gravar({ eventos: [ev], lente: [], mensagens: [] })
}

describe('pendências (o que falta, de quem depende, desde quando)', () => {
  it('episódio recém-aberto: D-7 em branco por seção, lente, TCLE, contatos, teach-back, data', () => {
    const sim = new Simulador()
    const p = pendenciasDoEpisodio(sim.estado(), sim.agora)
    expect(p.map((x) => x.codigo)).toEqual(
      expect.arrayContaining([
        'd7.em_branco:A',
        'd7.em_branco:G',
        'lente.sem_plano',
        'tcle.nao_assinado',
        'orientacoes.teach_back',
        'contato.whatsapp_ausente',
        'd7.acompanhante_reserva',
        'episodio.sem_data',
      ]),
    )
    for (const x of p) {
      expect(x.responsavel.length).toBeGreaterThan(0)
      expect(x.desde).toBe(sim.entrada.episodio.abertoEm)
      expect(x.id).toBe(`${sim.entrada.episodio.id}:${x.codigo}`)
    }
    // Determinístico
    expect(pendenciasDoEpisodio(sim.estado(), sim.agora)).toEqual(p)
  })

  it('alerta não comunicado: prazo no mesmo dia; sem conduta: responsável cirurgião', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.olhoUnico]: 'sim' })
    const p = pend(sim, `alerta.nao_comunicado:d7:${D7.olhoUnico}`)!
    expect(p).toMatchObject({ severidade: 'alerta', responsavel: ['concierge'], prazo: '2026-10-14T02:59:59.999Z' })
    expect(pend(sim, `alerta.sem_conduta:d7:${D7.olhoUnico}`)?.responsavel).toEqual(['cirurgiao'])
  })

  it('TCLE: prazo-alvo até D-2; depois do prazo vira alerta; lembrete no D-3', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'tcle.status', status: 'enviado', link: 'https://assinatura-teste.invalid/x' })
    expect(pend(sim, 'tcle.nao_assinado')).toMatchObject({ severidade: 'pendencia', prazo: '2026-10-19T02:59:59.999Z' })
    sim.agora = '2026-10-17T12:00:00.000Z'
    expect(codigos(sim)).toContain('tcle.lembrete_d3')
    sim.agora = '2026-10-19T12:00:00.000Z'
    expect(pend(sim, 'tcle.nao_assinado')?.severidade).toBe('alerta')
    sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    expect(codigos(sim)).not.toContain('tcle.nao_assinado')
  })

  it('link não aberto até D-3 gera ligação ativa; abrir o link resolve', () => {
    const sim = new Simulador()
    prepararContatos(sim)
    sim.executar('concierge', {
      tipo: 'materiais.enviar',
      tokenLink: 'token-de-teste-1234567890',
      expiraEm: '2026-11-30T00:00:00.000Z',
      materiais: [{ id: 'm', codigo: 'video', versao: 1, titulo: 'Vídeo (exemplo)', tipo: 'video', url: 'https://exemplo.invalid', conteudo: null, momento: 'd7', publico: 'paciente', ativo: true }],
    })
    expect(codigos(sim)).not.toContain('materiais.link_nao_aberto_d3')
    sim.agora = '2026-10-17T12:00:00.000Z'
    expect(pend(sim, 'materiais.link_nao_aberto_d3')).toMatchObject({ severidade: 'alerta', responsavel: ['concierge'], desde: '2026-10-17T03:00:00.000Z' })
    expect(sim.visao('concierge').materiais.contatoHumano?.motivo).toBe('link_nao_aberto_d3')
    sim.gravar({ eventos: [eventoMaterialAberto({ episodioId: sim.entrada.episodio.id, pacienteId: sim.entrada.paciente.id, autorId: '00000000-0000-4000-8000-000000000000', materialId: 'm' })], lente: [], mensagens: [] })
    expect(codigos(sim)).not.toContain('materiais.link_nao_aberto_d3')
  })

  it('quiz: reprovação dupla → contato humano em até 1 dia útil (fim de semana e feriado não contam); teach-back resolve', () => {
    const sim = new Simulador({ config: { feriados: ['2026-10-19'] } })
    prepararContatos(sim)
    sim.agora = '2026-10-16T13:00:00.000Z' // sexta-feira
    const erradas = { ...RESPOSTAS_CERTAS, 2: 'V', 3: 'c', 4: 'a' }
    registrarQuiz(sim, erradas)
    expect(codigos(sim).some((c) => c.startsWith('quiz.'))).toBe(false)
    registrarQuiz(sim, erradas)
    // Próximo dia útil depois de sexta 16/10, com segunda 19/10 feriado: terça 20/10, fim do dia.
    expect(pend(sim, 'quiz.contato_humano:reprovacao_dupla')).toMatchObject({ severidade: 'alerta', prazo: '2026-10-21T02:59:59.999Z', responsavel: ['concierge', 'enfermagem'] })
    sim.agora = '2026-10-16T15:00:00.000Z'
    sim.executar('enfermagem', { tipo: 'orientacoes.teach_back', resultado: 'apos_reorientacao', observacao: 'Ligação feita; reorientado.' })
    expect(codigos(sim).some((c) => c.startsWith('quiz.'))).toBe(false)
  })

  it('quiz: erro na pergunta do olho → ALERTA e contato humano', () => {
    const sim = new Simulador()
    registrarQuiz(sim, { ...RESPOSTAS_CERTAS, 1: 'OE' })
    expect(codigos(sim)).toEqual(expect.arrayContaining(['quiz.contato_humano:erro_olho', 'alerta.nao_comunicado:sistema:quiz_olho']))
  })

  it('contato sem anuência ou não confirmado vira pendência', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'f1', tipo: 'familiar_avisos', nome: 'Familiar Teste', telefone: '(44) 98888-0000', anuenciaPaciente: true } })
    sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'f2', tipo: 'familiar_avisos', nome: 'Familiar Teste Dois', telefone: '(44) 98888-1111', anuenciaPaciente: false } })
    expect(codigos(sim)).toEqual(expect.arrayContaining(['contato.nao_confirmado:f1', 'contato.sem_anuencia:f2']))
  })

  it('D-2 não concluído: pendência no D-2 e alerta na véspera', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    sim.agora = D2_INSTANTE
    expect(pend(sim, 'd2.nao_concluido')).toMatchObject({ severidade: 'pendencia', responsavel: ['conferente', 'concierge'] })
    sim.agora = '2026-10-19T15:00:00.000Z'
    expect(pend(sim, 'd2.nao_concluido')).toMatchObject({ severidade: 'alerta', descricao: 'D-2 não concluído na véspera da cirurgia.' })
  })

  it('lente: sem chegada / checkpoint 2 pendente (prazo D-2), responsáveis certos', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    expect(pend(sim, 'lente.sem_chegada')?.responsavel).toEqual(['concierge'])
    const sim2 = new Simulador()
    fazerD7(sim2)
    fazerCp1(sim2)
    expect(pend(sim2, 'lente.cp2')).toMatchObject({ responsavel: ['conferente'], prazo: '2026-10-19T02:59:59.999Z' })
  })

  it('hard stops abertos vêm primeiro, com quem resolve', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    fazerCp2(sim, { ...PLANO, dioptria: 20 })
    const p = pendenciasDoEpisodio(sim.estado(), sim.agora)
    expect(p[0]).toMatchObject({ codigo: 'hardstop:HS1_DIVERGENCIA_LIO', severidade: 'hard_stop', responsavel: ['cirurgiao'] })
  })
})

describe('indicadores (POP §12) e resumos', () => {
  function cenario() {
    const a = new Simulador()
    jornadaCompleta(a)
    // Quiz em A: reprovado na 1ª, aprovado na 2ª.
    a.agora = '2026-10-14T12:00:00.000Z'
    registrarQuiz(a, { ...RESPOSTAS_CERTAS, 2: 'V', 5: 'V', 9: 'V' })
    registrarQuiz(a, RESPOSTAS_CERTAS)
    const b = new Simulador()
    ateD2(b)
    registrarQuiz(b, RESPOSTAS_CERTAS)
    b.agora = D0_INSTANTE
    b.executar('cirurgiao', { tipo: 'episodio.cancelar', motivo: 'Paciente chegou sem acompanhante e ninguém virá.', causa: 'sem_acompanhante', evitavel: null })
    const c = new Simulador()
    fazerD7(c)
    concluirD7(c)
    fazerCp1(c)
    c.agora = D2_INSTANTE
    fazerCp2(c, { ...PLANO, modelo: 'Lente Divergente Teste' })
    const e = new Simulador()
    ateD2(e)
    admitir(e)
    e.executar('cirurgiao', { tipo: 'intercorrencia.registrar', descricao: 'Registro fictício de never event para teste.', neverEvent: 'lio_errada' })
    return { a, b, c, e }
  }

  it('números batem com os episódios fictícios', () => {
    const { a, b, c, e } = cenario()
    const ind = calcularIndicadores([a, b, c, e].map((s) => s.estado()), '2026-10-01', '2026-10-31')
    const n = (k: number) => ind.find((i) => i.numero === k)!
    expect(n(1)).toMatchObject({ numerador: 1, denominador: 1, valor: 1 })
    expect(n(2)).toMatchObject({ numerador: null, valor: null })
    expect(n(2).observacao).toContain('observação direta')
    expect(n(3)).toMatchObject({ numerador: 1, denominador: 1, valor: 1 })
    expect(n(4)).toMatchObject({ numerador: 1, observacao: 'Chegada: 0 · D-2: 1 · D0: 0.' })
    expect(n(5)).toMatchObject({ numerador: 1 })
    expect(n(6)).toMatchObject({ numerador: 1, denominador: 4, valor: 0.25 })
    expect(n(7)).toMatchObject({ numerador: 3, denominador: 4, valor: 0.75 })
    expect(n(8)).toMatchObject({ numerador: null, valor: null })
    expect(n(9)).toMatchObject({ numerador: 1, denominador: 2, valor: 0.5 })
    expect(n(9).observacao).toContain('pergunta 2 (1)')
  })

  it('dupla conferência pela mesma pessoa não conta (papel duplo não supre a regra)', () => {
    const a = new Simulador()
    jornadaCompleta(a)
    const ind = calcularIndicadores([a.estado()], '2026-10-20', '2026-10-20')
    expect(ind.find((i) => i.numero === 3)?.valor).toBe(1)
  })

  it('resumo da véspera: episódios do dia, alertas sem conduta, lentes não conferidas, termos não assinados', () => {
    const { a, b, c, e } = cenario()
    const r = resumoVespera([a, b, c, e].map((s) => s.estado()), '2026-10-20', '2026-10-19T12:00:00.000Z')
    expect(r.episodios).toHaveLength(3) // cancelado fica de fora
    expect(r.lentesNaoConferidas.map((x) => x.etapa)).toEqual(['Quarentena'])
    expect(r.termosNaoAssinados).toEqual([{ episodioId: c.entrada.episodio.id, paciente: 'Paciente Teste Alfa da Silva', status: 'nao_enviado' }])
    expect(r.alertasSemConduta).toEqual([])
  })

  it('visão de leitura do dia: só cirurgião e gestora; traz a lente formatada', () => {
    const { a } = cenario()
    expect(() => visaoLeituraDia([a.estado()], a.ator('concierge'), '2026-10-20')).toThrowError(/cirurgião e gestora/)
    const v = visaoLeituraDia([a.estado()], a.ator('cirurgiao'), '2026-10-20')
    expect(v.episodios[0]).toMatchObject({ ordem: 1, horario: '07:30', olho: 'OLHO DIREITO', lente: { modelo: 'Lente Teste ZX-100', dioptria: '+21,50 D', cilindro: null, eixo: null } })
  })

  it('resumo do dia (lista e episodios.resumo) não traz valores de lente', () => {
    const { a } = cenario()
    const r = resumoDia(a.estado(), D0_INSTANTE)
    expect(r).toMatchObject({ olhoExtenso: 'OLHO DIREITO', estado: 'alta', etapaLente: 'time_out_confere', hardStopsAbertos: 0, cirurgiaoNome: 'Cirurgião Teste Um' })
    const json = JSON.stringify(r)
    for (const s of ['Lente Teste ZX-100', '21.5', 'dioptria', 'cilindro', 'eixo']) expect(json).not.toContain(s)
    expect(MEMBROS.cirurgiao.nome).toBe('Cirurgião Teste Um')
  })
})
