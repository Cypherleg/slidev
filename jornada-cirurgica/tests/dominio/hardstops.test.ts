// Critério de aceite da fase 3: cada hard stop tem um teste que o dispara e outro que o resolve.
import { describe, expect, it } from 'vitest'
import { ADM, CP1, D2, D7, DEFINICOES_HARD_STOP, SI } from '../../supabase/functions/_shared/dominio/index.ts'
import type { CodigoHardStop } from '../../supabase/functions/_shared/dominio/index.ts'
import {
  admitir,
  ateD2,
  CHEGADA,
  concluirD7,
  D0_INSTANTE,
  D2_INSTANTE,
  fazerCp1,
  fazerCp2,
  fazerD7,
  MEMBROS,
  PLANO,
  preencherBloco,
  signIn,
  Simulador,
} from './apoio.ts'

const abertos = (sim: Simulador, chave: Parameters<Simulador['visao']>[0] = 'gestora') => sim.visao(chave, true).hardStops.map((h) => h.codigo)
const quaseEventos = (sim: Simulador, codigo: CodigoHardStop) =>
  sim.entrada.eventos.filter((e) => e.tipo === 'quase_evento.registrado' && (e.dados as { codigo?: string }).codigo === codigo)

function ateCp1(sim: Simulador) {
  fazerD7(sim)
  concluirD7(sim)
  fazerCp1(sim)
  sim.agora = D2_INSTANTE
}

describe('catálogo', () => {
  it('todos os códigos de tipos.ts têm definição com bloqueia, resolvivelPor, comoResolver e fonte', () => {
    const codigos: CodigoHardStop[] = [
      'HS1_DIVERGENCIA_LIO',
      'HS2_BIOMETRIA_AUSENTE',
      'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
      'HS4_SEM_ACOMPANHANTE',
      'HS5_TCLE',
      'HS6_SEM_CONDUTA_ALFA_ANTICOAG',
      'HS7_OLHO_VERMELHO',
      'HS8_TROCA_LIO_D0',
      'HS9_SITIO_NAO_MARCADO',
      'HS_LIO_TIME_OUT',
      'HS_HOMONIMO_NOME_MAE',
      'HS_ORDEM_SIGN_IN',
      'HS_LIO_SEM_DUPLA_CONFERENCIA',
    ]
    expect(DEFINICOES_HARD_STOP.map((d) => d.codigo).sort()).toEqual([...codigos].sort())
    for (const d of DEFINICOES_HARD_STOP) {
      expect(d.bloqueia.length).toBeGreaterThan(0)
      expect(d.resolvivelPor.length).toBeGreaterThan(0)
      expect(d.comoResolver.length).toBeGreaterThan(10)
      expect(d.fonte).toBeTruthy()
    }
  })
})

