// Regra 4 (ordem) e regra 5 (hora real: item não conferido não é marcado depois; fora de hora fica sinalizado).
import { describe, expect, it } from 'vitest'
import { ADM, AN, D7, decidir, SI, TO } from '../../supabase/functions/_shared/dominio/index.ts'
import { admitir, ateD2, D0_INSTANTE, D2_INSTANTE, fazerD7, concluirD7, MEMBROS, PLANO, preencherBloco, signIn, Simulador, timeOut } from './apoio.ts'

const ultimo = (sim: Simulador) => sim.entrada.eventos[sim.entrada.eventos.length - 1]

describe('ordem do Sign In (regra 4)', () => {
  it('identificação ativa → consentimento → marcação do sítio (cirurgião) → midriático, em envios separados', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    // Marcação antes da identificação ativa: ordem.
    expect(sim.falha('cirurgiao', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.marcacao, valor: true }] }).codigo).toBe('ORDEM')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.identificacao, valor: 'sim' }, { itemId: SI.consentimento, valor: 'sim' }] })
    // Midriático no mesmo envio que a marcação não vale: o pré-requisito precisa estar registrado antes.
    const e = sim.falha('cirurgiao', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.marcacao, valor: true }, { itemId: SI.midriatico, valor: true }] })
    expect(['HARD_STOP', 'SEM_PERMISSAO']).toContain(e.codigo)
    sim.executar('cirurgiao', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.marcacao, valor: true }] })
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.midriatico, valor: true }] })
    const v = sim.visao('enfermagem')
    expect(v.respostas.sign_in?.[SI.midriatico]).toMatchObject({ valor: true, autorNome: 'Enfermeira Teste Um', foraDeHora: false })
  })

  it('Sign In não começa antes da admissão concluída; Time Out não começa antes do Sign In', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.identificacao, valor: 'sim' }] }).codigo).toBe('ORDEM')
    admitir(sim)
    expect(sim.falha('circulante', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.procedimento, valor: true }] }).codigo).toBe('ORDEM')
    expect(sim.falha('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null, eixo: null } }).codigo).toBe('ORDEM')
  })

  it('read-back só depois da leitura da caixa conferida; liberação da recuperação só depois do Sign Out', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    expect(sim.falha('cirurgiao', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.readBack, valor: true }] }).codigo).toBe('ORDEM')
    expect(sim.falha('anestesista', { tipo: 'checklist.responder', modelo: 'anestesia', respostas: [{ itemId: AN.liberacao, valor: true }] }).codigo).toBe('ORDEM')
  })

  it('item de conferência só aceita "conferido": item não conferido não é marcado', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    expect(sim.falha('circulante', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.facoMicroscopio, valor: false as unknown as true }] }).codigo).toBe('VALIDACAO')
  })
})

describe('hora real (regra 5)', () => {
  it('resposta a item de bloco já concluído fica fora de hora, com motivo, e conta como correção', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.cidadeTransporte, valor: 'Cidade Teste, carro da família' }] })
    const ev = ultimo(sim)
    expect(ev.foraDeHora).toBe(true)
    expect(ev.motivoForaDeHora).toContain('depois da conclusão do bloco D-7')
    const r = sim.visao('concierge').respostas.d7?.[D7.cidadeTransporte]
    expect(r).toMatchObject({ valor: 'Cidade Teste, carro da família', foraDeHora: true, correcoes: 1 })
  })

  it('item do D0 registrado em data diferente da data da cirurgia fica fora de hora', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D2_INSTANTE
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.pa, valor: '12x8' }] })
    expect(ultimo(sim)).toMatchObject({ foraDeHora: true, motivoForaDeHora: 'Registrado em 18/10/2026; cirurgia em 20/10/2026.' })
    sim.agora = D0_INSTANTE
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.pa, valor: '13x8' }] })
    expect(ultimo(sim).foraDeHora).toBe(false)
  })

  it('item do D0 respondido depois de um bloco posterior concluído fica fora de hora', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    timeOut(sim)
    sim.executar('circulante', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.dots, valor: true }] })
    expect(ultimo(sim).motivoForaDeHora).toContain('bloco posterior Time Out')
    sim.executar('anestesista', { tipo: 'checklist.responder', modelo: 'anestesia', respostas: [{ itemId: AN.jejum, valor: true }] })
    expect(ultimo(sim).motivoForaDeHora).toContain('depois da conclusão do bloco Time Out')
  })

  it('conclusão de bloco do D0 em outra data fica fora de hora; o domínio não aceita hora do cliente', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = '2026-10-19T23:30:00.000Z' // 20:30 do dia 19 em São Paulo (véspera)
    preencherBloco(sim, 'admissao')
    const r = sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(r.eventos[0]).toMatchObject({ tipo: 'bloco.concluido', foraDeHora: true })
    expect(Object.keys(r.eventos[0])).not.toContain('registradoEm')
    // 02:30 UTC do dia 20 = 23:30 do dia 19 em São Paulo: ainda é a véspera.
    sim.agora = '2026-10-20T02:30:00.000Z'
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.pa, valor: '12x8' }] })
    expect(ultimo(sim).motivoForaDeHora).toContain('Registrado em 19/10/2026')
  })

  it('o ator registrado é quem executa (via PIN), não quem fez o login no aparelho', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    const ctx = sim.ctx('enfermagem')
    ctx.ator.sessaoUsuarioId = MEMBROS.circulante.id
    const r = decidir(sim.estado(), { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.pa, valor: '12x8' }] }, ctx)
    expect(r.eventos[0]).toMatchObject({ autorId: MEMBROS.enfermagem.id, autorPapel: 'enfermagem', sessaoUsuarioId: MEMBROS.circulante.id })
  })
})
