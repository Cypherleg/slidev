// @vitest-environment jsdom
// Página do paciente: nunca mostra o olho; fluxo do quiz (aprovado, 1ª reprovação, contato humano);
// registro de abertura de material; link inválido com mensagem neutra. Dados fictícios.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcoesPaciente } from '@contrato'

vi.mock('../../api/cliente.ts', () => ({
  chamar: vi.fn(),
  chamarPaciente: vi.fn(),
}))

import { chamarPaciente } from '../../api/cliente.ts'
import PaginaPaciente from './PaginaPaciente.tsx'

const mockPaciente = vi.mocked(chamarPaciente)
type Pagina = AcoesPaciente['pagina.obter']['S']

const VF = [
  { valor: 'V', rotulo: 'Verdadeiro' },
  { valor: 'F', rotulo: 'Falso' },
]

function quizFicticio(): Pagina['quiz'] {
  return [
    { numero: 1, texto: 'Qual olho o senhor ou a senhora vai operar?', critica: true, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'OD', rotulo: 'Direito' }, { valor: 'OE', rotulo: 'Esquerdo' }] },
    { numero: 2, texto: 'Devo pingar o colírio nos dois olhos.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
    { numero: 3, texto: 'Quantas gotas por vez?', critica: false, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: '1' }, { valor: 'b', rotulo: '2 a 3' }, { valor: 'c', rotulo: 'até escorrer' }] },
    { numero: 4, texto: 'Entre dois colírios diferentes, eu espero:', critica: false, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: 'nada' }, { valor: 'b', rotulo: '5 minutos' }, { valor: 'c', rotulo: '1 hora' }] },
    { numero: 5, texto: 'Posso encostar o bico do frasco nos cílios.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
    { numero: 6, texto: 'Devo parar o remédio para afinar o sangue por conta própria.', critica: true, pontua: true, tipo: 'opcao', opcoes: VF },
    { numero: 7, texto: 'No dia da cirurgia eu devo:', critica: true, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: 'vir sozinho, dirigindo' }, { valor: 'b', rotulo: 'vir com acompanhante adulto' }, { valor: 'c', rotulo: 'vir sozinho de ônibus' }] },
    { numero: 8, texto: 'O que devo trazer?', critica: false, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: 'documento' }, { valor: 'b', rotulo: 'cartão e colírios' }, { valor: 'c', rotulo: 'lista dos remédios' }, { valor: 'd', rotulo: 'todos' }] },
    { numero: 9, texto: 'Posso usar maquiagem no dia.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
    { numero: 10, texto: 'Na véspera, o olho amanheceu vermelho. O que faço?', critica: true, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: 'venho normalmente' }, { valor: 'b', rotulo: 'ligo antes de vir' }, { valor: 'c', rotulo: 'pingo mais colírio' }] },
    { numero: 11, texto: 'Várias pessoas perguntarem meu nome é desorganização.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
    { numero: 12, texto: 'Quem vai pingar seus colírios?', critica: false, pontua: false, tipo: 'quem_instila', opcoes: [] },
  ]
}

function paginaFicticia(extra: Partial<Pagina> = {}): Pagina {
  return {
    primeiroNome: 'Alfa',
    materiais: [
      { id: 'm-video', titulo: 'Vídeo de preparo', tipo: 'video', url: 'https://exemplo.invalid/video-preparo.mp4', conteudo: null },
      { id: 'm-texto', titulo: 'Orientação escrita de preparo', tipo: 'texto', url: null, conteudo: 'Comida: até 8 horas antes.\n\n- Traga documento com foto.\n- Traga os colírios.' },
      { id: 'm-tcle', titulo: 'Assinatura do termo', tipo: 'link_tcle', url: 'https://exemplo.invalid/tcle', conteudo: null },
    ],
    tcleLink: 'https://exemplo.invalid/tcle',
    quiz: quizFicticio(),
    tentativas: 0,
    podeResponder: true,
    ultimaTentativa: null,
    telefones: { hospital: '(00) 0000-0000', whatsappConcierge: null, enfermagemForaHorario: '(00) 90000-0000' },
    ...extra,
  }
}

