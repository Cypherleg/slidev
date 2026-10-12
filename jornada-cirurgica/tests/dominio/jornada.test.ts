// Episódio fictício percorre o D-7 inteiro, o D-2 e o D0 até a alta (critérios de aceite das fases 1, 2 e 3),
// e a sequência completa de avisos é gerada em modo ensaio (fase 4).
import { describe, expect, it } from 'vitest'
import { AN, D7, SO, textoAviso } from '../../supabase/functions/_shared/dominio/index.ts'
import {
  admitir,
  ateD2,
  concluirD7,
  D0_INSTANTE,
  fazerCp1,
  fazerD7,
  jornadaCompleta,
  MEMBROS,
  preencherBloco,
  prepararContatos,
  signIn,
  signOutEAlta,
  Simulador,
  timeOut,
} from './apoio.ts'

const MATERIAIS = [
  { id: 'mat-1', codigo: 'video_preparo', versao: 1, titulo: 'Vídeo de preparo (exemplo)', tipo: 'video' as const, url: 'https://exemplo.invalid/video', conteudo: null, momento: 'd7' as const, publico: 'paciente' as const, ativo: true },
  { id: 'mat-2', codigo: 'link_tcle', versao: 1, titulo: 'Termo de consentimento', tipo: 'link_tcle' as const, url: null, conteudo: null, momento: 'd7' as const, publico: 'paciente' as const, ativo: true },
]

describe('D-7 inteiro', () => {
  it('abre o episódio, coleta o checklist A–G, envia materiais e conclui', () => {
    const sim = new Simulador()
    expect(sim.estadoEpisodio).toBe('d7_em_andamento')
    prepararContatos(sim)
    preencherBloco(sim, 'd7', { pular: [D7.materiais] })
    sim.executar('concierge', { tipo: 'orientacoes.teach_back', resultado: 'adequado_primeira' })
    // "Enviados" só depois do envio registrado pelo painel.
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.materiais, valor: 'enviados' }] }).codigo).toBe('ORDEM')
    const r = sim.executar('concierge', { tipo: 'materiais.enviar', tokenLink: 'token-de-teste-1234567890', expiraEm: '2026-11-30T00:00:00.000Z', materiais: MATERIAIS })
    expect(r.mensagens).toHaveLength(1)
    expect(r.mensagens[0]).toMatchObject({ gatilho: 'tcle_envio', estadoInicial: 'ensaio', contatoId: 'contato-whats' })
    expect(r.mensagens[0].texto).toBe(
      'Olá, Paciente. Aqui é a Concierge, do hospital OFTA VITTA. Segue o vídeo que explica o termo de consentimento da sua cirurgia de catarata do olho direito. Depois de assistir, abra o link para ler e assinar pelo celular: https://pagina-teste.invalid/p/token-de-teste-1234567890. Se tiver qualquer dúvida sobre a cirurgia, não assine ainda e me avise. O Dr. Cirurgião Teste Um esclarece antes.',
    )
    expect(r.eventos.map((e) => e.tipo)).toEqual(['link_paciente.criado', 'material.enviado', 'mensagem.enfileirada'])
    expect(JSON.stringify(r.eventos)).not.toContain('token-de-teste')
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.materiais, valor: 'enviados' }] })
    concluirD7(sim)
    const v = sim.visao('concierge')
    expect(v.episodio.estado).toBe('d7_concluido')
    expect(v.blocos.d7).toMatchObject({ situacao: 'concluido', faltam: [], concluido: { porNome: 'Concierge Teste Um', foraDeHora: false } })
    expect(v.materiais.enviados.map((m) => m.titulo)).toEqual(['Vídeo de preparo (exemplo)', 'Termo de consentimento'])
    // Todo evento tem autor, papel, sessão e aparelho; checklist guarda a versão do modelo.
    for (const e of sim.entrada.eventos) {
      expect(e.autorId).toBeTruthy()
      expect(e.autorPapel).toBeTruthy()
      expect(e.aparelhoId).toBe('aparelho-teste')
      if (e.tipo === 'checklist.item_respondido') expect(e.versaoModelo).toBe('pop-0.4/1')
    }
  })

  it('"nenhum campo fica em branco": o D-7 não conclui com item exigido sem resposta', () => {
    const sim = new Simulador()
    prepararContatos(sim)
    preencherBloco(sim, 'd7', { pular: [D7.atividade, D7.cidadeTransporte] })
    sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] })
    const e = sim.falha('concierge', { tipo: 'bloco.concluir', modelo: 'd7' })
    expect(e.codigo).toBe('VALIDACAO')
    expect(sim.visao('concierge').blocos.d7.faltam.sort()).toEqual([D7.atividade, D7.cidadeTransporte].sort())
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.atividade, valor: '   ' }] }).codigo).toBe('VALIDACAO')
  })

  it('o D-7 só conclui com todos os ALERTAS comunicados; conduta pode vir depois', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.refrativa]: 'sim' })
    expect(sim.falha('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] }).codigo).toBe('ORDEM')
    sim.executar('concierge', { tipo: 'alerta.comunicar', alertaId: `d7:${D7.refrativa}`, via: 'whatsapp', cirurgiaoId: MEMBROS.cirurgiao.id, observacao: 'Enviado ao cirurgião.' })
    concluirD7(sim)
    const v = sim.visao('cirurgiao')
    expect(v.episodio.estado).toBe('d7_concluido')
    const a = v.alertas.find((x) => x.id === `d7:${D7.refrativa}`)!
    expect(a.comunicado).toMatchObject({ porNome: 'Concierge Teste Um', via: 'whatsapp', cirurgiaoId: MEMBROS.cirurgiao.id })
    expect(a.conduta).toBeUndefined()
    expect(v.pendencias.some((p) => p.codigo === `alerta.sem_conduta:d7:${D7.refrativa}` && p.responsavel.includes('cirurgiao'))).toBe(true)
  })

  it('materiais.enviar exige WhatsApp do paciente com anuência e confirmado', () => {
    const sim = new Simulador()
    sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'w', tipo: 'whatsapp_paciente', nome: 'Paciente Teste Alfa', telefone: '(44) 99999-1262', anuenciaPaciente: true } })
    expect(sim.falha('concierge', { tipo: 'materiais.enviar', tokenLink: 'token-de-teste-1234567890', expiraEm: '2026-11-30T00:00:00.000Z', materiais: MATERIAIS }).codigo).toBe('VALIDACAO')
    sim.executar('concierge', { tipo: 'contato.confirmar', contatoId: 'w' })
    sim.executar('concierge', { tipo: 'materiais.enviar', tokenLink: 'token-de-teste-1234567890', expiraEm: '2026-11-30T00:00:00.000Z', materiais: MATERIAIS })
    // Trocar o número desfaz a confirmação.
    sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'w', tipo: 'whatsapp_paciente', nome: 'Paciente Teste Alfa', telefone: '(44) 99999-0000', anuenciaPaciente: true } })
    expect(sim.visao('concierge').contatos.find((c) => c.id === 'w')?.confirmadoEm).toBeNull()
  })
})