describe('HS1 — divergência de LIO (quarentena)', () => {
  it('dispara: conferência cega divergente põe a LIO em quarentena, registra quase-evento e barra o D-2', () => {
    const sim = new Simulador()
    ateCp1(sim)
    preencherBloco(sim, 'cp2', { preferida: 'conferente' })
    const r = sim.executar('conferente', { tipo: 'lente.cp2', valores: { ...PLANO, dioptria: 22 } })
    const tipos = r.eventos.map((e) => e.tipo)
    expect(tipos).toEqual(expect.arrayContaining(['lente.cp2_registrado', 'lente.cp2_resultado', 'lente.quarentena_aberta', 'quase_evento.registrado']))
    expect(abertos(sim)).toContain('HS1_DIVERGENCIA_LIO')
    expect(quaseEventos(sim, 'HS1_DIVERGENCIA_LIO')).toHaveLength(1)
    preencherBloco(sim, 'd2', { preferida: 'conferente' })
    const e = sim.falha('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    expect(e.codigo).toBe('HARD_STOP')
    expect(e.detalhes?.hardStops).toContain('HS1_DIVERGENCIA_LIO')
  })

  it('dispara: "não" no checkpoint 1 (mesmo olho) abre quarentena na etapa cp1', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA } })
    preencherBloco(sim, 'cp1', { valores: { [CP1.olho]: 'nao' } })
    expect(abertos(sim)).toContain('HS1_DIVERGENCIA_LIO')
    expect(sim.visao('concierge').lente.quarentena).toMatchObject({ aberta: true, etapa: 'cp1' })
    expect(sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' }).codigo).toBe('ORDEM')
  })

  it('resolve: só o cirurgião, por escrito; novo plano abre novo ciclo com plano, cp1 e cp2 refeitos', () => {
    const sim = new Simulador()
    ateCp1(sim)
    fazerCp2(sim, { ...PLANO, dioptria: 22 })
    expect(sim.falha('concierge', { tipo: 'lente.resolver_quarentena', resolucao: 'texto', acao: 'novo_plano' }).codigo).toBe('SEM_PERMISSAO')
    expect(sim.falha('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: '   ', acao: 'novo_plano' }).codigo).toBe('VALIDACAO')
    expect(sim.falha('gestora', { tipo: 'hardstop.resolver', codigo: 'HS1_DIVERGENCIA_LIO', resolucao: 'x' }).codigo).toBe('VALIDACAO')
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Plano reescrito na biometria original; refazer conferências.', acao: 'novo_plano' })
    expect(abertos(sim)).not.toContain('HS1_DIVERGENCIA_LIO')
    const v = sim.visao('concierge')
    expect(v.lente.ciclo).toBe(2)
    expect(v.lente.etapa).toBe('sem_plano')
    expect(v.lente.faltaNoCiclo).toEqual(['plano', 'chegada', 'cp1', 'cp2'])
    fazerCp1(sim)
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    expect(sim.visao('gestora', true).lente.etapa).toBe('cp2_confere')
  })
})

describe('HS2 — biometria original ausente', () => {
  it('dispara: "não" no item da biometria bloqueia o checkpoint 1', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA } })
    preencherBloco(sim, 'cp1', { valores: { [CP1.biometria]: 'nao' } })
    expect(abertos(sim)).toContain('HS2_BIOMETRIA_AUSENTE')
    const e = sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
    expect(e.codigo).toBe('HARD_STOP')
    expect(e.detalhes?.hardStops).toContain('HS2_BIOMETRIA_AUSENTE')
    expect(quaseEventos(sim, 'HS2_BIOMETRIA_AUSENTE')).toHaveLength(1)
  })
  it('resolve: reimpressa a biometria, o item respondido "sim" libera a conclusão', () => {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA } })
    preencherBloco(sim, 'cp1', { valores: { [CP1.biometria]: 'nao' } })
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'cp1', respostas: [{ itemId: CP1.biometria, valor: 'sim' }] })
    expect(abertos(sim)).not.toContain('HS2_BIOMETRIA_AUSENTE')
    sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
    expect(sim.visao('concierge').blocos.cp1.situacao).toBe('concluido')
  })
})

