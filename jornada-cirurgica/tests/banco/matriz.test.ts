// A matriz permissoes_evento carregada pela migration é idêntica à da ARQUITETURA §4.4.
// Duas referências: (1) a tabela literal abaixo e (2) a tabela lida do próprio documento.
// Também confere a cobertura de todos os TipoEvento e ModeloId de tipos.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORDEM_MODELOS, PAPEIS } from '../../supabase/functions/_shared/dominio/tipos.ts'
import { criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'

const RAIZ = join(import.meta.dirname, '..', '..')
type Linha = { tipo: string; modelo: string | null; papeis: string[] }

const TODOS = ['concierge', 'conferente', 'enfermagem', 'circulante', 'anestesista', 'cirurgiao', 'gestora']
const POR_MODELO: Record<string, string[]> = {
  d7: ['concierge'],
  cp1: ['concierge'],
  cp2: ['conferente'],
  d2: ['conferente', 'concierge'],
  admissao: ['enfermagem'],
  sign_in: ['circulante', 'enfermagem', 'cirurgiao', 'anestesista'],
  anestesia: ['anestesista'],
  time_out: ['circulante', 'cirurgiao'],
  sign_out: ['circulante', 'cirurgiao', 'anestesista'],
  alta: ['enfermagem', 'cirurgiao'],
}

/** ARQUITETURA §4.4, linha a linha. */
const ESPERADA: Linha[] = [
  ...['paciente.cadastrado', 'paciente.corrigido'].map(tipo => ({ tipo, modelo: null, papeis: ['concierge', 'gestora'] })),
  { tipo: 'episodio.aberto', modelo: null, papeis: ['concierge', 'gestora'] },
  ...['episodio.agendado', 'episodio.corrigido'].map(tipo => ({ tipo, modelo: null, papeis: ['concierge', 'gestora', 'cirurgiao'] })),
  ...['checklist.item_respondido', 'bloco.concluido'].flatMap(tipo =>
    Object.entries(POR_MODELO).map(([modelo, papeis]) => ({ tipo, modelo, papeis }))),
  { tipo: 'alerta.comunicado', modelo: null, papeis: ['concierge', 'conferente', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'] },
  { tipo: 'alerta.conduta_registrada', modelo: null, papeis: ['cirurgiao'] },
  ...['contato.salvo', 'contato.removido'].map(tipo => ({ tipo, modelo: null, papeis: ['concierge', 'conferente', 'enfermagem', 'gestora'] })),
  { tipo: 'contato.confirmado', modelo: null, papeis: ['concierge', 'conferente', 'gestora'] },
  { tipo: 'orientacoes.teach_back', modelo: null, papeis: ['concierge', 'enfermagem'] },
  ...['lente.plano_registrado', 'lente.chegada_registrada'].map(tipo => ({ tipo, modelo: null, papeis: ['concierge'] })),
  ...['lente.cp2_registrado', 'lente.cp2_resultado'].map(tipo => ({ tipo, modelo: null, papeis: ['conferente'] })),
  { tipo: 'lente.quarentena_aberta', modelo: null, papeis: ['concierge', 'conferente', 'circulante', 'cirurgiao'] },
  ...['lente.quarentena_resolvida', 'lente.troca_d0'].map(tipo => ({ tipo, modelo: null, papeis: ['cirurgiao'] })),
  { tipo: 'lente.time_out_resultado', modelo: null, papeis: ['circulante'] },
  { tipo: 'anexo.adicionado', modelo: null, papeis: ['concierge', 'cirurgiao', 'gestora'] },
  { tipo: 'tcle.status', modelo: null, papeis: ['concierge', 'conferente', 'enfermagem', 'gestora'] },
  ...['material.enviado', 'link_paciente.criado'].map(tipo => ({ tipo, modelo: null, papeis: ['concierge', 'gestora'] })),
  { tipo: 'etiqueta.copiada', modelo: null, papeis: ['conferente', 'concierge', 'enfermagem'] },
  { tipo: 'hardstop.resolvido', modelo: null, papeis: TODOS },
  { tipo: 'intercorrencia.registrada', modelo: null, papeis: ['enfermagem', 'circulante', 'anestesista', 'cirurgiao'] },
  ...['episodio.suspenso', 'episodio.cancelado'].map(tipo => ({ tipo, modelo: null, papeis: ['cirurgiao', 'gestora'] })),
  { tipo: 'avisos.atraso_solicitado', modelo: null, papeis: ['concierge', 'enfermagem', 'circulante', 'gestora', 'cirurgiao'] },
  ...['mensagem.enfileirada', 'quase_evento.registrado'].map(tipo => ({ tipo, modelo: null, papeis: TODOS })),
  ...['membro.alterado', 'config.alterada', 'modelo.publicado', 'material.catalogo_alterado'].map(tipo => ({ tipo, modelo: null, papeis: ['gestora'] })),
  ...['material.aberto', 'quiz.respondido'].map(tipo => ({ tipo, modelo: null, papeis: [] as string[] })),
]

/** Lê a tabela da §4.4 do documento (linhas de continuação herdam o tipo anterior). */
function matrizDoDocumento(): Linha[] {
  const doc = readFileSync(join(RAIZ, 'docs', 'ARQUITETURA.md'), 'utf8')
  const inicio = doc.indexOf('### 4.4')
  const fim = doc.indexOf('Visibilidade obrigatória', inicio)
  expect(inicio).toBeGreaterThan(0)
  expect(fim).toBeGreaterThan(inicio)
  const linhas = doc.slice(inicio, fim).split('\n').filter(l => l.trim().startsWith('|'))
  const corpo = linhas.slice(2) // cabeçalho e separador
  const resultado: Linha[] = []
  let tiposAnteriores: string[] = []
  for (const l of corpo) {
    const [celTipo, celModelo, celPapeis] = l.split('|').slice(1, -1).map(c => c.trim())
    const tipos = celTipo ? celTipo.split(/\s*[,/]\s*/).filter(Boolean) : tiposAnteriores
    tiposAnteriores = tipos
    const modelo = celModelo === '—' || celModelo === '' ? null : celModelo
    let papeis: string[]
    if (celPapeis.startsWith('todos os 7')) papeis = TODOS
    else if (/^\(somente `?jornada_sistema/.test(celPapeis)) papeis = []
    else papeis = celPapeis.split(',').map(p => p.trim())
    for (const tipo of tipos) resultado.push({ tipo, modelo, papeis })
  }
  return resultado
}

const normalizar = (linhas: Linha[]) =>
  linhas
    .map(l => ({ tipo: l.tipo, modelo: l.modelo, papeis: [...l.papeis].sort() }))
    .sort((a, b) => (a.tipo + '|' + (a.modelo ?? '')).localeCompare(b.tipo + '|' + (b.modelo ?? '')))

let banco: BancoTeste
let carregada: Linha[]

beforeAll(async () => {
  banco = await criarBancoTeste()
  const linhas = await banco.sql`select tipo, modelo, papeis from jornada_cirurgica.permissoes_evento`
  carregada = linhas.map(l => ({ tipo: l.tipo as string, modelo: l.modelo as string | null, papeis: l.papeis as string[] }))
})

afterAll(async () => {
  await banco?.encerrar()
})

describe('matriz permissoes_evento (ARQUITETURA §4.4)', () => {
  it('tem 57 linhas e nenhuma duplicada', () => {
    expect(carregada).toHaveLength(57)
    const chaves = carregada.map(l => `${l.tipo}|${l.modelo ?? ''}`)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('é idêntica à tabela literal deste teste', () => {
    expect(normalizar(carregada)).toEqual(normalizar(ESPERADA))
  })

  it('é idêntica à tabela lida do documento docs/ARQUITETURA.md', () => {
    const doDoc = matrizDoDocumento()
    expect(doDoc).toHaveLength(57)
    expect(normalizar(carregada)).toEqual(normalizar(doDoc))
  })

  it('cobre exatamente os TipoEvento de tipos.ts', () => {
    const fonte = readFileSync(join(RAIZ, 'supabase', 'functions', '_shared', 'dominio', 'tipos.ts'), 'utf8')
    const bloco = fonte.slice(fonte.indexOf('export type TipoEvento ='), fonte.indexOf('export interface Evento'))
    const tipos = [...bloco.matchAll(/\|\s*'([a-z_]+\.[a-z0-9_]+)'/g)].map(m => m[1])
    expect(tipos.length).toBeGreaterThan(30)
    expect([...new Set(carregada.map(l => l.tipo))].sort()).toEqual([...new Set(tipos)].sort())
  })

  it('checklist.item_respondido e bloco.concluido: uma linha por ModeloId, sem linha genérica', () => {
    for (const tipo of ['checklist.item_respondido', 'bloco.concluido']) {
      const modelos = carregada.filter(l => l.tipo === tipo).map(l => l.modelo)
      expect(modelos).not.toContain(null)
      expect([...modelos].sort()).toEqual([...ORDEM_MODELOS].sort())
    }
    expect(carregada.filter(l => !['checklist.item_respondido', 'bloco.concluido'].includes(l.tipo)).every(l => l.modelo === null)).toBe(true)
  })

  it('só usa os 7 papéis de tipos.ts', () => {
    const usados = new Set(carregada.flatMap(l => l.papeis))
    for (const p of usados) expect(PAPEIS).toContain(p)
  })

  it('papeis_do_evento resolve (tipo, modelo) como a política de INSERT', async () => {
    const r = await banco.sql`
      select jornada_cirurgica.papeis_do_evento('checklist.item_respondido', 'd2') as d2,
             jornada_cirurgica.papeis_do_evento('checklist.item_respondido', null) as sem_modelo,
             jornada_cirurgica.papeis_do_evento('checklist.item_respondido', 'inexistente') as inexistente,
             jornada_cirurgica.papeis_do_evento('alerta.conduta_registrada', 'd7') as tipo_sem_modelo,
             jornada_cirurgica.papeis_do_evento('quiz.respondido', null) as so_sistema,
             jornada_cirurgica.papeis_do_evento('tipo.inexistente', null) as tipo_inexistente`
    expect(r[0]).toEqual({
      d2: ['conferente', 'concierge'],
      sem_modelo: null,
      inexistente: null,
      tipo_sem_modelo: ['cirurgiao'],
      so_sistema: [],
      tipo_inexistente: null,
    })
  })
})
