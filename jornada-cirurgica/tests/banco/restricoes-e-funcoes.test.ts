// Restrições de unicidade (seq por episódio, chaves de idempotência), visibilidade como CHECK
// independente da RLS, fila de saída concorrente (reivindicar_mensagens) e inscrição por e-mail.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import {
  CHECK_VIOLADO,
  EPISODIO,
  EPISODIO_2,
  M,
  RLS_OU_PRIVILEGIO,
  UNICO_VIOLADO,
  type Tx,
  codigoErro,
  comoAtor,
  comoSistema,
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

const respostaD7 = (tx: Tx, episodio: string, seq: number | null, chave: string | null = null) =>
  tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, autor_papel, chave_idempotencia)
     values (${episodio}, ${seq}, 'checklist.item_respondido', ${tx.json({ modelo: 'd7', itemId: 'A.1', valor: 'sim' } as never)},
             'concierge', ${chave})`

describe('unicidade e integridade de eventos', () => {
  it('seq é único por episódio (concorrência otimista); o mesmo seq em outro episódio é aceito', async () => {
    // seq 1..7 já existem no EPISODIO (semente)
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO, 1))).toBe(UNICO_VIOLADO)
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO, 8))).toBeNull()
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO_2, 1))).toBeNull()
    // Duas gravações com o mesmo seq na mesma transação: a segunda falha.
    expect(await erroDe(banco.sql, M.concierge, async tx => {
      await respostaD7(tx, EPISODIO_2, 1)
      await respostaD7(tx, EPISODIO_2, 1)
    })).toBe(UNICO_VIOLADO)
  })

  it('seq exige episódio e é positivo', async () => {
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, null as unknown as string, 3))).toBe(CHECK_VIOLADO)
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO_2, 0))).toBe(CHECK_VIOLADO)
  })

  it('chave_idempotencia é única em eventos e em mensagens_saida', async () => {
    await comoAtor(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO_2, 50, 'chave-unica-1'))
    expect(await erroDe(banco.sql, M.concierge, tx => respostaD7(tx, EPISODIO_2, 51, 'chave-unica-1'))).toBe(UNICO_VIOLADO)
    // ON CONFLICT DO NOTHING: reenvio idempotente não grava nem falha.
    const r = await tentar(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, autor_papel, chave_idempotencia)
         values (${EPISODIO_2}, 52, 'alerta.comunicado', '{}', 'concierge', 'chave-unica-1')
         on conflict (chave_idempotencia) do nothing returning id`)
    expect(r).toEqual({ codigo: null, valor: [] })

    const msg = (chave: string) => (tx: Tx) =>
      tx`insert into jornada_cirurgica.mensagens_saida (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado)
         values (${EPISODIO}, 'alta', 'c', '+5544900000000', 'Texto ficticio.', ${chave}, 'pendente')`
    expect(await erroDe(banco.sql, M.concierge, msg('semente-msg-1'))).toBe(UNICO_VIOLADO)
    expect(await erroDe(banco.sql, M.concierge, msg('nova-chave'))).toBeNull()
  })

  it('a visibilidade obrigatória é CHECK da tabela: vale também para jornada_sistema e sem RETURNING', async () => {
    const cp1 = (vis: string) => (tx: Tx) =>
      tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, visibilidade, autor_id, autor_papel)
         values (${EPISODIO_2}, 90, 'checklist.item_respondido', ${tx.json({ modelo: 'cp1' } as never)}, ${vis}, ${M.concierge}, 'sistema')`
    expect(await erroDe(banco.sql, null, cp1('geral'), { papel: 'jornada_sistema' })).toBe(CHECK_VIOLADO)
    expect(await erroDe(banco.sql, null, cp1('conferencia_1'), { papel: 'jornada_sistema' })).toBeNull()
    expect(await erroDe(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, visibilidade, autor_papel)
         values (${EPISODIO_2}, 91, 'checklist.item_respondido', ${tx.json({ modelo: 'cp1' } as never)}, 'conferencia_2', 'concierge')`))
      .toBe(CHECK_VIOLADO)
  })
})

