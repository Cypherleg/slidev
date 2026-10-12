// Correções da revisão independente de fidelidade ao POP (um bloco por achado).
import { describe, expect, it } from 'vitest'
import {
  ADM,
  calcularIndicadores,
  corrigirQuiz,
  CP2,
  D2,
  D7,
  DEFINICOES_HARD_STOP,
  eventoQuizRespondido,
  gerarEtiquetas,
  medicamentoAdmissao,
  medicamentoD2,
  modelosPadrao,
  pendenciasDoEpisodio,
  previaMateriais,
  questoesErradas,
  SI,
  situacaoPaginaPaciente,
  textoTcleEnvio,
  TO,
} from '../../supabase/functions/_shared/dominio/index.ts'
import type { ValorResposta } from '../../supabase/functions/_shared/dominio/index.ts'
import {
  admitir,
  ateD2,
  concluirD7,
  D0_INSTANTE,
  D2_INSTANTE,
  fazerCp1,
  fazerCp2,
  fazerD7,
  MEMBROS,
  PLANO,
  preencherBloco,
  prepararContatos,
  signIn,
  Simulador,
} from './apoio.ts'
import type { ChaveMembro } from './apoio.ts'

const MATERIAIS = [
  { id: 'mat-video', codigo: 'video_preparo', versao: 1, titulo: 'Vídeo de preparo (exemplo)', tipo: 'video' as const, url: 'https://exemplo.invalid/v', conteudo: null, momento: 'd7' as const, publico: 'paciente' as const, ativo: true },
  { id: 'mat-tcle', codigo: 'link_tcle', versao: 1, titulo: 'Termo de consentimento', tipo: 'link_tcle' as const, url: null, conteudo: null, momento: 'd7' as const, publico: 'paciente' as const, ativo: true },
]
const CERTAS: Record<number, string> = { 1: 'OD', 2: 'F', 3: 'a', 4: 'b', 5: 'F', 6: 'F', 7: 'b', 8: 'd', 9: 'F', 10: 'b', 11: 'F' }

const alerta = (sim: Simulador, id: string) => sim.visao('gestora', true).alertas.find((a) => a.id === id)
const abertos = (sim: Simulador) => sim.visao('gestora', true).hardStops.map((h) => h.codigo)
const codigos = (sim: Simulador) => pendenciasDoEpisodio(sim.estado(), sim.agora).map((p) => p.codigo)

/** Comunica ao cirurgião todo alerta pendente (como a concierge faria). */
function comunicarPendentes(sim: Simulador, chave: ChaveMembro = 'concierge', observacao?: string) {
  for (const a of sim.visao('gestora', true).alertas.filter((x) => x.comunicacaoPendente)) {
    sim.executar(chave, { tipo: 'alerta.comunicar', alertaId: a.id, via: 'telefone', cirurgiaoId: MEMBROS.cirurgiao.id, ...(observacao ? { observacao } : {}) })
  }
}

/** Do D-7 (com respostas próprias) ao D-2 concluído, comunicando os alertas. */
function ateD2Com(sim: Simulador, valoresD7: Record<string, ValorResposta>, valoresD2: Record<string, ValorResposta> = {}) {
  fazerD7(sim, valoresD7)
  comunicarPendentes(sim)
  concluirD7(sim)
  fazerCp1(sim)
  sim.agora = D2_INSTANTE
  fazerCp2(sim)
  sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
  sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado', link: 'https://assinatura-teste.invalid/t' })
  preencherBloco(sim, 'd2', { preferida: 'conferente', valores: valoresD2 })
  comunicarPendentes(sim, 'conferente')
  sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
}

const GLP1_SEMANAL: ValorResposta = { uso: 'usa', nomes: 'Caneta Teste', detalhes: '1 mg', aplicacao: 'semanal', ultimaAplicacao: '2026-10-10', inicioOuAumentoUltimos3Meses: false, nauseaOuVomito: false }

