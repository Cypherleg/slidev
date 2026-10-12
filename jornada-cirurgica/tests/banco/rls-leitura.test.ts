// RLS de leitura como a API faz: SET LOCAL ROLE jornada_api + set_config('jornada.ator', ...).
// Conferência cega (briefing §6.3 e §8 regra 7): a segunda conferente não lê o checkpoint 1;
// a concierge não lê o checkpoint 2. Membro inativo e não membro não leem nada.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import {
  APARELHO,
  EPISODIO,
  M,
  RLS_OU_PRIVILEGIO,
  SEMENTE_EVENTOS,
  TABELAS,
  comoAtor,
  comoSistema,
  contar,
  erroDe,
  semear,
} from './apoio-rls.ts'

let banco: BancoTeste

beforeAll(async () => {
  banco = await criarBancoTeste()
  await semear(banco.sql)
})

afterAll(async () => {
  await banco?.encerrar()
})

const visibilidades = (ator: string) =>
  comoAtor(banco.sql, ator, async tx => {
    const linhas = await tx`select visibilidade, count(*)::int as n from jornada_cirurgica.eventos group by 1`
    return Object.fromEntries(linhas.map(l => [l.visibilidade, l.n]))
  })

const etapasLente = (ator: string) =>
  comoAtor(banco.sql, ator, async tx => {
    const linhas = await tx`select etapa from jornada_cirurgica.lente_registros order by etapa`
    return linhas.map(l => l.etapa as string)
  })

describe('conferência cega em eventos', () => {
  it('segunda conferente (só conferente) não lê nenhuma linha conferencia_1', async () => {
    expect(await visibilidades(M.conferente)).toEqual({ geral: SEMENTE_EVENTOS.geral, conferencia_2: SEMENTE_EVENTOS.conferencia_2 })
    const n = await comoAtor(banco.sql, M.conferente, tx =>
      contar(tx, 'eventos', `visibilidade = 'conferencia_1' or dados->>'modelo' = 'cp1'`))
    expect(n).toBe(0)
  })

  it('concierge (só concierge) não lê conferencia_2 nem itens do cp2', async () => {
    expect(await visibilidades(M.concierge)).toEqual({ geral: SEMENTE_EVENTOS.geral, conferencia_1: SEMENTE_EVENTOS.conferencia_1 })
    const n = await comoAtor(banco.sql, M.concierge, tx =>
      contar(tx, 'eventos', `visibilidade = 'conferencia_2' or dados->>'modelo' = 'cp2'`))
    expect(n).toBe(0)
  })

  it('cirurgião e gestora leem as duas conferências', async () => {
    for (const ator of [M.cirurgiao, M.gestora]) {
      expect(await visibilidades(ator)).toEqual({ ...SEMENTE_EVENTOS })
    }
  })

  it('enfermagem, circulante e anestesista leem só eventos gerais', async () => {
    for (const ator of [M.enfermagem, M.circulante, M.anestesista]) {
      expect(await visibilidades(ator)).toEqual({ geral: SEMENTE_EVENTOS.geral })
    }
  })

  it('jornada_sistema lê o estado completo (para decidir)', async () => {
    const n = await comoSistema(banco.sql, tx => contar(tx, 'eventos'))
    expect(n).toBe(SEMENTE_EVENTOS.geral + SEMENTE_EVENTOS.conferencia_1 + SEMENTE_EVENTOS.conferencia_2)
  })
})

describe('conferência cega em lente_registros e anexos', () => {
  it('segunda conferente lê só o cp2 (nunca plano nem chegada)', async () => {
    expect(await etapasLente(M.conferente)).toEqual(['cp2'])
  })

  it('concierge lê plano e chegada, nunca cp2', async () => {
    expect(await etapasLente(M.concierge)).toEqual(['chegada', 'plano'])
  })

  it('circulante lê só o time_out; enfermagem e anestesista não leem nada', async () => {
    expect(await etapasLente(M.circulante)).toEqual(['time_out'])
    expect(await etapasLente(M.enfermagem)).toEqual([])
    expect(await etapasLente(M.anestesista)).toEqual([])
  })

  it('cirurgião e gestora leem todas as etapas', async () => {
    for (const ator of [M.cirurgiao, M.gestora]) {
      expect(await etapasLente(ator)).toEqual(['chegada', 'cp2', 'plano', 'time_out'])
    }
  })

  it('foto do plano (anexos): só concierge, cirurgião e gestora', async () => {
    const quantos = async (ator: string) => comoAtor(banco.sql, ator, tx => contar(tx, 'anexos'))
    expect(await quantos(M.conferente)).toBe(0)
    expect(await quantos(M.enfermagem)).toBe(0)
    expect(await quantos(M.concierge)).toBe(1)
    expect(await quantos(M.cirurgiao)).toBe(1)
    expect(await quantos(M.gestora)).toBe(1)
  })
})

