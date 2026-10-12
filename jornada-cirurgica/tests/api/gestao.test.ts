// Gestão (gestora com o próprio login): modelos versionados (semeadura de modelosPadrao() como
// jornada_sistema), configuração sobre o padrão, catálogo de materiais e membros.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configPadrao, modelosPadrao, ORDEM_MODELOS } from '../../supabase/functions/_shared/dominio/index.ts'
import { bancoPronto, cpfTeste, criarAmbiente, dominioPronto, roteiroTeste, U, type Ambiente } from './apoio.ts'
import { dataLocal } from '../../dev/roteiro.ts'

describe.skipIf(!bancoPronto || !dominioPronto)('gestão (banco real)', () => {
  let amb: Ambiente
  beforeAll(async () => {
    amb = await criarAmbiente({ semModelos: true })
  })
  afterAll(async () => {
    await amb?.encerrar()
  })

  it('tabela vazia: a API grava modelosPadrao() como jornada_sistema (publicado_por nulo)', async () => {
    const lista = await amb.ok(U.concierge, 'modelos.listar', {})
    expect(lista.filter(m => m.ativo).map(m => m.id).sort()).toEqual([...ORDEM_MODELOS].sort())
    const linhas = await amb.banco.sql`select id, versao, publicado_por from jornada_cirurgica.modelos_checklist`
    expect(linhas).toHaveLength(ORDEM_MODELOS.length)
    expect(linhas.every(l => l.publicado_por === null && l.versao === modelosPadrao().d7.versao)).toBe(true)
  })

  it('publicar: versão atribuída pelo servidor; o episódio guarda a versão da abertura', async () => {
    const r = roteiroTeste(amb)
    const pid = await r.cadastrar({ nome: 'Paciente Teste Gestao', nascimento: '1950-01-01', cpf: cpfTeste(400), prontuario: 'T-400' })
    const antes = await r.abrir(pid, 'OD', dataLocal(10))
    const atual = await amb.ok(U.gestora, 'modelos.obter', { id: 'd2' })
    const pub = await amb.ok(U.gestora, 'modelos.publicar', { modelo: { ...atual, titulo: `${atual.titulo} (revisado)`, versao: 'ignorada' } })
    expect(pub.versao).not.toBe(atual.versao)
    expect(pub.versao).not.toBe('ignorada')
    const lista = await amb.ok(U.gestora, 'modelos.listar', {})
    expect(lista.find(m => m.id === 'd2' && m.versao === pub.versao)?.ativo).toBe(true)
    expect(lista.find(m => m.id === 'd2' && m.versao === atual.versao)?.ativo).toBe(false)
    expect((await amb.ok(U.gestora, 'modelos.obter', { id: 'd2', versao: atual.versao })).versao).toBe(atual.versao)
    // Episódio aberto antes continua com a versão antiga; o novo usa a publicada.
    const [ep] = await amb.banco.sql`select versoes_modelos from jornada_cirurgica.episodios where id = ${antes}`
    expect(ep.versoes_modelos.d2).toBe(atual.versao)
    const depois = await r.abrir(pid, 'OE', dataLocal(20))
    const [ep2] = await amb.banco.sql`select versoes_modelos from jornada_cirurgica.episodios where id = ${depois}`
    expect(ep2.versoes_modelos.d2).toBe(pub.versao)
    expect((await amb.chamar(U.concierge, 'modelos.publicar', { modelo: atual })).status).toBe(403)
    expect((await amb.chamar(U.gestora, 'modelos.publicar', { modelo: { ...atual, secoes: [] } })).status).toBe(400)
  })

  it('config: salva por chave sobre o padrão; chave desconhecida recusada; só a gestora', async () => {
    const c = await amb.ok(U.gestora, 'config.salvar', { config: { temposEtapa: { duracao_cirurgia: 30 }, assinaturaConcierge: null } })
    expect(c.temposEtapa).toEqual({ duracao_cirurgia: 30 })
    expect(c.modelosEtiqueta).toEqual(configPadrao().modelosEtiqueta)
    expect((await amb.ok(U.enfermagem, 'config.obter', {})).temposEtapa).toEqual({ duracao_cirurgia: 30 })
    expect((await amb.chamar(U.gestora, 'config.salvar', { config: { inventada: 1 } })).status).toBe(400)
    expect((await amb.chamar(U.concierge, 'config.salvar', { config: { feriados: [] } })).status).toBe(403)
    const evs = await amb.banco.sql`select tipo, autor_papel from jornada_cirurgica.eventos where tipo = 'config.alterada'`
    expect(evs).toEqual([{ tipo: 'config.alterada', autor_papel: 'gestora' }])
  })

  it('materiais: nova versão é nova linha; código não muda; URL https', async () => {
    const m1 = await amb.ok(U.gestora, 'materiais.salvar', { material: { codigo: 'orientacao_escrita', titulo: 'Orientações (exemplo)', tipo: 'texto', url: null, conteudo: 'Texto fictício.', momento: 'd7', publico: 'paciente', ativo: true } })
    expect(m1.versao).toBe(1)
    const m2 = await amb.ok(U.gestora, 'materiais.salvar', { material: { id: m1.id, codigo: 'orientacao_escrita', titulo: 'Orientações v2 (exemplo)', tipo: 'texto', url: null, conteudo: 'Texto fictício 2.', momento: 'd7', publico: 'paciente', ativo: true } })
    expect(m2).toMatchObject({ codigo: 'orientacao_escrita', versao: 2 })
    expect(m2.id).not.toBe(m1.id)
    expect((await amb.chamar(U.gestora, 'materiais.salvar', { material: { id: m1.id, codigo: 'outro', titulo: 'x', tipo: 'texto', url: null, conteudo: 'x', momento: 'd7', publico: 'paciente', ativo: true } })).status).toBe(400)
    expect((await amb.chamar(U.gestora, 'materiais.salvar', { material: { codigo: 'v', titulo: 'x', tipo: 'video', url: 'http://inseguro.invalid', conteudo: null, momento: 'd7', publico: 'paciente', ativo: true } })).status).toBe(400)
    const lista = await amb.ok(U.concierge, 'materiais.listar', {})
    expect(lista.find(m => m.codigo === 'orientacao_escrita')?.versao).toBe(2)
  })

  it('membros: convidar, atualizar, resetar PIN; a gestora não remove o próprio acesso', async () => {
    await amb.ok(U.gestora, 'membros.convidar', { email: 'Nova.Pessoa@Exemplo.test', nome: 'Nova Pessoa Teste', papeis: ['circulante'] })
    expect((await amb.chamar(U.gestora, 'membros.convidar', { email: 'nova.pessoa@exemplo.test', nome: 'X', papeis: ['circulante'] })).status).toBe(400)
    await amb.ok(U.gestora, 'membros.atualizar', { email: U.anestesista.email, papeis: ['anestesista', 'circulante'] })
    expect((await amb.ok(U.anestesista, 'sessao', {})).membro.papeis).toEqual(['anestesista', 'circulante'])
    await amb.ok(U.gestora, 'membros.resetar_pin', { membroId: U.anestesista.id })
    expect((await amb.ok(U.anestesista, 'sessao', {})).membro.temPin).toBe(false)
    expect((await amb.chamar(U.gestora, 'membros.atualizar', { email: U.gestora.email, ativo: false })).status).toBe(400)
    await amb.ok(U.gestora, 'membros.atualizar', { email: U.circulante.email, ativo: false })
    expect((await amb.chamar(U.circulante, 'sessao', {})).status).toBe(403)
    const lista = await amb.ok(U.gestora, 'membros.listar', {})
    expect(lista.find(m => m.email === 'nova.pessoa@exemplo.test')).toMatchObject({ id: null, vinculado: false, ativo: true })
  })
})