describe('1. remédio que muda depois do D-7', () => {
  it('D-2: "mudou" exige as classes; a classe crítica entra nas regras do D-7 (alerta, dot S) e precisa ser comunicada antes de concluir', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    sim.agora = D2_INSTANTE
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    preencherBloco(sim, 'd2', { preferida: 'conferente', valores: { [D2.mudancaMedicacao]: 'sim' }, pular: [D2.mudancaClasses] })
    expect(sim.visao('conferente').blocos.d2.faltam).toEqual([D2.mudancaClasses])
    sim.executar('conferente', { tipo: 'checklist.responder', modelo: 'd2', respostas: [{ itemId: D2.mudancaClasses, valor: ['anticoagulante'] }] })
    expect(sim.visao('conferente').blocos.d2.faltam).toEqual([medicamentoD2('anticoagulante')])
    sim.executar('conferente', { tipo: 'checklist.responder', modelo: 'd2', respostas: [{ itemId: medicamentoD2('anticoagulante'), valor: { uso: 'usa', nomes: 'Anticoagulante Teste' } }] })
    const a = alerta(sim, `d7:${D7.anticoagulante}`)!
    expect(a).toMatchObject({ origem: { modelo: 'd2', itemId: medicamentoD2('anticoagulante') }, comunicacaoPendente: true })
    expect(a.descricao).toContain('Registro atualizado no D-2.')
    expect(sim.visao('enfermagem').dots.map((d) => d.letra)).toEqual(['S'])
    const e = sim.falha('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    expect(e.detalhes?.impedimentos).toEqual(expect.arrayContaining([expect.stringContaining('Mudança de medicação'), expect.stringContaining('Anticoagulante')]))
    comunicarPendentes(sim, 'conferente')
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    // No D0 a classe nova sem conduta vira HS6.
    expect(abertos(sim)).toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
  })

  it('"outro remédio" ou "estado de saúde" exigem descrição', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.mudouRemedio, valor: 'sim' }] })
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.mudouClasses, valor: ['estado_saude'] }] }).codigo).toBe('VALIDACAO')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.mudouClasses, valor: ['estado_saude'], observacao: 'Gripe na semana (fictício).' }] })
    expect(alerta(sim, `admissao:${ADM.mudouRemedio}`)?.descricao).toContain('estado de saúde')
  })

  it('admissão: α-bloqueador novo → dot I, alerta comunicado antes de concluir e HS6 no Sign In', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', {
      valores: { [ADM.mudouRemedio]: 'sim', [ADM.mudouClasses]: ['alfa_bloqueador'], [medicamentoAdmissao('alfa_bloqueador')]: { uso: 'usa', nomes: 'Remédio Teste de Próstata' } },
    })
    expect(sim.visao('enfermagem').dots.map((d) => d.letra)).toEqual(['I'])
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' }).codigo).toBe('VALIDACAO')
    comunicarPendentes(sim, 'enfermagem')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(abertos(sim)).toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
  })

  it('D0: a data da última dose de GLP-1 recalcula a janela; dentro do prazo → ALERTA que precisa ser comunicado', () => {
    const sim = new Simulador()
    ateD2Com(sim, { [D7.glp1]: GLP1_SEMANAL })
    expect(alerta(sim, `d7:${D7.glp1}.prazo`)).toBeUndefined() // 10/10 → 20/10 cabe
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.usaGlp1]: 'sim', [ADM.glp1UltimaDose]: '2026-10-17' } })
    const a = alerta(sim, `d7:${D7.glp1}.prazo`)!
    expect(a).toMatchObject({ origem: { modelo: 'admissao' }, comunicacaoPendente: true })
    expect(a.descricao).toContain('17/10/2026')
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' }).codigo).toBe('VALIDACAO')
    comunicarPendentes(sim, 'enfermagem')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(sim.estadoEpisodio).toBe('admitido')
  })

  it('D0: "não usa GLP-1" contra registro "usa" exige registrar a mudança', () => {
    const sim = new Simulador()
    ateD2Com(sim, { [D7.glp1]: GLP1_SEMANAL })
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao')
    const e = sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(e.detalhes?.impedimentos).toEqual(expect.arrayContaining([expect.stringContaining('GLP-1 registrado em uso')]))
    sim.executar('enfermagem', {
      tipo: 'checklist.responder',
      modelo: 'admissao',
      respostas: [
        { itemId: ADM.mudouRemedio, valor: 'sim' },
        { itemId: ADM.mudouClasses, valor: ['glp1'] },
        { itemId: medicamentoAdmissao('glp1'), valor: { uso: 'ja_usou', nomes: 'Caneta Teste' } },
      ],
    })
    comunicarPendentes(sim, 'enfermagem')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
  })

  it('conduta escrita antes da mudança do registro não vale mais (HS6 reabre)', () => {
    const sim = new Simulador()
    ateD2Com(sim, { [D7.anticoagulante]: { uso: 'usa', nomes: 'Anticoagulante A' } })
    sim.executar('cirurgiao', { tipo: 'alerta.conduta', alertaId: `d7:${D7.anticoagulante}`, conduta: 'Manter; sem bloqueio.' })
    expect(abertos(sim)).not.toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
    sim.agora = D0_INSTANTE
    sim.executar('enfermagem', {
      tipo: 'checklist.responder',
      modelo: 'admissao',
      respostas: [
        { itemId: ADM.mudouRemedio, valor: 'sim' },
        { itemId: ADM.mudouClasses, valor: ['anticoagulante'] },
        { itemId: medicamentoAdmissao('anticoagulante'), valor: { uso: 'usa', nomes: 'Anticoagulante B' } },
      ],
    })
    expect(alerta(sim, `d7:${D7.anticoagulante}`)).toMatchObject({ condutaDesatualizada: true, comunicacaoPendente: true })
    expect(abertos(sim)).toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
  })
})

