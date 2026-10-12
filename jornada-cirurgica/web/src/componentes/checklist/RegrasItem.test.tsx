// @vitest-environment jsdom
// Regras da revisão de fidelidade (modelos pop-0.4/2) exibidas pelo renderizador genérico.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ItemModelo, ModeloChecklist, ModeloId, RespostaAtual } from '@dominio/tipos.ts'
import { RenderizadorChecklist } from './RenderizadorChecklist.tsx'

const item = (id: string, tipo: ItemModelo['tipo'], texto: string, extra: Partial<ItemModelo> = {}): ItemModelo => ({
  id,
  texto,
  tipo,
  obrigatorio: true,
  papeis: ['concierge', 'enfermagem', 'circulante'],
  fonte: 'teste',
  ...extra,
})
const modelo = (id: ModeloId, itens: ItemModelo[]): ModeloChecklist => ({ id, versao: 'teste/2', titulo: `Modelo ${id}`, papeisConclusao: ['concierge'], fonte: 'teste', secoes: [{ id: 'S', titulo: 'Seção', itens }] })
const resposta = (valor: RespostaAtual['valor']): RespostaAtual => ({ valor, autorId: 'u', autorNome: 'Pessoa Fictícia', registradoEm: '2026-10-12T12:00:00Z', foraDeHora: false, correcoes: 0 })
const naTela = (id: string) => document.querySelector(`[data-item="${id}"]`) as HTMLElement

const d7 = modelo('d7', [
  item('C.demencia', 'sim_nao', 'Demência ou déficit cognitivo'),
  item('C.olho_unico', 'sim_nao', 'Olho único ou ambliopia'),
  item('C.olho_unico_qual', 'opcao', 'Olho único ou ambliopia: qual', {
    obrigatorio: false,
    exigidoQuando: { itemId: 'C.olho_unico', valores: ['sim'] },
    opcoes: [
      { valor: 'olho_unico', rotulo: 'Olho único' },
      { valor: 'ambliopia', rotulo: 'Ambliopia' },
    ],
  }),
])

const timeOut = modelo('time_out', [
  item('C.olho_unico_preceptor', 'confirmacao', 'Olho único: operado pelo preceptor', { obrigatorio: false, exigidoQuando: { itemId: 'd7:C.olho_unico_qual', valores: ['olho_unico'] } }),
])

describe('condição entre modelos (exigidoQuando "d7:...")', () => {
  it('fica recolhido enquanto o D-7 não registra olho único; com olho único, vira obrigatório', () => {
    const { rerender } = render(
      <RenderizadorChecklist modelo={timeOut} papeisAtor={['circulante']} aoSalvar={vi.fn()} contexto={{ modelos: { d7 }, respostasPorModelo: { d7: {} } }} />,
    )
    const it1 = within(naTela('C.olho_unico_preceptor'))
    expect(it1.getByText(/Responder quando "Olho único ou ambliopia: qual" \(D-7: checklist da concierge\) for Olho único/)).toBeTruthy()
    expect(it1.getByRole('button', { name: /Responder mesmo assim/ })).toBeTruthy()

    // Valor do item condicional só conta quando a condição dele vale: "qual = olho único" com "olho único = não" não ativa.
    rerender(
      <RenderizadorChecklist
        modelo={timeOut}
        papeisAtor={['circulante']}
        aoSalvar={vi.fn()}
        contexto={{ modelos: { d7 }, respostasPorModelo: { d7: { 'C.olho_unico': resposta('nao'), 'C.olho_unico_qual': resposta('olho_unico') } } }}
      />,
    )
    expect(within(naTela('C.olho_unico_preceptor')).queryByText(/^Obrigatório:/)).toBeNull()

    rerender(
      <RenderizadorChecklist
        modelo={timeOut}
        papeisAtor={['circulante']}
        aoSalvar={vi.fn()}
        contexto={{ modelos: { d7 }, respostasPorModelo: { d7: { 'C.olho_unico': resposta('sim'), 'C.olho_unico_qual': resposta('olho_unico') } } }}
      />,
    )
    const it2 = within(naTela('C.olho_unico_preceptor'))
    expect(it2.getByText(/Obrigatório: "Olho único ou ambliopia: qual" \(D-7: checklist da concierge\) é Olho único/)).toBeTruthy()
    expect(it2.getByRole('checkbox')).toBeTruthy()
  })

  it('item múltipla: basta uma classe marcada para exigir o registro daquela classe', () => {
    const d2 = modelo('d2', [
      item('D2.mudanca_classes', 'multipla', 'Quais classes mudaram', {
        opcoes: [
          { valor: 'glp1', rotulo: 'GLP-1' },
          { valor: 'outra', rotulo: 'Outro remédio (descrever na observação)' },
        ],
      }),
      item('D2.med.glp1', 'medicamento', 'GLP-1: registro atualizado', { obrigatorio: false, exigidoQuando: { itemId: 'D2.mudanca_classes', valores: ['glp1'] }, camposMedicamento: ['glp1'] }),
    ])
    render(<RenderizadorChecklist modelo={d2} papeisAtor={['concierge']} aoSalvar={vi.fn()} />)
    expect(within(naTela('D2.med.glp1')).getByRole('button', { name: /Responder mesmo assim/ })).toBeTruthy()
    fireEvent.click(within(naTela('D2.mudanca_classes')).getByLabelText('GLP-1'))
    const med = within(naTela('D2.med.glp1'))
    expect(med.getByText(/Obrigatório: "Quais classes mudaram" é GLP-1/)).toBeTruthy()
    // camposMedicamento: campos do GLP-1 aparecem no registro atualizado.
    fireEvent.click(med.getByLabelText('Usa'))
    expect(med.getByText('Data da última aplicação')).toBeTruthy()
  })
})