function renderizar(token = 'token-ficticio-123') {
  return render(
    <MemoryRouter initialEntries={[`/p/${token}`]}>
      <Routes>
        <Route path="/p/:token" element={<PaginaPaciente />} />
      </Routes>
    </MemoryRouter>,
  )
}

function preencherQuiz(opcoes: { quem?: 'eu' | 'outra'; nome?: string } = {}) {
  const escolher = (numero: number, rotulo: string | RegExp) => {
    const grupo = document.getElementById(`pergunta-${numero}`) as HTMLElement
    fireEvent.click(within(grupo).getByLabelText(rotulo))
  }
  escolher(1, 'Direito')
  escolher(2, 'Falso')
  escolher(3, '1')
  escolher(4, '5 minutos')
  escolher(5, 'Falso')
  escolher(6, 'Falso')
  escolher(7, 'vir com acompanhante adulto')
  escolher(8, 'todos')
  escolher(9, 'Falso')
  escolher(10, 'ligo antes de vir')
  escolher(11, 'Falso')
  escolher(12, opcoes.quem === 'outra' ? 'Outra pessoa' : 'Eu')
  if (opcoes.quem === 'outra' && opcoes.nome !== undefined) {
    fireEvent.change(screen.getByLabelText('Nome de quem vai pingar os colírios'), { target: { value: opcoes.nome } })
  }
}

function configurarRespostas(pagina: Pagina, respostaQuiz?: AcoesPaciente['quiz.responder']['S']) {
  mockPaciente.mockImplementation(async (acao: string) => {
    if (acao === 'pagina.obter') return pagina as never
    if (acao === 'material.visualizado') return { ok: true } as never
    if (acao === 'quiz.responder') return (respostaQuiz ?? { aprovado: true, proximaAcao: 'concluido' }) as never
    throw new Error(`ação inesperada: ${acao}`)
  })
}

beforeEach(() => {
  mockPaciente.mockReset()
})