describe('1b. registro por classe do D-2 e da admissão guarda os campos do GLP-1', () => {
  it('GLP-1 iniciado depois do D-7 e informado no D-2: dados guardados e janela recalculada', () => {
    const sim = new Simulador()
    const novo: ValorResposta = { uso: 'usa', nomes: 'Caneta Teste', detalhes: '0,5 mg', aplicacao: 'semanal', ultimaAplicacao: '2026-10-16', inicioOuAumentoUltimos3Meses: true, nauseaOuVomito: false }
    ateD2Com(sim, {}, { [D2.mudancaMedicacao]: 'sim', [D2.mudancaClasses]: ['glp1'], [medicamentoD2('glp1')]: novo })
    const r = sim.visao('gestora', true).respostas.d2?.[medicamentoD2('glp1')]?.valor as unknown as Record<string, unknown>
    expect(r).toMatchObject({ aplicacao: 'semanal', ultimaAplicacao: '2026-10-16', inicioOuAumentoUltimos3Meses: true })
    // 16/10 → 20/10: menos de 7 dias; o prazo de suspensão não cabe (POP §1.B).
    expect(alerta(sim, `d7:${D7.glp1}.prazo`)).toBeDefined()
  })

  it('registro de GLP-1 em uso no D-2 exige os mesmos campos do D-7', () => {
    const sim = new Simulador()
    ateD2Com(sim, {})
    expect(() =>
      sim.executar('conferente', {
        tipo: 'checklist.responder',
        modelo: 'd2',
        respostas: [{ itemId: medicamentoD2('glp1'), valor: { uso: 'usa', nomes: 'Caneta Teste' } }],
      }),
    ).toThrow(/dose|aplica/i)
  })
})