describe('identificação ativa: opção "acompanhante" só com demência no D-7', () => {
  const adm = modelo('admissao', [
    item('A.identificacao', 'opcao', 'Documento com foto conferido; paciente diz nome completo e data de nascimento', {
      exigeSim: true,
      opcoes: [
        { valor: 'sim', rotulo: 'Sim' },
        { valor: 'acompanhante', rotulo: 'Déficit cognitivo: confirmado com o acompanhante' },
        { valor: 'nao', rotulo: 'Não' },
      ],
    }),
  ])
  it('sem demência registrada, a opção não aparece', () => {
    render(<RenderizadorChecklist modelo={adm} papeisAtor={['enfermagem']} aoSalvar={vi.fn()} contexto={{ respostasPorModelo: { d7: { 'C.demencia': resposta('nao') } } }} />)
    expect(screen.queryByLabelText(/confirmado com o acompanhante/)).toBeNull()
    expect(screen.getByText('Conferência: o bloco não é concluído com a resposta "Não".')).toBeTruthy()
  })
  it('com demência = sim no D-7, a opção aparece', () => {
    render(<RenderizadorChecklist modelo={adm} papeisAtor={['enfermagem']} aoSalvar={vi.fn()} contexto={{ respostasPorModelo: { d7: { 'C.demencia': resposta('sim') } } }} />)
    expect(screen.getByLabelText(/confirmado com o acompanhante/)).toBeTruthy()
  })
})

describe('observação obrigatória', () => {
  it('opção que pede observação ("nenhum disponível") só registra com a observação', async () => {
    const m = modelo('d7', [
      item('E.acompanhante_reserva_situacao', 'opcao', 'Acompanhante reserva', {
        opcoes: [
          { valor: 'registrado', rotulo: 'Registrado' },
          { valor: 'nenhum', rotulo: 'Nenhum disponível (explicar na observação)' },
        ],
      }),
    ])
    const aoSalvar = vi.fn().mockResolvedValue(true)
    render(<RenderizadorChecklist modelo={m} papeisAtor={['concierge']} aoSalvar={aoSalvar} />)
    fireEvent.click(screen.getByLabelText('Nenhum disponível (explicar na observação)'))
    const botao = screen.getByRole('button', { name: 'Registrar seção Seção' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(screen.getAllByText(/descreva na observação/).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText(/^Observação/), { target: { value: 'Filha única mora em outra cidade.' } })
    expect(botao.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(botao)
    })
    expect(aoSalvar).toHaveBeenCalledWith([{ itemId: 'E.acompanhante_reserva_situacao', valor: 'nenhum', observacao: 'Filha única mora em outra cidade.' }])
  })

  it('corrigir item crítico do D-7 já concluído exige o motivo na observação', () => {
    const m = modelo('d7', [item('A.olho_paciente', 'olho', 'Olho dito pelo paciente', { permiteNaoSabe: true })])
    render(
      <RenderizadorChecklist
        modelo={m}
        papeisAtor={['concierge']}
        respostas={{ 'A.olho_paciente': resposta('OD') }}
        aoSalvar={vi.fn()}
        contexto={{ blocosConcluidos: ['d7'] }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'OLHO ESQUERDO' }))
    expect(screen.getAllByText(/Correção de item crítico depois do D-7 concluído/).length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Registrar seção Seção' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
