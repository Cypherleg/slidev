// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ItemModelo, ModeloChecklist, RespostaAtual } from '@dominio/tipos.ts'
import { RenderizadorChecklist } from './RenderizadorChecklist.tsx'

const item = (id: string, tipo: ItemModelo['tipo'], texto: string, extra: Partial<ItemModelo> = {}): ItemModelo => ({
  id,
  texto,
  tipo,
  obrigatorio: true,
  papeis: ['concierge'],
  fonte: 'teste',
  ...extra,
})

const modelo: ModeloChecklist = {
  id: 'd7',
  versao: 'teste/1',
  titulo: 'Checklist de teste',
  papeisConclusao: ['concierge'],
  fonte: 'teste',
  secoes: [
    {
      id: 'A',
      titulo: 'Tipos simples',
      itens: [
        item('A.conf', 'confirmacao', 'Documento conferido'),
        item('A.sn', 'sim_nao', 'Consegue deitar reto?'),
        item('A.op', 'opcao', 'Tipo de LIO', {
          opcoes: [
            { valor: 'monofocal', rotulo: 'Monofocal' },
            { valor: 'torica', rotulo: 'Tórica' },
          ],
        }),
        item('A.mult', 'multipla', 'Patologias oculares', {
          opcoes: [
            { valor: 'glaucoma', rotulo: 'Glaucoma' },
            { valor: 'uveite', rotulo: 'Uveíte' },
          ],
        }),
        item('A.txt', 'texto', 'O que espera enxergar'),
        item('A.data', 'data', 'Data prevista'),
        item('A.hora', 'hora', 'Hora da instilação'),
        item('A.num', 'numero', 'Última glicemia'),
        item('A.olho', 'olho', 'Olho dito pelo paciente', { permiteNaoSabe: true }),
      ],
    },
    {
      id: 'B',
      titulo: 'Tipos compostos',
      itens: [
        item('B.glp1', 'medicamento', 'Análogo de GLP-1 ou tirzepatida', { ajuda: 'Regra de teste: informação do serviço.' }),
        item('B.alergia', 'alergia', 'Alergia a látex'),
        item('B.pessoa', 'pessoa', 'Acompanhante do dia', { pendente: '[decisão pendente de teste]' }),
      ],
    },
  ],
}

function itemNaTela(id: string): HTMLElement {
  const el = document.querySelector(`[data-item="${id}"]`)
  if (!el) throw new Error(`item ${id} não encontrado`)
  return el as HTMLElement
}