describe('2. corrigir resposta não apaga alerta em silêncio', () => {
  it('alerta gerado e corrigido antes de comunicar continua exigindo comunicação ("resposta corrigida")', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.refrativa]: 'sim' })
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.refrativa, valor: 'nao' }] })
    expect(alerta(sim, `d7:${D7.refrativa}`)).toMatchObject({ inativo: true, comunicacaoPendente: true, titulo: 'Cirurgia refrativa prévia' })
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] }).codigo).toBe('ORDEM')
    expect(codigos(sim)).toContain(`alerta.nao_comunicado:d7:${D7.refrativa}`)
    sim.executar('concierge', { tipo: 'alerta.comunicar', alertaId: `d7:${D7.refrativa}`, via: 'whatsapp', cirurgiaoId: MEMBROS.cirurgiao.id, observacao: 'Resposta corrigida: não fez cirurgia refrativa.' })
    concluirD7(sim)
    expect(sim.estadoEpisodio).toBe('d7_concluido')
  })

  it('comunicado e depois corrigido: nova comunicação obrigatória', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.alfaBloqueador]: { uso: 'usa', nomes: 'Remédio A' } })
    comunicarPendentes(sim)
    expect(alerta(sim, `d7:${D7.alfaBloqueador}`)?.comunicacaoPendente).toBe(false)
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alfaBloqueador, valor: { uso: 'ja_usou', nomes: 'Remédio A' } }] })
    expect(alerta(sim, `d7:${D7.alfaBloqueador}`)?.comunicacaoPendente).toBe(true)
  })

  it('item crítico corrigido depois do D-7 concluído exige motivo e nova comunicação', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    const r = { tipo: 'checklist.responder' as const, modelo: 'd7' as const, respostas: [{ itemId: D7.anticoagulante, valor: { uso: 'usa', nomes: 'Anticoagulante Teste' } as ValorResposta }] }
    expect(sim.falha('concierge', r).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { ...r, respostas: [{ ...r.respostas[0], observacao: 'Paciente lembrou do remédio na ligação.' }] })
    expect(sim.entrada.eventos[sim.entrada.eventos.length - 1]).toMatchObject({ foraDeHora: true })
    expect(codigos(sim)).toContain(`alerta.nao_comunicado:d7:${D7.anticoagulante}`)
  })

  it('"não se aplica" na conduta do Sign In não passa com alerta desativado por correção e não comunicado', () => {
    const sim = new Simulador()
    ateD2Com(sim, { [D7.alfaBloqueador]: { uso: 'usa', nomes: 'Remédio A' } })
    sim.executar('cirurgiao', { tipo: 'alerta.conduta', alertaId: `d7:${D7.alfaBloqueador}`, conduta: 'Manter o remédio.' })
    admitir(sim)
    // Correção feita no D0, depois da admissão.
    sim.executar('concierge', {
      tipo: 'checklist.responder',
      modelo: 'd7',
      respostas: [{ itemId: D7.alfaBloqueador, valor: { uso: 'nao' }, observacao: 'Registro errado: o remédio era de outro paciente da família.' }],
    })
    const e = sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.condutaAlertas, valor: 'nao_se_aplica' }] })
    expect(e.message).toContain('desativado por correção')
    comunicarPendentes(sim, 'enfermagem', 'Resposta corrigida.')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.condutaAlertas, valor: 'nao_se_aplica' }] })
  })
})

describe('3. admissão: TCLE assinado e olho do TCLE separados', () => {
  it('"olho do TCLE = olho da agenda" = não → HS3 com resolução escrita do cirurgião', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.tcleOlho]: 'nao' } })
    expect(abertos(sim)).toContain('HS3_DIVERGENCIA_IDENTIDADE_OLHO')
    expect(abertos(sim)).not.toContain('HS5_TCLE')
    expect(sim.entrada.eventos.find((e) => e.tipo === 'quase_evento.registrado')?.dados).toMatchObject({ codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO', categoria: 'olho' })
  })
})

describe('4. segundo olho', () => {
  it('"segundo" exige a data do 1º olho e gera o alerta por extenso; sem registro no painel → ALERTA', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.primeiroSegundo, valor: 'segundo' }] })
    expect(sim.visao('concierge').blocos.d7.faltam).toContain(D7.dataPrimeiroOlho)
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.dataPrimeiroOlho, valor: '2026-08-03' }] })
    const v = sim.visao('concierge')
    expect(v.identificacao.alertasExtenso).toContain('2º OLHO — 1º operado em 03/08/2026')
    expect(alerta(sim, `d7:${D7.primeiroSegundo}`)?.descricao).toContain('não há episódio do outro olho')
  })
  it('"primeiro" com episódio do outro olho no painel, ou data diferente → ALERTA', () => {
    const anteriores = [{ episodioId: 'e-od', olho: 'OD' as const, dataCirurgia: '2026-09-15', estado: 'alta' as const }]
    const a = new Simulador({ olho: 'OE', anteriores })
    a.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.primeiroSegundo, valor: 'primeiro' }] })
    expect(alerta(a, `d7:${D7.primeiroSegundo}`)?.descricao).toContain('há episódio do outro olho')
    const b = new Simulador({ olho: 'OE', anteriores })
    b.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.primeiroSegundo, valor: 'segundo' }, { itemId: D7.dataPrimeiroOlho, valor: '2026-09-16' }] })
    expect(alerta(b, `d7:${D7.primeiroSegundo}`)?.descricao).toContain('diferente da registrada no painel')
    const c = new Simulador({ olho: 'OE', anteriores })
    c.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.primeiroSegundo, valor: 'segundo' }, { itemId: D7.dataPrimeiroOlho, valor: '2026-09-15' }] })
    expect(alerta(c, `d7:${D7.primeiroSegundo}`)).toBeUndefined()
  })
})

