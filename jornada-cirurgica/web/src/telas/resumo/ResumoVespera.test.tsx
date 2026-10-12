// @vitest-environment jsdom
// Resumo da véspera: episódios do dia, alertas sem conduta, lentes não conferidas e termos não assinados, com link para cada episódio.

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcoesEquipe } from '@contrato'
import type { EpisodioResumoDia } from '@dominio/tipos.ts'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  chamarPaciente: vi.fn(),
}))

import { chamar } from '../../api/cliente.ts'
import ResumoVespera from './ResumoVespera.tsx'

const mockChamar = vi.mocked(chamar)

function ep(id: string, ordem: number, nome: string, extra: Partial<EpisodioResumoDia> = {}): EpisodioResumoDia {
  return {
    episodioId: id,
    ordem,
    horario: `0${7 + ordem}:00`,
    pacienteNome: nome,
    dataNascimento: '1950-01-31',
    olho: 'OD',
    olhoExtenso: 'OLHO DIREITO',
    cirurgiaoNome: 'Cirurgião Teste',
    estado: 'd2_concluido',
    dots: [],
    alertasExtenso: [],
    hardStopsAbertos: 0,
    pendencias: 0,
    alertasSemConduta: 0,
    homonimoOuParecido: false,
    etapaLente: 'cp2_confere',
    avisosSuspensos: false,
    ...extra,
  }
}

const RESUMO: AcoesEquipe['resumo.vespera']['S'] = {
  data: '2026-10-21',
  episodios: [
    ep('ep-2', 2, 'Paciente Teste Beta', { olho: 'OE', olhoExtenso: 'OLHO ESQUERDO', etapaLente: 'quarentena', hardStopsAbertos: 1, pendencias: 2, alertasSemConduta: 1, homonimoOuParecido: true, dots: [{ letra: 'S', cor: 'laranja', rotulo: 'Sangramento', motivo: 'anticoagulante' }] }),
    ep('ep-1', 1, 'Paciente Teste Alfa', { alertasExtenso: ['OLHO ÚNICO'] }),
  ],
  alertasSemConduta: [{ episodioId: 'ep-2', paciente: 'Paciente Teste Beta', alerta: 'Anticoagulante em uso' }],
  lentesNaoConferidas: [{ episodioId: 'ep-2', paciente: 'Paciente Teste Beta', etapa: 'quarentena' }],
  termosNaoAssinados: [],
}

function renderizar(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/vespera/:data" element={<ResumoVespera />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockChamar.mockReset()
})

describe('ResumoVespera', () => {
  it('mostra as quatro listas com links para os episódios', async () => {
    mockChamar.mockResolvedValue(RESUMO as never)
    renderizar('/vespera/2026-10-21')
    await screen.findByRole('heading', { name: /Alertas sem conduta/ })
    expect(mockChamar).toHaveBeenCalledWith('resumo.vespera', { data: '2026-10-21' })
    expect(screen.getByText(/quarta-feira, 21\/10\/2026/)).toBeTruthy()

    const alertas = screen.getByRole('region', { name: /Alertas sem conduta/ })
    expect(within(alertas).getByText('Anticoagulante em uso')).toBeTruthy()
    expect(within(alertas).getByText('OLHO ESQUERDO')).toBeTruthy()
    expect(within(alertas).getByRole('link').getAttribute('href')).toBe('/episodio/ep-2')

    const lentes = screen.getByRole('region', { name: /Lentes não conferidas/ })
    expect(within(lentes).getByText('QUARENTENA')).toBeTruthy()
    expect(within(lentes).getByRole('link').getAttribute('href')).toBe('/episodio/ep-2?aba=lente')

    const termos = screen.getByRole('region', { name: /Termos não assinados/ })
    expect(within(termos).getByText('Todos os termos do dia estão assinados.')).toBeTruthy()

    const tabela = screen.getByRole('table')
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(within(linhas[0]).getByText('Paciente Teste Alfa')).toBeTruthy()
    expect(within(linhas[0]).getByText('OLHO ÚNICO')).toBeTruthy()
    expect(within(linhas[1]).getByText('HOMÔNIMO OU NOME PARECIDO')).toBeTruthy()
    expect(within(linhas[1]).getByText('1 HARD STOP')).toBeTruthy()
    expect(within(linhas[1]).getByLabelText('S: Sangramento')).toBeTruthy()
    expect(within(linhas[1]).getByRole('link', { name: 'Abrir episódio' }).getAttribute('href')).toBe('/episodio/ep-2')
  })

  it('data inválida não chama a API', async () => {
    renderizar('/vespera/amanha')
    expect(await screen.findByText(/Data inválida/)).toBeTruthy()
    expect(mockChamar).not.toHaveBeenCalled()
  })
})
