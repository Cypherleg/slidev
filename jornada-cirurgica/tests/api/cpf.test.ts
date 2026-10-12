// CPF: validação no domínio, HMAC com segredo do servidor (nunca gravado nem registrado em log),
// limite de consultas por usuário, Datasigh somente GET, paciente existente por HMAC ou id do
// Datasigh (nunca por nome ou telefone).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoPronto, cpfTeste, criarAmbiente, datasighFalso, despejoBanco, dominioPronto, U, type Ambiente } from './apoio.ts'

const CPF_A = cpfTeste(11)
const CPF_B = cpfTeste(12)
const CPF_C = cpfTeste(13)
const formatado = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`

describe.skipIf(!bancoPronto || !dominioPronto)('CPF e Datasigh (banco real)', () => {
  let amb: Ambiente
  const datasigh = datasighFalso({
    [CPF_A]: { id: 'DS-TESTE-11', nome: 'Paciente Teste Onze', nascimento: '01/02/1950', prontuario: 'P-11', celulares: ['(00) 90000-0011'] },
    [CPF_C]: { id: 'DS-TESTE-13', nome: 'Paciente Teste Treze' },
  })
  beforeAll(async () => {
    amb = await criarAmbiente({ datasigh, env: { JORNADA_CPF_CONSULTAS_HORA: '5' } })
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('busca: Datasigh só por GET; só os campos que vieram; sem paciente no painel', async () => {
    const r = await amb.ok(U.concierge, 'paciente.buscar_cpf', { cpf: formatado(CPF_A) })
    expect(r).toEqual({
      datasigh: { status: 'encontrado', campos: { datasighId: 'DS-TESTE-11', nomeCompleto: 'Paciente Teste Onze', dataNascimento: '1950-02-01', prontuario: 'P-11', telefones: ['(00) 90000-0011'] } },
      pacienteExistente: null,
    })
    const r2 = await amb.ok(U.concierge, 'paciente.buscar_cpf', { cpf: CPF_B })
    expect(r2.datasigh).toEqual({ status: 'nao_encontrado' })
    expect(datasigh.chamadas.length).toBeGreaterThan(0)
    expect(datasigh.chamadas.every(c => c.metodo === 'GET')).toBe(true)
  })

  it('CPF inválido: validação, nada consultado; papel sem cadastro de paciente não consulta', async () => {
    const antes = datasigh.chamadas.length
    const r = await amb.chamar(U.concierge, 'paciente.buscar_cpf', { cpf: '900.000.000-00' })
    expect(r.status).toBe(400)
    expect(r.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao' } })
    expect(JSON.stringify(r.corpo)).not.toContain('900.000.000-00')
    expect((await amb.chamar(U.enfermagem, 'paciente.buscar_cpf', { cpf: CPF_A })).status).toBe(403)
    expect(datasigh.chamadas.length).toBe(antes)
  })

  it('cadastro guarda só o HMAC; nova busca acha o paciente pelo HMAC e pelo id do Datasigh', async () => {
    const { pacienteId } = await amb.ok(U.concierge, 'paciente.cadastrar', {
      cpf: CPF_A,
      datasighId: 'DS-TESTE-11',
      nomeCompleto: 'Paciente Teste Onze',
      dataNascimento: '1950-02-01',
      nomeMae: null,
      prontuario: 'P-11',
      conferidoDatasigh: true,
      documentoConferido: true,
    })
    const [p] = await amb.banco.sql`select cpf_hmac, datasigh_id from jornada_cirurgica.pacientes where id = ${pacienteId}`
    expect(p.cpf_hmac).toMatch(/^[0-9a-f]{64}$/)
    expect(p.datasigh_id).toBe('DS-TESTE-11')
    const r = await amb.ok(U.gestora, 'paciente.buscar_cpf', { cpf: CPF_A })
    expect(r.pacienteExistente).toMatchObject({ id: pacienteId, nomeCompleto: 'Paciente Teste Onze', dataNascimento: '1950-02-01', episodios: [] })
    // Duplicado: recusado, devolvendo só o id do cadastro existente.
    const dup = await amb.chamar(U.concierge, 'paciente.cadastrar', {
      cpf: formatado(CPF_A),
      datasighId: null,
      nomeCompleto: 'Outro Nome Teste',
      dataNascimento: '1960-01-01',
      nomeMae: null,
      prontuario: null,
      conferidoDatasigh: false,
      documentoConferido: true,
    })
    // Sem o id do cadastro existente (a busca por CPF é o caminho, com limite e registro).
    expect(dup.corpo).toMatchObject({ ok: false, erro: { codigo: 'validacao', detalhes: { motivo: 'ja_cadastrado' } } })
    expect(JSON.stringify(dup.corpo)).not.toContain(pacienteId)
    // Mesmo nome e nascimento, sem CPF nem id do Datasigh: não é unido a ninguém.
    const homonimo = await amb.ok(U.concierge, 'paciente.cadastrar', {
      cpf: null,
      datasighId: null,
      nomeCompleto: 'Paciente Teste Onze',
      dataNascimento: '1950-02-01',
      nomeMae: null,
      prontuario: null,
      conferidoDatasigh: false,
      documentoConferido: true,
    })
    expect(homonimo.pacienteId).not.toBe(pacienteId)
  })

  it('o CPF nunca aparece no banco nem nos logs', async () => {
    const tudo = await despejoBanco(amb.banco)
    for (const c of [CPF_A, CPF_B, formatado(CPF_A), formatado(CPF_B)]) {
      expect(tudo).not.toContain(c)
      expect(amb.logger.linhas.join('\n')).not.toContain(c)
    }
    const acessos = await amb.banco.sql`select detalhe from jornada_cirurgica.acessos where recurso = 'cpf_consulta'`
    expect(acessos.length).toBeGreaterThanOrEqual(3)
  })

  it('limite de consultas por hora por usuário do login (a troca por PIN não contorna)', async () => {
    for (let i = 0; i < 5; i++) await amb.ok(U.dupla, 'paciente.buscar_cpf', { cpf: CPF_C })
    const r = await amb.chamar(U.dupla, 'paciente.buscar_cpf', { cpf: CPF_C })
    expect(r.status).toBe(429)
    expect(r.corpo).toMatchObject({ ok: false, erro: { codigo: 'limite_taxa' } })
    const viaPin = await amb.pin(U.dupla, U.concierge)
    expect((await amb.chamar(U.dupla, 'paciente.buscar_cpf', { cpf: CPF_C }, { ator: viaPin })).status).toBe(429)
    // Outro usuário segue livre.
    expect((await amb.chamar(U.concierge, 'paciente.buscar_cpf', { cpf: CPF_C })).status).toBe(200)
  })
})