describe('5. itens de conferência que precisam registrar divergência', () => {
  it('alergia nova na admissão: registrada, entra no dot A e na verbalização do Time Out', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.alergias]: 'nao' }, pular: [ADM.alergiaNova] })
    expect(sim.visao('enfermagem').blocos.admissao.faltam).toEqual([ADM.alergiaNova])
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.alergiaNova, valor: 'Dipirona: urticária (fictício)' }] })
    const v = sim.visao('circulante')
    expect(v.dots.find((d) => d.letra === 'A')?.motivo).toContain('Dipirona')
    expect(v.verbalizacaoTimeOut?.alergias).toEqual(['Dipirona: urticária (fictício) (informada na admissão)'])
    expect(v.verbalizacaoTimeOut?.alfaBloqueador).toBe('α-bloqueador: não usa')
  })

  it('procedimento não confirmado no Time Out: cirurgia não começa, quase-evento, resolução escrita do cirurgião', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
    sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null, eixo: null } })
    preencherBloco(sim, 'time_out', { preferida: 'circulante', valores: { [TO.procedimento]: 'nao' } })
    expect(abertos(sim)).toContain('HS_LIO_TIME_OUT')
    expect(sim.entrada.eventos.filter((e) => e.tipo === 'quase_evento.registrado').map((e) => e.dados)).toEqual([
      expect.objectContaining({ codigo: 'HS_LIO_TIME_OUT', etapa: 'd0', categoria: 'outro' }),
    ])
    // Abertura da LIO (read-back) também fica bloqueada enquanto houver divergência no Time Out.
    expect(sim.falha('cirurgiao', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.readBack, valor: true }] }).codigo).toBe('HARD_STOP')
    expect(sim.falha('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.cirurgiao.id }).codigo).toBe('HARD_STOP')
    expect(sim.falha('circulante', { tipo: 'hardstop.resolver', codigo: 'HS_LIO_TIME_OUT', resolucao: 'x' }).codigo).toBe('SEM_PERMISSAO')
    sim.executar('cirurgiao', { tipo: 'hardstop.resolver', codigo: 'HS_LIO_TIME_OUT', resolucao: 'Procedimento conferido com o pedido e o TCLE.' })
    sim.executar('circulante', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.procedimento, valor: 'sim' }] })
    sim.executar('cirurgiao', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.readBack, valor: true }] })
    sim.executar('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.cirurgiao.id })
    expect(sim.estadoEpisodio).toBe('time_out_concluido')
  })

  it('jejum ou medicações fora da orientação → ALERTA comunicado antes de concluir a admissão', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.jejum]: 'nao' } })
    expect(alerta(sim, `admissao:${ADM.jejum}`)?.descricao).toContain('POP §14')
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' }).codigo).toBe('VALIDACAO')
    comunicarPendentes(sim, 'enfermagem')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
  })
})

describe('7, 8. prazos e quarentena', () => {
  it('erro do olho no quiz: ligação no mesmo dia', () => {
    const sim = new Simulador()
    const t = corrigirQuiz({ ...CERTAS, 1: 'OE' }, 'OD')
    sim.gravar({ eventos: [eventoQuizRespondido({ episodioId: sim.entrada.episodio.id, pacienteId: sim.entrada.paciente.id, autorId: 's', tentativa: { ...t, em: sim.agora }, erradas: questoesErradas({ ...CERTAS, 1: 'OE' }, 'OD') })], lente: [], mensagens: [] })
    const p = pendenciasDoEpisodio(sim.estado(), sim.agora).find((x) => x.codigo === 'quiz.contato_humano:erro_olho')
    expect(p?.prazo).toBe('2026-10-14T02:59:59.999Z')
  })

  it('quarentena gera ALERTA ao cirurgião (quem, quando, via) com prazo no mesmo dia; a resolução escrita é a conduta', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    fazerCp2(sim, { ...PLANO, dioptria: 19 })
    const a = alerta(sim, 'lente:quarentena:1')!
    expect(a).toMatchObject({ titulo: 'LIO em quarentena (checkpoint 2, ciclo 1)', origem: { modelo: 'cp2' }, comunicacaoPendente: true })
    expect(JSON.stringify(a)).not.toMatch(/19|21[.,]5/)
    const p = pendenciasDoEpisodio(sim.estado(), sim.agora).find((x) => x.codigo === 'alerta.nao_comunicado:lente:quarentena:1')
    expect(p).toMatchObject({ responsavel: ['conferente'], prazo: '2026-10-14T02:59:59.999Z' })
    expect(sim.falha('cirurgiao', { tipo: 'alerta.conduta', alertaId: 'lente:quarentena:1', conduta: 'x' }).codigo).toBe('VALIDACAO')
    sim.executar('conferente', { tipo: 'alerta.comunicar', alertaId: 'lente:quarentena:1', via: 'telefone', cirurgiaoId: MEMBROS.cirurgiao.id })
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Plano reescrito.', acao: 'novo_plano' })
    expect(alerta(sim, 'lente:quarentena:1')?.conduta?.texto).toBe('Plano reescrito.')
  })
})

