// RLS de escrita como a API faz (jornada_api + jornada.ator) e como jornada_sistema.
// Toda tentativa roda numa transação desfeita: o banco do arquivo fica intacto.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import {
  APARELHO,
  CHECK_VIOLADO,
  EPISODIO,
  M,
  MENSAGEM,
  PACIENTE,
  REGRA_MEMBROS,
  RLS_OU_PRIVILEGIO,
  UNICO_VIOLADO,
  type Tx,
  erroDe,
  semear,
  tentar,
} from './apoio-rls.ts'

let banco: BancoTeste

beforeAll(async () => {
  banco = await criarBancoTeste()
  await semear(banco.sql)
})

afterAll(async () => {
  await banco?.encerrar()
})

interface NovoEvento {
  tipo: string
  dados?: Record<string, unknown>
  visibilidade?: string
  autorPapel: string
  autorId?: string | null // undefined = default (ator_id())
  seq?: number | null
  episodioId?: string | null
}

let proximoSeq = 100
const inserirEvento = (e: NovoEvento) => (tx: Tx) => {
  const dados = tx.json((e.dados ?? {}) as never)
  const seq = e.seq === undefined ? proximoSeq++ : e.seq
  const episodio = e.episodioId === undefined ? EPISODIO : e.episodioId
  return e.autorId === undefined
    ? tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, visibilidade, autor_papel)
         values (${episodio}, ${seq}, ${e.tipo}, ${dados}, ${e.visibilidade ?? 'geral'}, ${e.autorPapel})
         returning id, autor_id, sessao_usuario_id, aparelho_id`
    : tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, visibilidade, autor_id, autor_papel)
         values (${episodio}, ${seq}, ${e.tipo}, ${dados}, ${e.visibilidade ?? 'geral'}, ${e.autorId}, ${e.autorPapel})
         returning id`
}

// Visibilidade errada pode ser barrada pela RLS (o RETURNING exige que o autor enxergue a linha)
// antes do CHECK da tabela; os dois códigos significam "recusado".
const RECUSADO = [CHECK_VIOLADO, RLS_OU_PRIVILEGIO]

const evento = (ator: string | null, e: NovoEvento, papel: 'jornada_api' | 'jornada_sistema' = 'jornada_api') =>
  erroDe(banco.sql, ator, inserirEvento(e), { papel })

