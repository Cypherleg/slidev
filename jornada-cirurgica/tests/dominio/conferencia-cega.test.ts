// Briefing §6.3 e regra 7: a segunda conferente não vê o que a primeira digitou — nem pela API.
import { describe, expect, it } from 'vitest'
import { compararLente, CP2 } from '../../supabase/functions/_shared/dominio/index.ts'
import {
  admitir,
  ateD2,
  CHEGADA,
  chavesDeLenteEmEventosGerais,
  concluirD7,
  D2_INSTANTE,
  fazerCp1,
  fazerCp2,
  fazerD7,
  jornadaCompleta,
  PLANO,
  preencherBloco,
  signIn,
  Simulador,
} from './apoio.ts'

const SECRETO = { olho: 'OD' as const, modelo: 'PLANO-SECRETO-777', dioptria: 23.75, torica: true, cilindro: 2.25, eixo: 95, reserva: { modelo: 'RESERVA-SECRETA-555', dioptria: 19.25 } }
const DIGITADO_CP2 = { olho: 'OD' as const, modelo: 'CP2-DIGITADO-999', dioptria: 17.25, torica: false, cilindro: null, eixo: null }

function comPlanoSecreto() {
  const sim = new Simulador({ tipoLente: 'tórica' })
  fazerD7(sim)
  concluirD7(sim)
  sim.executar('concierge', { tipo: 'lente.plano', dados: { ...SECRETO } })
  sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA, lote: 'LOTE-SECRETO-321' } })
  preencherBloco(sim, 'cp1', { incluirOpcionais: true, valores: { 'CP1.torica': 'sim' } })
  sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
  sim.agora = D2_INSTANTE
  return sim
}

function semValoresDoPlano(json: string) {
  for (const s of ['PLANO-SECRETO-777', 'RESERVA-SECRETA-555', 'LOTE-SECRETO-321', '23.75', '+23,75', '19.25', '2.25']) expect(json).not.toContain(s)
}

