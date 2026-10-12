import { describe, expect, it } from 'vitest'
import { alertasDoEpisodio, D7, prazoGlp1Cabe } from '../../supabase/functions/_shared/dominio/index.ts'
import type { ValorResposta } from '../../supabase/functions/_shared/dominio/index.ts'
import { concluirD7, fazerD7, MEMBROS, Simulador } from './apoio.ts'

function comD7(valores: Record<string, ValorResposta>, op: ConstructorParameters<typeof Simulador>[0] = {}) {
  const sim = new Simulador(op)
  fazerD7(sim, valores)
  return sim
}
const ids = (sim: Simulador) => alertasDoEpisodio(sim.estado()).map((a) => a.id)
const nivel = (sim: Simulador, id: string) => alertasDoEpisodio(sim.estado()).find((a) => a.id === id)?.nivel

describe('alertas do D-7 (POP §1)', () => {
  it('paciente sem achados: nenhum alerta', () => {
    expect(ids(comD7({}))).toEqual([])
  })

  it('olho dito pelo paciente: diferente do pedido ou "não sabe" → ALERTA (derivado, não perguntado)', () => {
    expect(ids(comD7({ [D7.olhoPaciente]: 'OE' }))).toEqual([`d7:${D7.olhoPaciente}`])
    const sim = comD7({ [D7.olhoPaciente]: 'nao_sabe' })
    expect(alertasDoEpisodio(sim.estado())[0].titulo).toContain('não sabe')
  })

  it('α1-bloqueador (uso atual ou passado), anticoagulante, antiagregante → ALERTA', () => {
    const sim = comD7({
      [D7.alfaBloqueador]: { uso: 'ja_usou', nomes: 'Remédio Teste A' },
      [D7.anticoagulante]: { uso: 'usa', nomes: 'Remédio Teste B' },
      [D7.antiagregante]: { uso: 'usa', nomes: 'Remédio Teste C' },
    })
    expect(ids(sim)).toEqual(expect.arrayContaining([`d7:${D7.alfaBloqueador}`, `d7:${D7.anticoagulante}`, `d7:${D7.antiagregante}`]))
    expect(nivel(sim, `d7:${D7.alfaBloqueador}`)).toBe('alerta')
  })

  it('medicamento em uso exige o nome comercial; insulina exige tipo, dose, horário e marcação de dot D', () => {
    const sim = new Simulador()
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.anticoagulante, valor: { uso: 'usa' } }] }).codigo).toBe('VALIDACAO')
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.insulina, valor: { uso: 'usa', nomes: 'Insulina Teste' } }] }).codigo).toBe('VALIDACAO')
  })

  it('antipsicóticos: "registrar e sinalizar" (nível sinalizado, sem exigir conduta)', () => {
    const sim = comD7({ [D7.antipsicoticos]: { uso: 'usa', nomes: 'Remédio Teste D' } })
    expect(nivel(sim, `d7:${D7.antipsicoticos}`)).toBe('sinalizado')
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] })
    sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'd7' })
    expect(sim.visao('cirurgiao').pendencias.some((p) => p.codigo.includes(D7.antipsicoticos))).toBe(false)
  })

  it('GLP-1: sempre ALERTA; registra dose, última aplicação, início/aumento e náusea', () => {
    const sim = new Simulador()
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.glp1, valor: { uso: 'usa', nomes: 'Caneta Teste', detalhes: '1 mg' } }] }).codigo).toBe('VALIDACAO')
    const ok = comD7({ [D7.glp1]: { uso: 'usa', nomes: 'Caneta Teste', detalhes: '1 mg', aplicacao: 'semanal', ultimaAplicacao: '2026-10-10', inicioOuAumentoUltimos3Meses: false, nauseaOuVomito: false } })
    // 10/10 → 20/10: 10 dias; prazo de 7 dias cabe.
    expect(ids(ok)).toEqual([`d7:${D7.glp1}`])
  })

  it('GLP-1: se o prazo de suspensão não couber até a cirurgia, ALERTA específico "avisar o cirurgião no mesmo dia"', () => {
    const semanal = comD7({ [D7.glp1]: { uso: 'usa', nomes: 'Caneta Teste', detalhes: '1 mg', aplicacao: 'semanal', ultimaAplicacao: '2026-10-12', inicioOuAumentoUltimos3Meses: true, nauseaOuVomito: false } })
    // 12/10 → 20/10: cabe. Antecipada para 16/10, não cabe.
    expect(alertasDoEpisodio(semanal.estado()).map((x) => x.id)).not.toContain(`d7:${D7.glp1}.prazo`)
    semanal.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-16' })
    const a = alertasDoEpisodio(semanal.estado()).find((x) => x.id === `d7:${D7.glp1}.prazo`)
    expect(a?.titulo).toContain('avisar o cirurgião no mesmo dia')
    expect(a?.descricao).toContain('12/10/2026')
    // Reagendar para depois do prazo desativa o alerta específico.
    semanal.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-27' })
    const lista = alertasDoEpisodio(semanal.estado()).map((x) => x.id)
    expect(lista).not.toContain(`d7:${D7.glp1}.prazo`)
    expect(semanal.visao('concierge').alertas.find((x) => x.id === `d7:${D7.glp1}.prazo`)?.inativo).toBe(true)
  })

  it('prazoGlp1Cabe: semanal 7 dias; diário sem uso na véspera nem no dia', () => {
    const base = { uso: 'usa' as const, nomes: 'x' }
    expect(prazoGlp1Cabe({ ...base, aplicacao: 'semanal', ultimaAplicacao: '2026-10-13' }, '2026-10-20')).toBe(true)
    expect(prazoGlp1Cabe({ ...base, aplicacao: 'semanal', ultimaAplicacao: '2026-10-14' }, '2026-10-20')).toBe(false)
    expect(prazoGlp1Cabe({ ...base, aplicacao: 'diaria', ultimaAplicacao: '2026-10-18' }, '2026-10-20')).toBe(true)
    expect(prazoGlp1Cabe({ ...base, aplicacao: 'diaria', ultimaAplicacao: '2026-10-19' }, '2026-10-20')).toBe(false)
    expect(prazoGlp1Cabe({ ...base, aplicacao: 'diaria', ultimaAplicacao: '2026-10-19' }, null)).toBeNull()
  })

  it('patologias e capacidade: refrativa, olho único, olho vermelho, demência, deitar, compreender, ninguém para instilar', () => {
    const sim = comD7({
      [D7.refrativa]: 'sim',
      [D7.olhoUnico]: 'sim',
      [D7.olhoVermelho]: 'sim',
      [D7.demencia]: 'sim',
      [D7.representante]: { nome: 'Representante Teste Épsilon', parentesco: 'filho' },
      [D7.deitar]: 'nao',
      [D7.compreende]: 'nao',
      [D7.quemInstila]: 'ninguem',
    })
    expect(ids(sim).sort()).toEqual(
      [D7.refrativa, D7.olhoUnico, D7.olhoVermelho, D7.demencia, D7.deitar, D7.compreende, D7.quemInstila].map((i) => `d7:${i}`).sort(),
    )
    const ident = sim.visao('concierge').identificacao
    expect(ident.alertasExtenso).toEqual(['OLHO ÚNICO', 'DÉFICIT COGNITIVO — REPRESENTANTE: Representante Teste Épsilon'])
  })

  it('expectativa sem óculos com LIO monofocal → ALERTA; com outra LIO, não', () => {
    expect(ids(comD7({ [D7.semOculos]: 'sim' }))).toEqual([`d7:${D7.semOculos}`])
    expect(ids(comD7({ [D7.semOculos]: 'sim' }, { tipoLente: 'multifocal' }))).toEqual([])
  })

  it('teach-back inadequado → ALERTA ao cirurgião', () => {
    const sim = comD7({})
    sim.executar('concierge', { tipo: 'orientacoes.teach_back', resultado: 'inadequado', observacao: 'Não soube dizer o olho.' })
    expect(ids(sim)).toEqual(['sistema:teach_back_inadequado'])
    expect(sim.visao('concierge').materiais.contatoHumano?.motivo).toBe('teach_back_inadequado')
  })

  it('correção da resposta desativa o alerta (fica inativo na visão)', () => {
    const sim = comD7({ [D7.refrativa]: 'sim' })
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.refrativa, valor: 'nao' }] })
    expect(ids(sim)).toEqual([])
    expect(sim.visao('concierge').alertas.find((a) => a.id === `d7:${D7.refrativa}`)?.inativo).toBe(true)
  })

  it('comunicar exige cirurgião válido; conduta só pelo cirurgião', () => {
    const sim = comD7({ [D7.refrativa]: 'sim' })
    expect(sim.falha('concierge', { tipo: 'alerta.comunicar', alertaId: `d7:${D7.refrativa}`, via: 'telefone', cirurgiaoId: MEMBROS.enfermagem.id }).codigo).toBe('VALIDACAO')
    expect(sim.falha('concierge', { tipo: 'alerta.comunicar', alertaId: 'd7:inexistente', via: 'telefone', cirurgiaoId: MEMBROS.cirurgiao.id }).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { tipo: 'alerta.comunicar', alertaId: `d7:${D7.refrativa}`, via: 'telefone', cirurgiaoId: MEMBROS.cirurgiao.id })
    concluirD7(sim)
    sim.executar('cirurgiao', { tipo: 'alerta.conduta', alertaId: `d7:${D7.refrativa}`, conduta: 'Usar fórmula para olho pós-refrativo.' })
    const a = sim.visao('concierge').alertas[0]
    expect(a.conduta).toMatchObject({ cirurgiaoNome: 'Cirurgião Teste Um', texto: 'Usar fórmula para olho pós-refrativo.' })
  })
})

