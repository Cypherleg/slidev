// @vitest-environment jsdom
// Gestão: indicadores, fila de mensagens (modo ensaio), membros, modelos e configuração. Dados fictícios.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Indicador } from '@dominio/index.ts'
import type { ConfigJornada, MensagemSaida } from '@dominio/tipos.ts'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  chamarPaciente: vi.fn(),
  ErroChamada: class ErroChamada extends Error {},
}))

import { chamar } from '../../api/cliente.ts'
import { modeloFicticio } from '../impressao/ficticios.ts'
import { previaEtiqueta } from './etiquetas.ts'
import { apresentarIndicador, formatarPercentual } from './formatoIndicador.ts'
import Gestao from './Gestao.tsx'
import { TabelaIndicadores } from './Indicadores.tsx'
import { validarModelo } from './validarModelo.ts'

const mockChamar = vi.mocked(chamar)

function rotear(respostas: Record<string, unknown | ((dados: unknown) => unknown)>) {
  mockChamar.mockImplementation(async (acao: string, dados: unknown) => {
    if (!(acao in respostas)) throw { erro: { codigo: 'nao_encontrado', mensagem: `sem resposta para ${acao}` } }
    const r = respostas[acao]
    return (typeof r === 'function' ? (r as (d: unknown) => unknown)(dados) : r) as never
  })
}