describe('eventos: INSERT pela equipe (jornada_api)', () => {
  it('membro grava o próprio evento; autor, sessão e aparelho vêm do contexto', async () => {
    const r = await tentar(banco.sql, M.concierge, inserirEvento({
      tipo: 'checklist.item_respondido', dados: { modelo: 'd7', itemId: 'B.1', valor: 'nao' }, autorPapel: 'concierge',
    }))
    expect(r.codigo).toBeNull()
    expect(r.valor).toMatchObject([{ autor_id: M.concierge, sessao_usuario_id: M.concierge, aparelho_id: APARELHO }])
  })

  it('ator diferente do autor_id não insere', async () => {
    expect(await evento(M.concierge, {
      tipo: 'checklist.item_respondido', dados: { modelo: 'd7', itemId: 'B.1', valor: 'nao' },
      autorPapel: 'concierge', autorId: M.gestora,
    })).toBe(RLS_OU_PRIVILEGIO)
  })

  it('papel não permitido na matriz não insere', async () => {
    // concierge registrando conduta de alerta (só cirurgião)
    expect(await evento(M.concierge, { tipo: 'alerta.conduta_registrada', dados: { alertaId: 'x' }, autorPapel: 'concierge' }))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.cirurgiao, { tipo: 'alerta.conduta_registrada', dados: { alertaId: 'x' }, autorPapel: 'cirurgiao' }))
      .toBeNull()
    // enfermagem respondendo item do modelo d7 (só concierge); admissão é dela
    expect(await evento(M.enfermagem, {
      tipo: 'checklist.item_respondido', dados: { modelo: 'd7', itemId: 'A.1', valor: 'sim' }, autorPapel: 'enfermagem',
    })).toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.enfermagem, {
      tipo: 'checklist.item_respondido', dados: { modelo: 'admissao', itemId: 'A.1', valor: true }, autorPapel: 'enfermagem',
    })).toBeNull()
    // conferente concluindo o bloco cp1 (só concierge)
    expect(await evento(M.conferente, { tipo: 'bloco.concluido', dados: { modelo: 'cp1' }, autorPapel: 'conferente' }))
      .toBe(RLS_OU_PRIVILEGIO)
    // material.aberto / quiz.respondido: nenhum papel da equipe
    expect(await evento(M.gestora, { tipo: 'quiz.respondido', dados: {}, autorPapel: 'gestora' })).toBe(RLS_OU_PRIVILEGIO)
    // tipo inexistente
    expect(await evento(M.gestora, { tipo: 'tipo.inventado', dados: {}, autorPapel: 'gestora' })).toBe(RLS_OU_PRIVILEGIO)
  })

  it('checklist exige modelo conhecido; nos demais tipos dados.modelo não interfere', async () => {
    expect(await evento(M.concierge, { tipo: 'checklist.item_respondido', dados: { itemId: 'A.1', valor: 'sim' }, autorPapel: 'concierge' }))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.concierge, { tipo: 'checklist.item_respondido', dados: { modelo: 'x', itemId: 'A.1', valor: 'sim' }, autorPapel: 'concierge' }))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.concierge, { tipo: 'alerta.comunicado', dados: { modelo: 'd7', alertaId: 'd7:B.1' }, autorPapel: 'concierge' }))
      .toBeNull()
  })

  it('autor_papel tem de ser um dos papéis do ator', async () => {
    expect(await evento(M.concierge, { tipo: 'alerta.conduta_registrada', dados: { alertaId: 'x' }, autorPapel: 'cirurgiao' }))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.concierge, { tipo: 'alerta.comunicado', dados: { alertaId: 'x' }, autorPapel: 'gestora' }))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.concierge, { tipo: 'alerta.comunicado', dados: { alertaId: 'x' }, autorPapel: 'sistema' }))
      .toBe(RLS_OU_PRIVILEGIO)
  })

  it('membro inativo, não membro e ator ausente não inserem', async () => {
    const e: NovoEvento = { tipo: 'hardstop.resolvido', dados: { codigo: 'HS4_SEM_ACOMPANHANTE' }, autorPapel: 'concierge' }
    expect(await evento(M.inativo, e)).toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(M.naoMembro, e)).toBe(RLS_OU_PRIVILEGIO)
    expect([RLS_OU_PRIVILEGIO, '23502']).toContain(await evento(null, e))
  })

  it('visibilidade obrigatória: cp1 -> conferencia_1, cp2 -> conferencia_2, demais -> geral', async () => {
    const cp1 = { tipo: 'checklist.item_respondido', dados: { modelo: 'cp1', itemId: 'caixa', valor: true }, autorPapel: 'concierge' }
    expect(await evento(M.concierge, { ...cp1, visibilidade: 'geral' })).toBe(CHECK_VIOLADO)
    expect(RECUSADO).toContain(await evento(M.concierge, { ...cp1, visibilidade: 'conferencia_2' }))
    expect(await evento(M.concierge, { ...cp1, visibilidade: 'conferencia_1' })).toBeNull()

    const cp2 = { tipo: 'checklist.item_respondido', dados: { modelo: 'cp2', itemId: 'caixa', valor: true }, autorPapel: 'conferente' }
    expect(await evento(M.conferente, { ...cp2, visibilidade: 'geral' })).toBe(CHECK_VIOLADO)
    expect(RECUSADO).toContain(await evento(M.conferente, { ...cp2, visibilidade: 'conferencia_1' }))
    expect(await evento(M.conferente, { ...cp2, visibilidade: 'conferencia_2' })).toBeNull()

    // Demais eventos: só 'geral'.
    expect(await evento(M.concierge, {
      tipo: 'checklist.item_respondido', dados: { modelo: 'd7', itemId: 'A.1', valor: 'sim' }, autorPapel: 'concierge', visibilidade: 'conferencia_1',
    })).toBe(CHECK_VIOLADO)
    expect(await evento(M.concierge, { tipo: 'bloco.concluido', dados: { modelo: 'cp1' }, autorPapel: 'concierge', visibilidade: 'conferencia_1' }))
      .toBe(CHECK_VIOLADO)
    expect(await evento(M.concierge, { tipo: 'bloco.concluido', dados: { modelo: 'cp1' }, autorPapel: 'concierge' })).toBeNull()

    // Registros de lente: conferência correspondente ou 'geral' (sem valores).
    expect(await evento(M.concierge, { tipo: 'lente.plano_registrado', dados: { registroId: 'r' }, autorPapel: 'concierge', visibilidade: 'conferencia_1' })).toBeNull()
    expect(RECUSADO).toContain(await evento(M.concierge, { tipo: 'lente.plano_registrado', dados: { registroId: 'r' }, autorPapel: 'concierge', visibilidade: 'conferencia_2' }))
    expect(RECUSADO).toContain(await evento(M.conferente, { tipo: 'lente.cp2_registrado', dados: { registroId: 'r' }, autorPapel: 'conferente', visibilidade: 'conferencia_1' }))
  })

  it("eventos 'geral' nunca carregam valores de lente (dioptria, cilindro, eixo em qualquer nível)", async () => {
    expect(await evento(M.concierge, { tipo: 'lente.plano_registrado', dados: { dioptria: 21.5 }, autorPapel: 'concierge' })).toBe(CHECK_VIOLADO)
    expect(await evento(M.conferente, { tipo: 'lente.cp2_resultado', dados: { valores: { eixo: 90 } }, autorPapel: 'conferente' })).toBe(CHECK_VIOLADO)
    expect(await evento(M.conferente, { tipo: 'lente.cp2_resultado', dados: { confere: false, camposDivergentes: ['dioptria', 'eixo'] }, autorPapel: 'conferente' }))
      .toBeNull()
    // Na conferência correspondente os valores são aceitos (o domínio prefere lente_registros).
    expect(await evento(M.concierge, { tipo: 'lente.plano_registrado', dados: { dioptria: 21.5 }, autorPapel: 'concierge', visibilidade: 'conferencia_1' })).toBeNull()
  })

  it('jornada_sistema: só autor_papel sistema/paciente e tipos da matriz', async () => {
    expect(await evento(null, { tipo: 'quiz.respondido', dados: { aprovado: true }, autorPapel: 'paciente', autorId: PACIENTE }, 'jornada_sistema')).toBeNull()
    expect(await evento(null, { tipo: 'mensagem.enfileirada', dados: {}, autorPapel: 'sistema', autorId: M.gestora }, 'jornada_sistema')).toBeNull()
    expect(await evento(null, { tipo: 'checklist.item_respondido', dados: { modelo: 'd7' }, autorPapel: 'concierge', autorId: M.concierge }, 'jornada_sistema'))
      .toBe(RLS_OU_PRIVILEGIO)
    expect(await evento(null, { tipo: 'tipo.inventado', dados: {}, autorPapel: 'sistema', autorId: M.gestora }, 'jornada_sistema'))
      .toBe(RLS_OU_PRIVILEGIO)
  })
})

