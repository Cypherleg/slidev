import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  abrirEpisodio,
  cadastrarPaciente,
  configPadrao,
  dataLocal,
  formatarData,
  formatarDataHora,
  formatarDioptria,
  gerarEtiquetas,
  linhasMatrizPermissoes,
  mascararTelefone,
  modelosPadrao,
  normalizarCpf,
  normalizarNome,
  ORDEM_MODELOS,
  PAPEIS,
  PAPEIS_POR_MODELO,
  papeisPermitidosParaEvento,
  primeiroNome,
  similaridadeNomes,
  SI,
  validarCpf,
  versoesDosModelos,
} from '../../supabase/functions/_shared/dominio/index.ts'
import type { ModeloId, Papel } from '../../supabase/functions/_shared/dominio/index.ts'
import { D7 } from '../../supabase/functions/_shared/dominio/index.ts'
import { fazerD7, MEMBROS, Simulador } from './apoio.ts'

/** CPF fictício com dígitos válidos, gerado a partir de 9 dígitos. */
function cpfTeste(base9: string): string {
  const n = base9.split('').map(Number)
  const dv = (arr: number[]) => {
    const s = arr.reduce((acc, d, i) => acc + d * (arr.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(n)
  const d2 = dv([...n, d1])
  return `${base9}${d1}${d2}`
}

describe('utilitários', () => {
  it('CPF: dígitos verificadores, repetidos e normalização', () => {
    const cpf = cpfTeste('000123456')
    expect(validarCpf(cpf)).toBe(true)
    expect(validarCpf(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`)).toBe(true)
    expect(validarCpf(cpf.slice(0, 10) + ((Number(cpf[10]) + 1) % 10))).toBe(false)
    expect(validarCpf('11111111111')).toBe(false)
    expect(validarCpf('123')).toBe(false)
    expect(normalizarCpf(' 000.123.456-xx ')).toBe('000123456')
  })

  it('normalizarNome: sem acentos, maiúsculas, espaços simples', () => {
    expect(normalizarNome('  José  da   Conceição ')).toBe('JOSE DA CONCEICAO')
    expect(normalizarNome("Ana D'Ávila-Souza")).toBe('ANA DAVILA SOUZA')
  })

  it('similaridadeNomes (Jaro-Winkler): iguais = 1; parecidos alto; diferentes baixo', () => {
    expect(similaridadeNomes('Paciente Teste Alfa', 'PACIENTE TESTE ALFA')).toBe(1)
    expect(similaridadeNomes('Paciente Teste Alfa da Silva', 'Paciente Teste Alfa da Silveira')).toBeGreaterThanOrEqual(0.9)
    expect(similaridadeNomes('Paciente Teste Alfa', 'Outra Pessoa Zeta')).toBeLessThan(0.7)
    expect(similaridadeNomes('', 'x')).toBe(0)
  })

  it('formatarDioptria: sinal sempre explícito, vírgula, duas casas', () => {
    expect(formatarDioptria(21.5)).toBe('+21,50 D')
    expect(formatarDioptria(-1.25)).toBe('-1,25 D')
    expect(formatarDioptria(0)).toBe('+0,00 D')
    expect(formatarDioptria(10)).toBe('+10,00 D')
  })

  it('datas em America/Sao_Paulo', () => {
    expect(dataLocal('2026-10-20T02:30:00.000Z')).toBe('2026-10-19')
    expect(dataLocal('2026-10-20T03:00:00.000Z')).toBe('2026-10-20')
    expect(dataLocal('2026-10-20')).toBe('2026-10-20')
    expect(formatarData('2026-10-20')).toBe('20/10/2026')
    expect(formatarData('2026-10-20T02:30:00Z')).toBe('19/10/2026')
    expect(formatarDataHora('2026-10-20T10:05:00.000Z')).toBe('20/10/2026 07:05')
  })

  it('primeiroNome e mascararTelefone', () => {
    expect(primeiroNome('PACIENTE TESTE ALFA')).toBe('Paciente')
    expect(primeiroNome('  Érica Teste ')).toBe('Érica')
    expect(mascararTelefone('(44) 99999-1262')).toBe('(44) 9****-**62')
    expect(mascararTelefone('+55 44 3361-0000')).toBe('(44) 3***-**00')
    expect(mascararTelefone('123')).toBe('****')
  })

  it('configPadrao: sem tempos, sem telefones fixos, Cp2 antes do Time Out [S]', () => {
    const c = configPadrao()
    expect(c.temposEtapa).toEqual({})
    expect(c.exigirCp2AntesDoTimeOut).toBe(true)
    expect(c.limiarNomeParecido).toBeGreaterThan(0)
    expect(c.limiarNomeParecido).toBeLessThan(1)
    expect(Object.values(c.telefones).every((t) => t === null)).toBe(true)
    expect(Object.keys(c.modelosEtiqueta).sort()).toEqual(['alertas', 'caixa_lente', 'peito', 'pulseira'])
  })
})

describe('modelos v1 (POP v0.4)', () => {
  const modelos = modelosPadrao()

  it('versão pop-0.4/1, todos os modelos, ids únicos, fonte em cada item, papéis dentro da matriz', () => {
    expect(Object.keys(modelos).sort()).toEqual([...ORDEM_MODELOS].sort())
    for (const id of ORDEM_MODELOS) {
      const m = modelos[id]
      expect(m.versao).toBe('pop-0.4/1')
      const itens = m.secoes.flatMap((s) => s.itens)
      expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length)
      for (const i of itens) {
        expect(i.fonte, `${id}.${i.id}`).toBeTruthy()
        expect(i.papeis.length).toBeGreaterThan(0)
        for (const p of i.papeis) expect(PAPEIS_POR_MODELO[id], `${id}.${i.id}`).toContain(p)
        if (i.tipo === 'opcao' || i.tipo === 'multipla') expect(i.opcoes?.length).toBeGreaterThan(1)
        for (const d of i.depoisDe ?? []) expect(itens.some((x) => x.id === d)).toBe(true)
        if (i.exigidoQuando && 'itemId' in i.exigidoQuando) expect(itens.some((x) => x.id === (i.exigidoQuando as { itemId: string }).itemId)).toBe(true)
      }
      for (const p of m.papeisConclusao) expect(PAPEIS_POR_MODELO[id]).toContain(p)
    }
  })

  it('D-7: seções A a G; medicamentos com exemplos e "a concierge nunca orienta suspender"', () => {
    const d7 = modelos.d7
    expect(d7.secoes.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    const b = d7.secoes[1].itens
    expect(b.every((i) => i.tipo === 'medicamento')).toBe(true)
    expect(b.find((i) => i.id === D7.glp1)?.ajuda).toContain('nunca orienta suspender')
    expect(b.find((i) => i.id === D7.insulina)?.ajuda).toContain('nunca orienta suspender')
    expect(b.find((i) => i.id === D7.alfaBloqueador)?.ajuda).toContain('tansulosina')
    expect(b.find((i) => i.id === D7.antipsicoticos)?.alerta?.nivel).toBe('sinalizado')
    expect(b.find((i) => i.id === D7.glp1)?.camposMedicamento).toEqual(['glp1'])
    expect(b.find((i) => i.id === D7.insulina)?.camposMedicamento).toEqual(['insulina'])
    expect(d7.secoes[3].itens.filter((i) => i.tipo === 'alergia')).toHaveLength(6)
    // "Pedido e paciente coincidem" não é perguntado (é derivado).
    expect(d7.secoes[0].itens.some((i) => /coincidem/i.test(i.texto))).toBe(false)
    expect(d7.secoes[0].itens.find((i) => i.id === D7.olhoPaciente)).toMatchObject({ tipo: 'olho', permiteNaoSabe: true })
    expect(d7.secoes[2].itens.find((i) => i.id === D7.representante)).toMatchObject({ tipo: 'pessoa', exigidoQuando: { itemId: D7.demencia, valores: ['sim'] } })
  })

  it('cp1 e cp2 com o item da biometria original; plausibilidade do cp2 pendente; valores da lente não são itens', () => {
    const cp1 = modelos.cp1.secoes.flatMap((s) => s.itens)
    const cp2 = modelos.cp2.secoes.flatMap((s) => s.itens)
    for (const lista of [cp1, cp2]) {
      expect(lista.find((i) => /Biometria original \(impressão do ARGOS\)/.test(i.texto))).toMatchObject({ tipo: 'sim_nao', hardStop: 'HS2_BIOMETRIA_AUSENTE' })
      expect(lista.some((i) => /dioptria/i.test(i.id))).toBe(lista === cp1) // cp1 confirma a dioptria; cp2 digita à parte
    }
    expect(cp2.find((i) => i.id === 'CP2.plausibilidade')).toMatchObject({ obrigatorio: false })
    expect(cp2.find((i) => i.id === 'CP2.plausibilidade')?.pendente).toBeTruthy()
  })

  it('Sign In e Time Out exigem leitura em voz alta; midriático depois da identificação, consentimento e marcação (cirurgião)', () => {
    expect(modelos.sign_in.exigeLeituraEmVozAlta).toBe(true)
    expect(modelos.time_out.exigeLeituraEmVozAlta).toBe(true)
    const si = modelos.sign_in.secoes.flatMap((s) => s.itens)
    expect(si.find((i) => i.id === SI.marcacao)?.papeis).toEqual(['cirurgiao'])
    expect(si.find((i) => i.id === SI.midriatico)).toMatchObject({ depoisDe: [SI.identificacao, SI.consentimento, SI.marcacao], hardStop: 'HS9_SITIO_NAO_MARCADO' })
  })

  it('anestesia: itens do POP + extras da configuração (versão derivada)', () => {
    const base = modelos.anestesia.secoes.flatMap((s) => s.itens)
    expect(base.map((i) => i.id)).toEqual(['AN.jejum_medicacoes', 'AN.monitorizacao_acesso', 'AN.liberacao_recuperacao'])
    const comExtras = modelosPadrao({ itensAnestesiaExtras: [{ id: 'via_aerea', texto: 'Item extra de teste' }] }).anestesia
    expect(comExtras.versao).toMatch(/^pop-0\.4\/1\+anest\.[0-9a-f]{8}$/)
    expect(comExtras.secoes[1].itens).toMatchObject([{ id: 'EXTRA.via_aerea', texto: 'Item extra de teste', papeis: ['anestesista'] }])
    expect(versoesDosModelos(modelos).d7).toBe('pop-0.4/1')
  })

  it('alta: critérios do item 4.5 separados; alta médica pelo cirurgião; retornos D1 e D15 com data e hora', () => {
    const it = modelos.alta.secoes.flatMap((s) => s.itens)
    expect(it.filter((i) => i.id.startsWith('CRIT.'))).toHaveLength(9)
    expect(it.find((i) => i.id === 'ALTA.alta_medica')?.papeis).toEqual(['cirurgiao'])
    expect(it.filter((i) => i.id.startsWith('RET.')).map((i) => i.tipo)).toEqual(['data', 'hora', 'data', 'hora', 'texto'])
  })
})

describe('matriz papel × evento (ARQUITETURA §4.4)', () => {
  it('é idêntica à tabela do documento', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../docs/ARQUITETURA.md', import.meta.url)), 'utf8')
    const secao = doc.slice(doc.indexOf('### 4.4'), doc.indexOf('## 5.'))
    const nomes: Record<string, Papel> = { concierge: 'concierge', conferente: 'conferente', enfermagem: 'enfermagem', circulante: 'circulante', anestesista: 'anestesista', cirurgiao: 'cirurgiao', gestora: 'gestora' }
    const esperado: { tipo: string; modelo: string | null; papeis: Papel[] }[] = []
    let tiposAtuais: string[] = []
    for (const linha of secao.split('\n')) {
      const cel = linha.split('|').map((c) => c.trim())
      if (cel.length < 5 || cel[1] === 'tipo' || cel[1].startsWith('---')) continue
      const [, tiposTxt, modeloTxt, papeisTxt] = cel
      if (tiposTxt) tiposAtuais = tiposTxt.split(/,|\//).map((t) => t.trim()).filter(Boolean)
      const modelo = modeloTxt === '—' ? null : modeloTxt
      let papeis: Papel[]
      if (/todos os 7/.test(papeisTxt)) papeis = [...PAPEIS]
      else if (/somente `jornada_sistema`/.test(papeisTxt)) papeis = []
      else papeis = papeisTxt.split(',').map((p) => nomes[p.trim()]).filter(Boolean)
      for (const t of tiposAtuais) esperado.push({ tipo: t, modelo, papeis })
    }
    const norm = (l: { tipo: string; modelo: string | null; papeis: Papel[] }[]) => l.map((x) => `${x.tipo}|${x.modelo ?? ''}|${[...x.papeis].sort().join(',')}`).sort()
    expect(norm(linhasMatrizPermissoes())).toEqual(norm(esperado))
    expect(papeisPermitidosParaEvento('checklist.item_respondido', 'cp2')).toEqual(['conferente'])
    expect(papeisPermitidosParaEvento('checklist.item_respondido', null)).toEqual([])
    expect(papeisPermitidosParaEvento('quiz.respondido')).toEqual([])
    const modelosDaMatriz = Object.keys(PAPEIS_POR_MODELO) as ModeloId[]
    expect(modelosDaMatriz.sort()).toEqual([...ORDEM_MODELOS].sort())
  })
})

describe('cadastro, abertura e etiquetas', () => {
  it('cadastro exige documento conferido e nome completo; abertura recusa episódio ativo do mesmo olho', () => {
    const sim = new Simulador()
    const ctx = sim.ctx('concierge')
    const ok = cadastrarPaciente(
      { pacienteId: 'p-novo', nomeCompleto: '  Paciente   Teste Beta ', dataNascimento: '1948-05-06', nomeMae: null, prontuario: null, datasighId: null, conferidoDatasigh: false, documentoConferido: true },
      ctx,
    )
    expect(ok).toMatchObject({ tipo: 'paciente.cadastrado', episodioId: null, pacienteId: 'p-novo', autorPapel: 'concierge', dados: { nomeCompleto: 'Paciente Teste Beta', nomeNormalizado: 'PACIENTE TESTE BETA' } })
    expect(() => cadastrarPaciente({ pacienteId: 'p', nomeCompleto: 'Paciente Teste', dataNascimento: '1948-05-06', nomeMae: null, prontuario: null, datasighId: null, conferidoDatasigh: false, documentoConferido: false }, ctx)).toThrowError(/documento/)
    expect(() => cadastrarPaciente({ pacienteId: 'p', nomeCompleto: 'Paciente', dataNascimento: '1948-05-06', nomeMae: null, prontuario: null, datasighId: null, conferidoDatasigh: false, documentoConferido: true }, ctx)).toThrowError(/Nome completo/)
    expect(() => cadastrarPaciente({ pacienteId: 'p', nomeCompleto: 'Paciente Teste', dataNascimento: '1948-05-06', nomeMae: null, prontuario: null, datasighId: null, conferidoDatasigh: false, documentoConferido: true }, sim.ctx('enfermagem'))).toThrowError(/permissão/)
    const base = {
      episodioId: 'e-novo',
      paciente: sim.entrada.paciente,
      olho: 'OD' as const,
      cirurgiaoId: MEMBROS.cirurgiao.id,
      tipoCirurgia: 'Facoemulsificação com implante de LIO',
      tipoLente: 'monofocal',
      dataSugerida: null,
      versoesModelos: sim.entrada.episodio.versoesModelos,
    }
    expect(() => abrirEpisodio({ ...base, anterioresDoPaciente: [{ episodioId: 'e1', olho: 'OD', dataCirurgia: null, estado: 'd7_concluido' }] }, ctx)).toThrowError(/em andamento/)
    expect(abrirEpisodio({ ...base, anterioresDoPaciente: [{ episodioId: 'e1', olho: 'OD', dataCirurgia: null, estado: 'cancelado' }] }, ctx).avisos).toEqual([])
  })

  it('etiquetas: peito = nome, olho, cirurgia; pulseira com dots por letra e alertas por extenso; caixa = nome, nascimento, olho', () => {
    const sim = new Simulador()
    fazerD7(sim, { [D7.olhoUnico]: 'sim', [D7.alfaBloqueador]: { uso: 'usa', nomes: 'Remédio Teste A' } })
    const et = gerarEtiquetas(sim.estado(), sim.entrada.config)
    const porTipo = Object.fromEntries(et.map((e) => [e.tipo, e.texto]))
    expect(porTipo.peito).toBe('PACIENTE TESTE ALFA DA SILVA\nOLHO DIREITO\nFacoemulsificação com implante de LIO')
    expect(porTipo.pulseira).toBe(
      'PACIENTE TESTE ALFA DA SILVA\nNasc.: 04/03/1950\nPront.: PT-0001\nOLHO DIREITO\nQ — Risco de queda (amarelo) | I — IFIS (azul)\nOLHO ÚNICO',
    )
    expect(porTipo.caixa_lente).toBe('PACIENTE TESTE ALFA DA SILVA\nNasc.: 04/03/1950\nOLHO DIREITO')
    expect(porTipo.alertas).toBe('OLHO ÚNICO')
    // Modelo configurável pela gestora; linha com marcador vazio some.
    const cfg = { ...sim.entrada.config, modelosEtiqueta: { ...sim.entrada.config.modelosEtiqueta, peito: '{NOME_COMPLETO}\nMãe: {NOME_MAE}\n{OLHO_EXTENSO}' } }
    expect(gerarEtiquetas(sim.estado(), cfg).find((e) => e.tipo === 'peito')?.texto).toBe('PACIENTE TESTE ALFA DA SILVA\nOLHO DIREITO')
  })
})