describe('reivindicar_mensagens (fila de saída)', () => {
  async function criarFila(n: number, prefixo: string) {
    for (let i = 0; i < n; i++) {
      await banco.sql`insert into jornada_cirurgica.mensagens_saida
                        (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por)
                      values (${EPISODIO}, 'alta', ${'c-' + i}, '+5544900000000', 'Texto ficticio.', ${prefixo + i}, 'pendente', ${M.concierge})`
    }
    for (let i = 0; i < 2; i++) {
      await banco.sql`insert into jornada_cirurgica.mensagens_saida
                        (episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por)
                      values (${EPISODIO}, 'alta', 'c-ensaio', '+5544900000000', 'Ensaio.', ${prefixo + 'ensaio-' + i}, 'ensaio', ${M.concierge})`
    }
  }

  async function zerarPendentes() {
    // Coloca as pendentes de testes anteriores fora da fila (como dono, sem RLS).
    await banco.sql`update jornada_cirurgica.mensagens_saida set estado = 'cancelado' where estado in ('pendente', 'enviando')`
  }

  it('só jornada_sistema executa', async () => {
    expect(await erroDe(banco.sql, M.gestora, tx => tx`select * from jornada_cirurgica.reivindicar_mensagens(1)`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, null, tx => tx`select * from jornada_cirurgica.reivindicar_mensagens(1)`, { papel: 'jornada_sistema' })).toBeNull()
  })

  it('duas transações abertas ao mesmo tempo nunca recebem a mesma mensagem (SKIP LOCKED)', async () => {
    await zerarPendentes()
    await criarFila(10, 'conc-a-')
    const a = await banco.sql.reserve()
    const b = await banco.sql.reserve()
    try {
      await a`begin`
      await b`begin`
      await a`set local role jornada_sistema`
      await b`set local role jornada_sistema`
      const deA = await a`select id from jornada_cirurgica.reivindicar_mensagens(6)`
      // A ainda não confirmou: as 6 linhas estão travadas; B recebe as outras.
      const deB = await b`select id from jornada_cirurgica.reivindicar_mensagens(6)`
      await a`commit`
      await b`commit`
      const idsA = deA.map(l => l.id as string)
      const idsB = deB.map(l => l.id as string)
      expect(idsA).toHaveLength(6)
      expect(idsB).toHaveLength(4)
      expect(idsA.filter(id => idsB.includes(id))).toEqual([])
      // Depois de confirmado, nada mais pendente.
      const resto = await comoSistema(banco.sql, tx => tx`select id from jornada_cirurgica.reivindicar_mensagens(100)`)
      expect(resto).toHaveLength(0)
    } finally {
      a.release()
      b.release()
    }
  })

  it('vários envios em paralelo: cada mensagem pendente é entregue exatamente uma vez; ensaio nunca', async () => {
    await zerarPendentes()
    await criarFila(30, 'conc-b-')
    const reivindicar = () => comoSistema(banco.sql, async tx => {
      const linhas = await tx`select id, estado, tentativas from jornada_cirurgica.reivindicar_mensagens(4)`
      await tx`select pg_sleep(0.02)` // segura as travas um pouco
      return linhas.map(l => ({ id: l.id as string, estado: l.estado as string, tentativas: l.tentativas as number }))
    })
    const rodadas: { id: string; estado: string; tentativas: number }[] = []
    for (let rodada = 0; rodada < 4; rodada++) {
      const lotes = await Promise.all([reivindicar(), reivindicar(), reivindicar(), reivindicar()])
      rodadas.push(...lotes.flat())
    }
    const ids = rodadas.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length) // nenhuma duplicada
    expect(ids).toHaveLength(30)
    expect(rodadas.every(r => r.estado === 'enviando' && r.tentativas === 1)).toBe(true)

    const [estado] = await banco.sql`
      select count(*) filter (where estado = 'enviando')::int as enviando,
             count(*) filter (where estado = 'ensaio')::int as ensaio,
             count(*) filter (where estado = 'pendente')::int as pendente
        from jornada_cirurgica.mensagens_saida where chave_idempotencia like 'conc-b-%'`
    expect(estado).toEqual({ enviando: 30, ensaio: 2, pendente: 0 })
    const [{ historico }] = await banco.sql`
      select count(*)::int as historico from jornada_cirurgica.mensagens_saida_eventos e
        join jornada_cirurgica.mensagens_saida m on m.id = e.mensagem_id
       where m.chave_idempotencia like 'conc-b-%' and e.estado = 'enviando'`
    expect(historico).toBe(30)
  })

  it('limite é respeitado e saturado em 0..100', async () => {
    await zerarPendentes()
    await criarFila(3, 'lim-')
    const r = await tentar(banco.sql, null, async tx => ({
      zero: (await tx`select * from jornada_cirurgica.reivindicar_mensagens(0)`).length,
      negativo: (await tx`select * from jornada_cirurgica.reivindicar_mensagens(-5)`).length,
      dois: (await tx`select * from jornada_cirurgica.reivindicar_mensagens(2)`).length,
    }), { papel: 'jornada_sistema' })
    expect(r.valor).toEqual({ zero: 0, negativo: 0, dois: 2 })
  })
})

