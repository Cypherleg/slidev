// Sessão, inscrição por convite, MFA, PIN e ator (troca rápida de usuário), contra banco real.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APARELHO, bancoPronto, CONVIDADA, criarAmbiente, INATIVO, PIN, SEM_CONVITE, U, type Ambiente } from './apoio.ts'

describe.skipIf(!bancoPronto)('sessão, inscrição e PIN (banco real)', () => {
  let amb: Ambiente
  beforeAll(async () => {
    amb = await criarAmbiente()
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('sessão do membro: papéis, PIN, modo ensaio, aal', async () => {
    const s = await amb.ok(U.concierge, 'sessao', {})
    expect(s).toEqual({
      membro: { id: U.concierge.id, nome: U.concierge.nome, papeis: ['concierge'], temPin: true },
      ator: null,
      modoEnvio: 'ensaio',
      ambiente: 'desenvolvimento',
      mfaExigidoPara: [],
      aal: 'aal2',
    })
    const [ap] = await amb.banco.sql`select id from jornada_cirurgica.aparelhos where id = ${APARELHO}`
    expect(ap).toBeTruthy()
  })

  it('inscrição no primeiro acesso pelo convite (e-mail do Auth, nunca do corpo)', async () => {
    const s = await amb.ok(CONVIDADA, 'sessao', { email: 'outra@exemplo.test', papeis: ['gestora'] } as never)
    expect(s.membro).toMatchObject({ id: CONVIDADA.id, papeis: ['enfermagem'], temPin: false })
    const [c] = await amb.banco.sql`select vinculado_user_id from jornada_cirurgica.convites where email = ${CONVIDADA.email}`
    expect(c.vinculado_user_id).toBe(CONVIDADA.id)
    // Outra conta com o mesmo e-mail não herda o convite já vinculado.
    const r = await amb.chamar({ id: 'a0000000-0000-4000-8000-0000000000ff', email: CONVIDADA.email }, 'sessao', {})
    expect(r.status).toBe(403)
  })

  it('sem convite ou desativado: sem acesso; mensagem genérica', async () => {
    const r = await amb.chamar(SEM_CONVITE, 'sessao', {})
    expect(r.status).toBe(403)
    expect(r.corpo).toEqual({ ok: false, erro: { codigo: 'sem_permissao', mensagem: 'Usuário sem acesso a este painel.' } })
    expect((await amb.chamar(INATIVO, 'sessao', {})).status).toBe(403)
  })

  it('membros.ativos lista só ativos e filtra por papel', async () => {
    const todos = await amb.ok(U.enfermagem, 'membros.ativos', {})
    expect(todos.map(m => m.id)).not.toContain(INATIVO.id)
    const cir = await amb.ok(U.enfermagem, 'membros.ativos', { papel: 'cirurgiao' })
    expect(cir.map(m => m.id).sort()).toEqual([U.cirurgiao.id, U.cirurgiao2.id].sort())
    expect(JSON.stringify(todos)).not.toContain('pbkdf2')
  })

  it('troca de ator por PIN: token curto, preso à sessão e ao aparelho', async () => {
    const r = await amb.ok(U.enfermagem, 'ator.pin', { membroId: U.cirurgiao.id, pin: PIN })
    expect(r.ator).toEqual({ id: U.cirurgiao.id, nome: U.cirurgiao.nome, papeis: ['cirurgiao'] })
    const s = await amb.ok(U.enfermagem, 'sessao', {}, { ator: r.token })
    expect(s.membro.id).toBe(U.enfermagem.id)
    expect(s.ator).toMatchObject({ id: U.cirurgiao.id, expiraEm: r.expiraEm })
    // Mesmo token em outra sessão ou outro aparelho: recusado.
    expect((await amb.chamar(U.circulante, 'sessao', {}, { ator: r.token })).corpo).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado', detalhes: { motivo: 'ator' } } })
    expect((await amb.chamar(U.enfermagem, 'sessao', {}, { ator: r.token, aparelho: 'outro-aparelho-0001' })).status).toBe(401)
    // Encerrar: o token deixa de valer no servidor.
    await amb.ok(U.enfermagem, 'ator.encerrar', {}, { ator: r.token })
    expect((await amb.chamar(U.enfermagem, 'sessao', {}, { ator: r.token })).status).toBe(401)
  })

  it('PIN errado registra falha em acessos e bloqueia depois do limite', async () => {
    for (let i = 0; i < amb.config.falhasPinPorAlvo; i++) {
      const r = await amb.chamar(U.circulante, 'ator.pin', { membroId: U.anestesista.id, pin: '975310' })
      expect(r.corpo).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao', mensagem: 'PIN não confere.' } })
    }
    const bloqueado = await amb.chamar(U.circulante, 'ator.pin', { membroId: U.anestesista.id, pin: PIN })
    expect(bloqueado.status).toBe(429)
    expect(bloqueado.corpo).toMatchObject({ ok: false, erro: { codigo: 'limite_taxa' } })
    const falhas = await amb.banco.sql`select ator_id, sessao_usuario_id, aparelho_id, detalhe from jornada_cirurgica.acessos where recurso = 'pin_falha' and detalhe->>'alvo' = ${U.anestesista.id}`
    expect(falhas).toHaveLength(amb.config.falhasPinPorAlvo)
    expect(falhas[0]).toMatchObject({ ator_id: U.circulante.id, sessao_usuario_id: U.circulante.id, aparelho_id: APARELHO })
    expect(JSON.stringify(falhas)).not.toContain('975310')
  })

  it('membro.definir_pin: 6 dígitos, não trivial; exige o PIN atual; nunca grava o PIN', async () => {
    expect((await amb.chamar(CONVIDADA, 'membro.definir_pin', { pinNovo: '123456' })).status).toBe(400)
    expect((await amb.chamar(CONVIDADA, 'membro.definir_pin', { pinNovo: '12345' })).status).toBe(400)
    await amb.ok(CONVIDADA, 'membro.definir_pin', { pinNovo: '246813' })
    expect((await amb.ok(CONVIDADA, 'sessao', {})).membro.temPin).toBe(true)
    expect((await amb.chamar(CONVIDADA, 'membro.definir_pin', { pinNovo: '357924' })).status).toBe(403) // sem o atual
    expect((await amb.chamar(CONVIDADA, 'membro.definir_pin', { pinNovo: '357924', pinAtual: '000001' })).status).toBe(403)
    await amb.ok(CONVIDADA, 'membro.definir_pin', { pinNovo: '357924', pinAtual: '246813' })
    const [m] = await amb.banco.sql`select pin_hash from jornada_cirurgica.membros where user_id = ${CONVIDADA.id}`
    expect(m.pin_hash).toMatch(/^pbkdf2-sha256\$/)
    expect(m.pin_hash).not.toContain('357924')
    const t = await amb.ok(U.enfermagem, 'ator.pin', { membroId: CONVIDADA.id, pin: '357924' })
    expect(t.ator.id).toBe(CONVIDADA.id)
  })

  it('MFA: cirurgião e gestora com aal1 recebem mfa_exigido (sessao responde)', async () => {
    const mfa = await criarAmbiente({ env: { JORNADA_EXIGIR_MFA: 'true' } })
    try {
      const s = await mfa.ok(U.cirurgiao, 'sessao', {}, { aal: 'aal1' })
      expect(s).toMatchObject({ aal: 'aal1', mfaExigidoPara: ['cirurgiao', 'gestora'] })
      const r = await mfa.chamar(U.cirurgiao, 'membros.ativos', {}, { aal: 'aal1' })
      expect(r.status).toBe(403)
      expect(r.corpo).toMatchObject({ ok: false, erro: { codigo: 'mfa_exigido' } })
      expect((await mfa.chamar(U.gestora, 'membros.ativos', {}, { aal: 'aal1' })).corpo).toMatchObject({ ok: false, erro: { codigo: 'mfa_exigido' } })
      expect((await mfa.chamar(U.cirurgiao, 'membros.ativos', {}, { aal: 'aal2' })).status).toBe(200)
      expect((await mfa.chamar(U.concierge, 'membros.ativos', {}, { aal: 'aal1' })).status).toBe(200)
    } finally {
      await mfa.encerrar()
    }
  })

  it('corpo (autenticado): JSON inválido, ação desconhecida, limite de 256 KB e 7,2 MB só para a foto', async () => {
    const tok = `Bearer ${await amb.token(U.concierge)}`
    const req = (corpo: string) =>
      amb.handler(new Request('http://localhost/functions/v1/jornada-cirurgica', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: tok, 'x-jornada-aparelho': APARELHO }, body: corpo }))
    expect((await req('{x')).status).toBe(400)
    expect((await req(JSON.stringify({ acao: '__proto__', dados: {} }))).status).toBe(404)
    expect((await req(JSON.stringify({ acao: 'sessao', dados: { x: 'a'.repeat(300_000) } }))).status).toBe(413)
    const foto = await req(JSON.stringify({ acao: 'anexo.enviar', dados: { x: 'a'.repeat(1_000_000) } }))
    expect(foto.status).toBe(400) // passou do limite de 256 KB; recusado pela validação, não pelo tamanho
    expect((await req(JSON.stringify({ acao: 'anexo.enviar', dados: { x: 'a'.repeat(7_300_000) } }))).status).toBe(413)
  })

  it('gestão exige a gestora com o próprio login (sem troca por PIN)', async () => {
    expect((await amb.chamar(U.concierge, 'membros.listar', {})).status).toBe(403)
    const viaPin = await amb.pin(U.concierge, U.gestora)
    expect((await amb.chamar(U.concierge, 'membros.listar', {}, { ator: viaPin })).status).toBe(403)
    const lista = await amb.ok(U.gestora, 'membros.listar', {})
    expect(lista.find(m => m.email === U.concierge.email)).toMatchObject({ id: U.concierge.id, vinculado: true, temPin: true, ativo: true })
    expect(lista.find(m => m.email === INATIVO.email)).toMatchObject({ ativo: false })
  })
})
