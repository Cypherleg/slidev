// Fila de saída: com envio desligado nada é reivindicado; com envio ligado (cliente Meta FALSO),
// estados enviado / falhou / desconhecido; desconhecido nunca é reenviado; avisos suspensos →
// cancelado; o link do paciente só é restaurado na hora do envio.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarClienteMeta, processarFila, type ClienteMeta, type EnvioMeta, type FetchLike } from '../../supabase/functions/_shared/api/index.ts'
import { dataLocal } from '../../dev/roteiro.ts'
import { bancoPronto, cpfTeste, criarAmbiente, dominioPronto, roteiroTeste, U, type Ambiente } from './apoio.ts'

describe('cliente da Meta (sem banco)', () => {
  it('monta a chamada da Cloud API; timeout e 5xx = desconhecido; 4xx = falhou', async () => {
    const chamadas: { url: string; init?: RequestInit }[] = []
    let modo: 'ok' | '400' | '503' | 'lento' = 'ok'
    const f: FetchLike = async (url, init) => {
      chamadas.push({ url, init })
      if (modo === 'lento')
        await new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abortado'))))
      if (modo === '400') return new Response('{}', { status: 400 })
      if (modo === '503') return new Response('{}', { status: 503 })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.TESTE' }] }), { status: 200 })
    }
    const c = criarClienteMeta({ token: 'tok-teste', phoneId: '123', graphVersao: 'v21.0', timeoutMs: 50 }, f)
    expect(await c.enviar({ para: '+55 (00) 90000-0001', texto: 'Olá', modeloMeta: null, parametros: {} })).toEqual({ tipo: 'enviado', provedorId: 'wamid.TESTE' })
    expect(chamadas[0].url).toBe('https://graph.facebook.com/v21.0/123/messages')
    expect(new Headers(chamadas[0].init?.headers).get('authorization')).toBe('Bearer tok-teste')
    expect(JSON.parse(String(chamadas[0].init?.body))).toMatchObject({ messaging_product: 'whatsapp', to: '5500900000001', type: 'text', text: { body: 'Olá' } })
    expect(await c.enviar({ para: '1', texto: 'x', modeloMeta: 'modelo_teste', parametros: { '2': 'b', '1': 'a' } })).toMatchObject({ tipo: 'enviado' })
    expect(JSON.parse(String(chamadas[1].init?.body)).template.components[0].parameters).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])
    modo = '400'
    expect(await c.enviar({ para: '1', texto: 'x', modeloMeta: null, parametros: {} })).toEqual({ tipo: 'falhou', http: 400 })
    modo = '503'
    expect(await c.enviar({ para: '1', texto: 'x', modeloMeta: null, parametros: {} })).toEqual({ tipo: 'desconhecido', http: 503 })
    modo = 'lento'
    expect(await c.enviar({ para: '1', texto: 'x', modeloMeta: null, parametros: {} })).toEqual({ tipo: 'desconhecido' })
  })
})