describe('HS3 — divergência de identidade ou de olho', () => {
  function disparar() {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.identificacao]: 'nao' } })
    return sim
  }
  it('dispara: paciente não confirma identidade na admissão; admissão e midriático bloqueados', () => {
    const sim = disparar()
    expect(abertos(sim)).toContain('HS3_DIVERGENCIA_IDENTIDADE_OLHO')
    expect(quaseEventos(sim, 'HS3_DIVERGENCIA_IDENTIDADE_OLHO')).toHaveLength(1)
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' }).codigo).toBe('HARD_STOP')
  })
  it('resolve: resolução escrita do cirurgião (não da enfermagem) e item reconferido', () => {
    const sim = disparar()
    expect(sim.falha('enfermagem', { tipo: 'hardstop.resolver', codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO', resolucao: 'conferido' }).codigo).toBe('SEM_PERMISSAO')
    sim.executar('cirurgiao', { tipo: 'hardstop.resolver', codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO', resolucao: 'Documento conferido de novo; nome no prontuário corrigido.' })
    expect(abertos(sim)).not.toContain('HS3_DIVERGENCIA_IDENTIDADE_OLHO')
    expect(sim.visao('enfermagem').hardStopsResolvidos).toEqual([
      { codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO', titulo: 'Divergência de identidade ou de olho', resolucao: 'Documento conferido de novo; nome no prontuário corrigido.', porNome: 'Cirurgião Teste Um', em: D0_INSTANTE },
    ])
    // O item continua "não": o bloco não conclui até ser reconferido.
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' }).codigo).toBe('VALIDACAO')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.identificacao, valor: 'sim' }] })
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(sim.estadoEpisodio).toBe('admitido')
  })
})

describe('HS4 — sem acompanhante', () => {
  function disparar() {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao', { valores: { [ADM.acompanhantePresente]: 'nao' } })
    return sim
  }
  it('dispara: o episódio não passa da admissão', () => {
    const sim = disparar()
    expect(abertos(sim)).toContain('HS4_SEM_ACOMPANHANTE')
    const e = sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(e.codigo).toBe('HARD_STOP')
    expect(e.detalhes?.hardStops).toContain('HS4_SEM_ACOMPANHANTE')
    expect(sim.falha('gestora', { tipo: 'hardstop.resolver', codigo: 'HS4_SEM_ACOMPANHANTE', resolucao: 'prosseguir' }).codigo).toBe('VALIDACAO')
  })
  it('resolve: acompanhante presente e identificado', () => {
    const sim = disparar()
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.acompanhantePresente, valor: 'sim' }] })
    expect(abertos(sim)).not.toContain('HS4_SEM_ACOMPANHANTE')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(sim.estadoEpisodio).toBe('admitido')
  })
})

describe('HS5 — TCLE', () => {
  function disparar() {
    const sim = new Simulador()
    ateCp1(sim)
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    preencherBloco(sim, 'd2', { preferida: 'conferente', valores: { [D2.tcle]: 'nao_assinado' } })
    const r = sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    return { sim, r }
  }
  it('dispara: no dia, TCLE não assinado bloqueia a admissão (e é quase-evento)', () => {
    const { sim, r } = disparar()
    expect(r.eventos.some((e) => e.tipo === 'quase_evento.registrado' && (e.dados as { codigo?: string }).codigo === 'HS5_TCLE')).toBe(true)
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao')
    const e = sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(e.detalhes?.hardStops).toContain('HS5_TCLE')
  })
  it('resolve: TCLE assinado registrado', () => {
    const { sim } = disparar()
    sim.agora = D0_INSTANTE
    preencherBloco(sim, 'admissao')
    sim.executar('enfermagem', { tipo: 'tcle.status', status: 'assinado' })
    sim.executar('enfermagem', { tipo: 'tcle.status', status: 'olho_conferido' })
    expect(abertos(sim)).not.toContain('HS5_TCLE')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
    expect(sim.estadoEpisodio).toBe('admitido')
  })
  it('dispara também com dúvida não resolvida no Sign In', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.consentimento, valor: 'nao' }] })
    expect(abertos(sim)).toContain('HS5_TCLE')
  })
})

