// @vitest-environment jsdom
// Conferência cega (briefing §6.3, regra 7): a tela da conferente nunca mostra valores do checkpoint 1,
// mesmo que viessem na visão; o formulário do checkpoint 2 começa vazio.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { EpisodioVisao, Papel } from '@dominio/tipos.ts'
import { ProvedorNotificacoes } from '../../app/notificacoes.tsx'
import { FormularioCego } from '../../componentes/lente/FormularioCego.tsx'
import { visaoFicticia } from '../../componentes/teste/fixtures.ts'
import { AbaLente } from './AbaLente.tsx'
import type { ControleEpisodio } from './useEpisodio.ts'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn().mockRejectedValue(new Error('não deve chamar a API neste teste')),
  ErroChamada: class extends Error {},
}))

const MODELO_SECRETO = 'MODELO-PLANO-SECRETO-X1'
const LOTE_SECRETO = 'LOTE-SECRETO-777'

function visaoComPlanoVazado(): EpisodioVisao {
  // Simula uma visão que (por erro) trouxesse o plano: a tela da conferente não pode exibi-lo.
  return visaoFicticia({
    lente: {
      ciclo: 1,
      etapa: 'chegada_conferida',
      plano: { olho: 'OE', modelo: MODELO_SECRETO, dioptria: 21.5, torica: true, cilindro: 1.5, eixo: 87, reserva: { modelo: 'RESERVA-SECRETA', dioptria: 20.5 }, alvoRefrativo: -0.25, dataPedido: '2026-10-01', registradoPor: 'Concierge Fictícia', registradoEm: '2026-10-12T13:00:00Z' },
      chegada: { dataChegada: '2026-10-14', lote: LOTE_SECRETO, validade: '2028-05', registradoPor: 'Concierge Fictícia', registradoEm: '2026-10-14T13:00:00Z' },
      fotoPlanoAnexoId: 'anexo-secreto',
    },
  })
}

function controle(visao: EpisodioVisao, executar = vi.fn().mockResolvedValue(true)): ControleEpisodio {
  return { visao, carregando: false, erroCarga: null, ocupado: null, recarregar: vi.fn(), executar, executarERecarregar: vi.fn() } as unknown as ControleEpisodio
}

function renderizar(visao: EpisodioVisao, papeis: Papel[], executar?: ReturnType<typeof vi.fn>) {
  const ctl = controle(visao, executar)
  render(
    <MemoryRouter>
      <ProvedorNotificacoes>
        <AbaLente ctl={ctl} visao={visao} papeis={papeis} />
      </ProvedorNotificacoes>
    </MemoryRouter>,
  )
  return ctl
}

describe('Checkpoint 2 cego', () => {
  it('para a conferente, não renderiza nenhum valor do plano nem da chegada', () => {
    renderizar(visaoComPlanoVazado(), ['conferente'])
    const texto = document.body.textContent ?? ''
    expect(texto).not.toContain(MODELO_SECRETO)
    expect(texto).not.toContain('RESERVA-SECRETA')
    expect(texto).not.toContain(LOTE_SECRETO)
    expect(texto).not.toContain('+21,50')
    expect(texto).not.toContain('87°')
    expect(screen.queryByAltText(/Foto do plano/)).toBeNull()
    // Nenhum campo vem preenchido.
    const form = screen.getByRole('form', { name: /Checkpoint 2: conferência independente/ })
    for (const input of within(form).getAllByRole('textbox')) expect((input as HTMLInputElement).value).toBe('')
    expect(within(form).queryAllByRole('button', { pressed: true })).toHaveLength(0)
    for (const r of within(form).getAllByRole('radio')) expect((r as HTMLInputElement).checked).toBe(false)
  })

  it('a concierge vê o plano que o servidor enviou (e não vê o formulário cego)', async () => {
    renderizar(visaoComPlanoVazado(), ['concierge'])
    expect(screen.getByText(MODELO_SECRETO)).toBeTruthy()
    expect(screen.getAllByText('+21,50 D').length).toBeGreaterThan(0)
    expect(screen.queryByRole('form', { name: /Checkpoint 2: conferência independente/ })).toBeNull()
    // A foto do plano é pedida ao servidor (aqui, simulado indisponível).
    expect(await screen.findByText('Não foi possível abrir a foto do plano.')).toBeTruthy()
  })

  it('a conferente digita olho, modelo, dioptria com sinal, tórica, cilindro e eixo; envia lente.cp2', async () => {
    const executar = vi.fn().mockResolvedValue(true)
    renderizar(visaoComPlanoVazado(), ['conferente'], executar)
    const form = within(screen.getByRole('form', { name: /Checkpoint 2: conferência independente/ }))
    fireEvent.click(form.getByRole('button', { name: 'OLHO ESQUERDO' }))
    fireEvent.change(form.getByLabelText('Modelo da LIO'), { target: { value: 'Modelo Digitado B' } })
    fireEvent.click(form.getByRole('button', { name: 'Dioptria: sinal positivo' }))
    fireEvent.change(form.getByLabelText('Dioptria: valor sem sinal'), { target: { value: '21,5' } })
    expect(form.getByText('+21,50 D')).toBeTruthy()
    fireEvent.click(within(form.getByRole('radiogroup', { name: 'Lente tórica?' })).getByLabelText('Sim'))
    fireEvent.click(form.getByRole('button', { name: 'Cilindro: sinal positivo' }))
    fireEvent.change(form.getByLabelText('Cilindro: valor sem sinal'), { target: { value: '1,50' } })
    fireEvent.change(form.getByLabelText('Eixo (graus)'), { target: { value: '87' } })
    await act(async () => {
      fireEvent.click(form.getByRole('button', { name: 'Registrar checkpoint 2' }))
    })
    expect(executar).toHaveBeenCalledWith(
      'lente.cp2',
      { valores: { olho: 'OE', modelo: 'Modelo Digitado B', dioptria: 21.5, torica: true, cilindro: 1.5, eixo: 87 } },
      expect.any(String),
    )
  })
})

describe('FormularioCego', () => {
  it('exige sinal explícito e não envia com campos faltando', async () => {
    const aoEnviar = vi.fn().mockResolvedValue(true)
    render(<FormularioCego aoEnviar={aoEnviar} />)
    fireEvent.click(screen.getByRole('button', { name: 'OLHO DIREITO' }))
    fireEvent.change(screen.getByLabelText('Modelo da LIO'), { target: { value: 'Modelo C' } })
    fireEvent.change(screen.getByLabelText('Dioptria: valor sem sinal'), { target: { value: '19,00' } })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Lente tórica?' })).getByLabelText('Não'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar checkpoint 2' }))
    })
    expect(aoEnviar).not.toHaveBeenCalled()
    expect(screen.getByText('Escolha o sinal (+ ou −).')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dioptria: sinal negativo' }))
    expect(screen.getByText('-19,00 D')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar checkpoint 2' }))
    })
    expect(aoEnviar).toHaveBeenCalledWith({ olho: 'OD', modelo: 'Modelo C', dioptria: -19, torica: false, cilindro: null, eixo: null })
    // Depois de registrar, o formulário volta vazio.
    expect((screen.getByLabelText('Modelo da LIO') as HTMLInputElement).value).toBe('')
  })
})