describe('PaginaPaciente', () => {
  it('nunca renderiza o olho vindo dos dados, mesmo que o servidor mande campos a mais', async () => {
    const vazada = { ...paginaFicticia(), olho: 'OD', olhoExtenso: 'OLHO DIREITO', episodio: { olho: 'OE', olhoExtenso: 'OLHO ESQUERDO' } } as unknown as Pagina
    configurarRespostas(vazada)
    renderizar()
    await screen.findByText('Olá, Alfa.')

    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/OLHO DIREITO|OLHO ESQUERDO/)
    expect(texto).not.toMatch(/\bOD\b|\bOE\b/)

    // Fora da pergunta 1 (que pede ao paciente que diga o olho), nenhuma menção a direito/esquerdo.
    const p1 = document.getElementById('pergunta-1') as HTMLElement
    const clone = document.body.cloneNode(true) as HTMLElement
    clone.querySelector('#pergunta-1')?.remove()
    expect(clone.textContent ?? '').not.toMatch(/direito|esquerdo/i)

    // Pergunta 1 não vem marcada (a página não sugere o olho).
    for (const r of within(p1).getAllByRole('radio')) expect((r as HTMLInputElement).checked).toBe(false)
  })

  it('aprovado: envia respostas e "quem instila", e mostra conclusão', async () => {
    configurarRespostas(paginaFicticia(), { aprovado: true, proximaAcao: 'concluido' })
    renderizar()
    await screen.findByText('Olá, Alfa.')
    preencherQuiz({ quem: 'eu' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }))

    await screen.findByText('Questionário concluído. Obrigado.')
    const chamada = mockPaciente.mock.calls.find(c => c[0] === 'quiz.responder')
    expect(chamada).toBeDefined()
    expect(chamada![1]).toBe('token-ficticio-123')
    const dados = chamada![2] as AcoesPaciente['quiz.responder']['E']
    expect(Object.keys(dados.respostas)).toHaveLength(11)
    expect(dados.respostas[1]).toBe('OD')
    expect(dados.respostas[12]).toBeUndefined()
    expect(dados.quemInstila).toEqual({ eu: true })
    expect(screen.queryByRole('button', { name: 'Enviar respostas' })).toBeNull()
  })

  it('1ª reprovação: pede para assistir de novo ao vídeo e responder outra vez', async () => {
    configurarRespostas(paginaFicticia(), { aprovado: false, proximaAcao: 'rever_video_e_tentar_de_novo' })
    renderizar()
    await screen.findByText('Olá, Alfa.')
    preencherQuiz()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }))

    await screen.findByText('Por favor, assista de novo ao vídeo e responda outra vez.')
    expect(screen.getByRole('button', { name: 'Assistir ao vídeo de novo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Responder outra vez' }))

    // Formulário novo, sem respostas marcadas.
    const enviar = await screen.findByRole('button', { name: 'Enviar respostas' })
    expect(enviar).toBeTruthy()
    const p2 = document.getElementById('pergunta-2') as HTMLElement
    for (const r of within(p2).getAllByRole('radio')) expect((r as HTMLInputElement).checked).toBe(false)
  })

  it('2ª reprovação ou erro do olho: "a equipe vai entrar em contato", sem dizer que errou o olho', async () => {
    configurarRespostas(paginaFicticia({ tentativas: 1, ultimaTentativa: { aprovado: false, em: '2026-10-10T12:00:00Z' } }), {
      aprovado: false,
      proximaAcao: 'aguardar_contato_da_equipe',
    })
    renderizar()
    await screen.findByText('Assista de novo ao vídeo e responda outra vez.')
    preencherQuiz({ quem: 'outra', nome: 'Cuidadora Teste Beta' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }))

    await screen.findByText(/A equipe do OFTA VITTA vai entrar em contato/)
    const chamada = mockPaciente.mock.calls.find(c => c[0] === 'quiz.responder')
    expect((chamada![2] as AcoesPaciente['quiz.responder']['E']).quemInstila).toEqual({ eu: false, nome: 'Cuidadora Teste Beta' })
    expect(screen.getByText('Antes de assinar o termo, aguarde o contato da equipe.')).toBeTruthy()
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/olho errado|errou|direito|esquerdo/i)
    expect(screen.queryByRole('button', { name: 'Enviar respostas' })).toBeNull()
    // Telefones configurados aparecem; o vazio não.
    expect(screen.getByText('(00) 0000-0000')).toBeTruthy()
    expect(screen.queryByText('WhatsApp da concierge')).toBeNull()
  })

  it('"outra pessoa" exige o nome; respostas faltando são apontadas', async () => {
    configurarRespostas(paginaFicticia())
    renderizar()
    await screen.findByText('Olá, Alfa.')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Falta responder as perguntas 1, 2/)).toBeTruthy()

    preencherQuiz({ quem: 'outra' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }))
    expect(await screen.findByText('Escreva o nome de quem vai pingar os colírios.')).toBeTruthy()
    expect(mockPaciente.mock.calls.some(c => c[0] === 'quiz.responder')).toBe(false)
  })

  it('registra a abertura de cada material uma única vez', async () => {
    configurarRespostas(paginaFicticia())
    renderizar()
    await screen.findByText('Olá, Alfa.')

    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('https://exemplo.invalid/video-preparo.mp4')
    await act(async () => {
      fireEvent.play(video)
      fireEvent.play(video)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ler as orientações' }))
    expect(await screen.findByText('Traga documento com foto.')).toBeTruthy()

    await waitFor(() => {
      const vistos = mockPaciente.mock.calls.filter(c => c[0] === 'material.visualizado').map(c => (c[2] as { materialId: string }).materialId)
      expect(vistos).toEqual(['m-video', 'm-texto'])
    })
  })

  it('vídeo que não é arquivo direto aparece como link', async () => {
    configurarRespostas(
      paginaFicticia({ materiais: [{ id: 'm-v2', titulo: 'Vídeo de preparo', tipo: 'video', url: 'https://exemplo.invalid/assistir?v=abc', conteudo: null }] }),
    )
    renderizar()
    const link = await screen.findByRole('link', { name: 'Assistir ao vídeo' })
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(document.querySelector('video')).toBeNull()
  })

  it('link inválido ou expirado: mensagem neutra, sem detalhes', async () => {
    mockPaciente.mockRejectedValue({ erro: { codigo: 'nao_encontrado', mensagem: 'Token expirado em 01/10/2026' } })
    renderizar('token-invalido')
    expect(await screen.findByText('Este link não está disponível.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/expirado|token|01\/10/i)
  })
})