describe('HS6 — α-bloqueador ou anticoagulação sem conduta', () => {
  function disparar() {
    const sim = new Simulador()
    fazerD7(sim)
    sim.executar('concierge', {
      tipo: 'checklist.responder',
      modelo: 'd7',
      respostas: [{ itemId: D7.alfaBloqueador, valor: { uso: 'usa', nomes: 'Remédio Teste de Próstata' } }],
    })
    sim.executar('concierge', { tipo: 'alerta.comunicar', alertaId: `d7:${D7.alfaBloqueador}`, via: 'telefone', cirurgiaoId: MEMBROS.cirurgiao.id })
    concluirD7(sim)
    fazerCp1(sim)
    sim.agora = D2_INSTANTE
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    preencherBloco(sim, 'd2', { preferida: 'conferente' })
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    admitir(sim)
    preencherBloco(sim, 'sign_in', { preferida: 'enfermagem', pular: [SI.condutaAlertas] })
    return sim
  }
  it('dispara: no Sign In, sem conduta escrita, o item e a conclusão ficam bloqueados', () => {
    const sim = disparar()
    expect(abertos(sim)).toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.condutaAlertas, valor: 'presente' }] }).codigo).toBe('HARD_STOP')
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.condutaAlertas, valor: 'nao_se_aplica' }] }).codigo).toBe('HARD_STOP')
  })
  it('resolve: o cirurgião escreve a conduta no alerta', () => {
    const sim = disparar()
    expect(sim.falha('enfermagem', { tipo: 'alerta.conduta', alertaId: `d7:${D7.alfaBloqueador}`, conduta: 'x' }).codigo).toBe('SEM_PERMISSAO')
    sim.executar('cirurgiao', { tipo: 'alerta.conduta', alertaId: `d7:${D7.alfaBloqueador}`, conduta: 'Manter o remédio; materiais de íris disponíveis.' })
    expect(abertos(sim)).not.toContain('HS6_SEM_CONDUTA_ALFA_ANTICOAG')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.condutaAlertas, valor: 'presente' }] })
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'sign_in', leitorId: MEMBROS.enfermagem.id, confirmadorId: MEMBROS.circulante.id })
    expect(sim.estadoEpisodio).toBe('sign_in_concluido')
  })
})

describe('HS7 — olho vermelho', () => {
  function disparar() {
    const sim = new Simulador()
    ateCp1(sim)
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado' })
    preencherBloco(sim, 'd2', { preferida: 'conferente', valores: { [D2.olhoVermelho]: 'sim' } })
    return sim
  }
  it('dispara: olho vermelho no D-2 bloqueia a conclusão do D-2', () => {
    const sim = disparar()
    expect(abertos(sim)).toContain('HS7_OLHO_VERMELHO')
    expect(sim.falha('conferente', { tipo: 'bloco.concluir', modelo: 'd2' }).codigo).toBe('HARD_STOP')
  })
  it('resolve: avaliação do cirurgião registrada por escrito', () => {
    const sim = disparar()
    sim.executar('cirurgiao', { tipo: 'hardstop.resolver', codigo: 'HS7_OLHO_VERMELHO', resolucao: 'Paciente avaliado: sem infecção; liberado.' })
    expect(abertos(sim)).not.toContain('HS7_OLHO_VERMELHO')
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    expect(sim.estadoEpisodio).toBe('d2_concluido')
  })
  it('novo achado no D0 abre nova ocorrência mesmo depois de resolvido no D-2', () => {
    const sim = disparar()
    sim.executar('cirurgiao', { tipo: 'hardstop.resolver', codigo: 'HS7_OLHO_VERMELHO', resolucao: 'Avaliado no D-2.' })
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
    sim.agora = D0_INSTANTE
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: ADM.olhoVermelho, valor: 'sim' }] })
    expect(abertos(sim)).toContain('HS7_OLHO_VERMELHO')
  })
})

