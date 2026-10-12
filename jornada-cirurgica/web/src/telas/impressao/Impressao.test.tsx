// @vitest-environment jsdom
// Impressão: checklist em branco com todos os itens do modelo; registro preenchido do episódio. Dados fictícios.

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  chamarPaciente: vi.fn(),
}))

// Versão padrão embutida (contingência): substitui o stub do domínio por um modelo fictício.
vi.mock('@dominio/index.ts', async importOriginal => {
  const original = await importOriginal<typeof import('@dominio/index.ts')>()
  const { modeloFicticio } = await import('./ficticios.ts')
  const { ORDEM_MODELOS } = await import('@dominio/tipos.ts')
  return { ...original, modelosPadrao: () => Object.fromEntries(ORDEM_MODELOS.map(id => [id, modeloFicticio(id, 'embutida/1')])) }
})

import { chamar } from '../../api/cliente.ts'
import { episodioFicticio, modeloFicticio } from './ficticios.ts'
import ImpressaoBranco from './ImpressaoBranco.tsx'
import ImpressaoEpisodio from './ImpressaoEpisodio.tsx'
import { formatarResposta } from './resposta.ts'

const mockChamar = vi.mocked(chamar)

function renderizar(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/impressao/branco/:modelo" element={<ImpressaoBranco />} />
        <Route path="/impressao/episodio/:id" element={<ImpressaoEpisodio />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockChamar.mockReset()
})

