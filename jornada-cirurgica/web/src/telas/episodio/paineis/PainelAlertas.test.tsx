// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Alerta, EpisodioVisao, Papel } from '@dominio/tipos.ts'
import { ProvedorNotificacoes } from '../../../app/notificacoes.tsx'
import { visaoFicticia } from '../../../componentes/teste/fixtures.ts'
import { VerbalizacaoTimeOut } from '../../dia/Sala.tsx'
import type { ControleEpisodio } from '../useEpisodio.ts'
import { PainelAlertas } from './PainelAlertas.tsx'

vi.mock('../../../api/cliente.ts', () => ({
  chamar: vi.fn().mockResolvedValue([]),
  ErroChamada: class extends Error {},
}))

const base: Omit<Alerta, 'id' | 'titulo'> = {
  origem: { modelo: 'd7', itemId: 'B.alfa_bloqueador' },
  descricao: 'Descrição fictícia.',
  nivel: 'alerta',
  geradoEm: '2026-10-12T12:00:00Z',
}
const comunicado = { por: 'u1', porNome: 'Concierge Fictícia', em: '2026-10-12T12:10:00Z', via: 'telefone' as const, cirurgiaoId: 'cir-teste' }
const conduta = { texto: 'Conduta fictícia antiga.', cirurgiaoId: 'cir-teste', cirurgiaoNome: 'Dr. Cirurgião Fictício', em: '2026-10-12T12:20:00Z' }

function renderizar(alertas: Alerta[], papeis: Papel[]) {
  const visao: EpisodioVisao = visaoFicticia({ alertas })
  const ctl = { visao, carregando: false, erroCarga: null, ocupado: null, recarregar: vi.fn(), executar: vi.fn(), executarERecarregar: vi.fn() } as unknown as ControleEpisodio
  render(
    <MemoryRouter>
      <ProvedorNotificacoes>
        <PainelAlertas ctl={ctl} visao={visao} papeis={papeis} />
      </ProvedorNotificacoes>
    </MemoryRouter>,
  )
}

const artigo = (titulo: RegExp) => screen.getByRole('article', { name: titulo })

describe('PainelAlertas', () => {
  it('alerta que mudou depois da comunicação: comunicação anterior não vale e o botão de comunicar volta', () => {
    renderizar([{ ...base, id: 'a1', titulo: 'Alerta Um', comunicado, comunicacaoPendente: true, atualizadoEm: '2026-10-12T13:00:00Z' }], ['concierge'])
    const a = within(artigo(/Alerta Um/))
    expect(a.getByText('Comunicação anterior não vale mais')).toBeTruthy()
    expect(a.getByText('Comunicar de novo ao cirurgião')).toBeTruthy()
    expect(a.getByRole('button', { name: 'Registrar que o cirurgião foi avisado' })).toBeTruthy()
    expect(a.getByText(/alterado em 12\/10\/2026 10:00/)).toBeTruthy()
  })

  it('alerta desativado por correção, ainda sem comunicação: continua na lista com o botão de comunicar', () => {
    renderizar([{ ...base, id: 'a2', titulo: 'Alerta Dois', inativo: true, comunicacaoPendente: true }], ['concierge'])
    const a = within(artigo(/Alerta Dois/))
    expect(a.getByText('Deixou de valer (resposta corrigida)')).toBeTruthy()
    expect(a.getByRole('button', { name: 'Registrar que o cirurgião foi avisado' })).toBeTruthy()
  })

  it('alerta desativado e já comunicado vai para a lista recolhida', () => {
    renderizar([{ ...base, id: 'a3', titulo: 'Alerta Três', inativo: true, comunicado, comunicacaoPendente: false }], ['concierge'])
    expect(screen.queryByRole('article', { name: /Alerta Três/ })).toBeNull()
    expect(screen.getByText(/deixaram de valer \(resposta corrigida\) e já comunicados: 1/)).toBeTruthy()
  })

  it('conduta desatualizada: marcada como sem valor e o cirurgião escreve nova conduta', () => {
    renderizar([{ ...base, id: 'a4', titulo: 'Alerta Quatro', comunicado, comunicacaoPendente: false, conduta, condutaDesatualizada: true }], ['cirurgiao'])
    const a = within(artigo(/Alerta Quatro/))
    expect(a.getByText(/Conduta DESATUALIZADA/)).toBeTruthy()
    expect(a.getByLabelText('Nova conduta escrita (cirurgião)')).toBeTruthy()
    expect(screen.getByText('1 alerta sem conduta válida')).toBeTruthy()
  })
})

describe('VerbalizacaoTimeOut', () => {
  it('mostra alergias (inclusive a nova da admissão), α-bloqueador e anticoagulação para todo paciente', () => {
    const v = visaoFicticia({ verbalizacaoTimeOut: { alergias: ['Látex: urticária', 'Nova na admissão: dipirona'], alfaBloqueador: 'Usa tansulosina', anticoagulacao: 'Nega' } })
    render(<VerbalizacaoTimeOut visao={v} />)
    expect(screen.getByText(/TODO paciente/)).toBeTruthy()
    expect(screen.getByText('Látex: urticária; Nova na admissão: dipirona')).toBeTruthy()
    expect(screen.getByText('Usa tansulosina')).toBeTruthy()
    expect(screen.getByText('Nega')).toBeTruthy()
  })
  it('sem alergias registradas, diz isso por extenso', () => {
    render(<VerbalizacaoTimeOut visao={visaoFicticia({ verbalizacaoTimeOut: { alergias: [], alfaBloqueador: 'Nega', anticoagulacao: 'Nega' } })} />)
    expect(screen.getByText('Nenhuma alergia registrada')).toBeTruthy()
  })
})
