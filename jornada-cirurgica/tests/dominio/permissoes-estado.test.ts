import { describe, expect, it } from 'vitest'
import { corrigirPaciente, D7, decidir, montarEstado, previaMateriais, situacaoPaginaPaciente, corrigirQuiz, eventoQuizRespondido } from '../../supabase/functions/_shared/dominio/index.ts'
import type { Comando } from '../../supabase/functions/_shared/dominio/index.ts'
import { admitir, ateD2, concluirD7, fazerCp1, fazerD7, MEMBROS, prepararContatos, Simulador } from './apoio.ts'

const SHA = 'a'.repeat(64)

describe('permissões por papel', () => {
  it('mapa de ações para a interface (nomes das ações de api/contrato.ts)', () => {
    const sim = new Simulador()
    const pc = sim.visao('concierge').permissoes
    expect(pc['checklist.responder:d7'].permitido).toBe(true)
    expect(pc['bloco.concluir:d7']).toMatchObject({ permitido: false })
    expect(pc['lente.plano'].permitido).toBe(true)
    expect(pc['lente.cp2']).toMatchObject({ permitido: false })
    expect(pc['episodio.suspender']).toMatchObject({ permitido: false })
    expect(pc['materiais.enviar'].permitido).toBe(true)
    expect(pc['anexo.url'].permitido).toBe(true)
    const pf = sim.visao('conferente').permissoes
    expect(pf['checklist.responder:d7'].permitido).toBe(false)
    expect(pf['anexo.url'].permitido).toBe(false)
    expect(pf['etiqueta.copiada'].permitido).toBe(true)
    const pr = sim.visao('cirurgiao').permissoes
    expect(pr['alerta.conduta'].permitido).toBe(true)
    expect(pr['episodio.suspender'].permitido).toBe(true)
    expect(pr['hardstop.resolver']).toMatchObject({ permitido: false, motivo: 'Nenhum hard stop de resolução escrita aberto.' })
    for (const k of ['episodio.agendar', 'checklist.responder', 'bloco.concluir', 'alerta.comunicar', 'contato.salvar', 'contato.remover', 'contato.confirmar', 'orientacoes.teach_back', 'lente.chegada', 'lente.time_out', 'lente.resolver_quarentena', 'lente.troca_d0', 'anexo.enviar', 'tcle.status', 'materiais.previa', 'intercorrencia.registrar', 'episodio.cancelar', 'avisos.atraso', 'quase_evento.registrar', 'etiquetas.gerar']) {
      expect(pr[k], k).toBeDefined()
    }
  })

  it('papel errado recebe SEM_PERMISSAO (por comando e por item)', () => {
    const sim = new Simulador()
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.diabetes, valor: 'nao' }] }).codigo).toBe('SEM_PERMISSAO')
    expect(sim.falha('conferente', { tipo: 'lente.plano', dados: { olho: 'OD', modelo: 'x', dioptria: 20, torica: false, cilindro: null, eixo: null } }).codigo).toBe('SEM_PERMISSAO')
    expect(sim.falha('circulante', { tipo: 'intercorrencia.registrar', descricao: 'x', neverEvent: 'invalido' as never }).codigo).toBe('VALIDACAO')
    expect(sim.falha('concierge', { tipo: 'intercorrencia.registrar', descricao: 'x' }).codigo).toBe('SEM_PERMISSAO')
    expect(sim.falha('gestora', { tipo: 'comando.inexistente' } as unknown as Comando).codigo).toBe('VALIDACAO')
  })

  it('o papel registrado no evento é o papel do ator usado', () => {
    const sim = new Simulador()
    const r = sim.executar('dupla', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.diabetes, valor: 'nao' }] })
    expect(r.eventos[0]).toMatchObject({ autorId: MEMBROS.dupla.id, autorPapel: 'concierge', sessaoUsuarioId: MEMBROS.dupla.id, aparelhoId: 'aparelho-teste' })
  })
})