describe('ImpressaoBranco', () => {
  it('renderiza todos os itens do modelo, com caixas, cabeçalho em branco e assinaturas', async () => {
    const modelo = modeloFicticio('time_out', 'teste/3')
    mockChamar.mockResolvedValue(modelo as never)
    renderizar('/impressao/branco/time_out?versao=teste/3')

    await screen.findByRole('heading', { level: 1, name: modelo.titulo })
    expect(mockChamar).toHaveBeenCalledWith('modelos.obter', { id: 'time_out', versao: 'teste/3' })

    const itens = modelo.secoes.flatMap(s => s.itens)
    const linhas = document.querySelectorAll('tr[data-item]')
    expect(linhas).toHaveLength(itens.length)
    for (const item of itens) {
      const linha = document.querySelector(`tr[data-item="${item.id}"]`) as HTMLElement
      expect(linha).toBeTruthy()
      expect(within(linha).getByText(item.texto)).toBeTruthy()
      // Cada item tem área de registro (caixa ou linha para escrever).
      expect(linha.querySelectorAll('.imp-caixa, .imp-linha, .imp-data').length).toBeGreaterThan(0)
    }
    for (const s of modelo.secoes) expect(screen.getByText(`${s.id}. ${s.titulo}`)).toBeTruthy()

    // Olho por extenso como opção para marcar; marcadores de ALERTA, HARD STOP e pendência do POP.
    expect(screen.getAllByText('OLHO DIREITO').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OLHO ESQUERDO').length).toBeGreaterThan(0)
    expect(screen.getByText(/ALERTA: Sim gera alerta/)).toBeTruthy()
    expect(screen.getByText('HARD STOP')).toBeTruthy()
    expect(screen.getByText(/Pendente no POP: decisão pendente de teste/)).toBeTruthy()

    // Cabeçalho em branco, leitura em voz alta, assinaturas dos papéis que concluem o bloco e lembrete jurídico.
    expect(screen.getByText('Paciente (nome completo)')).toBeTruthy()
    expect(screen.getByText('Quem leu')).toBeTruthy()
    expect(screen.getByText('Circulante', { selector: '.imp-assinatura-papel' })).toBeTruthy()
    expect(screen.getByText('Cirurgião', { selector: '.imp-assinatura-papel' })).toBeTruthy()
    expect(screen.getByText('Registro eletrônico em validação jurídica: imprimir e assinar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeTruthy()
  })

  it('"d0" imprime os seis blocos do dia da cirurgia, um por página', async () => {
    mockChamar.mockImplementation(async (_acao, dados) => modeloFicticio((dados as { id: never }).id) as never)
    renderizar('/impressao/branco/d0')
    await screen.findByRole('heading', { level: 1, name: 'Modelo fictício alta' })
    expect(mockChamar).toHaveBeenCalledTimes(6)
    expect(document.querySelectorAll('.imp-folha')).toHaveLength(6)
    expect(document.querySelectorAll('.imp-folha.imp-quebra')).toHaveLength(5)
  })

  it('sem servidor, imprime a versão embutida no aplicativo, com aviso', async () => {
    mockChamar.mockRejectedValue({ erro: { codigo: 'indisponivel', mensagem: 'x' } })
    renderizar('/impressao/branco/sign_in')
    expect(await screen.findByText('Servidor indisponível: versão embutida no aplicativo.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Modelo fictício sign_in' })).toBeTruthy()
    expect(screen.getAllByText(/embutida\/1/).length).toBeGreaterThan(0)
  })

  it('outros erros não usam a versão embutida', async () => {
    mockChamar.mockRejectedValue({ erro: { codigo: 'nao_encontrado', mensagem: 'x' } })
    renderizar('/impressao/branco/sign_in?versao=inexistente')
    expect(await screen.findByText('Registro não encontrado.')).toBeTruthy()
    expect(screen.queryByText('Servidor indisponível: versão embutida no aplicativo.')).toBeNull()
  })

  it('modelo desconhecido não chama a API', async () => {
    renderizar('/impressao/branco/inexistente')
    expect(await screen.findByText(/Checklist não encontrado/)).toBeTruthy()
    expect(mockChamar).not.toHaveBeenCalled()
  })
})

describe('ImpressaoEpisodio', () => {
  it('gera o registro preenchido: identificação, olho por extenso, respostas com autor e hora, alertas, hard stops e assinaturas', async () => {
    mockChamar.mockResolvedValue(episodioFicticio() as never)
    renderizar('/impressao/episodio/ep-ficticio-1')

    await screen.findByRole('heading', { level: 1, name: /Registro do episódio cirúrgico/ })
    expect(mockChamar).toHaveBeenCalledWith('episodio.obter', { episodioId: 'ep-ficticio-1' })
    expect(screen.getAllByText('Paciente Teste Alfa da Silva').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/31\/01\/1950/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Olho a operar').textContent).toContain('OLHO ESQUERDO')
    expect(screen.getByText('OLHO ÚNICO')).toBeTruthy()

    const linhaOlho = document.querySelector('tr[data-item="sign_in.A.olho"]') as HTMLElement
    expect(within(linhaOlho).getByText('OLHO ESQUERDO')).toBeTruthy()
    const linhaSimNao = document.querySelector('tr[data-item="sign_in.A.simnao"]') as HTMLElement
    expect(within(linhaSimNao).getByText('Não')).toBeTruthy()
    expect(within(linhaSimNao).getByText('FORA DE HORA')).toBeTruthy()
    expect(within(linhaSimNao).getByText('Circulante Teste')).toBeTruthy()
    const linhaOpcao = document.querySelector('tr[data-item="sign_in.B.opcao"]') as HTMLElement
    expect(within(linhaOpcao).getByText('Opção Y')).toBeTruthy()

    // Bloco concluído com leitor e confirmador.
    expect(screen.getByText(/leu: Circulante Teste · confirmou: Cirurgião Teste/)).toBeTruthy()
    // Alerta com conduta e alerta sem conduta (linha para preencher).
    expect(screen.getByText('Manter o remédio. Materiais de íris disponíveis.')).toBeTruthy()
    expect(screen.getAllByText('Conduta do cirurgião (por escrito)').length).toBe(1)
    // Hard stop aberto com espaço para resolução escrita.
    expect(screen.getByText('TCLE ausente')).toBeTruthy()
    expect(screen.getByText('Resolução por escrito')).toBeTruthy()
    // Lente com dioptria formatada.
    expect(screen.getByText(/\+21,50 D/)).toBeTruthy()
    // Assinaturas exigidas.
    for (const papel of ['Concierge cirúrgica', 'Segunda conferente', 'Circulante', 'Cirurgião', 'Anestesista']) {
      expect(screen.getByText(papel, { selector: '.imp-assinatura-papel' })).toBeTruthy()
    }
    expect(screen.getByText('Registro eletrônico em validação jurídica: imprimir e assinar.')).toBeTruthy()
  })

  it('erro da API mostra mensagem genérica', async () => {
    mockChamar.mockRejectedValue({ erro: { codigo: 'sem_permissao', mensagem: 'x' } })
    renderizar('/impressao/episodio/ep-x')
    expect(await screen.findByText('O seu papel não tem permissão para esta ação.')).toBeTruthy()
  })
})

describe('formatarResposta', () => {
  it('formata por tipo de item', () => {
    const m = modeloFicticio('d7')
    const [conf, simnao, olho] = m.secoes[0].itens
    const [opcao, med] = m.secoes[1].itens
    expect(formatarResposta(conf, true)).toBe('Conferido')
    expect(formatarResposta(simnao, 'sim')).toBe('Sim')
    expect(formatarResposta(olho, 'OD')).toBe('OLHO DIREITO')
    expect(formatarResposta(olho, 'nao_sabe')).toBe('Não sabe')
    expect(formatarResposta(opcao, 'x')).toBe('Opção X')
    expect(formatarResposta(med, { uso: 'ja_usou', nomes: 'Nome Comercial Teste' })).toBe('Já usou · Nomes: Nome Comercial Teste')
    expect(formatarResposta(undefined, { tem: true, reacao: 'urticária' })).toBe('Sim. Reação: urticária')
    expect(formatarResposta(undefined, null)).toBe('—')
  })
})
