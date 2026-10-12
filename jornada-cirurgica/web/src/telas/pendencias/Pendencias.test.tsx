// @vitest-environment jsdom
// Pendências: filtros por data e papel, agrupamento por episódio, severidade com texto, desde quando e link para o local.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcoesEquipe } from '@contrato'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  chamarPaciente: vi.fn(),
}))

import { chamar } from '../../api/cliente.ts'
import { abaDoLocal } from './locais.ts'
import Pendencias from './Pendencias.tsx'

const mockChamar = vi.mocked(chamar)
type Item = AcoesEquipe['pendencias.listar']['S'][number]

const agora = Date.now()
const ha = (horas: number) => new Date(agora - horas * 3600_000).toISOString()

const LISTA: Item[] = [
  { id: 'p1', episodioId: 'ep-a', codigo: 'TCLE', descricao: 'TCLE não assinado', responsavel: ['concierge'], desde: ha(50), severidade: 'pendencia', local: 'tcle', pacienteNome: 'Paciente Teste Alfa', olhoExtenso: 'OLHO DIREITO' },
  { id: 'p2', episodioId: 'ep-b', codigo: 'HS1', descricao: 'Lente em quarentena', responsavel: ['cirurgiao'], desde: ha(3), severidade: 'hard_stop', local: 'lente.cp2', pacienteNome: 'Paciente Teste Beta', olhoExtenso: 'OLHO ESQUERDO' },
  { id: 'p3', episodioId: 'ep-a', codigo: 'ALERTA', descricao: 'Alerta sem conduta escrita', responsavel: ['cirurgiao'], desde: ha(26), severidade: 'alerta', local: 'd7.B', pacienteNome: 'Paciente Teste Alfa', olhoExtenso: 'OLHO DIREITO', prazo: ha(1) },
]

function renderizar(caminho = '/pendencias') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/pendencias" element={<Pendencias />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockChamar.mockReset()
  mockChamar.mockResolvedValue(LISTA as never)
})

describe('Pendencias', () => {
  it('agrupa por episódio, hard stop primeiro, severidade com texto, desde quando e link para o local', async () => {
    renderizar()
    await screen.findByRole('heading', { name: /Paciente Teste Beta/ })
    expect(mockChamar).toHaveBeenCalledWith('pendencias.listar', { data: null, papel: null })

    const titulos = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titulos).toEqual(['Paciente Teste Beta · OLHO ESQUERDO', 'Paciente Teste Alfa · OLHO DIREITO'])

    const grupoAlfa = screen.getByRole('region', { name: /Paciente Teste Alfa/ })
    const itens = within(grupoAlfa).getAllByRole('listitem')
    // Dentro do episódio: alerta antes da pendência simples.
    expect(within(itens[0]).getByText('ALERTA')).toBeTruthy()
    expect(within(itens[0]).getByText('Alerta sem conduta escrita')).toBeTruthy()
    expect(within(itens[0]).getByText(/Responsável: Cirurgião/)).toBeTruthy()
    expect(within(itens[0]).getByText(/Desde: há 1 dia/)).toBeTruthy()
    expect(within(itens[0]).getByText('(vencido)')).toBeTruthy()
    expect(within(itens[1]).getByText('Pendência')).toBeTruthy()
    expect(within(itens[1]).getByText(/Desde: há 2 dias/)).toBeTruthy()

    const grupoBeta = screen.getByRole('region', { name: /Paciente Teste Beta/ })
    expect(within(grupoBeta).getByText('HARD STOP')).toBeTruthy()
    expect(within(grupoBeta).getByRole('link', { name: 'Ir para o local: Lente em quarentena' }).getAttribute('href')).toBe('/episodio/ep-b?aba=lente')
    expect(within(grupoAlfa).getByRole('link', { name: 'Ir para o local: TCLE não assinado' }).getAttribute('href')).toBe('/episodio/ep-a?aba=d2')
    expect(within(grupoAlfa).getByRole('link', { name: 'Abrir episódio' }).getAttribute('href')).toBe('/episodio/ep-a')

    expect(screen.getByLabelText('Resumo').textContent).toMatch(/3pendências.*2episódios.*1hard stop.*1alerta/)
  })

  it('filtra por data e papel', async () => {
    renderizar('/pendencias?data=2026-10-20')
    await screen.findByRole('heading', { name: /Paciente Teste Beta/ })
    expect(mockChamar).toHaveBeenLastCalledWith('pendencias.listar', { data: '2026-10-20', papel: null })
    fireEvent.change(screen.getByLabelText('Papel responsável'), { target: { value: 'cirurgiao' } })
    await waitFor(() => expect(mockChamar).toHaveBeenLastCalledWith('pendencias.listar', { data: '2026-10-20', papel: 'cirurgiao' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(mockChamar).toHaveBeenLastCalledWith('pendencias.listar', { data: null, papel: null }))
  })

  it('lista vazia e erro', async () => {
    mockChamar.mockResolvedValueOnce([] as never)
    const { unmount } = renderizar()
    expect(await screen.findByText('Nada pendente com estes filtros.')).toBeTruthy()
    unmount()
    mockChamar.mockRejectedValueOnce({ erro: { codigo: 'indisponivel', mensagem: 'x' } })
    renderizar()
    expect(await screen.findByText(/Servidor indisponível/)).toBeTruthy()
  })

  it('local da pendência vira aba do episódio', () => {
    expect(abaDoLocal('d7.B')).toBe('d7')
    expect(abaDoLocal('lente.cp2')).toBe('lente')
    expect(abaDoLocal('cp1')).toBe('lente')
    expect(abaDoLocal('tcle')).toBe('d2')
    expect(abaDoLocal('time_out')).toBe('d0')
    expect(abaDoLocal('alertas')).toBeUndefined()
    expect(abaDoLocal(undefined)).toBeUndefined()
  })
})
