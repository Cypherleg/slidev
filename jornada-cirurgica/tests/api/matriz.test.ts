// A matriz do domínio (papeisPermitidosParaEvento) é idêntica à tabela permissoes_evento do banco.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORDEM_MODELOS, papeisPermitidosParaEvento, type NovoEvento } from '../../supabase/functions/_shared/dominio/index.ts'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import { bancoPronto, dominioPronto } from './apoio.ts'

describe.skipIf(!bancoPronto || !dominioPronto)('matriz papel × evento: domínio = banco', () => {
  let banco: BancoTeste
  beforeAll(async () => {
    banco = await criarBancoTeste()
  })
  afterAll(async () => {
    await banco?.encerrar()
  })

  it('cada linha da tabela confere com o domínio', async () => {
    const linhas = await banco.sql<{ tipo: string; modelo: string | null; papeis: string[] }[]>`select tipo, modelo, papeis from jornada_cirurgica.permissoes_evento order by tipo, modelo`
    expect(linhas.length).toBeGreaterThan(50)
    const divergencias: string[] = []
    for (const l of linhas) {
      const dominio = [...papeisPermitidosParaEvento(l.tipo as NovoEvento['tipo'], (l.modelo as never) ?? null)].sort()
      const tabela = [...l.papeis].sort()
      if (JSON.stringify(dominio) !== JSON.stringify(tabela)) divergencias.push(`${l.tipo}/${l.modelo ?? '-'}: domínio ${dominio.join(',')} × banco ${tabela.join(',')}`)
    }
    expect(divergencias).toEqual([])
  })

  it('tipos por modelo: todos os modelos têm linha no banco', async () => {
    for (const tipo of ['checklist.item_respondido', 'bloco.concluido'] as const) {
      const r = await banco.sql<{ modelo: string }[]>`select modelo from jornada_cirurgica.permissoes_evento where tipo = ${tipo}`
      expect(r.map(x => x.modelo).sort()).toEqual([...ORDEM_MODELOS].sort())
    }
  })
})
