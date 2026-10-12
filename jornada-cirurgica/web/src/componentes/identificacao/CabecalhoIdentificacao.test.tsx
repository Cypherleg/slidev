// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { visaoFicticia } from '../teste/fixtures.ts'
import { CabecalhoIdentificacao } from './CabecalhoIdentificacao.tsx'

describe('CabecalhoIdentificacao', () => {
  it('mostra os dois identificadores e o olho por extenso, nunca a sigla', () => {
    render(<CabecalhoIdentificacao visao={visaoFicticia()} />)
    expect(screen.getByTestId('nome-completo').textContent).toBe('Paciente Teste Alfa da Silva')
    expect(screen.getByTestId('nascimento').textContent).toContain('15/03/1950')
    expect(screen.getByTestId('nascimento').textContent).toContain('76 anos')
    expect(screen.getByText('PRT-0001')).toBeTruthy()
    const olho = screen.getByText('OLHO ESQUERDO')
    expect(olho.className).toContain('olho-destaque')
    expect(screen.queryByText(/^OE$/)).toBeNull()
    expect(screen.queryByText('OLHO DIREITO')).toBeNull()
  })

  it('dots sempre com letra (cor nunca sozinha) e nome acessível', () => {
    render(<CabecalhoIdentificacao visao={visaoFicticia()} />)
    const lista = screen.getByRole('list', { name: 'Dots da pulseira' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map(i => i.textContent)).toEqual(['A', 'I'])
    expect(screen.getByLabelText('A: Alergia')).toBeTruthy()
    expect(screen.getByLabelText('I: IFIS')).toBeTruthy()
  })

  it('na sala: olho enorme, legenda dos dots e lembrete de verbalizar para todo paciente', () => {
    render(<CabecalhoIdentificacao visao={visaoFicticia({ dots: [] })} variante="sala" />)
    expect(screen.getByText('OLHO ESQUERDO').className).toContain('enorme')
    expect(screen.getAllByText(/Ausência de dot não significa ausência de risco/).length).toBe(2)
    expect(screen.getByText(/Verbalizar alergias, α-bloqueador e anticoagulação para TODO paciente/)).toBeTruthy()
  })

  it('sala com dots: legenda escrita ao lado da letra', () => {
    render(<CabecalhoIdentificacao visao={visaoFicticia()} variante="sala" />)
    expect(screen.getByText('Alergia')).toBeTruthy()
    expect(screen.getByText('IFIS')).toBeTruthy()
  })

  it('alertas por extenso, homônimo, nome parecido, exige nome da mãe e não conferido no Datasigh', () => {
    const v = visaoFicticia({
      identificacao: {
        homonimoNoDia: true,
        nomesParecidos: [{ episodioId: 'ep-2', nomeCompleto: 'Paciente Teste Alva da Silva' }],
        exigeNomeMae: true,
        segundoOlho: { primeiroEpisodioId: 'ep-0', dataPrimeiro: '2026-09-01' },
        alertasExtenso: ['OLHO ÚNICO', '2º OLHO — 1º operado em 01/09/2026'],
      },
    })
    v.paciente = { ...v.paciente, conferidoDatasigh: false }
    render(<CabecalhoIdentificacao visao={v} />)
    expect(screen.getByText('OLHO ÚNICO')).toBeTruthy()
    expect(screen.getByText('2º OLHO — 1º operado em 01/09/2026')).toBeTruthy()
    expect(screen.getByText('HOMÔNIMO NO DIA')).toBeTruthy()
    expect(screen.getByText(/NOME PARECIDO NO DIA: Paciente Teste Alva da Silva/)).toBeTruthy()
    expect(screen.getByText(/EXIGE NOME DA MÃE \(3º IDENTIFICADOR\): NÃO REGISTRADO/)).toBeTruthy()
    expect(screen.getByText('NÃO CONFERIDO NO DATASIGH')).toBeTruthy()
  })

  it('com o nome da mãe registrado, mostra o 3º identificador e pede a conferência', () => {
    const v = visaoFicticia({ identificacao: { homonimoNoDia: true, nomesParecidos: [], exigeNomeMae: true, segundoOlho: null, alertasExtenso: [] } })
    v.paciente = { ...v.paciente, nomeMae: 'Mãe Fictícia da Silva' }
    render(<CabecalhoIdentificacao visao={v} />)
    expect(screen.getByText('Mãe Fictícia da Silva')).toBeTruthy()
    expect(screen.getByText('CONFERIR NOME DA MÃE (3º IDENTIFICADOR)')).toBeTruthy()
  })

  describe('faixa fixa ao rolar', () => {
    afterEach(() => vi.unstubAllGlobals())
    it('quando o cabeçalho sai da tela, a faixa mostra nome, nascimento, prontuário, OLHO, dots e alertas', () => {
      class ObservadorFora {
        constructor(private cb: (e: { isIntersecting: boolean; boundingClientRect: { top: number } }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: false, boundingClientRect: { top: -400 } }])
        }
        disconnect() {}
      }
      vi.stubGlobal('IntersectionObserver', ObservadorFora)
      const v = visaoFicticia({ identificacao: { homonimoNoDia: false, nomesParecidos: [], exigeNomeMae: false, segundoOlho: null, alertasExtenso: ['OLHO ÚNICO'] } })
      render(<CabecalhoIdentificacao visao={v} />)
      const faixa = screen.getByTestId('faixa-identificacao')
      expect(faixa.textContent).toContain('Paciente Teste Alfa da Silva')
      expect(faixa.textContent).toContain('15/03/1950')
      expect(faixa.textContent).toContain('PRT-0001')
      expect(faixa.textContent).toContain('OLHO ESQUERDO')
      expect(faixa.textContent).toContain('OLHO ÚNICO')
      expect(within(faixa).getByText('A')).toBeTruthy()
    })
    it('sem rolagem não há faixa', () => {
      render(<CabecalhoIdentificacao visao={visaoFicticia()} />)
      expect(screen.queryByTestId('faixa-identificacao')).toBeNull()
    })
  })
})