describe('lente_registros: INSERT por etapa', () => {
  const valores = { olho: 'OD', modelo: 'LIO FICTICIA Y', dioptria: 22, torica: false, cilindro: null, eixo: null }
  const registrar = (ator: string, etapa: string, visibilidade: string, autorId?: string) =>
    erroDe(banco.sql, ator, tx => autorId
      ? tx`insert into jornada_cirurgica.lente_registros (episodio_id, ciclo, etapa, dados, visibilidade, autor_id)
           values (${EPISODIO}, 1, ${etapa}, ${tx.json(valores as never)}, ${visibilidade}, ${autorId}) returning id`
      : tx`insert into jornada_cirurgica.lente_registros (episodio_id, ciclo, etapa, dados, visibilidade)
           values (${EPISODIO}, 1, ${etapa}, ${tx.json(valores as never)}, ${visibilidade}) returning id`)

  it('plano e chegada: concierge; cp2: conferente; time_out: circulante', async () => {
    expect(await registrar(M.concierge, 'plano', 'conferencia_1')).toBeNull()
    expect(await registrar(M.concierge, 'chegada', 'conferencia_1')).toBeNull()
    expect(await registrar(M.conferente, 'cp2', 'conferencia_2')).toBeNull()
    expect(await registrar(M.circulante, 'time_out', 'geral')).toBeNull()
  })

  it('papel errado não registra', async () => {
    expect(await registrar(M.conferente, 'plano', 'conferencia_1')).toBe(RLS_OU_PRIVILEGIO)
    expect(await registrar(M.concierge, 'cp2', 'conferencia_2')).toBe(RLS_OU_PRIVILEGIO)
    expect(await registrar(M.cirurgiao, 'cp2', 'conferencia_2')).toBe(RLS_OU_PRIVILEGIO)
    expect(await registrar(M.enfermagem, 'time_out', 'geral')).toBe(RLS_OU_PRIVILEGIO)
    expect(await registrar(M.inativo, 'plano', 'conferencia_1')).toBe(RLS_OU_PRIVILEGIO)
  })

  it('visibilidade tem de corresponder à etapa; autor tem de ser o ator', async () => {
    expect(await registrar(M.concierge, 'plano', 'geral')).toBe(CHECK_VIOLADO)
    expect(RECUSADO).toContain(await registrar(M.conferente, 'cp2', 'conferencia_1'))
    expect(await registrar(M.concierge, 'plano', 'conferencia_1', M.gestora)).toBe(RLS_OU_PRIVILEGIO)
  })

  it('jornada_sistema não grava valores de lente', async () => {
    expect(await erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.lente_registros (episodio_id, etapa, dados, visibilidade, autor_id)
         values (${EPISODIO}, 'plano', '{}', 'conferencia_1', ${M.concierge})`, { papel: 'jornada_sistema' })).toBe(RLS_OU_PRIVILEGIO)
  })
})

describe('demais tabelas', () => {
  it('acessos: o próprio ator registra (com RETURNING); outro ator_id ou inativo não', async () => {
    const r = await tentar(banco.sql, M.conferente, tx =>
      tx`insert into jornada_cirurgica.acessos (recurso, episodio_id) values ('episodio', ${EPISODIO}) returning ator_id, aparelho_id`)
    expect(r).toEqual({ codigo: null, valor: [{ ator_id: M.conferente, aparelho_id: APARELHO }] })
    expect(await erroDe(banco.sql, M.conferente, tx =>
      tx`insert into jornada_cirurgica.acessos (ator_id, recurso) values (${M.gestora}, 'dia')`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.inativo, tx =>
      tx`insert into jornada_cirurgica.acessos (recurso) values ('dia')`)).toBe(RLS_OU_PRIVILEGIO)
    // Página do paciente (sem ator): jornada_sistema registra.
    expect(await erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.acessos (recurso, episodio_id) values ('pagina_paciente', ${EPISODIO})`, { papel: 'jornada_sistema' })).toBeNull()
  })

  it('anexos: concierge, cirurgião e gestora; conferente não', async () => {
    const anexar = (ator: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.anexos (episodio_id, tipo, storage_path, sha256, content_type, tamanho)
         values (${EPISODIO}, 'foto_plano', ${'episodios/x/' + ator + '.png'}, ${'b'.repeat(64)}, 'image/png', 10) returning id`)
    expect(await anexar(M.conferente)).toBe(RLS_OU_PRIVILEGIO)
    expect(await anexar(M.enfermagem)).toBe(RLS_OU_PRIVILEGIO)
    expect(await anexar(M.concierge)).toBeNull()
    expect(await anexar(M.cirurgiao)).toBeNull()
  })

  it('pacientes: concierge/gestora cadastram e corrigem; CPF puro é recusado', async () => {
    const cadastrar = (ator: string, hmac: string | null) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.pacientes (cpf_hmac, nome_completo, nome_normalizado, data_nascimento)
         values (${hmac}, 'Paciente Teste Beta', 'paciente teste beta', '1948-05-05') returning id, criado_por`)
    expect(await cadastrar(M.enfermagem, null)).toBe(RLS_OU_PRIVILEGIO)
    expect(await cadastrar(M.concierge, 'e'.repeat(64))).toBeNull()
    expect(await cadastrar(M.concierge, '52998224725')).toBe(CHECK_VIOLADO)
    const corrigir = (ator: string) => tentar(banco.sql, ator, tx =>
      tx`update jornada_cirurgica.pacientes set nome_mae = 'Mae Teste Ficticia' where id = ${PACIENTE} returning id`)
    expect((await corrigir(M.concierge)).valor).toHaveLength(1)
    expect((await corrigir(M.enfermagem)).valor).toHaveLength(0) // RLS: nenhuma linha alcançável
  })

  it('episodios: concierge abre; olho e paciente são imutáveis; qualquer membro ativo atualiza a projeção', async () => {
    const abrir = (ator: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.episodios (paciente_id, olho, cirurgiao_id, tipo_cirurgia, tipo_lente)
         values (${PACIENTE}, 'OE', ${M.cirurgiao}, 'facoemulsificacao', 'monofocal') returning id`)
    expect(await abrir(M.concierge)).toBeNull()
    expect(await abrir(M.enfermagem)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`update jornada_cirurgica.episodios set olho = 'OE' where id = ${EPISODIO}`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`update jornada_cirurgica.episodios set paciente_id = ${PACIENTE} where id = ${EPISODIO}`)).toBe(RLS_OU_PRIVILEGIO)
    const projetar = (ator: string) => tentar(banco.sql, ator, tx =>
      tx`update jornada_cirurgica.episodios set estado = 'admitido', versao = versao + 1
          where id = ${EPISODIO} and versao = 0 returning versao`)
    expect((await projetar(M.enfermagem)).valor).toEqual([{ versao: 1 }])
    expect((await projetar(M.inativo)).valor).toEqual([])
    expect(await erroDe(banco.sql, M.enfermagem, tx =>
      tx`update jornada_cirurgica.episodios set resumo = ${tx.json({ lente: { dioptria: 21 } } as never)} where id = ${EPISODIO}`)).toBe(CHECK_VIOLADO)
  })

  it('membros: só a gestora altera papéis/situação; PIN só pelo próprio membro (gestora apenas zera)', async () => {
    const upd = (ator: string, set: string, alvo: string) =>
      tentar(banco.sql, ator, tx => tx.unsafe(`update jornada_cirurgica.membros set ${set} where user_id = '${alvo}' returning user_id`))
    expect((await upd(M.concierge, `papeis = '{concierge,gestora}'`, M.concierge)).codigo).toBe(REGRA_MEMBROS)
    expect((await upd(M.concierge, `ativo = true, nome = 'Outro Nome'`, M.concierge)).codigo).toBe(REGRA_MEMBROS)
    expect((await upd(M.concierge, `pin_hash = 'novo-hash', pin_atualizado_em = now()`, M.concierge)).valor).toHaveLength(1)
    expect((await upd(M.concierge, `pin_hash = 'novo-hash'`, M.enfermagem)).valor).toHaveLength(0)
    expect((await upd(M.gestora, `papeis = '{concierge,conferente}'`, M.concierge)).valor).toHaveLength(1)
    expect((await upd(M.gestora, `ativo = false`, M.concierge)).valor).toHaveLength(1)
    expect((await upd(M.gestora, `pin_hash = 'hash-escolhido-pela-gestora'`, M.concierge)).codigo).toBe(REGRA_MEMBROS)
    expect((await upd(M.gestora, `pin_hash = null`, M.concierge)).valor).toHaveLength(1)
    expect((await upd(M.gestora, `papeis = '{papel_inventado}'`, M.concierge)).codigo).toBe(CHECK_VIOLADO)
    expect((await upd(M.gestora, `email = 'x@exemplo.test'`, M.concierge)).codigo).toBe(RLS_OU_PRIVILEGIO)
    expect((await upd(M.inativo, `pin_hash = 'x'`, M.inativo)).valor).toHaveLength(0)
    // jornada_api não insere membros (inscrição é do jornada_sistema).
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`insert into jornada_cirurgica.membros (user_id, email, nome, papeis) values (gen_random_uuid(), 'z@exemplo.test', 'Z', '{gestora}')`))
      .toBe(RLS_OU_PRIVILEGIO)
  })

  it('membros (jornada_sistema): inscrição só a partir de convite ativo, sem papéis além do convite', async () => {
    await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis) values ('convite.teste@exemplo.test', 'Convite Teste', '{enfermagem}')
                    on conflict do nothing`
    const inscrever = (email: string, papeis: string[]) => erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.membros (user_id, email, nome, papeis) values (gen_random_uuid(), ${email}, 'Convite Teste', ${papeis})`,
    { papel: 'jornada_sistema' })
    expect(await inscrever('sem.convite@exemplo.test', ['enfermagem'])).toBe(RLS_OU_PRIVILEGIO)
    expect(await inscrever('convite.teste@exemplo.test', ['enfermagem', 'gestora'])).toBe(RLS_OU_PRIVILEGIO)
    expect(await inscrever('convite.teste@exemplo.test', ['enfermagem'])).toBeNull()
  })

  it('convites, config, modelos e materiais: escrita só da gestora', async () => {
    expect(await erroDe(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.convites (email, nome, papeis) values ('a@exemplo.test', 'A', '{concierge}')`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`insert into jornada_cirurgica.convites (email, nome, papeis) values ('a@exemplo.test', 'A', '{concierge}')`)).toBeNull()
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`insert into jornada_cirurgica.convites (email, nome, papeis) values ('A@Exemplo.test', 'A', '{concierge}')`)).toBe(CHECK_VIOLADO)

    const config = (ator: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.config (chave, valor) values ('feriados', '[]')
         on conflict (chave) do update set valor = excluded.valor, atualizado_por = excluded.atualizado_por`)
    expect(await config(M.concierge)).toBe(RLS_OU_PRIVILEGIO)
    expect(await config(M.gestora)).toBeNull()

    const modelo = (ator: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo) values ('d7', 'teste/2', '{}')`)
    expect(await modelo(M.concierge)).toBe(RLS_OU_PRIVILEGIO)
    expect(await modelo(M.gestora)).toBeNull()

    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`update jornada_cirurgica.materiais set titulo = 'Editado' where codigo = 'video_preparo'`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`update jornada_cirurgica.materiais set ativo = false where codigo = 'video_preparo'`)).toBeNull()
    expect(await erroDe(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.materiais (codigo, versao, titulo, tipo, momento, publico)
         values ('video_preparo', 2, 'V2', 'video', 'd7', 'paciente')`)).toBe(RLS_OU_PRIVILEGIO)
  })

  it('modelos_checklist: jornada_sistema semeia (publicado_por nulo); jornada_api só com papel gestora; só cresce', async () => {
    const sis = { papel: 'jornada_sistema' } as const
    const semeiaSistema = (versao: string, publicadoPor: string | null) => erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo, publicado_por)
         values ('cp1', ${versao}, ${tx.json({ id: 'cp1', secoes: [] } as never)}, ${publicadoPor})
         on conflict (id, versao) do nothing returning id`, sis)
    expect(await semeiaSistema('pop-0.4/1', null)).toBeNull()
    // Sem informar publicado_por: o padrão (ator_id() sem ator) também é nulo.
    expect(await erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo) values ('d2', 'pop-0.4/1', '{}')`, sis)).toBeNull()
    // Autor fixo de sistema ou pessoa: recusado (gravação do sistema é sempre publicado_por nulo).
    expect(await semeiaSistema('pop-0.4/1', '00000000-0000-4000-8000-000000000000')).toBe(RLS_OU_PRIVILEGIO)
    expect(await semeiaSistema('pop-0.4/1', M.gestora)).toBe(RLS_OU_PRIVILEGIO)
    // Versão já publicada não é sobrescrita.
    expect(await erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo) values ('d7', 'teste/1', '{}')`, sis)).toBe(UNICO_VIOLADO)
    expect(await erroDe(banco.sql, null, tx =>
      tx`update jornada_cirurgica.modelos_checklist set conteudo = '{}'`, sis)).toBe(RLS_OU_PRIVILEGIO)
    // jornada_api: membros sem papel gestora não inserem (nem com publicado_por nulo).
    for (const ator of [M.concierge, M.conferente, M.enfermagem, M.circulante, M.anestesista, M.cirurgiao, M.inativo]) {
      expect(await erroDe(banco.sql, ator, tx =>
        tx`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo, publicado_por) values ('cp1', 'x/1', '{}', null)`), ator)
        .toBe(RLS_OU_PRIVILEGIO)
    }
  })

  it('permissoes_evento: ninguém altera a matriz pela API', async () => {
    for (const [ator, papel] of [[M.gestora, 'jornada_api'], [null, 'jornada_sistema']] as const) {
      const op = { papel } as const
      expect(await erroDe(banco.sql, ator, tx =>
        tx`insert into jornada_cirurgica.permissoes_evento (tipo, modelo, papeis) values ('x.y', null, '{gestora}')`, op)).toBe(RLS_OU_PRIVILEGIO)
      expect(await erroDe(banco.sql, ator, tx =>
        tx`update jornada_cirurgica.permissoes_evento set papeis = '{concierge}' where tipo = 'alerta.conduta_registrada'`, op)).toBe(RLS_OU_PRIVILEGIO)
      expect(await erroDe(banco.sql, ator, tx => tx`delete from jornada_cirurgica.permissoes_evento`, op)).toBe(RLS_OU_PRIVILEGIO)
    }
  })

  it('links_paciente: concierge/gestora criam e revogam; conferente não', async () => {
    const criar = (ator: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.links_paciente (episodio_id, token_hash, expira_em)
         values (${EPISODIO}, ${'1'.repeat(64)}, now() + interval '7 days') returning id`)
    expect(await criar(M.conferente)).toBe(RLS_OU_PRIVILEGIO)
    expect(await criar(M.concierge)).toBeNull()
    // O token em si (base64url, 43 caracteres) nunca é gravado: só o SHA-256 em hex.
    expect(await erroDe(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.links_paciente (episodio_id, token_hash, expira_em)
         values (${EPISODIO}, 'Ab3_-Zz9Ab3_-Zz9Ab3_-Zz9Ab3_-Zz9Ab3_-Zz9Ab3', now() + interval '7 days')`)).toBe(CHECK_VIOLADO)
    const revogar = (ator: string) => tentar(banco.sql, ator, tx =>
      tx`update jornada_cirurgica.links_paciente set revogado_em = now() where episodio_id = ${EPISODIO} returning id`)
    expect((await revogar(M.gestora)).valor).toHaveLength(1)
    expect((await revogar(M.conferente)).valor).toHaveLength(0)
  })

  it('aparelhos: upsert do próprio aparelho', async () => {
    const upsert = (ator: string, id: string, aparelho: string) => erroDe(banco.sql, ator, tx =>
      tx`insert into jornada_cirurgica.aparelhos (id) values (${id})
         on conflict (id) do update set ultimo_acesso = now()`, { aparelho })
    expect(await upsert(M.enfermagem, APARELHO, APARELHO)).toBeNull()
    expect(await upsert(M.enfermagem, 'aparelho-novo', 'aparelho-novo')).toBeNull()
    expect(await upsert(M.enfermagem, 'aparelho-alheio', APARELHO)).toBe(RLS_OU_PRIVILEGIO)
    expect(await upsert(M.inativo, APARELHO, APARELHO)).toBe(RLS_OU_PRIVILEGIO)
  })
})

