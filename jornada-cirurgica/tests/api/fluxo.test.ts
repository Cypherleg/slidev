// Ponta a ponta pela API (handler → domínio → banco real): D-7, troca por PIN, conflito de versão,
// conferência cega, quarentena, hard stop, avisos em modo ensaio, intercorrência e página do paciente.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CP1, SO } from '../../supabase/functions/_shared/dominio/modelos/ids.ts'
import { ATOR_SISTEMA_ID, processarFila, restaurarToken } from '../../supabase/functions/_shared/api/index.ts'
import type { AcaoEquipe } from '../../supabase/functions/_shared/api/contrato.ts'
import { dataLocal, lenteFicticia, roteiro } from '../../dev/roteiro.ts'
import { bancoPronto, cpfTeste, criarAmbiente, despejoBanco, dominioPronto, ORIGEM, roteiroTeste, U, type Ambiente } from './apoio.ts'

const HOJE = dataLocal(0)
const AMANHA = dataLocal(1)

describe.skipIf(!bancoPronto || !dominioPronto)('fluxo pela API (banco real)', () => {
  let amb: Ambiente
  let r: ReturnType<typeof roteiroTeste>
  let n = 100
  const paciente = (nome: string, mae: string | null = null) => r.cadastrar({ nome, nascimento: '1951-01-0' + ((n % 9) + 1), cpf: cpfTeste(n++), prontuario: `T-${n}`, mae })

  beforeAll(async () => {
    amb = await criarAmbiente()
    r = roteiroTeste(amb)
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('D-7 completo: estado, eventos com autor e sessão, projeção e acessos', async () => {
    const pid = await paciente('Paciente Teste Fluxo Um')
    const id = await r.abrir(pid, 'OD', AMANHA)
    await r.d7(id, { dataCirurgia: AMANHA, dioptria: 21.5 })
    const v = await r.obter(id)
    expect(v.episodio.estado).toBe('d7_concluido')
    expect(v.blocos.d7.situacao).toBe('concluido')
    expect(v.episodio.olhoExtenso).toBe('OLHO DIREITO')

    const eventos = await amb.banco.sql`select seq, tipo, autor_id, autor_papel, sessao_usuario_id, aparelho_id from jornada_cirurgica.eventos where episodio_id = ${id} order by seq`
    expect(eventos.map(e => e.seq)).toEqual(eventos.map((_, i) => i + 1)) // seq contínuo
    expect(eventos.every(e => e.autor_id === U.concierge.id && e.sessao_usuario_id === U.concierge.id && e.aparelho_id)).toBe(true)
    const [ep] = await amb.banco.sql`select estado, versao, resumo, data_cirurgia::text as data from jornada_cirurgica.episodios where id = ${id}`
    expect(ep.estado).toBe('d7_concluido')
    expect(ep.versao).toBe(eventos.length)
    expect(ep.data).toBe(AMANHA)
    expect(ep.resumo).toMatchObject({ episodioId: id, estado: 'd7_concluido' })
    const acessos = await amb.banco.sql`select recurso from jornada_cirurgica.acessos where episodio_id = ${id} and ator_id = ${U.concierge.id}`
    expect(acessos.some(a => a.recurso === 'episodio')).toBe(true)
  })

  it('troca por PIN: autor = ator; sessão = quem fez o login', async () => {
    const pid = await paciente('Paciente Teste Fluxo Pin')
    const id = await r.abrir(pid, 'OE', AMANHA)
    const token = await amb.pin(U.enfermagem, U.concierge)
    const v = await r.obter(id)
    await amb.ok(U.enfermagem, 'orientacoes.teach_back', { episodioId: id, versao: v.episodio.versao, resultado: 'adequado_primeira', observacao: null }, { ator: token })
    const [ev] = await amb.banco.sql`select autor_id, autor_papel, sessao_usuario_id from jornada_cirurgica.eventos where episodio_id = ${id} and tipo = 'orientacoes.teach_back'`
    expect(ev).toEqual({ autor_id: U.concierge.id, autor_papel: 'concierge', sessao_usuario_id: U.enfermagem.id })
    // Confirmação por PIN inválida (outro aparelho ou adulterada) é recusada antes do domínio.
    const outroAparelho = await amb.pin(U.enfermagem, U.circulante, 'aparelho-teste-0002')
    const v1 = await r.obter(id)
    for (const confirmadorToken of [outroAparelho, 'at1.x.y']) {
      const resp = await amb.chamar(U.enfermagem, 'bloco.concluir', { episodioId: id, versao: v1.episodio.versao, modelo: 'd7', leitorId: U.enfermagem.id, confirmadorToken })
      expect(resp.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { campo: 'confirmadorToken' } } })
    }
    // Sem o PIN, a enfermagem não pode o que é da concierge (domínio + RLS).
    const v2 = await r.obter(id)
    const semPin = await amb.chamar(U.enfermagem, 'lente.plano', { episodioId: id, versao: v2.episodio.versao, dados: { ...lenteFicticia('OE', 20), reserva: null, alvoRefrativo: null, dataPedido: null } })
    expect(semPin.status).toBe(403)
  })

  it('conflito de versão: duas gravações com a mesma versão → a segunda recebe 409', async () => {
    const pid = await paciente('Paciente Teste Fluxo Versao')
    const id = await r.abrir(pid, 'OD', AMANHA)
    const v = await r.obter(id)
    const a = amb.chamar(U.concierge, 'tcle.status', { episodioId: id, versao: v.episodio.versao, status: 'enviado', link: null })
    const b = amb.chamar(U.concierge, 'orientacoes.teach_back', { episodioId: id, versao: v.episodio.versao, resultado: 'adequado_primeira', observacao: null })
    const [ra, rb] = await Promise.all([a, b])
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    const perdedor = ra.status === 409 ? ra : rb
    expect(perdedor.corpo).toMatchObject({ ok: false, erro: { codigo: 'conflito_versao' } })
    const velho = await amb.chamar(U.concierge, 'tcle.status', { episodioId: id, versao: v.episodio.versao, status: 'enviado', link: null })
    expect(velho.status).toBe(409)
  })

  describe('lente: conferência cega', () => {
    const PLANTADO = { modelo: 'LIO Plantada ZK917', dioptria: 23.75, lote: 'LOTE-PLANTADO-77', reserva: 24.25 }
    // Números como valor; horário ISO ("…:23.751Z") não conta: depois dos centésimos vem dígito.
    const proibidos: (string | RegExp)[] = ['ZK917', 'LOTE-PLANTADO-77', /(?<!\d)23[.,]75(?!\d)/, /(?<!\d)24[.,]25(?!\d)/]
    const semProibidos = (texto: string, lista = proibidos) => {
      for (const p of lista) typeof p === 'string' ? expect(texto).not.toContain(p) : expect(texto).not.toMatch(p)
    }
    let id: string

    beforeAll(async () => {
      const pid = await paciente('Paciente Teste Cega')
      id = await r.abrir(pid, 'OE', HOJE)
      await r.com(id, U.concierge, 'episodio.agendar', { dataCirurgia: HOJE, horario: '07:00', ordem: 1 })
      await r.contatos(id)
      await r.com(id, U.concierge, 'orientacoes.teach_back', { resultado: 'adequado_primeira', observacao: null })
      await r.com(id, U.concierge, 'lente.plano', {
        dados: { olho: 'OE', modelo: PLANTADO.modelo, dioptria: PLANTADO.dioptria, torica: false, cilindro: null, eixo: null, reserva: { modelo: PLANTADO.modelo, dioptria: PLANTADO.reserva }, alvoRefrativo: -0.5, dataPedido: dataLocal(-3) },
      })
      // Foto do plano (mostra os valores): PNG mínimo fictício.
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')
      await r.com(id, U.concierge, 'anexo.enviar', { tipo: 'foto_plano', contentType: 'image/png', base64: png })
      await r.com(id, U.concierge, 'tcle.status', { status: 'enviado', link: 'https://exemplo.invalid/tcle' })
      await r.com(id, U.concierge, 'materiais.enviar', {})
      await r.responder(id, 'd7', U.concierge)
      await r.concluir(id, 'd7', U.concierge)
      await r.com(id, U.concierge, 'lente.chegada', { dados: { dataChegada: dataLocal(-1), lote: PLANTADO.lote, validade: '2030-12' } })
      await r.responder(id, 'cp1', U.concierge)
      await r.concluir(id, 'cp1', U.concierge)
    })

    it('a concierge vê o plano (e a leitura fica registrada)', async () => {
      const v = await r.obter(id, U.concierge)
      expect(JSON.stringify(v)).toContain('ZK917')
      expect(JSON.stringify(v)).toMatch(proibidos[2] as RegExp) // controle positivo: a busca acharia o valor
      const [a] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where episodio_id = ${id} and ator_id = ${U.concierge.id} and recurso = 'lente_conferencia_1'`
      expect(a.n).toBeGreaterThan(0)
    })

    it('a segunda conferente chama TODAS as ações de leitura e nenhuma resposta traz os valores do checkpoint 1', async () => {
      const v = await r.obter(id, U.conferente)
      const anexoId = (
        await amb.banco.sql`select id from jornada_cirurgica.anexos where episodio_id = ${id}`
      )[0].id as string
      const leituras: [AcaoEquipe, Record<string, unknown>][] = [
        ['sessao', {}],
        ['membros.ativos', {}],
        ['episodio.obter', { episodioId: id }],
        ['etiquetas.gerar', { episodioId: id }],
        ['anexo.url', { episodioId: id, anexoId }],
        ['materiais.previa', { episodioId: id }],
        ['dia.lista', { data: HOJE }],
        ['dia.visao_leitura', { data: HOJE }],
        ['episodios.buscar', { termo: 'Cega' }],
        ['episodios.buscar', {}],
        ['pendencias.listar', { data: HOJE }],
        ['pendencias.listar', {}],
        ['resumo.vespera', { data: HOJE }],
        ['indicadores.calcular', { de: dataLocal(-30), ate: dataLocal(30) }],
        ['mensagens.listar', { episodioId: id }],
        ['mensagens.listar', { data: HOJE }],
        ['alertas.abertos', {}],
        ['modelos.listar', {}],
        ['modelos.obter', { id: 'cp2' }],
        ['materiais.listar', {}],
        ['config.obter', {}],
      ]
      const respostas: string[] = [JSON.stringify(v)]
      for (const [acao, dados] of leituras) {
        const resp = await amb.chamar(U.conferente, acao, dados as never)
        respostas.push(JSON.stringify(resp.corpo))
        if (acao === 'anexo.url') expect(resp.status).toBe(404)
      }
      for (const texto of respostas) semProibidos(texto)
      const vistos = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where ator_id = ${U.conferente.id} and recurso = 'lente_conferencia_1'`
      expect(vistos[0].n).toBe(0)
      expect(v.lente.plano).toBeUndefined()
      expect(v.lente.chegada).toBeUndefined()
      expect(v.respostas.cp1 ?? {}).toEqual({})
    })

    it('quem registrou ou leu o checkpoint 1 é recusado no checkpoint 2', async () => {
      // U.dupla é concierge e conferente: lê o episódio (vê o plano) e tenta o checkpoint 2.
      await r.obter(id, U.dupla)
      const v = await r.obter(id, U.dupla)
      const tenta = await amb.chamar(U.dupla, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: lenteFicticia('OE', PLANTADO.dioptria) })
      expect(tenta.status).toBe(403)
      expect(tenta.corpo).toMatchObject({ ok: false, erro: { codigo: 'conferencia_cega' } })
      // A autora do checkpoint 1 (concierge pura) também não faz o checkpoint 2.
      const autora = await amb.chamar(U.concierge, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: lenteFicticia('OE', PLANTADO.dioptria) })
      expect(autora.status).toBe(403)
    })

    it('a segunda conferente digita sem ver; valores iguais conferem; a resposta não traz o lote nem a reserva', async () => {
      const v = await r.obter(id, U.conferente)
      const depois = await amb.ok(U.conferente, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: { olho: 'OE', modelo: PLANTADO.modelo, dioptria: PLANTADO.dioptria, torica: false, cilindro: null, eixo: null } })
      expect(depois.lente.etapa).not.toBe('quarentena')
      semProibidos(JSON.stringify(depois), ['LOTE-PLANTADO-77', /(?<!\d)24[.,]25(?!\d)/])
    })
  })

  it('a autora do checkpoint 1 (com papel de conferente) é recusada no checkpoint 2', async () => {
    const pid = await paciente('Paciente Teste Autora')
    const id = await r.abrir(pid, 'OD', AMANHA)
    await r.d7(id, { dataCirurgia: AMANHA, dioptria: 22.5 })
    // U.dupla (concierge e conferente) registra a chegada e conclui o checkpoint 1.
    const rDupla = roteiro((quem, acao, dados, ator) => amb.ok(quem as never, acao, dados, { ator }), { ...U, concierge: U.dupla }, (s, a) => amb.pin(s as never, a as never))
    await rDupla.cp1(id)
    const v = await r.obter(id, U.dupla)
    const tenta = await amb.chamar(U.dupla, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: lenteFicticia('OD', 22.5) })
    expect(tenta.status).toBe(403)
    expect(tenta.corpo).toMatchObject({ ok: false, erro: { codigo: 'conferencia_cega' } })
    // Outra conferente faz o checkpoint 2 normalmente.
    const ok = await r.cp2(id, 22.5, U.conferente2)
    expect(ok.lente.etapa).not.toBe('quarentena')
  })

  it('divergência plantada no checkpoint 2 → quarentena, hard stop e bloqueio até a resolução do cirurgião', async () => {
    const pid = await paciente('Paciente Teste Quarentena')
    const id = await r.abrir(pid, 'OD', AMANHA)
    await r.d7(id, { dataCirurgia: AMANHA, dioptria: 22.0 })
    await r.cp1(id)
    const q = await r.cp2(id, 22.5)
    expect(q.lente.etapa).toBe('quarentena')
    const vc = await r.obter(id, U.cirurgiao)
    expect(vc.hardStops.map(h => h.codigo)).toContain('HS1_DIVERGENCIA_LIO')
    // Nada adiante: nem marcar nem concluir o checkpoint 2, nem o D-2.
    const v = await r.obter(id, U.conferente)
    for (const modelo of ['cp2', 'd2'] as const) {
      const bloq = await amb.chamar(U.conferente, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo })
      expect(bloq.status).toBe(409)
      expect(['hard_stop', 'ordem']).toContain(bloq.corpo.ok ? '' : bloq.corpo.erro.codigo)
    }
    const marcar = await amb.chamar(U.conferente, 'checklist.responder', { episodioId: id, versao: v.episodio.versao, modelo: 'cp2', respostas: [{ itemId: 'CP2.biometria_original', valor: 'sim' }] })
    expect(marcar.status).toBe(409)
    // Ninguém além do cirurgião resolve.
    const naoCir = await amb.chamar(U.concierge, 'lente.resolver_quarentena', { episodioId: id, versao: v.episodio.versao, resolucao: 'tentativa', acao: 'manter_plano' })
    expect(naoCir.status).toBe(403)
    const res = await r.com(id, U.cirurgiao, 'lente.resolver_quarentena', { resolucao: 'Conferido com a biometria original: novo plano necessário (fictício).', acao: 'novo_plano' })
    expect(res.lente.quarentena?.aberta ?? false).toBe(false)
  })

  it('hard stop impede bloco.concluir (biometria original ausente no checkpoint 1)', async () => {
    const pid = await paciente('Paciente Teste Hardstop')
    const id = await r.abrir(pid, 'OE', AMANHA)
    await r.d7(id, { dataCirurgia: AMANHA, dioptria: 20.5 })
    await r.com(id, U.concierge, 'lente.chegada', { dados: { dataChegada: dataLocal(-1), lote: 'LOTE-T-2', validade: '2030-12' } })
    await r.responder(id, 'cp1', U.concierge, { [CP1.biometria]: 'nao' })
    const v = await r.obter(id)
    expect(v.hardStops.map(h => h.codigo)).toContain('HS2_BIOMETRIA_AUSENTE')
    const tenta = await amb.chamar(U.concierge, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo: 'cp1' })
    expect(tenta.status).toBe(409)
    expect(tenta.corpo).toMatchObject({ ok: false, erro: { codigo: 'hard_stop' } })
    expect(JSON.stringify(tenta.corpo)).toContain('HS2')
    // Corrigido o registro (biometria reimpressa), o bloco conclui.
    await r.responder(id, 'cp1', U.concierge, { [CP1.biometria]: 'sim' }, item => item === CP1.biometria)
    const ok = await r.concluir(id, 'cp1', U.concierge)
    expect(ok.blocos.cp1.situacao).toBe('concluido')
  })

  it('modo ensaio: a sequência completa de avisos é gerada e nada sai', async () => {
    const pid = await paciente('Paciente Teste Ensaio')
    const id = await r.abrir(pid, 'OD', HOJE)
    await r.d7(id, { dataCirurgia: HOJE, ordem: 5, dioptria: 21.0 })
    await r.cp1(id)
    await r.cp2(id, 21.0)
    await r.d2(id)
    await r.admissao(id)
    await r.signIn(id)
    await r.anestesia(id)
    await r.timeOut(id)
    await r.signOut(id)
    await r.liberacaoAnestesia(id)
    const fim = await r.alta(id)
    expect(fim.episodio.estado).toBe('alta')
    const msgs = await amb.banco.sql`select gatilho, estado, telefone, texto from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`
    const gatilhos = new Set(msgs.map(m => m.gatilho))
    for (const g of ['admissao_concluida', 'inicio_cirurgia', 'fim_cirurgia', 'alta']) expect(gatilhos).toContain(g)
    expect(msgs.every(m => m.estado === 'ensaio')).toBe(true)
    // Conteúdo mínimo: sem olho.
    for (const m of msgs.filter(x => ['admissao_concluida', 'inicio_cirurgia', 'fim_cirurgia', 'alta'].includes(x.gatilho as string))) {
      expect(String(m.texto)).not.toMatch(/OLHO|olho direito|olho esquerdo/i)
    }
    const lista = await amb.ok(U.enfermagem, 'mensagens.listar', { episodioId: id })
    expect(JSON.stringify(lista)).not.toContain('00900000013') // telefone completo nunca na lista
    const fila = await processarFila({ db: amb.db, config: amb.config, meta: { enviar: () => Promise.reject(new Error('não deveria enviar')) }, logger: amb.logger })
    expect(fila).toMatchObject({ modo: 'ensaio', reivindicadas: 0, enviadas: 0 })
  }, 120_000)

  it('com intercorrência, nenhum aviso automático é gerado', async () => {
    const pid = await paciente('Paciente Teste Intercorrencia')
    const id = await r.abrir(pid, 'OE', HOJE)
    await r.d7(id, { dataCirurgia: HOJE, ordem: 6, dioptria: 20.0 })
    await r.cp1(id)
    await r.cp2(id, 20.0)
    await r.d2(id)
    await r.admissao(id)
    const antes = (await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`)[0].n
    await r.com(id, U.enfermagem, 'intercorrencia.registrar', { descricao: 'Intercorrência fictícia de teste.' })
    const v = await r.obter(id, U.cirurgiao)
    expect(v.avisosFamilia.suspensos).toBe(true)
    await r.signIn(id)
    await r.anestesia(id)
    await r.timeOut(id)
    await r.signOut(id, { [SO.intercorrencias]: 'registradas' })
    await r.liberacaoAnestesia(id)
    await r.alta(id)
    await r.com(id, U.enfermagem, 'avisos.atraso', { minutos: 30 }).catch(() => null)
    const depois = (await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`)[0].n
    expect(depois).toBe(antes)
  }, 120_000)

  it('página do paciente: token só como hash; abertura, material e quiz como eventos do paciente; não mostra o olho', async () => {
    const pid = await paciente('Paciente Teste Pagina')
    const id = await r.abrir(pid, 'OE', AMANHA)
    await r.d7(id, { dataCirurgia: AMANHA, dioptria: 21.0 })
    const [msg] = await amb.banco.sql`select texto, parametros from jornada_cirurgica.mensagens_saida where episodio_id = ${id} and parametros ? '_link_token_cifrado' limit 1`
    expect(msg).toBeTruthy()
    const restaurado = await restaurarToken('{{LINK_TOKEN}}', msg.parametros as Record<string, string>, amb.config.segredoAtor)
    const token = restaurado!.texto
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await despejoBanco(amb.banco)).not.toContain(token)

    const pag = await amb.paciente(token, 'pagina.obter', {})
    expect(pag.status).toBe(200)
    const corpo = pag.corpo as { ok: true; dados: { primeiroNome: string; quiz: unknown[]; podeResponder: boolean; materiais: { id: string }[] } }
    expect(corpo.dados.primeiroNome).toBe('Paciente')
    expect(corpo.dados.podeResponder).toBe(true)
    // O olho não aparece (a pergunta 1 do quiz oferece os dois olhos, sem indicar o do episódio).
    const { quiz: perguntas, ...semQuiz } = corpo.dados
    expect(JSON.stringify(semQuiz)).not.toMatch(/"OE"|"OD"|OLHO|olho/i)
    expect(JSON.stringify(perguntas)).toContain('"OD"')
    expect(JSON.stringify(perguntas)).toContain('"OE"')
    const materialId = corpo.dados.materiais[0]?.id
    if (materialId) expect((await amb.paciente(token, 'material.visualizado', { materialId })).status).toBe(200)
    const respostas = { 1: 'OE', 2: 'F', 3: 'a', 4: 'b', 5: 'F', 6: 'F', 7: 'b', 8: 'd', 9: 'F', 10: 'b', 11: 'F' }
    const quiz = await amb.paciente(token, 'quiz.responder', { respostas, quemInstila: { eu: true } })
    expect(quiz.corpo).toEqual({ ok: true, dados: { aprovado: true, proximaAcao: 'concluido' } })
    const evs = await amb.banco.sql`select tipo, autor_id, autor_papel, sessao_usuario_id from jornada_cirurgica.eventos where episodio_id = ${id} and autor_papel = 'paciente'`
    expect(evs.map(e => e.tipo)).toEqual(expect.arrayContaining(['material.aberto', 'quiz.respondido']))
    expect(evs.every(e => e.autor_id === ATOR_SISTEMA_ID && e.sessao_usuario_id === null)).toBe(true)
    const v = await r.obter(id)
    expect(v.materiais.abertoEm).toBeTruthy()
    expect(v.materiais.quiz.at(-1)?.aprovado).toBe(true)
    // Token inválido ou de outro formato: genérico.
    expect((await amb.paciente('A'.repeat(43), 'pagina.obter', {})).status).toBe(404)
  })

  it('CORS com banco: origem do portal recebe o cabeçalho; outra origem é recusada', async () => {
    const ok = await amb.chamar(U.concierge, 'sessao', {}, { origem: ORIGEM })
    expect(ok.cabecalhos.get('access-control-allow-origin')).toBe(ORIGEM)
    const fora = await amb.chamar(U.concierge, 'sessao', {}, { origem: 'https://outro.invalid' })
    expect(fora.status).toBe(403)
  })
})