describe('HS8 — troca de LIO no dia D', () => {
  function disparar() {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    sim.executar('cirurgiao', { tipo: 'lente.troca_d0', motivo: 'Mudança de plano após nova avaliação.' })
    signIn(sim)
    preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
    return sim
  }
  it('dispara: sem novo plano e dupla conferência, a LIO não é lida no Time Out', () => {
    const sim = disparar()
    expect(abertos(sim)).toContain('HS8_TROCA_LIO_D0')
    const e = sim.falha('circulante', { tipo: 'lente.time_out', leitura: { modelo: 'Lente Nova Teste', dioptria: 22, cilindro: null, eixo: null } })
    expect(e.codigo).toBe('HARD_STOP')
    expect(e.detalhes?.hardStops).toContain('HS8_TROCA_LIO_D0')
  })
  it('resolve: novo plano, checkpoint 1 e checkpoint 2 refeitos por duas pessoas', () => {
    const sim = disparar()
    const novo = { ...PLANO, modelo: 'Lente Nova Teste', dioptria: 22 }
    fazerCp1(sim, novo)
    expect(abertos(sim)).toContain('HS8_TROCA_LIO_D0')
    fazerCp2(sim, novo)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    expect(abertos(sim)).not.toContain('HS8_TROCA_LIO_D0')
    const r = sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: 'lente nova  teste', dioptria: 22, cilindro: null, eixo: null } })
    expect(r.eventos.find((e) => e.tipo === 'lente.time_out_resultado')?.dados).toMatchObject({ confere: true })
  })
})

describe('HS9 e HS_ORDEM_SIGN_IN — ordem do Sign In', () => {
  it('dispara: midriático antes da identificação, do consentimento e da marcação do sítio', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    expect(abertos(sim)).toEqual(expect.arrayContaining(['HS9_SITIO_NAO_MARCADO', 'HS_ORDEM_SIGN_IN']))
    const e = sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.midriatico, valor: true }] })
    expect(e.codigo).toBe('HARD_STOP')
    expect(e.detalhes?.hardStops).toEqual(expect.arrayContaining(['HS9_SITIO_NAO_MARCADO', 'HS_ORDEM_SIGN_IN']))
    // Hard stops de ordem não geram quase-evento nem suspendem avisos.
    expect(quaseEventos(sim, 'HS9_SITIO_NAO_MARCADO')).toHaveLength(0)
    expect(sim.visao('enfermagem').avisosFamilia.suspensos).toBe(false)
  })
  it('resolve: identificação e consentimento resolvem a ordem; a marcação do cirurgião libera o midriático', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.identificacao, valor: 'sim' }, { itemId: SI.consentimento, valor: 'sim' }] })
    expect(abertos(sim)).not.toContain('HS_ORDEM_SIGN_IN')
    expect(abertos(sim)).toContain('HS9_SITIO_NAO_MARCADO')
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.marcacao, valor: true }] }).codigo).toBe('SEM_PERMISSAO')
    sim.executar('cirurgiao', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.marcacao, valor: true }] })
    expect(abertos(sim)).not.toContain('HS9_SITIO_NAO_MARCADO')
    sim.executar('enfermagem', { tipo: 'checklist.responder', modelo: 'sign_in', respostas: [{ itemId: SI.midriatico, valor: true }] })
  })
})