describe('mensagens_saida', () => {
  const nova = (ator: string, estado: string, chave: string) => erroDe(banco.sql, ator, tx =>
    tx`insert into jornada_cirurgica.mensagens_saida (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado)
       values (${EPISODIO}, 'alta', 'contato-1', '+5544900000000', 'Texto ficticio.', ${chave}, ${estado}) returning id`)

  it('equipe enfileira só em ensaio/pendente e não muda estado', async () => {
    expect(await nova(M.enfermagem, 'pendente', 'k-1')).toBeNull()
    expect(await nova(M.enfermagem, 'ensaio', 'k-2')).toBeNull()
    expect(await nova(M.enfermagem, 'enviado', 'k-3')).toBe(RLS_OU_PRIVILEGIO)
    expect(await nova(M.inativo, 'pendente', 'k-4')).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`update jornada_cirurgica.mensagens_saida set estado = 'cancelado' where id = ${MENSAGEM}`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`insert into jornada_cirurgica.mensagens_saida_eventos (mensagem_id, estado) values (${MENSAGEM}, 'cancelado')`)).toBe(RLS_OU_PRIVILEGIO)
  })

  it('jornada_sistema atualiza só as colunas de estado e nunca mexe em mensagem de ensaio', async () => {
    const sis = { papel: 'jornada_sistema' } as const
    const r = await tentar(banco.sql, null, tx =>
      tx`update jornada_cirurgica.mensagens_saida set estado = 'falhou', tentativas = tentativas + 1, ultimo_erro = 'timeout'
          where id = ${MENSAGEM} returning estado`, sis)
    expect(r).toEqual({ codigo: null, valor: [{ estado: 'falhou' }] })
    expect(await erroDe(banco.sql, null, tx =>
      tx`update jornada_cirurgica.mensagens_saida set texto = 'outro' where id = ${MENSAGEM}`, sis)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, null, tx =>
      tx`update jornada_cirurgica.mensagens_saida set telefone = '+5500000000000' where id = ${MENSAGEM}`, sis)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, null, tx =>
      tx`update jornada_cirurgica.mensagens_saida set estado = 'ensaio' where id = ${MENSAGEM}`, sis)).toBe(RLS_OU_PRIVILEGIO)
    await banco.sql`insert into jornada_cirurgica.mensagens_saida
                      (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por)
                    values (${EPISODIO}, 'alta', 'c', '+5544900000000', 't', 'k-ensaio-sistema', 'ensaio', ${M.gestora})`
    const nenhuma = await tentar(banco.sql, null, tx =>
      tx`update jornada_cirurgica.mensagens_saida set estado = 'pendente' where estado = 'ensaio' returning id`, sis)
    expect(nenhuma).toEqual({ codigo: null, valor: [] })
    expect(await erroDe(banco.sql, null, tx =>
      tx`insert into jornada_cirurgica.mensagens_saida_eventos (mensagem_id, estado) values (${MENSAGEM}, 'falhou')`, sis)).toBeNull()
  })
})