describe('9. demência ou déficit cognitivo', () => {
  it('identificação confirmada com o acompanhante só com déficit cognitivo; D-7 exige o olho confirmado com o acompanhante', () => {
    const sem = new Simulador()
    ateD2(sem)
    sem.agora = D0_INSTANTE
    expect(sem.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.identificacao, valor: 'acompanhante' }] }).codigo).toBe('VALIDACAO')

    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.demencia, valor: 'sim' }] })
    expect(sim.visao('concierge').blocos.d7.faltam).toEqual(expect.arrayContaining([D7.representante, D7.olhoAcompanhante]))
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.olhoAcompanhante, valor: 'OE' }] })
    expect(alerta(sim, `d7:${D7.olhoAcompanhante}`)?.titulo).toBe('Olho dito pelo acompanhante diferente do pedido')

    const ok = new Simulador()
    fazerD7(ok, { [D7.demencia]: 'sim', [D7.representante]: { nome: 'Representante Teste' } })
    comunicarPendentes(ok)
    concluirD7(ok)
    fazerCp1(ok)
    ok.agora = D2_INSTANTE
    fazerCp2(ok)
    ok.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    ok.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    preencherBloco(ok, 'd2', { preferida: 'conferente' })
    ok.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    ok.agora = D0_INSTANTE
    preencherBloco(ok, 'admissao', { valores: { [ADM.identificacao]: 'acompanhante' } })
    ok.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    ok.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.identificacao, valor: 'acompanhante' }, { itemId: SI.consentimento, valor: 'sim' }] })
    expect(abertos(ok)).not.toContain('HS_ORDEM_SIGN_IN')
  })
})

describe('10, 12. TCLE retido e página do paciente', () => {
  it('expectativa a realinhar sem conduta: TCLE retido (preparo pode ir, sem mensagem); depois da conduta, o TCLE sai', () => {
    const sim = new Simulador()
    prepararContatos(sim)
    preencherBloco(sim, 'd7', { valores: { [D7.semOculos]: 'sim' }, pular: [D7.materiais] })
    const previa = previaMateriais(sim.estado(), MATERIAIS, sim.ctx('concierge'))
    expect(previa.mensagens).toEqual([])
    expect(previa.materiais.map((m) => m.id)).toEqual(['mat-video'])
    expect(previa.avisos[0]).toContain('TCLE retido')
    const r = sim.executar('concierge', { tipo: 'materiais.enviar', tokenLink: 'token-de-teste-1234567890', expiraEm: '2026-11-30T00:00:00.000Z', materiais: MATERIAIS })
    expect(r.mensagens).toEqual([])
    expect(r.eventos.find((e) => e.tipo === 'material.enviado')?.dados).toMatchObject({ tcleRetido: true, materiais: [{ id: 'mat-video' }] })
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.materiais, valor: 'enviados' }] }).codigo).toBe('ORDEM')
    expect(codigos(sim)).toContain('tcle.retido_expectativa')
    sim.executar('cirurgiao', { tipo: 'alerta.conduta', alertaId: `d7:${D7.semOculos}`, conduta: 'Expectativa realinhada em consulta (fictício).' })
    const r2 = sim.executar('concierge', { tipo: 'materiais.enviar', tokenLink: 'token-de-teste-1234567890', expiraEm: '2026-11-30T00:00:00.000Z', materiais: MATERIAIS })
    expect(r2.mensagens.map((m) => m.gatilho)).toEqual(['tcle_envio'])
  })

  it('link do TCLE na página: só depois da aprovação no quiz ou do contato humano após reprovação', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'tcle.status', status: 'enviado', link: 'https://assinatura-teste.invalid/x' })
    expect(situacaoPaginaPaciente(sim.estado()).tcleLink).toBeNull()
    const quiz = (r: Record<number, string>) => {
      const t = corrigirQuiz(r, 'OD')
      sim.gravar({ eventos: [eventoQuizRespondido({ episodioId: sim.entrada.episodio.id, pacienteId: sim.entrada.paciente.id, autorId: 's', tentativa: { ...t, em: sim.agora }, erradas: [] })], lente: [], mensagens: [] })
    }
    quiz({ ...CERTAS, 7: 'a' })
    expect(situacaoPaginaPaciente(sim.estado()).tcleLink).toBeNull()
    sim.agora = '2026-10-13T15:00:00.000Z'
    sim.executar('concierge', { tipo: 'orientacoes.teach_back', resultado: 'apos_reorientacao' })
    expect(situacaoPaginaPaciente(sim.estado()).tcleLink).toBe('https://assinatura-teste.invalid/x')
    const outro = new Simulador()
    outro.executar('concierge', { tipo: 'tcle.status', status: 'enviado', link: 'https://assinatura-teste.invalid/y' })
    const t = corrigirQuiz(CERTAS, 'OD')
    outro.gravar({ eventos: [eventoQuizRespondido({ episodioId: outro.entrada.episodio.id, pacienteId: outro.entrada.paciente.id, autorId: 's', tentativa: { ...t, em: outro.agora }, erradas: [] })], lente: [], mensagens: [] })
    expect(situacaoPaginaPaciente(outro.estado()).tcleLink).toBe('https://assinatura-teste.invalid/y')
  })
})

