// Apoio aos testes de banco: membros fictícios, semente mínima e execução "como ator".
// Dados 100% fictícios. Nenhum CPF é usado (só HMAC fictício).
import type postgres from 'postgres'
import type { Sql } from '../apoio/banco.ts'

export type Tx = postgres.TransactionSql<Record<string, unknown>>
export type PapelBanco = 'jornada_api' | 'jornada_sistema'

const uuid = (prefixo: string, n: number) => `${prefixo}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Membros fictícios, um por papel, mais um inativo e um que não é membro. */
export const M = {
  concierge: uuid('a0000000', 1),
  conferente: uuid('a0000000', 2),
  enfermagem: uuid('a0000000', 3),
  circulante: uuid('a0000000', 4),
  anestesista: uuid('a0000000', 5),
  cirurgiao: uuid('a0000000', 6),
  gestora: uuid('a0000000', 7),
  inativo: uuid('a0000000', 8), // concierge + gestora, ativo = false
  naoMembro: uuid('a0000000', 15),
} as const

export const PACIENTE = uuid('b0000000', 1)
export const EPISODIO = uuid('c0000000', 1)
export const EPISODIO_2 = uuid('c0000000', 2)
export const MENSAGEM = uuid('d0000000', 1)
export const APARELHO = 'aparelho-teste-sala-1'

/** Eventos semeados no EPISODIO: contagem por visibilidade. */
export const SEMENTE_EVENTOS = { geral: 3, conferencia_1: 2, conferencia_2: 2 } as const

/** Executa `fn` numa transação com SET LOCAL ROLE e o contexto do ator (como a API faz). */
export async function comoAtor<T>(
  sql: Sql,
  ator: string | null,
  fn: (tx: Tx) => Promise<T>,
  opcoes: { papel?: PapelBanco; aparelho?: string | null; sessao?: string | null } = {},
): Promise<T> {
  const papel = opcoes.papel ?? 'jornada_api'
  const resultado = await sql.begin(async tx => {
    await tx.unsafe(`set local role ${papel}`)
    await tx`
      select set_config('jornada.ator', ${ator ?? ''}, true),
             set_config('jornada.sessao', ${opcoes.sessao ?? ator ?? ''}, true),
             set_config('jornada.aparelho', ${opcoes.aparelho ?? APARELHO}, true)`
    return { valor: await fn(tx as unknown as Tx) }
  })
  return (resultado as { valor: T }).valor
}

export const comoSistema = <T>(sql: Sql, fn: (tx: Tx) => Promise<T>) =>
  comoAtor(sql, null, fn, { papel: 'jornada_sistema' })

class Desfazer<T> extends Error {
  constructor(readonly valor: T) {
    super('desfazer')
  }
}

/**
 * Como `comoAtor`, mas SEMPRE desfaz a transação (o banco do arquivo de teste fica intacto).
 * Devolve `{ codigo: null, valor }` em caso de sucesso ou `{ codigo: SQLSTATE }` em caso de erro.
 */
export async function tentar<T>(
  sql: Sql,
  ator: string | null,
  fn: (tx: Tx) => Promise<T>,
  opcoes: { papel?: PapelBanco; aparelho?: string | null; sessao?: string | null } = {},
): Promise<{ codigo: string | null; valor?: T }> {
  try {
    await comoAtor(sql, ator, async tx => {
      throw new Desfazer(await fn(tx))
    }, opcoes)
    throw new Error('inalcançável')
  } catch (e) {
    if (e instanceof Desfazer) return { codigo: null, valor: e.valor as T }
    const codigo = (e as { code?: string }).code
    if (!codigo) throw e
    return { codigo }
  }
}

/** Atalho: só o SQLSTATE (null = sucesso), sempre desfazendo. */
export async function erroDe(
  sql: Sql,
  ator: string | null,
  fn: (tx: Tx) => Promise<unknown>,
  opcoes: { papel?: PapelBanco; aparelho?: string | null } = {},
): Promise<string | null> {
  return (await tentar(sql, ator, fn, opcoes)).codigo
}

/** SQLSTATE do erro de uma promessa (ou null se não houve erro). */
export async function codigoErro(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'sem_codigo'
  }
}

export const RLS_OU_PRIVILEGIO = '42501'
export const CHECK_VIOLADO = '23514'
export const UNICO_VIOLADO = '23505'
export const SO_CRESCE = 'JC001'
export const REGRA_MEMBROS = 'JC002'

/** Contagem de linhas visíveis de uma tabela do schema. */
export async function contar(tx: Tx, tabela: string, onde = 'true'): Promise<number> {
  const [linha] = await tx.unsafe(`select count(*)::int as n from jornada_cirurgica.${tabela} where ${onde}`)
  return (linha as unknown as { n: number }).n
}

export const TABELAS = [
  'membros',
  'convites',
  'pacientes',
  'episodios',
  'eventos',
  'lente_registros',
  'acessos',
  'permissoes_evento',
  'modelos_checklist',
  'config',
  'materiais',
  'links_paciente',
  'mensagens_saida',
  'mensagens_saida_eventos',
  'anexos',
  'aparelhos',
] as const

/** Semente mínima, gravada como dono (postgres), sem passar pela RLS. */
export async function semear(sql: Sql): Promise<void> {
  const membros: [string, string, string[], boolean][] = [
    [M.concierge, 'Membro Teste Concierge', ['concierge'], true],
    [M.conferente, 'Membro Teste Conferente', ['conferente'], true],
    [M.enfermagem, 'Membro Teste Enfermagem', ['enfermagem'], true],
    [M.circulante, 'Membro Teste Circulante', ['circulante'], true],
    [M.anestesista, 'Membro Teste Anestesista', ['anestesista'], true],
    [M.cirurgiao, 'Membro Teste Cirurgiao', ['cirurgiao'], true],
    [M.gestora, 'Membro Teste Gestora', ['gestora'], true],
    [M.inativo, 'Membro Teste Inativo', ['concierge', 'gestora'], false],
  ]
  for (const [id, nome, papeis, ativo] of membros) {
    const email = `${nome.toLowerCase().replace(/ /g, '.')}@exemplo.test`
    await sql`insert into jornada_cirurgica.membros (user_id, email, nome, papeis, ativo, pin_hash)
              values (${id}, ${email}, ${nome}, ${papeis}, ${ativo}, ${'hash-ficticio-' + id})`
    await sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo, vinculado_user_id, criado_por)
              values (${email}, ${nome}, ${papeis}, ${ativo}, ${id}, ${M.gestora})`
  }

  await sql`insert into jornada_cirurgica.pacientes
              (id, cpf_hmac, nome_completo, nome_normalizado, data_nascimento, conferido_datasigh, criado_por)
            values (${PACIENTE}, ${'f'.repeat(64)}, 'Paciente Teste Alfa da Silva', 'paciente teste alfa da silva',
                    '1950-01-01', false, ${M.concierge})`
  for (const [id, olho] of [[EPISODIO, 'OD'], [EPISODIO_2, 'OE']] as const) {
    await sql`insert into jornada_cirurgica.episodios
                (id, paciente_id, olho, cirurgiao_id, tipo_cirurgia, tipo_lente, data_cirurgia, ordem, aberto_por)
              values (${id}, ${PACIENTE}, ${olho}, ${M.cirurgiao}, 'facoemulsificacao', 'monofocal',
                      '2026-11-10', 1, ${M.concierge})`
  }

  const ev = (seq: number, tipo: string, dados: Record<string, unknown>, vis: string, autor: string, papel: string) =>
    sql`insert into jornada_cirurgica.eventos (episodio_id, seq, tipo, dados, visibilidade, autor_id, autor_papel)
        values (${EPISODIO}, ${seq}, ${tipo}, ${sql.json(dados as never)}, ${vis}, ${autor}, ${papel})`
  await ev(1, 'episodio.aberto', {}, 'geral', M.concierge, 'concierge')
  await ev(2, 'checklist.item_respondido', { modelo: 'd7', itemId: 'A.1', valor: 'sim' }, 'geral', M.concierge, 'concierge')
  await ev(3, 'checklist.item_respondido', { modelo: 'cp1', itemId: 'cp1.caixa', valor: true }, 'conferencia_1', M.concierge, 'concierge')
  await ev(4, 'checklist.item_respondido', { modelo: 'cp2', itemId: 'cp2.caixa', valor: true }, 'conferencia_2', M.conferente, 'conferente')
  await ev(5, 'lente.plano_registrado', { registroId: 'r1' }, 'conferencia_1', M.concierge, 'concierge')
  await ev(6, 'lente.cp2_registrado', { registroId: 'r3' }, 'conferencia_2', M.conferente, 'conferente')
  await ev(7, 'lente.cp2_resultado', { confere: true, camposDivergentes: [] }, 'geral', M.conferente, 'conferente')

  const valores = { olho: 'OD', modelo: 'LIO FICTICIA X', dioptria: 21.5, torica: false, cilindro: null, eixo: null }
  const lente = (etapa: string, vis: string, autor: string, dados: Record<string, unknown>) =>
    sql`insert into jornada_cirurgica.lente_registros (episodio_id, ciclo, etapa, dados, visibilidade, autor_id)
        values (${EPISODIO}, 1, ${etapa}, ${sql.json(dados as never)}, ${vis}, ${autor})`
  await lente('plano', 'conferencia_1', M.concierge, valores)
  await lente('chegada', 'conferencia_1', M.concierge, { dataChegada: '2026-11-01', lote: 'LOTE-FICT-1', validade: '2028-01' })
  await lente('cp2', 'conferencia_2', M.conferente, valores)
  await lente('time_out', 'geral', M.circulante, { modelo: 'LIO FICTICIA X', dioptria: 21.5, cilindro: null, eixo: null })

  await sql`insert into jornada_cirurgica.anexos (episodio_id, tipo, storage_path, sha256, content_type, tamanho, autor_id)
            values (${EPISODIO}, 'foto_plano', ${`episodios/${EPISODIO}/plano-1.jpg`}, ${'a'.repeat(64)}, 'image/jpeg', 1234, ${M.concierge})`
  await sql`insert into jornada_cirurgica.acessos (ator_id, recurso, episodio_id) values
              (${M.concierge}, 'episodio', ${EPISODIO}), (${M.conferente}, 'episodio', ${EPISODIO})`
  await sql`insert into jornada_cirurgica.mensagens_saida
              (id, episodio_id, gatilho, contato_id, telefone, texto, chave_idempotencia, estado, criado_por)
            values (${MENSAGEM}, ${EPISODIO}, 'admissao_concluida', 'contato-1', '+5544900000000',
                    'Mensagem ficticia de teste.', 'semente-msg-1', 'pendente', ${M.concierge})`
  await sql`insert into jornada_cirurgica.mensagens_saida_eventos (mensagem_id, estado) values (${MENSAGEM}, 'pendente')`
  await sql`insert into jornada_cirurgica.links_paciente (episodio_id, token_hash, expira_em, criado_por)
            values (${EPISODIO}, ${'0'.repeat(64)}, now() + interval '7 days', ${M.concierge})`
  await sql`insert into jornada_cirurgica.config (chave, valor, atualizado_por) values ('limiarNomeParecido', '0.85', ${M.gestora})`
  await sql`insert into jornada_cirurgica.materiais (codigo, titulo, tipo, url, momento, publico, criado_por)
            values ('video_preparo', 'Video de preparo (exemplo)', 'video', 'https://exemplo.test/video', 'd7', 'paciente', ${M.gestora})`
  await sql`insert into jornada_cirurgica.modelos_checklist (id, versao, conteudo, publicado_por)
            values ('d7', 'teste/1', '{"id":"d7","secoes":[]}', ${M.gestora})`
  await sql`insert into jornada_cirurgica.aparelhos (id, nome) values (${APARELHO}, 'Tablet ficticio')`
}