describe('HS_LIO_TIME_OUT e HS_LIO_SEM_DUPLA_CONFERENCIA', () => {
  function disparar(config: { exigirCp2AntesDoTimeOut?: boolean } = {}) {
    const sim = new Simulador({ config })
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
    const r = sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: 12.5, cilindro: null, eixo: null } })
    return { sim, r }
  }
  it('dispara: leitura da caixa divergente — a cirurgia não começa; quase-evento no D0', () => {
    const { sim, r } = disparar()
    expect(r.eventos.find((e) => e.tipo === 'lente.time_out_resultado')?.dados).toMatchObject({ confere: false, camposDivergentes: ['dioptria'] })
    expect(abertos(sim)).toContain('HS_LIO_TIME_OUT')
    expect(quaseEventos(sim, 'HS_LIO_TIME_OUT')[0]?.dados).toMatchObject({ etapa: 'd0' })
    preencherBloco(sim, 'time_out', { preferida: 'circulante' })
    const e = sim.falha('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.cirurgiao.id })
    expect(e.codigo).toBe('HARD_STOP')
  })
  it('resolve: cirurgião mantém o plano por escrito; caixa reconferida por duas pessoas; nova leitura confere', () => {
    const { sim } = disparar()
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Caixa errada na mesa; plano confirmado na biometria original.', acao: 'manter_plano' })
    expect(abertos(sim)).not.toContain('HS_LIO_TIME_OUT')
    // Novo ciclo sem checkpoint 2: exige dupla conferência antes do Time Out ([S] configurável).
    expect(abertos(sim)).toContain('HS_LIO_SEM_DUPLA_CONFERENCIA')
    expect(sim.visao('concierge').lente).toMatchObject({ ciclo: 2, origemCiclo: 'manter_plano', faltaNoCiclo: ['chegada', 'cp1', 'cp2', 'time_out'] })
    expect(sim.falha('concierge', { tipo: 'lente.plano', dados: { ...PLANO } }).codigo).toBe('ESTADO')
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA, lote: 'LOTE-TESTE-002' } })
    preencherBloco(sim, 'cp1')
    sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
    fazerCp2(sim)
    sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
    expect(abertos(sim)).not.toContain('HS_LIO_SEM_DUPLA_CONFERENCIA')
    sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null, eixo: null } })
    expect(sim.visao('gestora', true).lente.etapa).toBe('time_out_confere')
  })
  it('com exigirCp2AntesDoTimeOut = false, o novo ciclo não abre HS_LIO_SEM_DUPLA_CONFERENCIA', () => {
    const { sim } = disparar({ exigirCp2AntesDoTimeOut: false })
    sim.executar('cirurgiao', { tipo: 'lente.resolver_quarentena', resolucao: 'Plano confirmado.', acao: 'manter_plano' })
    expect(abertos(sim)).not.toContain('HS_LIO_SEM_DUPLA_CONFERENCIA')
  })
})

describe('HS_HOMONIMO_NOME_MAE', () => {
  const homonimo = { episodioId: 'episodio-outro', pacienteId: 'paciente-outro', nomeCompleto: 'PACIENTE TESTE ALFA DA SILVA', dataNascimento: '1961-01-01' }
  it('dispara: homônimo no mesmo dia exige o nome da mãe nas conferências seguintes', () => {
    const sim = new Simulador({ mesmoDia: [homonimo] })
    fazerD7(sim)
    expect(abertos(sim)).toContain('HS_HOMONIMO_NOME_MAE')
    // No D-7 o nome da mãe passa a ser item exigido.
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] })
    const e7 = sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'd7' })
    expect(e7.codigo).toBe('VALIDACAO')
    expect(sim.visao('concierge').blocos.d7.faltam).toEqual([D7.nomeMae])
    const v = sim.visao('concierge')
    expect(v.identificacao).toMatchObject({ homonimoNoDia: true, exigeNomeMae: true })
    expect(v.identificacao.alertasExtenso).toContain('HOMÔNIMO NO DIA')
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA } })
    preencherBloco(sim, 'cp1')
    const e = sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
    expect(e.detalhes?.hardStops).toContain('HS_HOMONIMO_NOME_MAE')
  })
  it('resolve: nome da mãe registrado e conferido', () => {
    const sim = new Simulador({ mesmoDia: [homonimo] })
    fazerD7(sim)
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.nomeMae, valor: 'Mãe Teste Delta' }] })
    expect(abertos(sim)).not.toContain('HS_HOMONIMO_NOME_MAE')
    sim.executar('concierge', { tipo: 'lente.plano', dados: { ...PLANO } })
    sim.executar('concierge', { tipo: 'lente.chegada', dados: { ...CHEGADA } })
    preencherBloco(sim, 'cp1')
    expect(sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' }).codigo).toBe('VALIDACAO') // nome da mãe conferido: item exigido
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'cp1', respostas: [{ itemId: CP1.nomeMae, valor: true }] })
    sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'cp1' })
  })
})