describe('D-2', () => {
  it('conclui com D-7 concluído e checkpoint 2 sem divergência', () => {
    const sim = new Simulador()
    fazerD7(sim)
    concluirD7(sim)
    preencherBloco(sim, 'd2', { preferida: 'conferente' })
    expect(sim.falha('conferente', { tipo: 'bloco.concluir', modelo: 'd2' }).codigo).toBe('VALIDACAO')
    fazerCp1(sim)
    const sim2 = new Simulador()
    ateD2(sim2)
    expect(sim2.estadoEpisodio).toBe('d2_concluido')
  })
  it('itens do D-2 antes do D-7 concluído: ordem', () => {
    const sim = new Simulador()
    expect(sim.falha('conferente', { tipo: 'checklist.responder', modelo: 'd2', respostas: [{ itemId: 'D2.presenca', valor: 'sim' }] }).codigo).toBe('ORDEM')
  })
})

describe('D0 até a alta', () => {
  it('estados em ordem; cp1, cp2 e anestesia não mudam o estado', () => {
    const sim = new Simulador()
    ateD2(sim)
    expect(sim.estadoEpisodio).toBe('d2_concluido')
    admitir(sim)
    expect(sim.estadoEpisodio).toBe('admitido')
    signIn(sim)
    expect(sim.estadoEpisodio).toBe('sign_in_concluido')
    timeOut(sim)
    expect(sim.estadoEpisodio).toBe('time_out_concluido')
    preencherBloco(sim, 'sign_out', { preferida: 'circulante' })
    sim.executar('circulante', { tipo: 'bloco.concluir', modelo: 'sign_out' })
    expect(sim.estadoEpisodio).toBe('sign_out_concluido')
    preencherBloco(sim, 'alta', { preferida: 'enfermagem' })
    // Alta exige anestesia concluída (liberação da recuperação).
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'alta' }).codigo).toBe('VALIDACAO')
    sim.executar('anestesista', { tipo: 'checklist.responder', modelo: 'anestesia', respostas: [{ itemId: AN.liberacao, valor: true }] })
    sim.executar('anestesista', { tipo: 'bloco.concluir', modelo: 'anestesia' })
    expect(sim.estadoEpisodio).toBe('sign_out_concluido')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'alta' })
    expect(sim.estadoEpisodio).toBe('alta')
    const v = sim.visao('gestora', true)
    for (const m of ['d7', 'cp1', 'cp2', 'd2', 'admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta'] as const) expect(v.blocos[m].situacao).toBe('concluido')
    expect(v.blocos.sign_in.concluido).toMatchObject({ leitorNome: 'Enfermeira Teste Um', confirmadorNome: 'Circulante Teste Um' })
    expect(v.blocos.time_out.concluido).toMatchObject({ leitorNome: 'Circulante Teste Um', confirmadorNome: 'Cirurgião Teste Um' })
    expect(v.hardStops).toEqual([])
    expect(v.lente.etapa).toBe('time_out_confere')
  })

  it('Sign In e Time Out exigem leitor e confirmador distintos (Time Out: confirmador cirurgião)', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    preencherBloco(sim, 'sign_in', { preferida: 'enfermagem' })
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'sign_in' }).codigo).toBe('VALIDACAO')
    expect(sim.falha('enfermagem', { tipo: 'bloco.concluir', modelo: 'sign_in', leitorId: MEMBROS.enfermagem.id, confirmadorId: MEMBROS.enfermagem.id }).codigo).toBe('VALIDACAO')
    sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'sign_in', leitorId: MEMBROS.enfermagem.id, confirmadorId: MEMBROS.circulante.id })
    preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
    sim.executar('circulante', { tipo: 'lente.time_out', leitura: { modelo: 'Lente Teste ZX-100', dioptria: 21.5, cilindro: null, eixo: null } })
    preencherBloco(sim, 'time_out', { preferida: 'circulante' })
    sim.executar('cirurgiao', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: 'C.read_back', valor: true }] })
    expect(sim.falha('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.enfermagem.id }).codigo).toBe('VALIDACAO')
    sim.executar('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.cirurgiao2.id })
    expect(sim.estadoEpisodio).toBe('time_out_concluido')
  })

  it('suspensão e cancelamento: só cirurgião ou gestora, com causa; o episódio para', () => {
    const sim = new Simulador()
    ateD2(sim)
    sim.agora = D0_INSTANTE
    expect(sim.falha('enfermagem', { tipo: 'episodio.suspender', motivo: 'x', causa: 'sem_acompanhante', evitavel: null }).codigo).toBe('SEM_PERMISSAO')
    expect(sim.falha('cirurgiao', { tipo: 'episodio.suspender', motivo: 'Sem acompanhante.', causa: null, evitavel: null }).codigo).toBe('VALIDACAO')
    const r = sim.executar('cirurgiao', { tipo: 'episodio.suspender', motivo: 'Ninguém virá acompanhar.', causa: 'sem_acompanhante', evitavel: null })
    expect(r.eventos[0].dados).toMatchObject({ causa: 'sem_acompanhante', evitavel: true })
    expect(sim.estadoEpisodio).toBe('suspenso')
    expect(sim.falha('enfermagem', { tipo: 'checklist.responder', modelo: 'admissao', respostas: [{ itemId: 'A.pa', valor: '12x8' }] }).codigo).toBe('ESTADO')
    sim.executar('gestora', { tipo: 'episodio.cancelar', motivo: 'Reagendamento como novo episódio.', causa: 'sem_acompanhante', evitavel: true })
    expect(sim.estadoEpisodio).toBe('cancelado')
  })
})