describe('estado', () => {
  it('correção é novo evento: a resposta atual é a última e as correções são contadas', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.hipertensao, valor: 'nao' }] })
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.hipertensao, valor: 'sim' }] })
    sim.executar('concierge2', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.hipertensao, valor: 'sim', observacao: 'Confirmado com a receita.' }] })
    expect(sim.visao('concierge').respostas.d7?.[D7.hipertensao]).toMatchObject({ valor: 'sim', correcoes: 2, autorNome: 'Concierge Teste Dois', observacao: 'Confirmado com a receita.' })
    expect(sim.entrada.eventos.filter((e) => e.tipo === 'checklist.item_respondido')).toHaveLength(3)
  })

  it('decidir é puro: não altera o estado nem a entrada', () => {
    const sim = new Simulador()
    prepararContatos(sim)
    const est = sim.estado()
    const antes = JSON.stringify(sim.entrada)
    decidir(est, { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.diabetes, valor: 'nao' }] }, sim.ctx('concierge'))
    expect(JSON.stringify(sim.entrada)).toBe(antes)
    expect(est.estado).toBe('d7_em_andamento')
  })

  it('montarEstado aceita eventos fora de ordem (ordena por seq) e o estado só com eventos visíveis', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    const embaralhado = { ...sim.entrada, eventos: [...sim.entrada.eventos].reverse() }
    expect(montarEstado(embaralhado).estado).toBe('d7_concluido')
    fazerCp1(sim)
    expect(sim.estadoVisivel('circulante').estado).toBe('d7_concluido')
    expect(sim.visao('circulante').blocos.cp1.situacao).toBe('concluido')
  })

  it('agenda: data não muda depois da admissão; horário e ordem podem mudar no dia', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    expect(sim.falha('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-21' }).codigo).toBe('ESTADO')
    sim.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: '2026-10-20', ordem: 5 })
    expect(sim.visao('concierge').episodio).toMatchObject({ ordem: 5, horario: '07:30', dataCirurgia: '2026-10-20' })
    expect(sim.falha('concierge', { tipo: 'episodio.agendar', dataCirurgia: '20/10/2026' }).codigo).toBe('VALIDACAO')
  })

  it('TCLE: olho conferido só depois de assinado; link https', () => {
    const sim = new Simulador()
    expect(sim.falha('concierge', { tipo: 'tcle.status', status: 'olho_conferido' }).codigo).toBe('ORDEM')
    expect(sim.falha('concierge', { tipo: 'tcle.status', status: 'enviado', link: 'http://inseguro.invalid' }).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { tipo: 'tcle.status', status: 'enviado', link: 'https://assinatura-teste.invalid/abc' })
    sim.executar('conferente', { tipo: 'tcle.status', status: 'assinado' })
    const v = sim.visao('concierge')
    expect(v.tcle).toMatchObject({ status: 'assinado', link: 'https://assinatura-teste.invalid/abc' })
    expect(v.tcle.historico.map((h) => h.porNome)).toEqual(['Concierge Teste Um', 'Conferente Teste Um'])
  })

  it('foto do plano: só concierge, cirurgião e gestora veem o anexo', () => {
    const sim = new Simulador()
    expect(sim.falha('concierge', { tipo: 'anexo.adicionar', anexoId: 'anx-1', tipoAnexo: 'foto_plano', sha256: 'XYZ' }).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { tipo: 'anexo.adicionar', anexoId: 'anx-1', tipoAnexo: 'foto_plano', sha256: SHA })
    expect(sim.visao('concierge').lente.fotoPlanoAnexoId).toBe('anx-1')
    expect(sim.visao('conferente', true).lente.fotoPlanoAnexoId).toBeUndefined()
  })

  it('quase-evento manual e etiqueta copiada', () => {
    const sim = new Simulador()
    const r = sim.executar('circulante', { tipo: 'quase_evento.registrar', etapa: 'd0', descricao: 'Caixa de outro paciente na bancada (fictício).' })
    expect(r.eventos[0].dados).toMatchObject({ etapa: 'd0', automatico: false })
    expect(sim.falha('circulante', { tipo: 'etiqueta.copiada', etiqueta: 'pulseira' }).codigo).toBe('SEM_PERMISSAO')
    sim.executar('conferente', { tipo: 'etiqueta.copiada', etiqueta: 'pulseira' })
  })
})