describe.skipIf(!bancoPronto || !dominioPronto)('fila de saída (banco real)', () => {
  let amb: Ambiente
  let id: string
  beforeAll(async () => {
    amb = await criarAmbiente({ configExtra: { envioHabilitado: true } })
    const r = roteiroTeste(amb)
    const pid = await r.cadastrar({ nome: 'Paciente Teste Fila', nascimento: '1950-05-05', cpf: cpfTeste(300), prontuario: 'T-300' })
    id = await r.abrir(pid, 'OD', dataLocal(1))
    await r.d7(id, { dataCirurgia: dataLocal(1), dioptria: 21.0 })
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  const inserir = async (telefone: string, estado = 'pendente') => {
    const [m] = await amb.banco.sql`insert into jornada_cirurgica.mensagens_saida (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por)
      values (${id}, 'atraso', 'contato-teste', ${telefone}, 'Mensagem fictícia de teste.', ${`teste:${telefone}:${Math.random()}`}, ${estado}, ${U.concierge.id}) returning id`
    return m.id as string
  }
  const estado = async (mid: string) => (await amb.banco.sql`select estado, provedor_id, ultimo_erro, tentativas from jornada_cirurgica.mensagens_saida where id = ${mid}`)[0]

  it('mensagens geradas com envio ligado nascem pendentes; o link sai cifrado e é restaurado só no envio', async () => {
    const pendentes = await amb.banco.sql`select id, texto, parametros, estado from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`
    expect(pendentes.length).toBeGreaterThan(0)
    expect(pendentes.every(m => m.estado === 'pendente')).toBe(true)
    const enviados: EnvioMeta[] = []
    const meta: ClienteMeta = { enviar: async m => (enviados.push(m), { tipo: 'enviado', provedorId: `wamid.${enviados.length}` }) }
    const r = await processarFila({ db: amb.db, config: amb.config, meta, logger: amb.logger })
    expect(r).toMatchObject({ modo: 'real', reivindicadas: pendentes.length, enviadas: pendentes.length })
    const comLink = enviados.find(m => m.texto.includes('exemplo.invalid/p/'))
    if (comLink) expect(comLink.texto).toMatch(/exemplo\.invalid\/p\/[A-Za-z0-9_-]{43}/)
    for (const m of enviados) expect(m.texto).not.toContain('{{LINK_TOKEN}}')
    const linhas = await amb.banco.sql`select estado from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`
    expect(linhas.every(l => l.estado === 'enviado')).toBe(true)
  })

  it('falhou (4xx), desconhecido (timeout/5xx) e nunca reenvia automaticamente', async () => {
    const ok = await inserir('00900000101')
    const quatro = await inserir('00900000102')
    const timeout = await inserir('00900000103')
    const cinco = await inserir('00900000104')
    const ensaio = await inserir('00900000105', 'ensaio')
    let envios = 0
    const meta: ClienteMeta = {
      enviar: async m => {
        envios++
        if (m.para.endsWith('101')) return { tipo: 'enviado', provedorId: 'wamid.101' }
        if (m.para.endsWith('102')) return { tipo: 'falhou', http: 400 }
        if (m.para.endsWith('103')) return { tipo: 'desconhecido' }
        return { tipo: 'desconhecido', http: 503 }
      },
    }
    const r1 = await processarFila({ db: amb.db, config: amb.config, meta, logger: amb.logger })
    expect(r1).toMatchObject({ reivindicadas: 4, enviadas: 1, falhas: 1, desconhecidas: 2 })
    expect(await estado(ok)).toMatchObject({ estado: 'enviado', provedor_id: 'wamid.101', tentativas: 1 })
    expect(await estado(quatro)).toMatchObject({ estado: 'falhou', ultimo_erro: 'http_400' })
    expect(await estado(timeout)).toMatchObject({ estado: 'desconhecido', ultimo_erro: 'timeout_ou_rede' })
    expect(await estado(cinco)).toMatchObject({ estado: 'desconhecido', ultimo_erro: 'http_503' })
    expect(await estado(ensaio)).toMatchObject({ estado: 'ensaio', tentativas: 0 })
    const r2 = await processarFila({ db: amb.db, config: amb.config, meta, logger: amb.logger })
    expect(r2.reivindicadas).toBe(0)
    expect(envios).toBe(4)
    const hist = await amb.banco.sql`select estado from jornada_cirurgica.mensagens_saida_eventos where mensagem_id = ${timeout} order by id`
    expect(hist.map(h => h.estado)).toEqual(['enviando', 'desconhecido'])
    // Log sem telefone nem texto.
    expect(amb.logger.linhas.join('\n')).not.toContain('00900000103')
  })

  it('com envio desligado nada é reivindicado', async () => {
    const pend = await inserir('00900000106')
    const r = await processarFila({ db: amb.db, config: { ...amb.config, envioHabilitado: false }, meta: { enviar: () => Promise.reject(new Error('não')) }, logger: amb.logger })
    expect(r).toMatchObject({ modo: 'ensaio', reivindicadas: 0 })
    expect(await estado(pend)).toMatchObject({ estado: 'pendente', tentativas: 0 })
    await amb.banco.sql`update jornada_cirurgica.mensagens_saida set estado = 'cancelado' where id = ${pend}`
  })

  it('avisos suspensos no episódio (intercorrência): pendente vira cancelado sem envio', async () => {
    // Intercorrência é registrada por quem está no D0; aqui o episódio ainda está antes da admissão:
    // usamos um episódio cancelado (avisos suspensos) para conferir a checagem na hora do envio.
    const v = await amb.ok(U.cirurgiao, 'episodio.obter', { episodioId: id })
    await amb.ok(U.cirurgiao, 'episodio.cancelar', { episodioId: id, versao: v.episodio.versao, motivo: 'Cancelamento fictício de teste.', causa: 'outra', evitavel: false })
    const pend = await inserir('00900000107')
    let envios = 0
    const r = await processarFila({ db: amb.db, config: amb.config, meta: { enviar: async () => (envios++, { tipo: 'enviado', provedorId: 'x' }) }, logger: amb.logger })
    expect(envios).toBe(0)
    expect(r.canceladas).toBe(1)
    expect(await estado(pend)).toMatchObject({ estado: 'cancelado', ultimo_erro: 'avisos_suspensos' })
  })
})
