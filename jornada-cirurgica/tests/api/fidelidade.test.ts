// Ligação na API das mudanças do domínio (revisão de fidelidade; modelos pop-0.4/2):
// semeadura da versão padrão nova em bancos com versão anterior, olho único até a alta, TCLE retido
// (avisos da prévia; "enviados" só com a mensagem do TCLE), categoria do quase-evento e never event.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { modelosPadrao, ORDEM_MODELOS, versoesDosModelos } from '../../supabase/functions/_shared/dominio/index.ts'
import { D7, TO } from '../../supabase/functions/_shared/dominio/modelos/ids.ts'
import { dataLocal } from '../../dev/roteiro.ts'
import { bancoPronto, cpfTeste, criarAmbiente, dominioPronto, roteiroTeste, U, type Ambiente } from './apoio.ts'

const pronto = bancoPronto && dominioPronto

describe.skipIf(!pronto)('modelos: a versão padrão do código entra mesmo com versão anterior no banco', () => {
  let amb: Ambiente
  const padrao = modelosPadrao()
  const versaoNova = padrao.d7.versao
  const anterior = 'pop-0.4/1'
  beforeAll(async () => {
    amb = await criarAmbiente({ semModelos: true })
    // Banco "antigo": só a versão anterior de cada modelo, publicada ontem.
    for (const id of ORDEM_MODELOS) {
      await amb.banco.sql`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo, publicado_em)
        values (${id}, ${anterior}, ${amb.banco.sql.json({ ...padrao[id], versao: anterior } as never)}, now() - interval '1 day')`
    }
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('a primeira leitura grava a versão padrão nova como sistema e ela passa a ser a ativa', async () => {
    expect(versaoNova).not.toBe(anterior)
    const lista = await amb.ok(U.concierge, 'modelos.listar', {})
    for (const id of ORDEM_MODELOS) {
      expect(lista.find(m => m.id === id && m.versao === versoesDosModelos(padrao)[id])?.ativo).toBe(true)
      expect(lista.find(m => m.id === id && m.versao === anterior)?.ativo).toBe(false)
    }
    const novas = await amb.banco.sql`select publicado_por from jornada_cirurgica.modelos_checklist where versao = ${versaoNova}`
    expect(novas).toHaveLength(ORDEM_MODELOS.length)
    expect(novas.every(n => n.publicado_por === null)).toBe(true)
    // Idempotente: nova leitura não grava de novo.
    await amb.ok(U.concierge, 'modelos.listar', {})
    const [c] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.modelos_checklist`
    expect(c.n).toBe(ORDEM_MODELOS.length * 2)
  })

  it('a publicação da gestora vira a ativa e não é sobrescrita; episódios mantêm a versão que guardaram', async () => {
    const r = roteiroTeste(amb)
    const pid = await r.cadastrar({ nome: 'Versao Teste Modelos', nascimento: '1950-01-01', cpf: cpfTeste(410), prontuario: 'T-410' })
    const id = await r.abrir(pid, 'OD', dataLocal(10))
    expect((await r.obter(id)).episodio.versoesModelos.d2).toBe(versaoNova)
    const atual = await amb.ok(U.gestora, 'modelos.obter', { id: 'd2' })
    const pub = await amb.ok(U.gestora, 'modelos.publicar', { modelo: { ...atual, titulo: `${atual.titulo} (revisado)` } })
    expect(pub.versao).toBe(`${versaoNova}+gestora.1`)
    const lista = await amb.ok(U.gestora, 'modelos.listar', {})
    expect(lista.find(m => m.id === 'd2' && m.versao === pub.versao)?.ativo).toBe(true)
    expect((await r.obter(id)).episodio.versoesModelos.d2).toBe(versaoNova)
    // Episódio aberto na versão anterior continua com ela (conteúdo da tabela).
    await amb.banco.sql`update jornada_cirurgica.episodios set versoes_modelos = ${amb.banco.sql.json(Object.fromEntries(ORDEM_MODELOS.map(m => [m, anterior])) as never)} where id = ${id}`
    const v = await r.obter(id)
    expect(v.episodio.versoesModelos.d7).toBe(anterior)
    expect(v.modelos.d7.versao).toBe(anterior)
  })
})

describe.skipIf(!pronto)('itens novos do domínio pela API', () => {
  let amb: Ambiente
  let r: ReturnType<typeof roteiroTeste>
  let n = 420
  const paciente = (nome: string) => r.cadastrar({ nome, nascimento: '1952-02-02', cpf: cpfTeste(n++), prontuario: `T-${n}` })
  beforeAll(async () => {
    amb = await criarAmbiente()
    r = roteiroTeste(amb)
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('olho único: D-7 → alta com os itens condicionais (conversa no D-2, preceptor no Time Out, alta)', async () => {
    const hoje = dataLocal(0)
    const id = await r.abrir(await paciente('Unico Teste Olho'), 'OE', hoje)
    await r.d7(id, { dataCirurgia: hoje, ordem: 7, dioptria: 20.5, sobrepor: { [D7.olhoUnico]: 'sim', [D7.olhoUnicoQual]: 'olho_unico' } })
    await r.cp1(id)
    await r.cp2(id, 20.5)
    await r.d2(id)
    await r.admissao(id)
    await r.signIn(id)
    await r.anestesia(id)
    const to = await r.timeOut(id)
    expect(to.respostas.time_out?.[TO.olhoUnicoPreceptor]?.valor).toBe(true)
    await r.signOut(id)
    await r.liberacaoAnestesia(id)
    const fim = await r.alta(id)
    expect(fim.episodio.estado).toBe('alta')
    expect(fim.identificacao.alertasExtenso.join(' ')).toMatch(/OLHO ÚNICO/)
  }, 120_000)

  it('TCLE retido (expectativa sem conduta): prévia com avisos; "enviados" recusado sem a mensagem do TCLE', async () => {
    const id = await r.abrir(await paciente('Retido Teste Tcle'), 'OD', dataLocal(9))
    await r.com(id, U.concierge, 'episodio.agendar', { dataCirurgia: dataLocal(9), horario: '07:00', ordem: 1 })
    await r.contatos(id)
    await r.responder(id, 'd7', U.concierge, { [D7.semOculos]: 'sim' }, (_i, secao) => secao === 'F')
    const previa = await amb.ok(U.concierge, 'materiais.previa', { episodioId: id })
    expect(previa.avisos.join(' ')).toMatch(/TCLE retido/)
    expect(previa.mensagens).toHaveLength(0)
    await r.com(id, U.concierge, 'materiais.enviar', {}).catch(() => null) // só preparo (ou nada a enviar): sem mensagem
    const [m] = await amb.banco.sql`select count(*)::int as n from jornada_cirurgica.mensagens_saida where episodio_id = ${id}`
    expect(m.n).toBe(0)
    const v = await r.obter(id)
    const enviados = await amb.chamar(U.concierge, 'checklist.responder', { episodioId: id, versao: v.episodio.versao, modelo: 'd7', respostas: [{ itemId: D7.materiais, valor: 'enviados' }] })
    expect(enviados.status).toBe(409)
    expect(enviados.corpo).toMatchObject({ ok: false, erro: { codigo: 'ordem' } })
  })

  it('quase-evento com categoria e intercorrência com never event chegam ao domínio', async () => {
    const id = await r.abrir(await paciente('Categoria Teste Quase'), 'OD', dataLocal(0))
    await r.d7(id, { dataCirurgia: dataLocal(0), ordem: 8, dioptria: 21 })
    await r.com(id, U.concierge, 'quase_evento.registrar', { etapa: 'chegada', descricao: 'Caixa de outro paciente no envelope (fictício).', categoria: 'lio' })
    expect((await amb.chamar(U.concierge, 'quase_evento.registrar', { episodioId: id, versao: (await r.obter(id)).episodio.versao, etapa: 'd2', descricao: 'x', categoria: 'inventada' })).status).toBe(400)
    await r.cp1(id)
    await r.cp2(id, 21)
    await r.d2(id)
    await r.admissao(id)
    await r.com(id, U.enfermagem, 'intercorrencia.registrar', { descricao: 'Intercorrência fictícia.', neverEvent: 'lio_errada' })
    const evs = await amb.banco.sql`select tipo, dados from jornada_cirurgica.eventos where episodio_id = ${id} and tipo in ('quase_evento.registrado', 'intercorrencia.registrada')`
    expect(evs.find(e => e.tipo === 'quase_evento.registrado')?.dados).toMatchObject({ categoria: 'lio' })
    expect(evs.find(e => e.tipo === 'intercorrencia.registrada')?.dados).toMatchObject({ neverEvent: 'lio_errada' })
  }, 120_000)
})