describe('inscrever_por_email', () => {
  const NOVO = 'e0000000-0000-4000-8000-000000000001'
  const OUTRO = 'e0000000-0000-4000-8000-000000000002'

  const inscrever = (userId: string, email: string) =>
    comoSistema(banco.sql, tx => tx`select user_id, email, nome, papeis, ativo from jornada_cirurgica.inscrever_por_email(${userId}, ${email})`)

  it('cria o membro a partir de convite ativo (e-mail sem diferença de caixa) e vincula o convite', async () => {
    await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis, criado_por)
                    values ('novo.membro@exemplo.test', 'Novo Membro Teste', '{enfermagem,circulante}', ${M.gestora})`
    const r = await inscrever(NOVO, '  Novo.Membro@Exemplo.test ')
    expect(r).toEqual([{ user_id: NOVO, email: 'novo.membro@exemplo.test', nome: 'Novo Membro Teste', papeis: ['enfermagem', 'circulante'], ativo: true }])
    const [c] = await banco.sql`select vinculado_user_id from jornada_cirurgica.convites where email = 'novo.membro@exemplo.test'`
    expect(c.vinculado_user_id).toBe(NOVO)
  })

  it('é idempotente e não altera papéis nem situação de membro existente', async () => {
    await banco.sql`update jornada_cirurgica.membros set ativo = false where user_id = ${NOVO}`
    const r = await inscrever(NOVO, 'novo.membro@exemplo.test')
    expect(r).toHaveLength(1)
    expect(r[0].ativo).toBe(false)
    const [{ n }] = await banco.sql`select count(*)::int as n from jornada_cirurgica.membros where email = 'novo.membro@exemplo.test'`
    expect(n).toBe(1)
  })

  it('sem convite, com convite inativo ou com convite já vinculado a outra conta: nenhuma linha', async () => {
    expect(await inscrever(OUTRO, 'sem.convite@exemplo.test')).toEqual([])
    await banco.sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo) values ('inativo.convite@exemplo.test', 'Convite Inativo', '{concierge}', false)`
    expect(await inscrever(OUTRO, 'inativo.convite@exemplo.test')).toEqual([])
    expect(await inscrever(OUTRO, 'novo.membro@exemplo.test')).toEqual([])
    expect(await inscrever(OUTRO, '')).toEqual([])
    const [{ n }] = await banco.sql`select count(*)::int as n from jornada_cirurgica.membros where user_id = ${OUTRO}`
    expect(n).toBe(0)
  })

  it('jornada_api não executa', async () => {
    expect(await erroDe(banco.sql, M.gestora, tx =>
      tx`select * from jornada_cirurgica.inscrever_por_email(${OUTRO}, 'x@exemplo.test')`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await codigoErro(banco.sql.begin(async tx => {
      await tx`set local role jornada_api`
      await tx`select jornada_cirurgica.reivindicar_mensagens(1)`
    }))).toBe(RLS_OU_PRIVILEGIO)
  })
})