function renderizar(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/gestao/*" element={<Gestao />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockChamar.mockReset()
})

const INDICADORES: Indicador[] = [
  { numero: 1, nome: 'Checklist D0 completo', numerador: 19, denominador: 20, valor: 0.95, meta: '100%' },
  { numero: 2, nome: 'Time Out real', numerador: null, denominador: null, valor: null, meta: '≥ 95%', observacao: 'Exige observação direta: registrar manualmente.' },
  { numero: 3, nome: 'Dupla conferência de LIO', numerador: 2, denominador: 3, valor: 2 / 3, meta: '100%' },
  { numero: 4, nome: 'Divergências interceptadas', numerador: 4, denominador: null, valor: null, meta: 'Sem meta de zero' },
]

describe('Indicadores', () => {
  it('tabela com número, nome, numerador/denominador, % , meta e "registro manual"', () => {
    render(<TabelaIndicadores indicadores={INDICADORES} de="2026-10-01" ate="2026-10-31" />)
    expect(screen.getByText('Indicadores de adesão ao POP, de 01/10/2026 a 31/10/2026')).toBeTruthy()
    const linha1 = document.querySelector('tr[data-indicador="1"]') as HTMLElement
    expect(within(linha1).getByText('Checklist D0 completo')).toBeTruthy()
    expect(within(linha1).getByText('19')).toBeTruthy()
    expect(within(linha1).getByText('20')).toBeTruthy()
    expect(within(linha1).getByText('95%')).toBeTruthy()
    expect(within(linha1).getByText('100%')).toBeTruthy()
    const linha2 = document.querySelector('tr[data-indicador="2"]') as HTMLElement
    expect(within(linha2).getByText('Registro manual')).toBeTruthy()
    expect(within(linha2).getByText(/observação direta/)).toBeTruthy()
    const linha3 = document.querySelector('tr[data-indicador="3"]') as HTMLElement
    expect(within(linha3).getByText('66,7%')).toBeTruthy()
    const linha4 = document.querySelector('tr[data-indicador="4"]') as HTMLElement
    expect(within(linha4).getByText('4 (contagem)')).toBeTruthy()
  })

  it('formata percentual e detecta indicador manual', () => {
    expect(formatarPercentual(1)).toBe('100%')
    expect(formatarPercentual(0.9523)).toBe('95,2%')
    expect(formatarPercentual(null)).toBe('—')
    expect(apresentarIndicador(INDICADORES[1]).manual).toBe(true)
    expect(apresentarIndicador(INDICADORES[0]).manual).toBe(false)
    expect(apresentarIndicador({ numero: 7, nome: 'TCLE no prazo', numerador: 0, denominador: 0, valor: null, meta: '≥ 90%' }).valor).toBe('Sem casos no período')
  })

  it('a tela calcula pelo período escolhido', async () => {
    rotear({ 'indicadores.calcular': INDICADORES })
    renderizar('/gestao/indicadores')
    await screen.findByText('Checklist D0 completo')
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calcular' }))
    await waitFor(() => expect(mockChamar).toHaveBeenLastCalledWith('indicadores.calcular', { de: '2026-09-01', ate: '2026-09-30' }))
  })
})

describe('Mensagens', () => {
  const msg = (estado: MensagemSaida['estado'], n: number): MensagemSaida => ({
    id: `m${n}`,
    episodioId: 'ep-1',
    gatilho: 'admissao_concluida',
    contatoId: 'c1',
    destinoMascarado: '(00) 9****-**01',
    texto: 'Olá. Alfa já está com a equipe.',
    modeloMeta: null,
    estado,
    criadoEm: `2026-10-20T1${n}:00:00Z`,
    atualizadoEm: `2026-10-20T1${n}:00:00Z`,
  })

  it('mostra "MODO ENSAIO: nenhuma mensagem sai", destino mascarado e estados por extenso', async () => {
    rotear({ 'mensagens.listar': [msg('ensaio', 1), msg('desconhecido', 2)] })
    renderizar('/gestao/mensagens?data=2026-10-20')
    expect(await screen.findByText('MODO ENSAIO: nenhuma mensagem sai.')).toBeTruthy()
    expect(mockChamar).toHaveBeenCalledWith('mensagens.listar', { data: '2026-10-20' })
    expect(screen.getAllByText('(00) 9****-**01')).toHaveLength(2)
    expect(screen.getAllByText('Ensaio (não sai)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Desconhecido: reconciliar antes de reenviar').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Admissão concluída').length).toBe(2)
  })

  it('filtra por data da cirurgia ou por episódio', async () => {
    rotear({ 'mensagens.listar': [] })
    renderizar('/gestao/mensagens?data=2026-10-20')
    await screen.findByText('Nenhuma mensagem com estes filtros.')
    fireEvent.change(screen.getByLabelText('Data da cirurgia'), { target: { value: '2026-10-21' } })
    await waitFor(() => expect(mockChamar).toHaveBeenLastCalledWith('mensagens.listar', { data: '2026-10-21' }))
    renderizar('/gestao/mensagens?episodio=ep-1')
    await waitFor(() => expect(mockChamar).toHaveBeenLastCalledWith('mensagens.listar', { episodioId: 'ep-1' }))
  })
})

describe('Membros', () => {
  it('lista, valida e convida com nome, e-mail e papéis', async () => {
    const convites: unknown[] = []
    rotear({
      'membros.listar': [
        { id: 'u1', email: 'gestora.teste@exemplo.invalid', nome: 'Gestora Teste', papeis: ['gestora'], ativo: true, vinculado: true, temPin: true },
        { id: null, email: 'novo.teste@exemplo.invalid', nome: 'Novo Teste', papeis: ['concierge'], ativo: true, vinculado: false, temPin: false },
      ],
      'membros.convidar': (d: unknown) => {
        convites.push(d)
        return { ok: true }
      },
    })
    renderizar('/gestao')
    expect(await screen.findByText('Gestora Teste')).toBeTruthy()
    expect(screen.getByText('Convite: aguardando o primeiro acesso')).toBeTruthy()

    const form = screen.getByRole('form', { name: 'Convidar membro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Convidar' }))
    expect(await within(form).findByText('Informe um e-mail válido.')).toBeTruthy()
    expect(within(form).getByText('Escolha pelo menos um papel.')).toBeTruthy()

    fireEvent.change(within(form).getByLabelText('Nome'), { target: { value: 'Enfermeira Teste' } })
    fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: 'Enfermeira.Teste@Exemplo.invalid' } })
    fireEvent.click(within(form).getByLabelText('Enfermagem'))
    fireEvent.click(within(form).getByLabelText('Circulante'))
    fireEvent.click(within(form).getByRole('button', { name: 'Convidar' }))
    await screen.findByText('Convite registrado para Enfermeira Teste.')
    expect(convites).toEqual([{ email: 'enfermeira.teste@exemplo.invalid', nome: 'Enfermeira Teste', papeis: ['enfermagem', 'circulante'] }])
  })

  it('desativar pede confirmação', async () => {
    rotear({
      'membros.listar': [{ id: 'u2', email: 'c.teste@exemplo.invalid', nome: 'Concierge Teste', papeis: ['concierge'], ativo: true, vinculado: true, temPin: false }],
      'membros.atualizar': { ok: true },
    })
    renderizar('/gestao/membros')
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }))
    expect(mockChamar).not.toHaveBeenCalledWith('membros.atualizar', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: desativar Concierge Teste' }))
    await waitFor(() => expect(mockChamar).toHaveBeenCalledWith('membros.atualizar', { email: 'c.teste@exemplo.invalid', ativo: false }))
  })
})

describe('Modelos', () => {
  it('validação mínima do JSON antes de publicar', () => {
    expect(validarModelo('{ isto não é json').erros[0]).toMatch(/JSON válido/)
    const ok = validarModelo(JSON.stringify(modeloFicticio('d7', 'pop-0.4/1')))
    expect(ok.erros).toEqual([])
    expect(ok.modelo?.id).toBe('d7')

    const ruim = modeloFicticio('d7', 'x/2') as unknown as Record<string, unknown>
    ruim.id = 'inexistente'
    ;(ruim.secoes as { itens: Record<string, unknown>[] }[])[0].itens[0].tipo = 'desconhecido'
    ;(ruim.secoes as { itens: Record<string, unknown>[] }[])[0].itens[1].papeis = ['faxina']
    ;(ruim.secoes as { itens: Record<string, unknown>[] }[])[1].itens[0].opcoes = []
    ;(ruim.secoes as { itens: Record<string, unknown>[] }[])[1].itens[1].depoisDe = ['nao.existe']
    ;(ruim.secoes as { itens: Record<string, unknown>[] }[])[1].itens[2].exigidoQuando = { contexto: 'qualquer' }
    const erros = validarModelo(JSON.stringify(ruim)).erros.join('\n')
    expect(erros).toMatch(/"id": deve ser um destes/)
    expect(erros).toMatch(/"tipo" deve ser um destes/)
    expect(erros).toMatch(/papel desconhecido \(faxina\)/)
    expect(erros).toMatch(/"opcoes" obrigatório/)
    expect(erros).toMatch(/item inexistente \(nao\.existe\)/)
    expect(erros).toMatch(/"exigidoQuando" inválido/)
  })

  it('lista versões, mostra o modelo legível e avisa que cada episódio guarda a versão usada', async () => {
    const modelo = modeloFicticio('time_out', 'pop-0.4/1')
    rotear({
      'modelos.listar': [{ id: 'time_out', versao: 'pop-0.4/1', publicadoEm: '2026-10-12T12:00:00Z', ativo: true }],
      'modelos.obter': modelo,
    })
    renderizar('/gestao/modelos')
    expect(await screen.findByText('Ativa: vale para novos episódios')).toBeTruthy()
    expect(screen.getByText('Cada episódio guarda a versão usada.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Imprimir em branco' }).getAttribute('href')).toBe('/impressao/branco/time_out?versao=pop-0.4%2F1')
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(await screen.findByText('Item de opção time_out')).toBeTruthy()
    expect(screen.getByText('decisão pendente de teste')).toBeTruthy()
  })
})

describe('Configuração', () => {
  const CONFIG: ConfigJornada = {
    temposEtapa: { duracao_cirurgia: 30 },
    modelosEtiqueta: { peito: '{NOME_COMPLETO}\n{OLHO_EXTENSO}', pulseira: '{NOME_COMPLETO} {NASCIMENTO}', caixa_lente: '{NOME_COMPLETO}', alertas: '{ALERTAS_EXTENSO}' },
    limiarNomeParecido: 0.85,
    exigirCp2AntesDoTimeOut: true,
    itensAnestesiaExtras: [],
    feriados: [],
    telefones: { hospital: '(00) 0000-0000' },
  }

  it('pré-visualiza etiquetas com dados fictícios e aponta marcador desconhecido', () => {
    expect(previaEtiqueta('{NOME_COMPLETO} · {OLHO_EXTENSO}').texto).toBe('Paciente Teste Alfa da Silva · OLHO DIREITO')
    expect(previaEtiqueta('{CPF}').desconhecidos).toEqual(['CPF'])
  })

  it('explica tempo vazio, marca [S] e salva sem fixar tempos vazios', async () => {
    let salvo: unknown = null
    rotear({
      'config.obter': CONFIG,
      'config.salvar': (d: unknown) => {
        salvo = d
        return { ...CONFIG, ...(d as { config: Partial<ConfigJornada> }).config }
      },
    })
    renderizar('/gestao/config')
    expect(await screen.findByText(/Campo vazio: a mensagem sai sem previsão de tempo/)).toBeTruthy()
    expect(screen.getByText('[S] a confirmar')).toBeTruthy()
    expect(screen.getByLabelText('Pré-visualização: Etiqueta do peito').textContent).toBe('Paciente Teste Alfa da Silva\nOLHO DIREITO')

    fireEvent.change(screen.getByLabelText('Duração da cirurgia'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Da admissão até o início da cirurgia'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }))
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'Jejum conferido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))
    await screen.findByText(/Configuração salva/)
    const config = (salvo as { config: Partial<ConfigJornada> }).config
    expect(config.temposEtapa).toEqual({ admissao_ate_inicio: 45 })
    expect(config.itensAnestesiaExtras).toEqual([{ id: 'anestesia_extra_jejum_conferido', texto: 'Jejum conferido' }])
    expect(config.telefones).toEqual({ hospital: '(00) 0000-0000', whatsappConcierge: null, enfermagemForaHorario: null })
    expect(config.limiarNomeParecido).toBe(0.85)
  })

  it('recusa tempo inválido', async () => {
    rotear({ 'config.obter': CONFIG })
    renderizar('/gestao/config')
    fireEvent.change(await screen.findByLabelText('Duração da cirurgia'), { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))
    expect(await screen.findByText('Use minutos inteiros (de 1 a 1440) ou deixe em branco.')).toBeTruthy()
    expect(mockChamar).not.toHaveBeenCalledWith('config.salvar', expect.anything())
  })
})