describe('conferência cega', () => {
  it('a projeção para a conferente não contém os valores do plano (nem montada do estado completo)', () => {
    const sim = comPlanoSecreto()
    semValoresDoPlano(JSON.stringify(sim.visao('conferente')))
    semValoresDoPlano(JSON.stringify(sim.visao('conferente', true)))
    // ...nem as respostas do checkpoint 1
    expect(sim.visao('conferente', true).respostas.cp1).toBeUndefined()
    // a concierge vê
    const vc = sim.visao('concierge')
    expect(vc.lente.plano?.modelo).toBe('PLANO-SECRETO-777')
    expect(vc.respostas.cp1).toBeDefined()
  })

  it('o estado montado só com eventos visíveis à conferente mostra a situação correta sem valores', () => {
    const sim = comPlanoSecreto()
    const v = sim.visao('conferente')
    expect(v.blocos.cp1.situacao).toBe('concluido')
    expect(v.lente.etapa).toBe('chegada_conferida')
    expect(v.permissoes['lente.cp2'].permitido).toBe(true)
    expect(v.lente.plano).toBeUndefined()
    expect(v.lente.chegada).toBeUndefined()
    expect(v.lente.fotoPlanoAnexoId).toBeUndefined()
  })

  it('divergência plantada vai para quarentena; a projeção da conferente continua sem os valores do plano', () => {
    const sim = comPlanoSecreto()
    preencherBloco(sim, 'cp2', { preferida: 'conferente' })
    const r = sim.executar('conferente', { tipo: 'lente.cp2', valores: { ...DIGITADO_CP2 } })
    const resultado = r.eventos.find((e) => e.tipo === 'lente.cp2_resultado')!
    expect(resultado.dados).toMatchObject({ confere: false })
    expect((resultado.dados as { camposDivergentes: string[] }).camposDivergentes).toEqual(['modelo', 'dioptria', 'cilindro', 'eixo'])
    const v = sim.visao('conferente')
    expect(v.lente.etapa).toBe('quarentena')
    expect(v.lente.quarentena).toMatchObject({ aberta: true, etapa: 'cp2' })
    expect(v.lente.cp2?.modelo).toBe('CP2-DIGITADO-999')
    semValoresDoPlano(JSON.stringify(v))
    semValoresDoPlano(JSON.stringify(sim.visao('conferente', true)))
    // A concierge não vê o que a conferente digitou.
    expect(JSON.stringify(sim.visao('concierge', true))).not.toContain('CP2-DIGITADO-999')
    expect(sim.visao('concierge').respostas.cp2).toBeUndefined()
    // O cirurgião e a gestora veem as duas.
    const vg = sim.visao('gestora', true)
    expect(vg.lente.plano?.modelo).toBe('PLANO-SECRETO-777')
    expect(vg.lente.cp2?.modelo).toBe('CP2-DIGITADO-999')
  })

  it('a autora do checkpoint 1 não pode fazer o checkpoint 2 (mesmo tendo os dois papéis)', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim, PLANO, 'dupla')
    expect(sim.falha('dupla', { tipo: 'lente.cp2', valores: { ...PLANO } }).codigo).toBe('CONFERENCIA_CEGA')
    expect(sim.falha('dupla', { tipo: 'checklist.responder', modelo: 'cp2', respostas: [{ itemId: CP2.biometria, valor: 'sim' }] }).codigo).toBe('CONFERENCIA_CEGA')
    expect(sim.visao('dupla').permissoes['lente.cp2']).toMatchObject({ permitido: false })
  })

  it('quem consultou a conferência 1 (registro de acesso informado pela API) não faz o checkpoint 2', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    sim.atorViuConferencia1.add('00000000-0000-4000-8000-0000000000b1')
    expect(sim.falha('conferente', { tipo: 'lente.cp2', valores: { ...PLANO } }).codigo).toBe('CONFERENCIA_CEGA')
  })

  it('checkpoint 2 exige o checkpoint 1 concluído e papel de conferente', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    expect(sim.falha('conferente', { tipo: 'lente.cp2', valores: { ...PLANO } }).codigo).toBe('ORDEM')
    expect(sim.falha('concierge2', { tipo: 'lente.cp2', valores: { ...PLANO } }).codigo).toBe('SEM_PERMISSAO')
  })

  it('ninguém corrige o valor do outro: não há segunda digitação do cp2 nem edição do plano depois do cp1', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    expect(sim.falha('concierge', { tipo: 'lente.plano', dados: { ...PLANO, dioptria: 20 } }).codigo).toBe('ESTADO')
    fazerCp2(sim)
    expect(sim.falha('conferente', { tipo: 'lente.cp2', valores: { ...PLANO } }).codigo).toBe('ESTADO')
  })

  it('manter o plano após divergência no cp2 exige nova conferência cega (cp1 herdado)', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    sim.agora = D2_INSTANTE
    fazerCp2(sim, { ...PLANO, modelo: 'Lente Digitada Errada' })
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Plano correto conferido na biometria original; refazer o checkpoint 2.', acao: 'manter_plano' })
    const v = sim.visao('conferente')
    expect(v.lente).toMatchObject({ ciclo: 2, origemCiclo: 'manter_plano', etapa: 'chegada_conferida', faltaNoCiclo: ['cp2'] })
    expect(v.lente.cp2).toBeUndefined()
    fazerCp2(sim, PLANO, 'conferente2')
    sim.executar('conferente2', { tipo: 'bloco.concluir', modelo: 'cp2' })
    expect(sim.visao('gestora', true).lente.etapa).toBe('cp2_confere')
  })

  it('olho divergente do episódio no cp2 também é divergência', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    fazerCp1(sim)
    fazerCp2(sim, { ...PLANO, olho: 'OE' })
    expect(sim.visao('gestora', true).lente.cp2Resultado).toMatchObject({ confere: false, camposDivergentes: ['olho'] })
  })

  it('plano com olho diferente do episódio já entra em quarentena e não pode ser "mantido"', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO, olho: 'OE' } })
    expect(sim.visao('concierge').lente.quarentena).toMatchObject({ aberta: true, etapa: 'cp1' })
    expect(sim.falha('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Manter.', acao: 'manter_plano' }).codigo).toBe('VALIDACAO')
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Plano reescrito do olho certo.', acao: 'novo_plano' })
    expect(sim.visao('concierge').lente.etapa).toBe('sem_plano')
  })

  it('leitura do Time Out: só circulante, cirurgião e gestora veem; a circulante não vê o plano', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null, eixo: null } })
    const vc = sim.visao('circulante')
    expect(vc.lente.timeOut?.modelo).toBe(PLANO.modelo)
    expect(vc.lente.plano).toBeUndefined()
    expect(vc.lente.cp2).toBeUndefined()
    expect(sim.visao('concierge', true).lente.timeOut).toBeUndefined()
    expect(sim.visao('conferente', true).lente.timeOut).toBeUndefined()
    expect(sim.visao('cirurgiao', true).lente.timeOut?.dioptria).toBe(PLANO.dioptria)
  })

  it('nenhum evento "geral" carrega dioptria, cilindro ou eixo (CHECK do banco)', () => {
    const sim = new Simulador({ tipoLente: 'tórica' })
    jornadaCompleta(sim)
    expect(chavesDeLenteEmEventosGerais(sim.entrada.eventos)).toEqual([])
    // Visibilidade: cp1 → conferencia_1; cp2 → conferencia_2; o resto geral.
    for (const e of sim.entrada.eventos) {
      const modelo = (e.dados as { modelo?: string }).modelo
      if (e.tipo === 'checklist.item_respondido' && modelo === 'cp1') expect(e.visibilidade).toBe('conferencia_1')
      else if (e.tipo === 'checklist.item_respondido' && modelo === 'cp2') expect(e.visibilidade).toBe('conferencia_2')
      else expect(e.visibilidade).toBe('geral')
    }
    expect(sim.entrada.lente.map((r) => [r.etapa, r.visibilidade])).toEqual([
      ['plano', 'conferencia_1'],
      ['chegada', 'conferencia_1'],
      ['cp2', 'conferencia_2'],
      ['time_out', 'conferencia_1'],
    ])
  })
})

describe('compararLente', () => {
  it('normaliza modelo (maiúsculas, espaços) e dioptria numérica', () => {
    expect(compararLente({ modelo: 'Lente  teste zx-100', dioptria: 21.5 }, { modelo: 'LENTE TESTE ZX-100', dioptria: 21.5 }, ['modelo', 'dioptria']).confere).toBe(true)
    expect(compararLente({ dioptria: -1.5 }, { dioptria: 1.5 }, ['dioptria']).camposDivergentes).toEqual(['dioptria'])
    expect(compararLente({ dioptria: 21.5 }, { dioptria: 21.05 }, ['dioptria']).confere).toBe(false)
  })
  it('cilindro e eixo: null = null; número × null diverge', () => {
    expect(compararLente({ cilindro: null, eixo: null }, { cilindro: null, eixo: null }, ['cilindro', 'eixo']).confere).toBe(true)
    expect(compararLente({ cilindro: 1.5, eixo: 90 }, { cilindro: null, eixo: null }, ['cilindro', 'eixo']).camposDivergentes).toEqual(['cilindro', 'eixo'])
    expect(compararLente({ olho: 'OD' }, { olho: 'OE' }, ['olho']).camposDivergentes).toEqual(['olho'])
  })
})