describe('avisos à família (fase 4)', () => {
  it('em ensaio, a sequência completa é gerada sem envio real, com os textos exatos e sem olho', () => {
    const sim = new Simulador()
    jornadaCompleta(sim)
    const avisos = sim.entrada.mensagens.filter((m) => m.gatilho !== 'tcle_envio')
    expect(avisos.map((m) => m.gatilho)).toEqual(['admissao_concluida', 'admissao_concluida', 'inicio_cirurgia', 'inicio_cirurgia', 'fim_cirurgia', 'fim_cirurgia', 'alta', 'alta'])
    expect(avisos.every((m) => m.estado === 'ensaio')).toBe(true)
    expect(new Set(avisos.map((m) => m.contatoId))).toEqual(new Set(['contato-familia', 'contato-whats']))
    const textos = [...new Set(avisos.map((m) => m.texto))]
    expect(textos).toEqual([
      'Olá. Paciente já está com a equipe do OFTA VITTA, em preparo para a cirurgia. Avisaremos quando começar.',
      'A cirurgia de Paciente começou às 07:00. Avisaremos quando terminar.',
      'A cirurgia de Paciente terminou às 07:00. Agora é a recuperação. A equipe chama o acompanhante para as orientações.',
      'Paciente recebeu alta. As orientações e os telefones estão na folha entregue ao acompanhante.',
    ])
    for (const t of textos) expect(t).not.toMatch(/olho|direito|esquerdo|LIO|catarata/i)
    expect(avisos.every((m) => m.destinoMascarado.includes('*'))).toBe(true)
    // Registro de cada mensagem enfileirada no histórico de eventos.
    expect(sim.entrada.eventos.filter((e) => e.tipo === 'mensagem.enfileirada')).toHaveLength(8)
  })

  it('com tempos configurados, a previsão entra no texto; envio habilitado gera mensagens pendentes', () => {
    const sim = new Simulador({ envioHabilitado: true, config: { temposEtapa: { admissao_ate_inicio: 40, duracao_cirurgia: 25, recuperacao_ate_alta: 60 } } })
    ateD2(sim)
    admitir(sim)
    const adm = sim.entrada.mensagens.filter((m) => m.gatilho === 'admissao_concluida')
    expect(adm[0].texto).toBe('Olá. Paciente já está com a equipe do OFTA VITTA, em preparo para a cirurgia. Previsão para o início: cerca de 40 minutos. Avisaremos quando começar.')
    expect(adm.every((m) => m.estado === 'pendente')).toBe(true)
    signIn(sim)
    timeOut(sim)
    expect(sim.entrada.mensagens.find((m) => m.gatilho === 'inicio_cirurgia')?.texto).toBe('A cirurgia de Paciente começou às 07:00. Duração prevista: cerca de 25 minutos. Avisaremos quando terminar.')
    signOutEAlta(sim)
    expect(sim.entrada.mensagens.find((m) => m.gatilho === 'fim_cirurgia')?.texto).toBe(
      'A cirurgia de Paciente terminou às 07:00. Agora é a recuperação, com alta prevista em cerca de 60 minutos. A equipe chama o acompanhante para as orientações.',
    )
  })

  it('com intercorrência registrada, nenhuma mensagem é gerada e os avisos ficam suspensos', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    signIn(sim)
    sim.executar('cirurgiao', { tipo: 'intercorrencia.registrar', descricao: 'Intercorrência fictícia de teste.' })
    const antes = sim.entrada.mensagens.length
    timeOut(sim)
    signOutEAlta(sim, { [SO.intercorrencias]: 'registradas' })
    expect(sim.estadoEpisodio).toBe('alta')
    expect(sim.entrada.mensagens.length).toBe(antes)
    const v = sim.visao('enfermagem')
    expect(v.avisosFamilia.suspensos).toBe(true)
    expect(v.avisosFamilia.motivoSuspensao).toContain('cirurgião')
    expect(v.permissoes['avisos.atraso'].permitido).toBe(false)
  })

  it('atraso: só por ação de uma pessoa; sem minutos, sem previsão; idempotência por ocorrência', () => {
    const sim = new Simulador()
    ateD2(sim)
    admitir(sim)
    const r1 = sim.executar('enfermagem', { tipo: 'avisos.atraso', minutos: 30 })
    expect(r1.mensagens[0].texto).toBe('A cirurgia de Paciente ainda não começou. Nova previsão: cerca de 30 minutos. Agradecemos a paciência.')
    const r2 = sim.executar('enfermagem', { tipo: 'avisos.atraso', minutos: null })
    expect(r2.mensagens[0].texto).toBe('A cirurgia de Paciente ainda não começou. Agradecemos a paciência.')
    const chaves = [...r1.mensagens, ...r2.mensagens].map((m) => m.chaveIdempotencia)
    expect(new Set(chaves).size).toBe(4)
    expect(chaves[0]).toBe(`jc1:${sim.entrada.episodio.id}:atraso:contato-familia:1`)
    expect(sim.falha('concierge', { tipo: 'avisos.atraso', minutos: -5 }).codigo).toBe('VALIDACAO')
  })

  it('contato sem anuência ou não confirmado não recebe aviso', () => {
    const sim2 = new Simulador()
    ateD2(sim2)
    sim2.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'contato-familia', tipo: 'familiar_avisos', nome: 'Familiar Teste Gama', telefone: '(44) 98888-3344', anuenciaPaciente: false } })
    admitir(sim2)
    expect(sim2.entrada.mensagens.filter((m) => m.gatilho === 'admissao_concluida').map((m) => m.contatoId)).toEqual(['contato-whats'])
  })

  it('textoAviso: conteúdo mínimo (primeiro nome, etapa, horário, previsão)', () => {
    expect(textoAviso('alta', { primeiroNome: 'Paciente' }).modeloMeta).toBe('jornada_alta_v1')
    expect(textoAviso('admissao_concluida', { primeiroNome: 'Paciente' }).modeloMeta).toBe('jornada_admissao_sem_previsao_v1')
  })
})
