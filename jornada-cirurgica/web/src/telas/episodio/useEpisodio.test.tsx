// @vitest-environment jsdom
// A visão do episódio é filtrada pelo papel de quem marca: trocar o ator por PIN descarta a visão e recarrega.
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { definirAtor } from '../../api/ator.ts'
import { chamar } from '../../api/cliente.ts'
import { ProvedorNotificacoes } from '../../app/notificacoes.tsx'
import { visaoFicticia } from '../../componentes/teste/fixtures.ts'
import { useEpisodio } from './useEpisodio.ts'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  ErroChamada: class extends Error {},
}))

function Sonda() {
  const ctl = useEpisodio('ep-teste-1')
  return <p>{ctl.carregando ? 'carregando' : ctl.visao ? `versao ${ctl.visao.episodio.versao}` : 'sem visão'}</p>
}

describe('useEpisodio', () => {
  afterEach(() => {
    definirAtor(null)
    vi.mocked(chamar).mockReset()
  })

  it('recarrega a visão quando muda quem marca (PIN)', async () => {
    vi.mocked(chamar)
      .mockResolvedValueOnce(visaoFicticia() as never)
      .mockResolvedValueOnce(visaoFicticia({ episodio: { ...visaoFicticia().episodio, versao: 8 } }) as never)
    render(
      <MemoryRouter>
        <ProvedorNotificacoes>
          <Sonda />
        </ProvedorNotificacoes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('versao 7')).toBeTruthy()
    await act(async () => {
      definirAtor({ token: 't', expiraEm: new Date(Date.now() + 600_000).toISOString(), id: 'u2', nome: 'Pessoa Fictícia', papeis: ['conferente'] })
    })
    expect(await screen.findByText('versao 8')).toBeTruthy()
    expect(vi.mocked(chamar)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chamar).mock.calls.every(c => c[0] === 'episodio.obter')).toBe(true)
  })
})