describe('alergias (POP §1.D)', () => {
  it('alergia exige descrever a reação; "nenhuma alergia conhecida" coerente com os itens', () => {
    const sim = new Simulador()
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alergiaLatex, valor: { tem: true } }] }).codigo).toBe('VALIDACAO')
    expect(
      sim.falha('concierge', {
        tipo: 'checklist.responder',
        modelo: 'd7',
        respostas: [
          { itemId: D7.alergiaLatex, valor: { tem: true, reacao: 'Urticária' } },
          { itemId: D7.nenhumaAlergia, valor: 'sim' },
        ],
      }).codigo,
    ).toBe('VALIDACAO')
    const sim2 = comD7({ [D7.nenhumaAlergia]: 'nao' })
    sim2.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] })
    const e = sim2.falha('concierge', { tipo: 'bloco.concluir', modelo: 'd7' })
    expect(e.detalhes?.impedimentos).toEqual(expect.arrayContaining([expect.stringContaining('nenhuma alergia foi registrada')]))
  })
})

describe('dots (POP §2)', () => {
  it('sem registros de risco: nenhum dot', () => {
    expect(comD7({}).visao('enfermagem').dots).toEqual([])
  })

  it('A, Q, M, I, S, D com letra, cor e motivo; teto de 6', () => {
    const sim = comD7({
      [D7.alergiaLatex]: { tem: true, reacao: 'Urticária' },
      [D7.nenhumaAlergia]: 'nao',
      [D7.mobilidade]: ['cadeira_rodas'],
      [D7.renal]: 'sim',
      [D7.fistulaBraco]: 'esquerdo',
      [D7.alfaBloqueador]: { uso: 'usa', nomes: 'Remédio Teste A' },
      [D7.antiagregante]: { uso: 'usa', nomes: 'Remédio Teste C' },
      [D7.insulina]: { uso: 'usa', nomes: 'Insulina Teste', detalhes: 'NPH 10 UI às 7h', insulinaOuSulfonilureia: true },
    })
    const dots = sim.visao('enfermagem').dots
    expect(dots.map((d) => `${d.letra}:${d.cor}`)).toEqual(['A:vermelho', 'Q:amarelo', 'M:rosa', 'I:azul', 'S:laranja', 'D:verde'])
    expect(dots.length).toBeLessThanOrEqual(6)
    for (const d of dots) expect(d.motivo.length).toBeGreaterThan(5)
    expect(dots.find((d) => d.letra === 'A')?.motivo).toBe('Alergia registrada: látex.')
    expect(dots.find((d) => d.letra === 'M')?.motivo).toContain('esquerdo')
  })

  it('Q por olho único (baixa visão contralateral); D só com insulina ou sulfonilureia', () => {
    const sim = comD7({ [D7.olhoUnico]: 'sim', [D7.insulina]: { uso: 'usa', nomes: 'Comprimido Teste', detalhes: '1 cp manhã', insulinaOuSulfonilureia: false } })
    expect(sim.visao('enfermagem').dots.map((d) => d.letra)).toEqual(['Q'])
  })

  it('fístula exige "qual braço" quando há doença renal', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.renal, valor: 'sim' }] })
    expect(sim.visao('concierge').blocos.d7.faltam).toContain(D7.fistulaBraco)
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.renal, valor: 'nao' }] })
    expect(sim.visao('concierge').blocos.d7.faltam).not.toContain(D7.fistulaBraco)
  })
})