describe('11. midriático bloqueado pelos hard stops do POP §8 e §2', () => {
  it('HS3, HS4, HS5, HS6 e HS7 bloqueiam o midriático', () => {
    for (const c of ['HS3_DIVERGENCIA_IDENTIDADE_OLHO', 'HS4_SEM_ACOMPANHANTE', 'HS5_TCLE', 'HS6_SEM_CONDUTA_ALFA_ANTICOAG', 'HS7_OLHO_VERMELHO']) {
      expect(DEFINICOES_HARD_STOP.find((d) => d.codigo === c)?.bloqueia, c).toContain(`marcar:sign_in.${SI.midriatico}`)
    }
  })
})

describe('13, 14. dot Q e olho único', () => {
  it('ambliopia sozinha não gera Q nem "OLHO ÚNICO"; baixa visão no olho contralateral gera Q', () => {
    const amb = new Simulador()
    fazerD7(amb, { [D7.olhoUnico]: 'sim', [D7.olhoUnicoQual]: 'ambliopia' })
    expect(amb.visao('enfermagem').dots).toEqual([])
    expect(amb.visao('enfermagem').identificacao.alertasExtenso).not.toContain('OLHO ÚNICO')
    const bv = new Simulador()
    fazerD7(bv, { [D7.baixaVisaoContralateral]: 'sim' })
    expect(bv.visao('enfermagem').dots.map((d) => `${d.letra}:${d.motivo}`)).toEqual(['Q:Risco de queda: baixa visão no olho contralateral.'])
  })

  it('olho único: "operado pelo preceptor" obrigatório no Time Out; os demais itens do §11 ficam pendentes e não obrigatórios', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.olhoUnico]: 'sim', [D7.olhoUnicoQual]: 'olho_unico' })
    comunicarPendentes(sim)
    concluirD7(sim)
    fazerCp1(sim)
    sim.agora = D2_INSTANTE
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    preencherBloco(sim, 'd2', { preferida: 'conferente' })
    expect(sim.visao('conferente').blocos.d2.faltam).toEqual([])
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    admitir(sim)
    signIn(sim)
    preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
    sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null, eixo: null } })
    preencherBloco(sim, 'time_out', { preferida: 'circulante' })
    expect([...sim.visao('circulante').blocos.time_out.faltam].sort()).toEqual([TO.olhoUnicoPreceptor, TO.readBack].sort())
    const modelos = modelosPadrao()
    const pendentes = [...modelos.d2.secoes, ...modelos.alta.secoes].flatMap((s) => s.itens).filter((i) => i.id.includes('olho_unico'))
    expect(pendentes.length).toBe(3)
    for (const i of pendentes) expect(i).toMatchObject({ obrigatorio: false, pendente: expect.stringContaining('[S] POP §11') })
  })
})

