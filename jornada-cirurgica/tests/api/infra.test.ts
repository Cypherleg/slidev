// Infraestrutura da API sem banco: criptografia, tokens, PIN, autenticação, Datasigh (só GET),
// anexos, configuração e o handler HTTP (rotas, CORS, cabeçalhos, limites, erros).

import { describe, expect, it } from 'vitest'
import {
  base64,
  cifrar,
  decifrar,
  hmac,
  hex,
  sha256Hex,
  assinarToken,
  verificarToken,
} from '../../supabase/functions/_shared/api/cripto.ts'
import {
  converterErro,
  criarArmazenamentoLocal,
  criarArmazenamentoSupabase,
  criarAutenticadorDev,
  criarAutenticadorSupabase,
  criarClienteDatasigh,
  criarHandler,
  emitirTokenAtor,
  emitirTokenDev,
  ErroConfig,
  ErroMetodoProibido,
  fetchSomenteGet,
  formatoPinValido,
  gerarHashPin,
  lerConfig,
  loggerCapturado,
  mapearRegistro,
  pinAceitavel,
  rotaDe,
  validarAnexo,
  verificarHashPin,
  verificarTokenAtor,
  restaurarToken,
  protegerMensagens,
  MARCADOR_TOKEN,
  gerarTokenLink,
  type Db,
  type FetchLike,
} from '../../supabase/functions/_shared/api/index.ts'
import { ErroDominio } from '../../supabase/functions/_shared/dominio/index.ts'
import { datasighFalso, envTeste, MAPA_DATASIGH, ORIGEM, SEGREDO_DEV, cpfTeste } from './apoio.ts'

const config = lerConfig(n => envTeste()[n])

/** Db que falha se for usado: o handler não pode tocar no banco antes de autenticar. */
const dbProibido: Db = {
  consulta: () => Promise.reject(new Error('banco não deveria ser usado')),
  transacao: () => Promise.reject(new Error('banco não deveria ser usado')),
}

function handlerSemBanco(extra: Partial<Parameters<typeof criarHandler>[0]> = {}) {
  const logger = loggerCapturado()
  const h = criarHandler({
    config,
    db: dbProibido,
    autenticador: criarAutenticadorDev(config, SEGREDO_DEV),
    datasigh: criarClienteDatasigh(null),
    armazenamento: criarArmazenamentoLocal({ segredo: SEGREDO_DEV }),
    logger,
    ...extra,
  })
  return { h, logger }
}

const post = (caminho: string, corpo: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) })