describe('auxiliares da API', () => {
  it('prévia dos materiais: mostra o texto antes de enviar e os impedimentos, sem gravar', () => {
    const sim = new Simulador()
    const mat = [{ id: 'm', codigo: 'video', versao: 1, titulo: 'Vídeo (exemplo)', tipo: 'video' as const, url: null, conteudo: null, momento: 'd7' as const, publico: 'paciente' as const, ativo: true }]
    const p0 = previaMateriais(sim.estado(), mat, { ...sim.ctx('concierge') })
    expect(p0.impedimentos).toEqual(['WhatsApp do paciente não cadastrado, sem anuência ou não confirmado.'])
    expect(p0.modoEnvio).toBe('ensaio')
    prepararContatos(sim)
    const antes = sim.entrada.eventos.length
    const p1 = previaMateriais(sim.estado(), mat, { ...sim.ctx('concierge') })
    expect(p1.impedimentos).toEqual([])
    expect(p1.mensagens[0]).toMatchObject({ gatilho: 'tcle_envio', destinoMascarado: '(44) 9****-**62' })
    expect(p1.mensagens[0].texto).toContain('[link gerado no envio]')
    expect(sim.entrada.eventos.length).toBe(antes)
  })

  it('situação da página do paciente', () => {
    const sim = new Simulador()
    expect(situacaoPaginaPaciente(sim.estado())).toMatchObject({ primeiroNome: 'Paciente', tentativas: 0, podeResponder: true, ultimaTentativa: null })
    const t = corrigirQuiz({ 1: 'OE' }, 'OD')
    sim.gravar({ eventos: [eventoQuizRespondido({ episodioId: sim.entrada.episodio.id, pacienteId: sim.entrada.paciente.id, autorId: 'sistema', tentativa: t, erradas: [] })], lente: [], mensagens: [] })
    expect(situacaoPaginaPaciente(sim.estado())).toMatchObject({ tentativas: 1, podeResponder: false, proximaAcao: 'aguardar_contato_da_equipe', ultimaTentativa: { aprovado: false, em: sim.agora } })
  })
})

describe('correção do cadastro do paciente', () => {
  it('gera paciente.corrigido com valor anterior e motivo; exige papel e motivo', () => {
    const sim = new Simulador()
    const ev = corrigirPaciente({ paciente: sim.entrada.paciente, campo: 'nomeMae', valor: 'Mãe Teste Delta', motivo: 'Homônimo no dia: 3º identificador.' }, sim.ctx('concierge'))
    expect(ev).toMatchObject({ tipo: 'paciente.corrigido', episodioId: null, autorPapel: 'concierge', dados: { campo: 'nomeMae', valorAnterior: null, valor: 'Mãe Teste Delta' } })
    expect(() => corrigirPaciente({ paciente: sim.entrada.paciente, campo: 'nomeMae', valor: 'x', motivo: '' }, sim.ctx('concierge'))).toThrowError(/Motivo/)
    expect(() => corrigirPaciente({ paciente: sim.entrada.paciente, campo: 'prontuario', valor: 'P2', motivo: 'm' }, sim.ctx('enfermagem'))).toThrowError(/permissão/)
    expect(() => corrigirPaciente({ paciente: sim.entrada.paciente, campo: 'dataNascimento', valor: '2099-01-01', motivo: 'm' }, sim.ctx('gestora'))).toThrowError(/nascimento/)
  })
})