describe('membro inativo, não membro e ator ausente', () => {
  for (const [rotulo, ator] of [['inativo', M.inativo], ['não membro', M.naoMembro], ['sem ator', null]] as const) {
    it(`${rotulo}: não lê nenhuma linha de nenhuma tabela`, async () => {
      const contagens = await comoAtor(banco.sql, ator, async tx => {
        const r: Record<string, number> = {}
        for (const t of TABELAS) r[t] = await contar(tx, t)
        return r
      })
      expect(contagens).toEqual(Object.fromEntries(TABELAS.map(t => [t, 0])))
    })
  }

  it('funções do ator: inativo não tem papéis', async () => {
    const r = await comoAtor(banco.sql, M.inativo, async tx => {
      const [l] = await tx`select jornada_cirurgica.ator_papeis() as papeis,
                                  jornada_cirurgica.ator_ativo() as ativo,
                                  jornada_cirurgica.ator_tem_papel('gestora') as gestora,
                                  jornada_cirurgica.ator_id()::text as id`
      return l
    })
    expect(r).toEqual({ papeis: [], ativo: false, gestora: false, id: M.inativo })
  })
})

describe('demais tabelas', () => {
  it('acessos: gestora lê todos; os demais só as próprias linhas', async () => {
    expect(await comoAtor(banco.sql, M.gestora, tx => contar(tx, 'acessos'))).toBe(2)
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'acessos'))).toBe(1)
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'acessos', `ator_id <> '${M.concierge}'`))).toBe(0)
    expect(await comoAtor(banco.sql, M.enfermagem, tx => contar(tx, 'acessos'))).toBe(0)
  })

  it('convites: só a gestora', async () => {
    expect(await comoAtor(banco.sql, M.gestora, tx => contar(tx, 'convites'))).toBe(8)
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'convites'))).toBe(0)
  })

  it('links_paciente: concierge e gestora; conferente não', async () => {
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'links_paciente'))).toBe(1)
    expect(await comoAtor(banco.sql, M.gestora, tx => contar(tx, 'links_paciente'))).toBe(1)
    expect(await comoAtor(banco.sql, M.conferente, tx => contar(tx, 'links_paciente'))).toBe(0)
  })

  it('mensagens_saida: membros ativos; histórico (mensagens_saida_eventos): gestora', async () => {
    expect(await comoAtor(banco.sql, M.enfermagem, tx => contar(tx, 'mensagens_saida'))).toBe(1)
    expect(await comoAtor(banco.sql, M.enfermagem, tx => contar(tx, 'mensagens_saida_eventos'))).toBe(0)
    expect(await comoAtor(banco.sql, M.gestora, tx => contar(tx, 'mensagens_saida_eventos'))).toBe(1)
  })

  it('membros, pacientes, episódios, matriz, modelos, config e materiais: todo membro ativo lê', async () => {
    const r = await comoAtor(banco.sql, M.anestesista, async tx => ({
      membros: await contar(tx, 'membros'),
      pacientes: await contar(tx, 'pacientes'),
      episodios: await contar(tx, 'episodios'),
      permissoes_evento: await contar(tx, 'permissoes_evento'),
      modelos_checklist: await contar(tx, 'modelos_checklist'),
      config: await contar(tx, 'config'),
      materiais: await contar(tx, 'materiais'),
    }))
    expect(r).toEqual({ membros: 8, pacientes: 1, episodios: 2, permissoes_evento: 57, modelos_checklist: 1, config: 1, materiais: 1 })
  })

  it('aparelhos: o próprio aparelho (jornada.aparelho); gestora lê todos', async () => {
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'aparelhos'), { aparelho: APARELHO })).toBe(1)
    expect(await comoAtor(banco.sql, M.concierge, tx => contar(tx, 'aparelhos'), { aparelho: 'outro-aparelho' })).toBe(0)
    expect(await comoAtor(banco.sql, M.gestora, tx => contar(tx, 'aparelhos'), { aparelho: 'outro-aparelho' })).toBe(1)
  })

  it('membros.pin_hash não é legível por jornada_api (tem_pin sim); jornada_sistema lê', async () => {
    expect(await erroDe(banco.sql, M.gestora, tx => tx`select pin_hash from jornada_cirurgica.membros`)).toBe(RLS_OU_PRIVILEGIO)
    expect(await erroDe(banco.sql, M.gestora, tx => tx`select * from jornada_cirurgica.membros`)).toBe(RLS_OU_PRIVILEGIO)
    const comPin = await comoAtor(banco.sql, M.concierge, tx =>
      tx`select user_id, tem_pin from jornada_cirurgica.membros where user_id = ${M.concierge}`)
    expect(comPin[0].tem_pin).toBe(true)
    const hash = await comoSistema(banco.sql, tx =>
      tx`select pin_hash from jornada_cirurgica.membros where user_id = ${M.concierge}`)
    expect(hash[0].pin_hash).toMatch(/^hash-ficticio-/)
  })

  it('o episódio semeado é visível a todo membro ativo, sem valores de lente no resumo', async () => {
    const [ep] = await comoAtor(banco.sql, M.conferente, tx =>
      tx`select id, olho from jornada_cirurgica.episodios where id = ${EPISODIO}`)
    expect(ep).toEqual({ id: EPISODIO, olho: 'OD' })
  })
})