describe('criptografia', () => {
  it('HMAC separa usos pelo rótulo e é determinístico', async () => {
    const a = hex(await hmac('s'.repeat(32), 'cpf', '12345678909'))
    const b = hex(await hmac('s'.repeat(32), 'cpf', '12345678909'))
    const c = hex(await hmac('s'.repeat(32), 'outro', '12345678909'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('token assinado: adulteração e prefixo errado são recusados', async () => {
    const t = await assinarToken('k'.repeat(32), 'x1', { a: 1 })
    expect(await verificarToken('k'.repeat(32), 'x1', t)).toEqual({ a: 1 })
    expect(await verificarToken('k'.repeat(32), 'x2', t)).toBeNull()
    expect(await verificarToken('j'.repeat(32), 'x1', t)).toBeNull()
    const [p, , s] = t.split('.')
    expect(await verificarToken('k'.repeat(32), 'x1', `${p}.${base64(new TextEncoder().encode('{"a":2}'))}.${s}`)).toBeNull()
  })

  it('cifra AES-GCM ida e volta; chave errada falha', async () => {
    const c = await cifrar('k'.repeat(32), 'r', 'segredo')
    expect(await decifrar('k'.repeat(32), 'r', c)).toBe('segredo')
    expect(await decifrar('j'.repeat(32), 'r', c)).toBeNull()
    expect(c).not.toContain('segredo')
  })
})

describe('PIN', () => {
  it('formato: 6 dígitos; recusa triviais', () => {
    expect(pinAceitavel('135790')).toBe(true)
    expect(pinAceitavel('123456')).toBe(false)
    expect(pinAceitavel('654321')).toBe(false)
    expect(pinAceitavel('111111')).toBe(false)
    expect(pinAceitavel('12345')).toBe(false)
    expect(pinAceitavel('12a456')).toBe(false)
    expect(formatoPinValido('123456')).toBe(true)
  })

  it('hash PBKDF2-SHA256 com sal e pepper; confere só o PIN certo', async () => {
    const h1 = await gerarHashPin('p'.repeat(32), '135790', 2000)
    const h2 = await gerarHashPin('p'.repeat(32), '135790', 2000)
    expect(h1).toMatch(/^pbkdf2-sha256\$2000\$/)
    expect(h1).not.toBe(h2) // sal aleatório
    expect(h1).not.toContain('135790')
    expect(await verificarHashPin('p'.repeat(32), '135790', h1)).toBe(true)
    expect(await verificarHashPin('p'.repeat(32), '135791', h1)).toBe(false)
    expect(await verificarHashPin('q'.repeat(32), '135790', h1)).toBe(false) // pepper do servidor
    expect(await verificarHashPin('p'.repeat(32), '135790', null)).toBe(false)
  })

  it('token de ator: preso à sessão e ao aparelho, expira', async () => {
    const agora = Date.now()
    const { token, expiraEm } = await emitirTokenAtor('a'.repeat(32), { membroId: 'm1', sessaoUsuarioId: 's1', aparelhoId: 'ap1' }, 15, agora)
    expect(Date.parse(expiraEm) - agora).toBeGreaterThan(14 * 60_000)
    expect((await verificarTokenAtor('a'.repeat(32), token, { sessaoUsuarioId: 's1', aparelhoId: 'ap1' }, agora))?.membroId).toBe('m1')
    expect(await verificarTokenAtor('a'.repeat(32), token, { sessaoUsuarioId: 's2', aparelhoId: 'ap1' }, agora)).toBeNull()
    expect(await verificarTokenAtor('a'.repeat(32), token, { sessaoUsuarioId: 's1', aparelhoId: 'ap2' }, agora)).toBeNull()
    expect(await verificarTokenAtor('a'.repeat(32), token, { sessaoUsuarioId: 's1', aparelhoId: 'ap1' }, agora + 16 * 60_000)).toBeNull()
  })
})

describe('autenticação', () => {
  it('modo dev: só com JORNADA_MODO_DEV=true e fora de produção', () => {
    expect(() => criarAutenticadorDev({ modoDev: false, ambiente: 'desenvolvimento' }, SEGREDO_DEV)).toThrow()
    expect(() => criarAutenticadorDev({ modoDev: true, ambiente: 'producao' }, SEGREDO_DEV)).toThrow()
    expect(() => lerConfig(n => envTeste({ JORNADA_AMBIENTE: 'producao' })[n])).toThrow(ErroConfig)
  })

  it('modo dev: token assinado e com validade', async () => {
    const a = criarAutenticadorDev(config, SEGREDO_DEV)
    const id = 'a0000000-0000-4000-8000-000000000001'
    const t = await emitirTokenDev(SEGREDO_DEV, { id, email: 'X@Exemplo.test', aal: 'aal1' })
    expect(await a.verificar(t)).toEqual({ userId: id, email: 'x@exemplo.test', emailConfirmado: true, aal: 'aal1' })
    const vencido = await emitirTokenDev(SEGREDO_DEV, { id, email: 'x@exemplo.test' }, 1, Date.now() - 3600_000)
    await expect(a.verificar(vencido)).rejects.toMatchObject({ codigo: 'nao_autenticado' })
    const outro = await emitirTokenDev('outro-segredo-de-teste-0123456789', { id, email: 'x@exemplo.test' })
    await expect(a.verificar(outro)).rejects.toMatchObject({ codigo: 'nao_autenticado' })
  })

  it('produção: valida no /auth/v1/user com a anon key; aal do JWT; e-mail confirmado', async () => {
    const id = 'b0000000-0000-4000-8000-000000000001'
    const payload = (p: object) => Buffer.from(JSON.stringify(p)).toString('base64url')
    const jwt = (p: object) => `h.${payload(p)}.s`
    const chamadas: { url: string; headers: Headers }[] = []
    const f: FetchLike = async (url, init) => {
      chamadas.push({ url, headers: new Headers(init?.headers) })
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      if (auth.includes('invalido')) return new Response('{}', { status: 401 })
      return new Response(JSON.stringify({ id, email: 'Pessoa@Exemplo.test', email_confirmed_at: auth.includes(payload({ sub: id, aal: 'aal1', x: 1 })) ? null : '2026-01-01T00:00:00Z' }), { status: 200 })
    }
    const a = criarAutenticadorSupabase({ supabaseUrl: 'https://projeto.exemplo.invalid/', anonKey: 'anon-teste', fetch: f })
    const r = await a.verificar(jwt({ sub: id, aal: 'aal2' }))
    expect(r).toEqual({ userId: id, email: 'pessoa@exemplo.test', emailConfirmado: true, aal: 'aal2' })
    expect(chamadas[0].url).toBe('https://projeto.exemplo.invalid/auth/v1/user')
    expect(chamadas[0].headers.get('apikey')).toBe('anon-teste')
    expect((await a.verificar(jwt({ sub: id }))).aal).toBe('aal1')
    expect((await a.verificar(jwt({ sub: id, aal: 'aal1', x: 1 }))).emailConfirmado).toBe(false)
    // sub do JWT diferente do usuário devolvido pelo Auth
    await expect(a.verificar(jwt({ sub: 'c0000000-0000-4000-8000-000000000001', aal: 'aal2' }))).rejects.toMatchObject({ codigo: 'nao_autenticado' })
    await expect(a.verificar(jwt({ sub: id, invalido: true }).replace('h.', 'invalido.'))).rejects.toMatchObject({ codigo: 'nao_autenticado' })
    await expect(a.verificar('nao-e-jwt')).rejects.toMatchObject({ codigo: 'nao_autenticado' })
    const fora = criarAutenticadorSupabase({ supabaseUrl: 'https://x.invalid', anonKey: 'k', fetch: () => Promise.reject(new Error('rede')) })
    await expect(fora.verificar(jwt({ sub: id }))).rejects.toMatchObject({ codigo: 'indisponivel' })
  })
})

describe('Datasigh: somente GET', () => {
  it('qualquer método diferente de GET lança antes de chegar à rede', () => {
    let chamou = 0
    const f = fetchSomenteGet(async () => {
      chamou++
      return new Response('{}')
    })
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'post']) {
      expect(() => f('https://x.invalid/', { method: metodo })).toThrow(ErroMetodoProibido)
    }
    expect(() => f('https://x.invalid/', { method: 'GET', body: 'x' })).toThrow(ErroMetodoProibido)
    expect(chamou).toBe(0)
    return f('https://x.invalid/').then(() => expect(chamou).toBe(1))
  })

  const cfg = (extra: Record<string, string> = {}) => lerConfig(n => envTeste(extra)[n]).datasigh

  it('sem caminho ou mapa configurados: nao_configurado (nada sai)', async () => {
    const falso = datasighFalso({})
    expect(await criarClienteDatasigh(null, falso.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'nao_configurado' })
    expect(await criarClienteDatasigh(cfg({ DATASIGH_CAMINHO_BUSCA_CPF: '' }), falso.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'nao_configurado' })
    expect(await criarClienteDatasigh(cfg({ DATASIGH_MAPA_CAMPOS: '' }), falso.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'nao_configurado' })
    expect(falso.chamadas).toHaveLength(0)
  })

  it('encontrado: só os campos que vieram; data normalizada; só GET', async () => {
    const cpf = cpfTeste(7)
    const falso = datasighFalso({ [cpf]: { id: 'DS-7', nome: 'Paciente Teste Sete', nascimento: '05/03/1950' } })
    const c = criarClienteDatasigh(cfg({ DATASIGH_AUTH_HEADER: 'X-Chave', DATASIGH_AUTH_VALOR: 'chave-teste' }), falso.fetch)
    const r = await c.buscarPorCpf(cpf)
    expect(r).toEqual({ status: 'encontrado', campos: { datasighId: 'DS-7', nomeCompleto: 'Paciente Teste Sete', dataNascimento: '1950-03-05' } })
    expect(falso.chamadas.every(x => x.metodo === 'GET')).toBe(true)
    expect(await c.buscarPorCpf(cpfTeste(8))).toEqual({ status: 'nao_encontrado' })
  })

  it('falha e timeout: indisponivel', async () => {
    const lento = datasighFalso({}, { atraso: 2000 })
    expect(await criarClienteDatasigh({ ...cfg()!, timeoutMs: 50 }, lento.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'indisponivel' })
    const erro500 = datasighFalso({}, { status: 500 })
    expect(await criarClienteDatasigh(cfg(), erro500.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'indisponivel' })
    const nao404 = datasighFalso({}, { status: 404 })
    expect(await criarClienteDatasigh(cfg(), nao404.fetch).buscarPorCpf(cpfTeste(1))).toEqual({ status: 'nao_encontrado' })
  })

  it('caminho configurado não sai do host da base', async () => {
    const falso = datasighFalso({})
    const c = criarClienteDatasigh(cfg({ DATASIGH_CAMINHO_BUSCA_CPF: 'https://outro.invalid/x?cpf={cpf}' }), falso.fetch)
    expect(await c.buscarPorCpf(cpfTeste(1))).toEqual({ status: 'nao_configurado' })
    expect(falso.chamadas).toHaveLength(0)
  })

  it('mapa de campos com telefones em vários caminhos', () => {
    const m = mapearRegistro({ a: { b: '1' }, tel: ['(44) 9 0000-0001', '(44) 9 0000-0001'], cel: '(44) 9 0000-0002' }, { datasighId: 'a.b', telefones: ['tel', 'cel'] })
    expect(m).toEqual({ datasighId: '1', telefones: ['(44) 9 0000-0001', '(44) 9 0000-0002'] })
    expect(JSON.parse(MAPA_DATASIGH).lista).toBe('pacientes')
  })
})

describe('anexos', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')

  it('só JPEG/PNG, conteúdo confere com o tipo, limite de 5 MB, SHA-256', async () => {
    const a = await validarAnexo(png, 'image/png')
    expect(a.sha256).toBe(await sha256Hex(Buffer.from(png, 'base64')))
    expect((await validarAnexo(jpg, 'image/jpeg')).extensao).toBe('jpg')
    await expect(validarAnexo(png, 'image/jpeg')).rejects.toMatchObject({ codigo: 'validacao' })
    await expect(validarAnexo(png, 'image/gif')).rejects.toMatchObject({ codigo: 'validacao' })
    await expect(validarAnexo('!!!', 'image/png')).rejects.toMatchObject({ codigo: 'validacao' })
    const grande = Buffer.alloc(5 * 1024 * 1024 + 10)
    grande.set([0xff, 0xd8, 0xff])
    await expect(validarAnexo(grande.toString('base64'), 'image/jpeg')).rejects.toMatchObject({ codigo: 'validacao' })
  })

  it('local: URL assinada com validade', async () => {
    let agora = Date.now()
    const arm = criarArmazenamentoLocal({ segredo: SEGREDO_DEV, baseUrl: 'http://127.0.0.1:8787/dev/anexos', relogio: () => agora })
    await arm.salvar('episodios/x/a.png', new Uint8Array([1]), 'image/png')
    await expect(arm.salvar('episodios/x/a.png', new Uint8Array([1]), 'image/png')).rejects.toMatchObject({ codigo: 'validacao' })
    await expect(arm.salvar('../fora.png', new Uint8Array([1]), 'image/png')).rejects.toMatchObject({ codigo: 'validacao' })
    const url = new URL(await arm.urlAssinada('episodios/x/a.png', 60))
    expect(await arm.verificarUrl('episodios/x/a.png', url.searchParams.get('exp')!, url.searchParams.get('sig')!)).toBe(true)
    expect(await arm.verificarUrl('episodios/x/b.png', url.searchParams.get('exp')!, url.searchParams.get('sig')!)).toBe(false)
    agora += 61_000
    expect(await arm.verificarUrl('episodios/x/a.png', url.searchParams.get('exp')!, url.searchParams.get('sig')!)).toBe(false)
  })

  it('Supabase Storage: bucket privado, service role só no servidor, URL assinada curta', async () => {
    const chamadas: { url: string; init?: RequestInit }[] = []
    const f: FetchLike = async (url, init) => {
      chamadas.push({ url, init })
      if (url.includes('/object/sign/')) return new Response(JSON.stringify({ signedURL: '/object/sign/jornada-cirurgica/episodios/x/a.png?token=t' }))
      return new Response('{}')
    }
    const s = criarArmazenamentoSupabase({ supabaseUrl: 'https://p.exemplo.invalid', serviceRoleKey: 'service-teste', fetch: f })
    await s.salvar('episodios/x/a.png', new Uint8Array([1]), 'image/png')
    const url = await s.urlAssinada('episodios/x/a.png', 120)
    expect(chamadas[0].url).toBe('https://p.exemplo.invalid/storage/v1/object/jornada-cirurgica/episodios/x/a.png')
    expect(new Headers(chamadas[0].init?.headers).get('x-upsert')).toBe('false')
    expect(JSON.parse(String(chamadas[1].init?.body))).toEqual({ expiresIn: 120 })
    expect(url).toBe('https://p.exemplo.invalid/storage/v1/object/sign/jornada-cirurgica/episodios/x/a.png?token=t')
  })
})

describe('link do paciente na fila', () => {
  it('o token não fica em texto claro na mensagem; a função de envio restaura', async () => {
    const token = gerarTokenLink()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [m] = await protegerMensagens(
      [{ id: '1', gatilho: 'materiais_preparo', contatoId: 'c', telefone: '44900000000', texto: `Olá. Acesse https://x.invalid/p/${token}`, modeloMeta: null, parametros: { '1': `https://x.invalid/p/${token}` }, chaveIdempotencia: 'k', estadoInicial: 'ensaio' }],
      token,
      'k'.repeat(32),
    )
    expect(JSON.stringify(m)).not.toContain(token)
    expect(m.texto).toContain(MARCADOR_TOKEN)
    const r = await restaurarToken(m.texto, m.parametros, 'k'.repeat(32))
    expect(r?.texto).toContain(token)
    expect(r?.parametros).toEqual({ '1': `https://x.invalid/p/${token}` })
  })
})

describe('configuração', () => {
  it('segredos obrigatórios e envio real só com credenciais da Meta e fora do modo dev', () => {
    expect(() => lerConfig(n => envTeste({ JORNADA_SEGREDO_CPF: 'curto' })[n])).toThrow(ErroConfig)
    expect(() => lerConfig(n => envTeste({ ENVIO_PACIENTES_HABILITADO: 'true' })[n])).toThrow(ErroConfig)
    try {
      lerConfig(n => envTeste({ JORNADA_SEGREDO_CPF: 'curto' })[n])
    } catch (e) {
      expect((e as ErroConfig).message).not.toContain('curto') // só nomes, nunca valores
    }
    expect(config.envioHabilitado).toBe(false)
    expect(config.cpfConsultasHora).toBe(30)
    expect(config.atorTtlMin).toBe(15)
  })
})

describe('handler HTTP (sem banco)', () => {
  it('rotas: /functions/v1/<nome> e /<nome>', () => {
    expect(rotaDe('/functions/v1/jornada-cirurgica')).toBe('equipe')
    expect(rotaDe('/jornada-cirurgica')).toBe('equipe')
    expect(rotaDe('/jornada-cirurgica/')).toBe('equipe')
    expect(rotaDe('/functions/v1/jornada-paciente')).toBe('paciente')
    expect(rotaDe('/jornada-paciente')).toBe('paciente')
    expect(rotaDe('/functions/v1/outra')).toBeNull()
    expect(rotaDe('/functions/v1/jornada-cirurgica/x')).toBeNull()
  })

  it('CORS: preflight só para a origem do portal; outra origem é recusada sem tocar no banco', async () => {
    const { h } = handlerSemBanco()
    const pre = await h(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'OPTIONS', headers: { Origin: ORIGEM, 'Access-Control-Request-Method': 'POST' } }))
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGEM)
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-jornada-ator')
    const ruim = await h(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'OPTIONS', headers: { Origin: 'https://malicioso.invalid' } }))
    expect(ruim.status).toBe(403)
    expect(ruim.headers.get('access-control-allow-origin')).toBeNull()
    const post2 = await h(post('/functions/v1/jornada-cirurgica', { acao: 'sessao', dados: {} }, { Origin: 'https://malicioso.invalid' }))
    expect(post2.status).toBe(403)
    expect(post2.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('cabeçalhos de segurança em toda resposta', async () => {
    const { h } = handlerSemBanco()
    const r = await h(post('/functions/v1/jornada-cirurgica', { acao: 'sessao', dados: {} }, { Origin: ORIGEM }))
    expect(r.status).toBe(401)
    expect(r.headers.get('cache-control')).toContain('no-store')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-frame-options')).toBe('DENY')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGEM)
    expect(await r.json()).toEqual({ ok: false, erro: { codigo: 'nao_autenticado', mensagem: expect.any(String) } })
  })

  it('método, tipo de conteúdo, rota e credencial: recusados antes do corpo e do banco', async () => {
    const { h } = handlerSemBanco()
    expect((await h(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'GET' }))).status).toBe(405)
    expect((await h(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } }))).status).toBe(415)
    expect((await h(post('/functions/v1/outra', { acao: 'sessao' }))).status).toBe(404)
    const semToken = await h(post('/functions/v1/jornada-cirurgica', { acao: 'sessao', dados: {} }))
    expect(semToken.status).toBe(401)
    const tokenRuim = await h(post('/functions/v1/jornada-cirurgica', { acao: 'sessao', dados: {} }, { Authorization: 'Bearer dev1.e30.xxx' }))
    expect(tokenRuim.status).toBe(401)
    // Corpo declarado acima do limite: recusado sem ler (página do paciente, 256 KB).
    const grande = await h(new Request('http://localhost/functions/v1/jornada-paciente', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(300_000) }, body: 'x'.repeat(300_000) }))
    expect(grande.status).toBe(413)
    const latin1 = await h(new Request('http://localhost/functions/v1/jornada-paciente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([0x7b, 0xff, 0x7d]) }))
    expect(latin1.status).toBe(400)
  })

  it('página do paciente: token malformado não toca no banco', async () => {
    const { h } = handlerSemBanco()
    const r = await h(post('/functions/v1/jornada-paciente', { acao: 'pagina.obter', token: 'curto', dados: {} }))
    expect(r.status).toBe(404)
    const b = (await r.json()) as { erro: { codigo: string } }
    expect(b.erro.codigo).toBe('nao_encontrado')
  })

  it('cada Edge Function serve só a sua rota', async () => {
    const { h } = handlerSemBanco({ funcoes: ['paciente'] })
    const r = await h(post('/functions/v1/jornada-cirurgica', { acao: 'sessao', dados: {} }))
    expect(r.status).toBe(404)
  })

  it('log sem corpo nem dado: só função, status e código', async () => {
    const { h, logger } = handlerSemBanco()
    await h(post('/functions/v1/jornada-cirurgica', { acao: 'paciente.buscar_cpf', dados: { cpf: cpfTeste(3) } }))
    expect(logger.linhas.join('\n')).not.toContain(cpfTeste(3))
    expect(logger.linhas[0]).toContain('"funcao":"equipe"')
    expect(logger.linhas[0]).toContain('"status":401')
  })
})

