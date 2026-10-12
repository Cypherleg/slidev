// Registro que só cresce (briefing §8 regra 6): UPDATE, DELETE e TRUNCATE falham nas
// tabelas protegidas para qualquer papel, inclusive o dono (postgres, superusuário no teste).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import { M, RLS_OU_PRIVILEGIO, SO_CRESCE, codigoErro, comoAtor, erroDe, semear } from './apoio-rls.ts'

let banco: BancoTeste

beforeAll(async () => {
  banco = await criarBancoTeste()
  await semear(banco.sql)
})

afterAll(async () => {
  await banco?.encerrar()
})

/** Tabela protegida -> uma atribuição inofensiva para tentar o UPDATE. */
const PROTEGIDAS: Record<string, string> = {
  eventos: 'dados = dados',
  lente_registros: 'dados = dados',
  acessos: 'detalhe = detalhe',
  mensagens_saida_eventos: 'detalhe = detalhe',
  anexos: 'tamanho = tamanho',
  modelos_checklist: 'conteudo = conteudo',
}

async function contagens(): Promise<Record<string, number>> {
  const r: Record<string, number> = {}
  for (const t of Object.keys(PROTEGIDAS)) {
    const [{ n }] = await banco.sql.unsafe(`select count(*)::int as n from jornada_cirurgica.${t}`)
    r[t] = n
  }
  return r
}

describe.each(Object.entries(PROTEGIDAS))('%s só cresce', (tabela, atribuicao) => {
  it('como postgres (dono e superusuário): UPDATE, DELETE e TRUNCATE falham', async () => {
    const sql = banco.sql
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from jornada_cirurgica.${tabela}`)
    expect(n).toBeGreaterThan(0)
    expect(await codigoErro(sql.unsafe(`update jornada_cirurgica.${tabela} set ${atribuicao}`))).toBe(SO_CRESCE)
    expect(await codigoErro(sql.unsafe(`delete from jornada_cirurgica.${tabela}`))).toBe(SO_CRESCE)
    expect(await codigoErro(sql.unsafe(`truncate jornada_cirurgica.${tabela}`))).toBe(SO_CRESCE)
    expect(await codigoErro(sql.unsafe(`truncate jornada_cirurgica.${tabela} cascade`))).toBe(SO_CRESCE)
    const [{ n: depois }] = await sql.unsafe(`select count(*)::int as n from jornada_cirurgica.${tabela}`)
    expect(depois).toBe(n)
  })

  it('como jornada_api (gestora) e jornada_sistema: sem privilégio de UPDATE/DELETE/TRUNCATE', async () => {
    for (const [ator, papel] of [[M.gestora, 'jornada_api'], [null, 'jornada_sistema']] as const) {
      const op = { papel } as const
      expect(await erroDe(banco.sql, ator, tx => tx.unsafe(`update jornada_cirurgica.${tabela} set ${atribuicao}`), op), papel).toBe(RLS_OU_PRIVILEGIO)
      expect(await erroDe(banco.sql, ator, tx => tx.unsafe(`delete from jornada_cirurgica.${tabela}`), op), papel).toBe(RLS_OU_PRIVILEGIO)
      expect(await erroDe(banco.sql, ator, tx => tx.unsafe(`truncate jornada_cirurgica.${tabela}`), op), papel).toBe(RLS_OU_PRIVILEGIO)
    }
  })
})

describe('proteção indireta', () => {
  it('TRUNCATE ... CASCADE em episodios/pacientes é barrado pelos registros que só crescem', async () => {
    const antes = await contagens()
    expect(await codigoErro(banco.sql`truncate jornada_cirurgica.episodios cascade`)).toBe(SO_CRESCE)
    expect(await codigoErro(banco.sql`truncate jornada_cirurgica.pacientes cascade`)).toBe(SO_CRESCE)
    expect(await contagens()).toEqual(antes)
  })

  it('DELETE de episódio com eventos falha pela chave estrangeira (sem cascata)', async () => {
    const [{ id }] = await banco.sql`select episodio_id as id from jornada_cirurgica.eventos where episodio_id is not null limit 1`
    expect(await codigoErro(banco.sql`delete from jornada_cirurgica.episodios where id = ${id}`)).toBe('23503')
  })

  it('INSERT continua permitido (o registro cresce)', async () => {
    await comoAtor(banco.sql, M.concierge, tx =>
      tx`insert into jornada_cirurgica.acessos (ator_id, recurso) values (${M.concierge}, 'dia')`)
    const [{ n }] = await banco.sql`select count(*)::int as n from jornada_cirurgica.acessos where recurso = 'dia'`
    expect(n).toBe(1)
  })
})