describe('identificação', () => {
  it('nome parecido no mesmo dia: alerta por extenso e nome da mãe exigido', () => {
    const sim = new Simulador({ mesmoDia: [{ episodioId: 'e2', pacienteId: 'p2', nomeCompleto: 'Paciente Teste Alfa da Silveira', dataNascimento: '1949-01-01' }] })
    sim.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-20' })
    const i = sim.visao('concierge').identificacao
    expect(i.homonimoNoDia).toBe(false)
    expect(i.nomesParecidos).toEqual([{ episodioId: 'e2', nomeCompleto: 'Paciente Teste Alfa da Silveira' }])
    expect(i.exigeNomeMae).toBe(true)
    expect(i.alertasExtenso).toEqual(['NOME PARECIDO NO DIA'])
  })

  it('nomes diferentes: sem alerta; o mesmo paciente (outro olho no dia) não conta', () => {
    const sim = new Simulador({
      mesmoDia: [
        { episodioId: 'e2', pacienteId: 'p2', nomeCompleto: 'Outra Pessoa Teste Zeta', dataNascimento: '1949-01-01' },
        { episodioId: 'e3', pacienteId: '11111111-0000-4000-8000-000000000001', nomeCompleto: 'Paciente Teste Alfa da Silva', dataNascimento: '1950-03-04' },
      ],
    })
    sim.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-20' })
    expect(sim.visao('concierge').identificacao).toMatchObject({ homonimoNoDia: false, nomesParecidos: [], exigeNomeMae: false })
  })

  it('2º olho: alerta "2º OLHO — 1º operado em dd/mm/aaaa"; nada da lente do 1º é copiado', () => {
    const sim = new Simulador({ olho: 'OE', anteriores: [{ episodioId: 'e-od', olho: 'OD', dataCirurgia: '2026-09-15', estado: 'alta' }] })
    const v = sim.visao('concierge')
    expect(v.identificacao.segundoOlho).toEqual({ primeiroEpisodioId: 'e-od', dataPrimeiro: '2026-09-15' })
    expect(v.identificacao.alertasExtenso).toEqual(['2º OLHO — 1º operado em 15/09/2026'])
    expect(v.lente.etapa).toBe('sem_plano')
    expect(sim.entrada.eventos[0].dados).toMatchObject({ segundoOlho: { primeiroEpisodioId: 'e-od' } })
  })
})