describe('RenderizadorChecklist', () => {
  it('coleta cada tipo de resposta simples e salva só a seção, com os valores tipados', async () => {
    const aoSalvar = vi.fn().mockResolvedValue(true)
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} aoSalvar={aoSalvar} />)

    fireEvent.click(within(itemNaTela('A.conf')).getByRole('checkbox'))
    fireEvent.click(within(itemNaTela('A.sn')).getByLabelText('Não'))
    fireEvent.click(within(itemNaTela('A.op')).getByLabelText('Tórica'))
    fireEvent.click(within(itemNaTela('A.mult')).getByLabelText('Glaucoma'))
    fireEvent.click(within(itemNaTela('A.mult')).getByLabelText('Uveíte'))
    fireEvent.change(within(itemNaTela('A.txt')).getByRole('textbox'), { target: { value: 'Ler sem óculos' } })
    fireEvent.change(itemNaTela('A.data').querySelector('input[type="date"]')!, { target: { value: '2026-10-21' } })
    fireEvent.change(itemNaTela('A.hora').querySelector('input[type="time"]')!, { target: { value: '07:30' } })
    fireEvent.change(within(itemNaTela('A.num')).getByRole('textbox'), { target: { value: '7,5' } })
    fireEvent.click(within(itemNaTela('A.olho')).getByRole('button', { name: 'NÃO SABE' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar seção Tipos simples' }))
    })
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1))
    expect(aoSalvar.mock.calls[0][0]).toEqual([
      { itemId: 'A.conf', valor: true, observacao: null },
      { itemId: 'A.sn', valor: 'nao', observacao: null },
      { itemId: 'A.op', valor: 'torica', observacao: null },
      { itemId: 'A.mult', valor: ['glaucoma', 'uveite'], observacao: null },
      { itemId: 'A.txt', valor: 'Ler sem óculos', observacao: null },
      { itemId: 'A.data', valor: '2026-10-21', observacao: null },
      { itemId: 'A.hora', valor: '07:30', observacao: null },
      { itemId: 'A.num', valor: 7.5, observacao: null },
      { itemId: 'A.olho', valor: 'nao_sabe', observacao: null },
    ])
  })

  it('olho é sempre por extenso nos botões', () => {
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} aoSalvar={vi.fn()} />)
    const olho = within(itemNaTela('A.olho'))
    expect(olho.getByRole('button', { name: 'OLHO DIREITO' })).toBeTruthy()
    expect(olho.getByRole('button', { name: 'OLHO ESQUERDO' })).toBeTruthy()
    expect(olho.queryByText(/^OD$|^OE$/)).toBeNull()
  })

  it('medicamento GLP-1 exige os campos do POP; alergia exige a reação; pessoa exige nome', async () => {
    const aoSalvar = vi.fn().mockResolvedValue(true)
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} aoSalvar={aoSalvar} />)
    const botao = () => screen.getByRole('button', { name: 'Registrar seção Tipos compostos' }) as HTMLButtonElement

    const med = within(itemNaTela('B.glp1'))
    fireEvent.click(med.getByLabelText('Usa'))
    expect(med.getByText(/nome comercial/i)).toBeTruthy()
    expect(botao().disabled).toBe(true)
    fireEvent.change(med.getByLabelText('Nomes comerciais informados'), { target: { value: 'Caneta fictícia' } })
    fireEvent.change(med.getByLabelText('Dose, horário, tipo'), { target: { value: '1 mg' } })
    fireEvent.click(med.getByLabelText('Semanal'))
    fireEvent.change(med.getByLabelText('Data da última aplicação'), { target: { value: '2026-10-10' } })
    fireEvent.click(within(med.getByRole('radiogroup', { name: /Início ou aumento/ })).getByLabelText('Sim'))
    fireEvent.click(within(med.getByRole('radiogroup', { name: /Náusea ou vômito/ })).getByLabelText('Não'))

    const ale = within(itemNaTela('B.alergia'))
    fireEvent.click(within(ale.getByRole('radiogroup', { name: 'Tem alergia?' })).getByLabelText('Sim'))
    expect(ale.getByText(/Descreva a reação \(obrigatório/)).toBeTruthy()
    expect(botao().disabled).toBe(true)
    fireEvent.change(ale.getByLabelText(/Descreva a reação/), { target: { value: 'Urticária' } })

    const pes = within(itemNaTela('B.pessoa'))
    fireEvent.change(pes.getByLabelText('Telefone'), { target: { value: '(00) 90000-0000' } })
    expect(botao().disabled).toBe(true)
    fireEvent.change(pes.getByLabelText('Nome'), { target: { value: 'Acompanhante Fictício' } })

    expect(botao().disabled).toBe(false)
    await act(async () => {
      fireEvent.click(botao())
    })
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1))
    expect(aoSalvar.mock.calls[0][0]).toEqual([
      {
        itemId: 'B.glp1',
        valor: { uso: 'usa', nomes: 'Caneta fictícia', detalhes: '1 mg', aplicacao: 'semanal', ultimaAplicacao: '2026-10-10', inicioOuAumentoUltimos3Meses: true, nauseaOuVomito: false },
        observacao: null,
      },
      { itemId: 'B.alergia', valor: { tem: true, reacao: 'Urticária' }, observacao: null },
      { itemId: 'B.pessoa', valor: { nome: 'Acompanhante Fictício', telefone: '(00) 90000-0000' }, observacao: null },
    ])
  })

  it('"não usa" e "não tem alergia" são respostas escritas, sem campos extras', async () => {
    const aoSalvar = vi.fn().mockResolvedValue(true)
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} aoSalvar={aoSalvar} secoes={['B']} />)
    fireEvent.click(within(itemNaTela('B.glp1')).getByLabelText('Não usa'))
    fireEvent.click(within(within(itemNaTela('B.alergia')).getByRole('radiogroup', { name: 'Tem alergia?' })).getByLabelText('Não'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar seção Tipos compostos' }))
    })
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1))
    expect(aoSalvar.mock.calls[0][0]).toEqual([
      { itemId: 'B.glp1', valor: { uso: 'nao' }, observacao: null },
      { itemId: 'B.alergia', valor: { tem: false }, observacao: null },
    ])
  })

  it('mostra ajuda como informação, pendência do POP, autor, hora, fora de hora e correções', () => {
    const respostas: Record<string, RespostaAtual> = {
      'A.sn': { valor: 'sim', autorId: 'u1', autorNome: 'Concierge Fictícia', registradoEm: '2026-10-12T14:05:00Z', foraDeHora: true, correcoes: 2, observacao: 'conferido por telefone' },
    }
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} respostas={respostas} aoSalvar={vi.fn()} />)
    expect(screen.getByText(/Informação do serviço/)).toBeTruthy()
    expect(screen.getByText('Regra de teste: informação do serviço.')).toBeTruthy()
    expect(within(itemNaTela('B.pessoa')).getByText('Pendência do POP')).toBeTruthy()
    const sn = within(itemNaTela('A.sn'))
    expect(sn.getByText('Concierge Fictícia')).toBeTruthy()
    expect(sn.getByText(/12\/10\/2026 11:05/)).toBeTruthy()
    expect(sn.getByText('FORA DE HORA')).toBeTruthy()
    expect(sn.getByText('2 correções')).toBeTruthy()
    expect(sn.getByText(/conferido por telefone/)).toBeTruthy()
    expect((sn.getByLabelText('Sim') as HTMLInputElement).checked).toBe(true)
  })

  it('destaca o que falta (nenhum campo em branco)', () => {
    render(
      <RenderizadorChecklist
        modelo={modelo}
        papeisAtor={['concierge']}
        bloco={{ modelo: 'd7', situacao: 'em_andamento', faltam: ['A.txt', 'B.alergia'], impedimentos: [] }}
        aoSalvar={vi.fn()}
      />,
    )
    expect(screen.getByText(/Faltam 2 itens/)).toBeTruthy()
    expect(itemNaTela('A.txt').className).toContain('falta')
    expect(within(itemNaTela('A.txt')).getByText('Falta responder')).toBeTruthy()
    expect(itemNaTela('A.sn').className).not.toContain('falta')
  })

  it('respeita papeis (quem responde) e depoisDe (ordem obrigatória)', () => {
    const m: ModeloChecklist = {
      ...modelo,
      secoes: [
        {
          id: 'S',
          titulo: 'Sign In',
          itens: [
            item('S.marca', 'confirmacao', 'Cirurgião marca a pele acima do supercílio', { papeis: ['cirurgiao'] }),
            item('S.midriatico', 'confirmacao', 'Midriático somente no olho marcado', { papeis: ['enfermagem'], depoisDe: ['S.marca'] }),
          ],
        },
      ],
    }
    render(<RenderizadorChecklist modelo={m} papeisAtor={['enfermagem']} aoSalvar={vi.fn()} modo="imediato" />)
    const marca = within(itemNaTela('S.marca'))
    expect((marca.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(marca.getByText('Só Cirurgião responde a este item.')).toBeTruthy()
    const mid = within(itemNaTela('S.midriatico'))
    expect((mid.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(mid.getByText(/Registre antes: Cirurgião marca a pele/)).toBeTruthy()
  })

  it('modo imediato: "Registrar agora" envia só aquele item (hora real)', async () => {
    const aoSalvar = vi.fn().mockResolvedValue(true)
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} aoSalvar={aoSalvar} modo="imediato" secoes={['A']} />)
    fireEvent.click(within(itemNaTela('A.conf')).getByRole('checkbox'))
    fireEvent.click(within(itemNaTela('A.sn')).getByLabelText('Sim'))
    await act(async () => {
      fireEvent.click(within(itemNaTela('A.conf')).getByRole('button', { name: /Registrar agora/ }))
    })
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1))
    expect(aoSalvar.mock.calls[0][0]).toEqual([{ itemId: 'A.conf', valor: true, observacao: null }])
  })

  it('confirmação registrada não pode ser desmarcada', () => {
    const respostas: Record<string, RespostaAtual> = {
      'A.conf': { valor: true, autorId: 'u1', autorNome: 'Fulana Fictícia', registradoEm: '2026-10-12T14:00:00Z', foraDeHora: false, correcoes: 0 },
    }
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} respostas={respostas} aoSalvar={vi.fn()} />)
    const cb = within(itemNaTela('A.conf')).getByRole('checkbox') as HTMLInputElement
    expect(cb.checked).toBe(true)
    expect(cb.disabled).toBe(true)
  })

  it('somente leitura bloqueia tudo e mostra o motivo', () => {
    render(<RenderizadorChecklist modelo={modelo} papeisAtor={['concierge']} somenteLeitura="Episódio cancelado." aoSalvar={vi.fn()} secoes={['A']} />)
    expect((within(itemNaTela('A.conf')).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getAllByText('Episódio cancelado.').length).toBeGreaterThan(0)
  })
})