describe('mapeamento de erros', () => {
  it('domínio → contrato', () => {
    expect(converterErro(new ErroDominio('HARD_STOP', 'x', { hardStops: ['HS1_DIVERGENCIA_LIO'] }))).toMatchObject({ codigo: 'hard_stop', status: 409, detalhes: { hardStops: ['HS1_DIVERGENCIA_LIO'] } })
    expect(converterErro(new ErroDominio('SEM_PERMISSAO', 'x'))).toMatchObject({ codigo: 'sem_permissao', status: 403 })
    expect(converterErro(new ErroDominio('ORDEM', 'x'))).toMatchObject({ codigo: 'ordem', status: 409 })
    expect(converterErro(new ErroDominio('VALIDACAO', 'x'))).toMatchObject({ codigo: 'validacao', status: 400 })
    expect(converterErro(new ErroDominio('ESTADO', 'x'))).toMatchObject({ codigo: 'validacao', status: 409 })
    expect(converterErro(new ErroDominio('CONFERENCIA_CEGA', 'x'))).toMatchObject({ codigo: 'conferencia_cega', status: 403 })
    expect(converterErro(new ErroDominio('NAO_IMPLEMENTADO', 'x'))).toMatchObject({ codigo: 'indisponivel', status: 503 })
  })

  it('Postgres → contrato, sem repassar a mensagem do banco', () => {
    const pg = (code: string, constraint_name?: string) => Object.assign(new Error('Key (cpf_hmac)=(abc) already exists'), { code, constraint_name })
    expect(converterErro(pg('23505', 'eventos_episodio_seq_unico'))).toMatchObject({ codigo: 'conflito_versao' })
    expect(converterErro(pg('42501'))).toMatchObject({ codigo: 'sem_permissao' })
    expect(converterErro(pg('JC001'))).toMatchObject({ codigo: 'sem_permissao' })
    expect(converterErro(pg('23514')).message).not.toContain('abc')
    expect(converterErro(new TypeError('x'))).toMatchObject({ codigo: 'indisponivel', status: 503 })
  })
})
