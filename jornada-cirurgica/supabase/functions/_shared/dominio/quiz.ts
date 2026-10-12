// Quiz pós-vídeo (POP §6). O quiz não barra cirurgia: decide quem precisa de contato humano antes do D0.
// Aprovação: acertar as 4 perguntas críticas (C) e pelo menos 9 das 11 pontuadas.

import type { NovoEvento, Olho, QuizTentativa } from './tipos.ts'

export interface PerguntaQuiz {
  numero: number
  texto: string
  critica: boolean
  pontua: boolean
  opcoes: { valor: string; rotulo: string }[]
  tipo: 'opcao' | 'quem_instila'
}

const VF = [
  { valor: 'V', rotulo: 'Verdadeiro' },
  { valor: 'F', rotulo: 'Falso' },
]

const PERGUNTAS: PerguntaQuiz[] = [
  { numero: 1, texto: 'Qual olho o senhor ou a senhora vai operar?', critica: true, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'OD', rotulo: 'Direito' }, { valor: 'OE', rotulo: 'Esquerdo' }] },
  { numero: 2, texto: 'Devo pingar o colírio nos dois olhos.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
  { numero: 3, texto: 'Quantas gotas por vez?', critica: false, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: '1' }, { valor: 'b', rotulo: '2 a 3' }, { valor: 'c', rotulo: 'Até escorrer' }] },
  { numero: 4, texto: 'Entre dois colírios diferentes, eu espero:', critica: false, pontua: true, tipo: 'opcao', opcoes: [{ valor: 'a', rotulo: 'Nada' }, { valor: 'b', rotulo: '5 minutos' }, { valor: 'c', rotulo: '1 hora' }] },
  { numero: 5, texto: 'Posso encostar o bico do frasco nos cílios para acertar melhor.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
  { numero: 6, texto: 'Tomo remédio para afinar o sangue. Devo parar por conta própria antes da cirurgia.', critica: true, pontua: true, tipo: 'opcao', opcoes: VF },
  {
    numero: 7,
    texto: 'No dia da cirurgia eu devo:',
    critica: true,
    pontua: true,
    tipo: 'opcao',
    opcoes: [
      { valor: 'a', rotulo: 'Vir sozinho, dirigindo' },
      { valor: 'b', rotulo: 'Vir com acompanhante adulto que fica até a alta' },
      { valor: 'c', rotulo: 'Vir sozinho de ônibus' },
    ],
  },
  {
    numero: 8,
    texto: 'O que devo trazer?',
    critica: false,
    pontua: true,
    tipo: 'opcao',
    opcoes: [
      { valor: 'a', rotulo: 'Documento com foto' },
      { valor: 'b', rotulo: 'Cartão e colírios' },
      { valor: 'c', rotulo: 'Caixas ou lista dos remédios' },
      { valor: 'd', rotulo: 'Todos' },
    ],
  },
  { numero: 9, texto: 'Posso usar maquiagem e creme no rosto no dia.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
  {
    numero: 10,
    texto: 'Na véspera, meu olho amanheceu vermelho e com secreção. O que faço?',
    critica: true,
    pontua: true,
    tipo: 'opcao',
    opcoes: [
      { valor: 'a', rotulo: 'Venho normalmente' },
      { valor: 'b', rotulo: 'Ligo para o OFTA VITTA antes de vir' },
      { valor: 'c', rotulo: 'Pingo mais colírio' },
    ],
  },
  { numero: 11, texto: 'Várias pessoas perguntarem meu nome e meu olho é sinal de desorganização.', critica: false, pontua: true, tipo: 'opcao', opcoes: VF },
  { numero: 12, texto: 'Quem vai pingar seus colírios?', critica: false, pontua: false, tipo: 'quem_instila', opcoes: [{ valor: 'eu', rotulo: 'Eu' }, { valor: 'outra', rotulo: 'Outra pessoa' }] },
]

/** Gabarito (nunca vai para a página do paciente). A pergunta 1 é conferida contra o olho do episódio. */
const GABARITO: Record<number, string> = { 2: 'F', 3: 'a', 4: 'b', 5: 'F', 6: 'F', 7: 'b', 8: 'd', 9: 'F', 10: 'b', 11: 'F' }
const CRITICAS = [1, 6, 7, 10]
const PONTUADAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
export const MINIMO_ACERTOS = 9

/** Perguntas do quiz (POP §6), sem gabarito, para a página do paciente. */
export function perguntasQuiz(): PerguntaQuiz[] {
  return PERGUNTAS.map((p) => ({ ...p, opcoes: p.opcoes.map((o) => ({ ...o })) }))
}

function correta(numero: number, resposta: string | undefined, olho: Olho): boolean {
  if (resposta === undefined) return false
  if (numero === 1) return resposta === olho
  return GABARITO[numero] === resposta
}

/** Perguntas pontuadas erradas (para o indicador complementar "perguntas mais erradas"). */
export function questoesErradas(respostas: Record<number, string>, olhoEpisodio: Olho): number[] {
  return PONTUADAS.filter((n) => !correta(n, respostas[n], olhoEpisodio))
}

/** Corrige uma tentativa (4 críticas + pelo menos 9 de 11 pontuadas; pergunta 1 conferida contra o olho). */
export function corrigirQuiz(respostas: Record<number, string>, olhoEpisodio: Olho, quemInstila?: { eu: boolean; nome?: string }): QuizTentativa {
  const acertos = PONTUADAS.filter((n) => correta(n, respostas[n], olhoEpisodio)).length
  const criticasOk = CRITICAS.every((n) => correta(n, respostas[n], olhoEpisodio))
  const r1 = respostas[1]
  const olhoInformado: Olho | null = r1 === 'OD' || r1 === 'OE' ? r1 : null
  const t: QuizTentativa = {
    em: '',
    acertos,
    criticasOk,
    olhoInformado,
    olhoConfere: olhoInformado === null ? null : olhoInformado === olhoEpisodio,
    aprovado: criticasOk && acertos >= MINIMO_ACERTOS,
  }
  if (quemInstila) t.quemInstila = { eu: !!quemInstila.eu, ...(quemInstila.nome ? { nome: quemInstila.nome } : {}) }
  return t
}

/**
 * Próxima ação na página do paciente (POP §6, "Se reprovar"):
 * aprovado → concluído; 1ª reprovação → rever o vídeo e tentar de novo;
 * 2ª reprovação ou erro na pergunta 1 → aguardar contato humano (em até 1 dia útil).
 */
export function proximaAcaoQuiz(tentativas: QuizTentativa[]): 'concluido' | 'rever_video_e_tentar_de_novo' | 'aguardar_contato_da_equipe' | null {
  if (!tentativas.length) return null
  if (tentativas.some((t) => t.aprovado)) return 'concluido'
  if (tentativas.some((t) => t.olhoConfere === false) || tentativas.length >= 2) return 'aguardar_contato_da_equipe'
  return 'rever_video_e_tentar_de_novo'
}

/** Pode responder de novo? Só depois de uma única reprovação sem erro de olho. */
export function podeResponderQuiz(tentativas: QuizTentativa[]): boolean {
  return tentativas.length === 0 || proximaAcaoQuiz(tentativas) === 'rever_video_e_tentar_de_novo'
}

/**
 * Evento `quiz.respondido` (gravado pela API como `jornada_sistema`, autor 'paciente').
 * `dados`: { tentativa: QuizTentativa, erradas: number[] } — sem valores de lente.
 */
export function eventoQuizRespondido(entrada: {
  episodioId: string
  pacienteId: string
  autorId: string
  tentativa: QuizTentativa
  erradas: number[]
}): NovoEvento {
  return {
    episodioId: entrada.episodioId,
    pacienteId: entrada.pacienteId,
    tipo: 'quiz.respondido',
    dados: { tentativa: entrada.tentativa, erradas: entrada.erradas },
    visibilidade: 'geral',
    autorId: entrada.autorId,
    autorPapel: 'paciente',
    sessaoUsuarioId: null,
    aparelhoId: null,
    foraDeHora: false,
    motivoForaDeHora: null,
    versaoModelo: null,
  }
}

/** Evento `material.aberto` (página do paciente; autor 'paciente'). */
export function eventoMaterialAberto(entrada: { episodioId: string; pacienteId: string; autorId: string; materialId: string }): NovoEvento {
  return {
    episodioId: entrada.episodioId,
    pacienteId: entrada.pacienteId,
    tipo: 'material.aberto',
    dados: { materialId: entrada.materialId },
    visibilidade: 'geral',
    autorId: entrada.autorId,
    autorPapel: 'paciente',
    sessaoUsuarioId: null,
    aparelhoId: null,
    foraDeHora: false,
    motivoForaDeHora: null,
    versaoModelo: null,
  }
}