describe('15, 17, 18. etiqueta, acompanhante reserva, homônimo', () => {
  it('pulseira sem prontuário mostra "PRONTUÁRIO NÃO REGISTRADO"', () => {
    const sim = new Simulador({ paciente: { prontuario: null } })
    const pulseira = gerarEtiquetas(sim.estado(), sim.entrada.config).find((e) => e.tipo === 'pulseira')!
    expect(pulseira.texto).toContain('Pront.: PRONTUÁRIO NÃO REGISTRADO')
  })

  it('acompanhante reserva: exigido no D-7; "nenhum disponível" com observação vira pendência (não alerta)', () => {
    const sim = new Simulador()
    prepararContatos(sim)
    preencherBloco(sim, 'd7', { pular: [D7.acompanhanteReservaSituacao, D7.acompanhanteReserva] })
    expect(sim.visao('concierge').blocos.d7.faltam).toContain(D7.acompanhanteReservaSituacao)
    expect(sim.visao('concierge').blocos.d7.faltam).not.toContain(D7.acompanhanteReserva)
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.acompanhanteReservaSituacao, valor: 'nenhum' }] }).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.acompanhanteReservaSituacao, valor: 'nenhum', observacao: 'Mora só com o filho (fictício).' }] })
    const p = pendenciasDoEpisodio(sim.estado(), sim.agora).find((x) => x.codigo === 'd7.sem_acompanhante_reserva')
    expect(p?.severidade).toBe('pendencia')
    expect(sim.visao('concierge').alertas).toEqual([])
  })

  it('homônimo: o texto do hard stop inclui "cirurgias não consecutivas, se possível"', () => {
    expect(DEFINICOES_HARD_STOP.find((d) => d.codigo === 'HS_HOMONIMO_NOME_MAE')?.descricao).toContain('cirurgias não consecutivas, se possível')
  })
})

describe('21, 22, 23. TCLE com cirurgiã, indicador 4, plausibilidade', () => {
  it('"Dra." no cadastro → "A Dra. <nome> esclarece antes."', () => {
    const t = textoTcleEnvio({ nomePaciente: 'Paciente', nomeConcierge: 'Concierge', olho: 'OE', link: 'https://x.invalid', nomeCirurgiao: 'Dra. Cirurgiã Teste' })
    expect(t.texto.endsWith('A Dra. Cirurgiã Teste esclarece antes.')).toBe(true)
    const t2 = textoTcleEnvio({ nomePaciente: 'Paciente', nomeConcierge: 'Concierge', olho: 'OE', link: 'https://x.invalid', nomeCirurgiao: 'Cirurgião Teste' })
    expect(t2.texto.endsWith('O Dr. Cirurgião Teste esclarece antes.')).toBe(true)
  })

  it('indicador 4 conta só identidade, olho e LIO (categoria do quase-evento)', () => {
    const sim = new Simulador()
    sim.executar('circulante', { tipo: 'quase_evento.registrar', etapa: 'd0', descricao: 'Pulseira de outro paciente (fictício).', categoria: 'identidade' })
    sim.executar('circulante', { tipo: 'quase_evento.registrar', etapa: 'd0', descricao: 'Material fora do lugar (fictício).', categoria: 'outro' })
    sim.executar('circulante', { tipo: 'quase_evento.registrar', etapa: 'd0', descricao: 'Sem categoria (fictício).' })
    expect(sim.falha('circulante', { tipo: 'quase_evento.registrar', etapa: 'd0', descricao: 'x', categoria: 'invalida' as never }).codigo).toBe('VALIDACAO')
    const ind = calcularIndicadores([sim.estado()], '2026-10-01', '2026-10-31').find((i) => i.numero === 4)!
    expect(ind.numerador).toBe(1)
  })

  it('plausibilidade do cp2 sem números de exemplo do trecho [RASCUNHO]', () => {
    const item = modelosPadrao().cp2.secoes[0].itens.find((i) => i.id === CP2.plausibilidade)!
    expect(item.ajuda).toBe('Critérios a definir pelo cirurgião [RASCUNHO]. B não interpreta; só sinaliza.')
    expect(JSON.stringify(item)).not.toMatch(/0,3 mm|1 D/)
  })
})
