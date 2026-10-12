// Correções da revisão de segurança independente (docs/notas-agentes/api.md, "Correções da revisão de
// segurança"). Cada bloco reproduz o achado do revisor e falhava antes da correção.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CP1, SI } from '../../supabase/functions/_shared/dominio/modelos/ids.ts'
import {
  criarArmazenamentoLocal,
  criarAutenticadorDev,
  criarAutenticadorSupabase,
  criarClienteDatasigh,
  criarHandler,
  emitirTokenDev,
  lerConfig,
  loggerSilencioso,
  processarFila,
  type ClienteMeta,
  type Db,
  type FetchLike,
} from '../../supabase/functions/_shared/api/index.ts'
import { dataLocal, lenteFicticia } from '../../dev/roteiro.ts'
import { APARELHO, bancoPronto, cpfTeste, criarAmbiente, dominioPronto, envTeste, PIN, roteiroTeste, SEGREDO_DEV, U, type Ambiente } from './apoio.ts'

const pronto = bancoPronto && dominioPronto

// ---------------------------------------------------------------------------
// 1. paciente.cadastrar não é oráculo de CPF
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('1. paciente.cadastrar não é oráculo de CPF', () => {
  let amb: Ambiente
  const corpo = (cpf: string | null) => ({ cpf, datasighId: null, nomeCompleto: 'Qualquer Nome Teste', dataNascimento: '1950-01-01', nomeMae: null, prontuario: null, conferidoDatasigh: false, documentoConferido: true })
  beforeAll(async () => {
    amb = await criarAmbiente({ env: { JORNADA_CPF_CONSULTAS_HORA: '3' } })
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('papel conferido antes de qualquer busca: a circulante não cadastra (nem descobre CPF)', async () => {
    const cpf = cpfTeste(501)
    // CPF já cadastrado (pela gestora) e CPF novo: para a circulante, a mesma recusa, sem distinguir.
    const { pacienteId } = await amb.ok(U.gestora, 'paciente.cadastrar', corpo(cpf))
    const existente = await amb.chamar(U.circulante, 'paciente.cadastrar', corpo(cpf))
    const novo = await amb.chamar(U.circulante, 'paciente.cadastrar', corpo(cpfTeste(509)))
    expect(existente.status).toBe(403)
    expect(novo.status).toBe(403)
    expect(JSON.stringify(existente.corpo)).not.toContain(pacienteId)
    expect(existente.corpo).toEqual(novo.corpo)
    const [a] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where sessao_usuario_id = ${U.circulante.id} and recurso = 'cpf_consulta'`
    expect(a.n).toBe(0)
  })

  it('"já cadastrado" não devolve o id; com CPF, conta no limite por hora e fica em acessos', async () => {
    const cpf = cpfTeste(502)
    const primeiro = await amb.ok(U.concierge, 'paciente.cadastrar', corpo(cpf))
    const dup = await amb.chamar(U.concierge, 'paciente.cadastrar', corpo(cpf))
    expect(dup.status).toBe(400)
    expect(JSON.stringify(dup.corpo)).not.toContain(primeiro.pacienteId)
    expect(dup.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao' } })
    if (!dup.corpo.ok) expect(dup.corpo.erro.detalhes?.pacienteId).toBeUndefined()
    // Limite 3/h compartilhado com a busca: 2 cadastros com CPF + 1 busca = 3; o 4º é recusado.
    await amb.ok(U.concierge, 'paciente.buscar_cpf', { cpf: cpfTeste(503) })
    const excesso = await amb.chamar(U.concierge, 'paciente.cadastrar', corpo(cpfTeste(504)))
    expect(excesso.status).toBe(429)
    // Sem CPF não consome consulta.
    expect((await amb.chamar(U.concierge, 'paciente.cadastrar', corpo(null))).status).toBe(200)
    const reg = await amb.banco.sql`select detalhe from jornada_cirurgica.acessos where sessao_usuario_id = ${U.concierge.id} and recurso = 'cpf_consulta' order by id`
    expect(reg.map(x => (x.detalhe as { origem?: string }).origem)).toEqual(['cadastro', 'cadastro', 'busca'])
  })
})

// ---------------------------------------------------------------------------
// 2. Limites de PIN e CPF não se burlam por concorrência
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('2. limites de PIN e de CPF sob concorrência', () => {
  let amb: Ambiente
  beforeAll(async () => {
    // Pool grande e PBKDF2 como no mínimo de produção: a verificação do hash demora e as requisições se sobrepõem.
    amb = await criarAmbiente({ poolMax: 40, env: { JORNADA_PIN_ITERACOES: '100000', JORNADA_CPF_CONSULTAS_HORA: '3' } })
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('40 PINs errados em paralelo com limite 5: no máximo 5 avaliações', async () => {
    const palpites = Array.from({ length: 40 }, (_, i) => String(200000 + i * 7919).slice(0, 6))
    const res = await Promise.all(palpites.map(pin => amb.chamar(U.conferente, 'ator.pin', { membroId: U.cirurgiao.id, pin })))
    const avaliados = res.filter(x => x.status !== 429)
    expect(avaliados.length).toBeLessThanOrEqual(5)
    expect(avaliados.every(x => !x.corpo.ok && x.corpo.erro.codigo === 'sem_permissao')).toBe(true)
    const [t] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where recurso = 'pin_tentativa' and detalhe->>'alvo' = ${U.cirurgiao.id}`
    expect(t.n).toBeLessThanOrEqual(5)
    // Bloqueado também para o PIN certo enquanto durar a janela.
    expect((await amb.chamar(U.conferente2, 'ator.pin', { membroId: U.cirurgiao.id, pin: PIN })).status).toBe(429)
  }, 60_000)

  it('membro.definir_pin: tentativas paralelas do PIN atual também param no limite', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => amb.chamar(U.anestesista, 'membro.definir_pin', { pinNovo: '246813', pinAtual: String(300000 + i * 104729).slice(0, 6) })))
    expect(res.filter(x => x.status !== 429).length).toBeLessThanOrEqual(5)
  }, 60_000)

  it('20 consultas de CPF em paralelo com limite 3/h: no máximo 3', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => amb.chamar(U.concierge, 'paciente.buscar_cpf', { cpf: cpfTeste(700 + i) })))
    expect(res.filter(x => x.status === 200).length).toBeLessThanOrEqual(3)
    const [c] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where recurso = 'cpf_consulta' and sessao_usuario_id = ${U.concierge.id}`
    expect(c.n).toBeLessThanOrEqual(3)
  }, 60_000)
})

// ---------------------------------------------------------------------------
// 3. Token de confirmação da leitura em voz alta
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('3. confirmação da leitura em voz alta', () => {
  let amb: Ambiente
  let r: ReturnType<typeof roteiroTeste>
  let id: string
  beforeAll(async () => {
    amb = await criarAmbiente()
    r = roteiroTeste(amb)
    const pid = await r.cadastrar({ nome: 'Paciente Teste Confirmacao', nascimento: '1949-02-02', cpf: cpfTeste(801), prontuario: 'T-801' })
    id = await r.abrir(pid, 'OE', dataLocal(0))
    await r.d7(id, { dataCirurgia: dataLocal(0), dioptria: 21.0 })
    await r.cp1(id)
    await r.cp2(id, 21.0)
    await r.d2(id)
    await r.admissao(id)
    await r.responder(id, 'sign_in', U.circulante, {}, item => item !== SI.midriatico)
    await r.responder(id, 'sign_in', U.cirurgiao)
    await r.responder(id, 'sign_in', U.circulante)
  }, 120_000)
  afterAll(async () => {
    await amb?.encerrar()
  })

  const concluir = async (extra: Record<string, unknown>, ator?: string) => {
    const v = await r.obter(id, U.circulante)
    return amb.chamar(U.circulante, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo: 'sign_in', ...extra }, { ator })
  }

  it('o token de ator (troca por PIN) não serve de confirmação', async () => {
    const tokenAtor = await amb.pin(U.circulante, U.enfermagem)
    const resp = await concluir({ leitorId: U.circulante.id, confirmadorToken: tokenAtor })
    expect(resp.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { campo: 'confirmadorToken' } } })
  })

  it('o token de confirmação não serve de ator e vale só para o episódio e o bloco pedidos', async () => {
    const c = await amb.ok(U.circulante, 'ator.confirmacao', { membroId: U.enfermagem.id, pin: PIN, episodioId: id, modelo: 'sign_in' })
    expect(c.ator.id).toBe(U.enfermagem.id)
    expect(Date.parse(c.expiraEm) - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 1000)
    const comoAtor = await amb.chamar(U.circulante, 'sessao', {}, { ator: c.token })
    expect(comoAtor.status).toBe(401)
    const v = await r.obter(id, U.circulante)
    const outroBloco = await amb.chamar(U.circulante, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo: 'time_out', leitorId: U.circulante.id, confirmadorToken: c.token })
    expect(outroBloco.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { campo: 'confirmadorToken' } } })
    const outroAparelho = await amb.chamar(U.circulante, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo: 'sign_in', leitorId: U.circulante.id, confirmadorToken: c.token }, { aparelho: 'aparelho-teste-0002' })
    expect(outroAparelho.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao' } })
  })

  it('leitorId sem prova é recusado: quem lê é quem conclui (ator)', async () => {
    const c = await amb.ok(U.circulante, 'ator.confirmacao', { membroId: U.enfermagem.id, pin: PIN, episodioId: id, modelo: 'sign_in' })
    const resp = await concluir({ leitorId: U.cirurgiao.id, confirmadorToken: c.token })
    expect(resp.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { campo: 'leitorId' } } })
  })

  it('uso único: conclui uma vez; o mesmo token não confirma de novo', async () => {
    const c = await amb.ok(U.circulante, 'ator.confirmacao', { membroId: U.enfermagem.id, pin: PIN, episodioId: id, modelo: 'sign_in' })
    const ok = await concluir({ leitorId: U.circulante.id, confirmadorToken: c.token })
    expect(ok.status).toBe(200)
    const [u] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where recurso = 'confirmacao_usada' and episodio_id = ${id}`
    expect(u.n).toBe(1)
    const de_novo = await concluir({ leitorId: U.circulante.id, confirmadorToken: c.token })
    expect(de_novo.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { campo: 'confirmadorToken' } } })
    // PIN errado na confirmação conta no mesmo limite do PIN.
    const errado = await amb.chamar(U.circulante, 'ator.confirmacao', { membroId: U.enfermagem.id, pin: '975310', episodioId: id, modelo: 'time_out' })
    expect(errado.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// 4. Listas montadas com o estado visível ao ator
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('4. listas não vazam à conferente o que vem do checkpoint 1', () => {
  let amb: Ambiente
  let r: ReturnType<typeof roteiroTeste>
  let a: string
  let b: string
  const data = dataLocal(6)
  beforeAll(async () => {
    amb = await criarAmbiente()
    r = roteiroTeste(amb)
    const pidA = await r.cadastrar({ nome: 'Paciente Teste Biometria Alfa', nascimento: '1948-03-03', cpf: cpfTeste(901), prontuario: 'T-901' })
    a = await r.abrir(pidA, 'OD', data)
    await r.d7(a, { dataCirurgia: data, dioptria: 21.5 })
    await r.com(a, U.concierge, 'lente.chegada', { dados: { dataChegada: dataLocal(-1), lote: 'LOTE-TESTE-009', validade: '2030-12' } })
    await r.responder(a, 'cp1', U.concierge, { [CP1.biometria]: 'nao' })
    const pidB = await r.cadastrar({ nome: 'Validade Teste Bravo', nascimento: '1947-04-04', cpf: cpfTeste(902), prontuario: 'T-902' })
    b = await r.abrir(pidB, 'OE', data)
    await r.d7(b, { dataCirurgia: data, dioptria: 22 })
    await r.cp1(b)
    await r.com(b, U.concierge, 'episodio.agendar', { dataCirurgia: '2031-03-10', horario: '07:00', ordem: 1 })
  }, 120_000)
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('pendências, lista do dia, busca, véspera e alertas coincidem com a visão do episódio da conferente', async () => {
    const visA = await amb.ok(U.conferente, 'episodio.obter', { episodioId: a })
    const visB = await amb.ok(U.conferente, 'episodio.obter', { episodioId: b })
    const pend = await amb.ok(U.conferente, 'pendencias.listar', {})
    const codigos = (ep: string) => pend.filter(p => p.episodioId === ep).map(p => p.codigo).sort()
    expect(codigos(a)).toEqual(visA.pendencias.map(p => p.codigo).sort())
    expect(codigos(b)).toEqual(visB.pendencias.map(p => p.codigo).sort())
    const dia = await amb.ok(U.conferente, 'dia.lista', { data })
    const linhaA = dia.find(x => x.episodioId === a)!
    expect(linhaA.hardStopsAbertos).toBe(visA.hardStops.length)
    expect(linhaA.avisosSuspensos).toBe(visA.avisosFamilia.suspensos)
    const busca = await amb.ok(U.conferente, 'episodios.buscar', { termo: 'Biometria' })
    expect(busca.find(x => x.episodioId === a)?.hardStopsAbertos).toBe(visA.hardStops.length)
    const vespera = await amb.ok(U.conferente, 'resumo.vespera', { data })
    expect(vespera.episodios.find(x => x.episodioId === a)?.hardStopsAbertos).toBe(visA.hardStops.length)
    const alertas = await amb.ok(U.conferente, 'alertas.abertos', {})
    expect(alertas.filter(x => x.episodioId === a).map(x => x.id).sort()).toEqual(visA.alertas.filter(x => !x.conduta && !x.inativo).map(x => x.id).sort())
    // Para a concierge (que vê o checkpoint 1) o hard stop da biometria aparece.
    const diaConcierge = await amb.ok(U.concierge, 'dia.lista', { data })
    expect(diaConcierge.find(x => x.episodioId === a)!.hardStopsAbertos).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Checkpoint 2 só com o login da própria conferente
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('5. conferência cega pela sessão', () => {
  let amb: Ambiente
  let r: ReturnType<typeof roteiroTeste>
  beforeAll(async () => {
    amb = await criarAmbiente()
    r = roteiroTeste(amb)
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  const episodioComCp1 = async (n: number) => {
    const pid = await r.cadastrar({ nome: `Sessao Teste ${n}`, nascimento: '1946-05-05', cpf: cpfTeste(950 + n), prontuario: `T-95${n}` })
    const id = await r.abrir(pid, 'OD', dataLocal(6))
    await r.d7(id, { dataCirurgia: dataLocal(6), dioptria: 21.5 })
    await r.cp1(id)
    return id
  }

  it('na sessão da autora do checkpoint 1, a conferente por PIN não registra o checkpoint 2', async () => {
    const id = await episodioComCp1(1)
    const token = await amb.pin(U.concierge, U.conferente)
    const v = await r.obter(id, U.conferente)
    const resp = await amb.chamar(U.concierge, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: lenteFicticia('OD', 21.5) }, { ator: token })
    expect(resp.status).toBe(403)
    expect(resp.corpo).toMatchObject({ ok: false, erro: { codigo: 'conferencia_cega' } })
  })

  it('sessão em que alguém (por PIN) consultou o checkpoint 1: a conferente não registra o checkpoint 2 nela', async () => {
    const id = await episodioComCp1(2)
    const tokenConcierge = await amb.pin(U.conferente, U.concierge)
    await amb.ok(U.conferente, 'episodio.obter', { episodioId: id }, { ator: tokenConcierge }) // a tela da sessão mostrou o plano
    const v = await r.obter(id, U.conferente)
    const resp = await amb.chamar(U.conferente, 'lente.cp2', { episodioId: id, versao: v.episodio.versao, valores: lenteFicticia('OD', 21.5) })
    expect(resp.corpo).toMatchObject({ ok: false, erro: { codigo: 'conferencia_cega' } })
    // Outra conferente, no próprio login, faz normalmente.
    const ok = await r.cp2(id, 21.5, U.conferente2)
    expect(ok.lente.etapa).not.toBe('quarentena')
  })
})

// ---------------------------------------------------------------------------
// 6. Só `email_confirmed_at` confirma o e-mail
// ---------------------------------------------------------------------------
describe('6. e-mail confirmado = email_confirmed_at', () => {
  it('confirmed_at sozinho (ex.: telefone) não confirma o e-mail', async () => {
    const id = 'b0000000-0000-4000-8000-000000000009'
    const jwt = `h.${Buffer.from(JSON.stringify({ sub: id, aal: 'aal1' })).toString('base64url')}.s`
    const resposta = (u: object): FetchLike => async () => new Response(JSON.stringify({ id, email: 'x@exemplo.test', ...u }), { status: 200 })
    const so = criarAutenticadorSupabase({ supabaseUrl: 'https://p.invalid', anonKey: 'k', fetch: resposta({ confirmed_at: '2026-01-01T00:00:00Z', email_confirmed_at: null }) })
    expect((await so.verificar(jwt)).emailConfirmado).toBe(false)
    const ok = criarAutenticadorSupabase({ supabaseUrl: 'https://p.invalid', anonKey: 'k', fetch: resposta({ email_confirmed_at: '2026-01-01T00:00:00Z' }) })
    expect((await ok.verificar(jwt)).emailConfirmado).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Fila com validade
// ---------------------------------------------------------------------------
describe.skipIf(!pronto)('7. mensagem pendente vencida nunca sai', () => {
  let amb: Ambiente
  let id: string
  beforeAll(async () => {
    amb = await criarAmbiente({ configExtra: { envioHabilitado: true } })
    const r = roteiroTeste(amb)
    const pid = await r.cadastrar({ nome: 'Fila Teste Validade', nascimento: '1950-05-05', cpf: cpfTeste(310), prontuario: 'T-310' })
    id = await r.abrir(pid, 'OD', dataLocal(1))
    await r.d7(id, { dataCirurgia: dataLocal(1), dioptria: 21.0, materiais: false })
  }, 60_000)
  afterAll(async () => {
    await amb?.encerrar()
  })

  const inserir = async (telefone: string, criadoEm: string) => {
    const [m] = await amb.banco.sql`insert into jornada_cirurgica.mensagens_saida (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por, criado_em)
      values (${id}, 'atraso', 'contato-teste', ${telefone}, 'Mensagem fictícia de teste.', ${`validade:${telefone}`}, 'pendente', ${U.concierge.id}, ${criadoEm}) returning id`
    return m.id as string
  }

  it(`mais antiga que JORNADA_FILA_VALIDADE_MIN (padrão ${60}) ou de outra data local → cancelada como expirada`, async () => {
    expect(amb.config.filaValidadeMin).toBe(60)
    // Agora: 00:20 em São Paulo (03:20Z). A1: 2 h atrás. A2: 30 min atrás, mas na véspera (23:50). A3: 5 min atrás.
    const agora = new Date('2031-01-15T03:20:00Z')
    const velha = await inserir('00900000201', '2031-01-15T01:20:00Z')
    const vespera = await inserir('00900000202', '2031-01-15T02:50:00Z')
    const nova = await inserir('00900000203', '2031-01-15T03:15:00Z')
    const enviados: string[] = []
    const meta: ClienteMeta = { enviar: async m => (enviados.push(m.para), { tipo: 'enviado', provedorId: `wamid.${m.para}` }) }
    await processarFila({ db: amb.db, config: amb.config, meta, logger: amb.logger, relogio: () => agora })
    const estado = async (mid: string) => (await amb.banco.sql`select estado, ultimo_erro from jornada_cirurgica.mensagens_saida where id = ${mid}`)[0]
    expect(await estado(velha)).toEqual({ estado: 'cancelado', ultimo_erro: 'expirada' })
    expect(await estado(vespera)).toEqual({ estado: 'cancelado', ultimo_erro: 'expirada' })
    expect(await estado(nova)).toMatchObject({ estado: 'enviado' })
    expect(enviados).toEqual(['00900000203'])
    const hist = await amb.banco.sql`select detalhe from jornada_cirurgica.mensagens_saida_eventos where mensagem_id = ${velha}`
    expect(hist.map(h => (h.detalhe as { motivo?: string }).motivo)).toContain('expirada')
  })
})

// ---------------------------------------------------------------------------
// 8. Corpo só depois da autenticação
// ---------------------------------------------------------------------------
describe('8. o corpo grande só é lido depois da autenticação', () => {
  const config = lerConfig(n => envTeste()[n])
  const dbProibido: Db = { consulta: () => Promise.reject(new Error('banco')), transacao: () => Promise.reject(new Error('banco')) }
  const handler = criarHandler({
    config,
    db: dbProibido,
    autenticador: criarAutenticadorDev(config, SEGREDO_DEV),
    datasigh: criarClienteDatasigh(null),
    armazenamento: criarArmazenamentoLocal({ segredo: SEGREDO_DEV }),
    logger: loggerSilencioso,
  })
  /** Corpo em pedaços de 64 KB que conta quanto foi lido. */
  function corpoContado(total: number) {
    let lidos = 0
    const pedaco = new Uint8Array(64 * 1024).fill(0x20)
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (lidos >= total) return c.close()
        lidos += pedaco.length
        c.enqueue(pedaco)
      },
    })
    return { stream, lidos: () => lidos }
  }
  const req = (caminho: string, body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, duplex: 'half' } as RequestInit)

  it('sem Authorization: 401 sem ler o corpo de 5 MB', async () => {
    const c = corpoContado(5 * 1024 * 1024)
    const r = await handler(req('/functions/v1/jornada-cirurgica', c.stream))
    expect(r.status).toBe(401)
    expect(c.lidos()).toBeLessThanOrEqual(256 * 1024)
  })

  it('token inválido: 401 sem ler o corpo', async () => {
    const c = corpoContado(5 * 1024 * 1024)
    const r = await handler(req('/functions/v1/jornada-cirurgica', c.stream, { Authorization: 'Bearer dev1.e30.xxx' }))
    expect(r.status).toBe(401)
    expect(c.lidos()).toBeLessThanOrEqual(256 * 1024)
  })

  it('página do paciente (sem login): no máximo 256 KB lidos', async () => {
    const c = corpoContado(5 * 1024 * 1024)
    const r = await handler(req('/functions/v1/jornada-paciente', c.stream))
    expect(r.status).toBe(413)
    expect(c.lidos()).toBeLessThanOrEqual(256 * 1024 + 64 * 1024)
  })

  it('token válido: o corpo é lido (o banco é a próxima etapa)', async () => {
    const tok = await emitirTokenDev(SEGREDO_DEV, { id: U.concierge.id, email: U.concierge.email })
    const c = corpoContado(300 * 1024)
    const r = await handler(req('/functions/v1/jornada-cirurgica', c.stream, { Authorization: `Bearer ${tok}`, 'x-jornada-aparelho': APARELHO }))
    expect([413, 503]).toContain(r.status)
  })
})

