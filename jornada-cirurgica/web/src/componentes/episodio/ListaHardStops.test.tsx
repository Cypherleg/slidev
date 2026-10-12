// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HardStop } from '@dominio/tipos.ts'
import { ListaHardStops } from './ListaHardStops.tsx'

const hs: HardStop = {
  codigo: 'HS6_SEM_CONDUTA_ALFA_ANTICOAG',
  titulo: 'Alerta de α-bloqueador sem conduta escrita',
  descricao: 'Há alerta de α-bloqueador sem conduta escrita do cirurgião.',
  bloqueia: ['concluir:sign_in'],
  resolvivelPor: ['cirurgiao'],
  exigeResolucaoEscrita: true,
  comoResolver: 'O cirurgião escreve a conduta no painel.',
  abertoDesde: '2026-10-12T10:00:00Z',
  fonte: 'POP §13.7 item 6',
}

describe('ListaHardStops', () => {
  it('mostra como resolver e quem resolve; quem não tem competência não vê o formulário', () => {
    render(<ListaHardStops hardStops={[hs]} papeisAtor={['circulante']} aoResolver={vi.fn()} />)
    expect(screen.getByText('O cirurgião escreve a conduta no painel.')).toBeTruthy()
    expect(screen.getAllByText(/Cirurgião/).length).toBeGreaterThan(0)
    expect(screen.getByText(/concluir Sign In/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Registrar resolução/ })).toBeNull()
    expect(screen.getByText(/Aguardando resolução escrita de: Cirurgião/)).toBeTruthy()
    // Nenhum atalho para seguir sem resolver.
    expect(screen.queryByRole('button', { name: /prosseguir|assim mesmo|ignorar/i })).toBeNull()
  })

  it('o cirurgião registra a resolução escrita', async () => {
    const aoResolver = vi.fn().mockResolvedValue(true)
    render(<ListaHardStops hardStops={[hs]} papeisAtor={['cirurgiao']} aoResolver={aoResolver} />)
    const botao = screen.getByRole('button', { name: 'Registrar resolução' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Resolução escrita/), { target: { value: 'Mantém tansulosina; materiais de íris na sala.' } })
    await act(async () => {
      fireEvent.click(botao)
    })
    expect(aoResolver).toHaveBeenCalledWith('HS6_SEM_CONDUTA_ALFA_ANTICOAG', 'Mantém tansulosina; materiais de íris na sala.')
  })

  it('respeita a permissão calculada pelo servidor para o código', () => {
    render(<ListaHardStops hardStops={[hs]} papeisAtor={['cirurgiao']} permissaoPara={() => ({ permitido: false, motivo: 'Cirurgião de outro episódio.' })} aoResolver={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Registrar resolução' })).toBeNull()
    expect(screen.getByText(/Cirurgião de outro episódio/)).toBeTruthy()
  })
})
