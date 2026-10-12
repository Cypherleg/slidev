// Estrutura interna do Estado (resultado de dobrar os eventos). Não faz parte do contrato público:
// a API e a interface usam projetarVisao/resumoDia/pendenciasDoEpisodio, não estes campos.

import type { EntradaEstado, Estado } from '../contrato.ts'
import type {
  CampoLente,
  CodigoHardStop,
  Contato,
  EstadoEpisodio,
  ModeloId,
  QuizTentativa,
  StatusTcle,
  ValorResposta,
  ViaComunicacao,
} from '../tipos.ts'

export interface RespostaInterna {
  valor: ValorResposta
  observacao: string | null
  autorId: string
  autorPapel: string
  registradoEm: string
  foraDeHora: boolean
  motivoForaDeHora: string | null
  correcoes: number
  eventoId: string
  /** Posição do evento na dobra (ordem real de registro). */
  ordem: number
}

export interface ConclusaoInterna {
  em: string
  porId: string
  porPapel: string
  leitorId: string | null
  confirmadorId: string | null
  foraDeHora: boolean
  motivoForaDeHora: string | null
  eventoId: string
}

export interface RegistroRef {
  registroId: string | null
  em: string
  porId: string
}

export interface ResultadoComparacaoInterno {
  confere: boolean
  camposDivergentes: CampoLente[]
  em: string
  porId: string
  registroId: string | null
}

export type EtapaQuarentena = 'cp1' | 'cp2' | 'time_out'
export type AcaoQuarentena = 'manter_plano' | 'novo_plano'
export type OrigemCiclo = 'inicial' | 'novo_plano' | 'manter_plano' | 'troca_d0'

export interface QuarentenaInterna {
  aberta: boolean
  etapa: EtapaQuarentena
  motivo: string
  desde: string
  porId: string
  camposDivergentes: CampoLente[]
  itens: string[]
  resolucao?: { texto: string; cirurgiaoId: string; em: string; acao: AcaoQuarentena }
}

export interface CicloLente {
  numero: number
  origem: OrigemCiclo
  iniciadoEm: string
  /** manter_plano: o plano do ciclo anterior continua valendo (não é digitado de novo). */
  herdaPlanoDe: number | null
  /** manter_plano em quarentena do checkpoint 2: chegada e checkpoint 1 do ciclo anterior continuam valendo. */
  herdaCp1De: number | null
  plano: RegistroRef | null
  chegada: RegistroRef | null
  respostasCp1: Record<string, RespostaInterna>
  cp1: ConclusaoInterna | null
  cp2Registro: RegistroRef | null
  cp2Resultado: ResultadoComparacaoInterno | null
  respostasCp2: Record<string, RespostaInterna>
  cp2: ConclusaoInterna | null
  timeOutRegistro: RegistroRef | null
  timeOutResultado: ResultadoComparacaoInterno | null
  quarentena: QuarentenaInterna | null
  encerrado: { em: string; motivo: string } | null
  /** Quem registrou plano, chegada, respostas ou conclusão do checkpoint 1 neste ciclo (conferência cega). */
  autoresConferencia1: string[]
}

export interface TrilhaAlerta {
  geradoEm: string
  ativo: boolean
  /** Última mudança: geração, mudança de conteúdo, desativação ou reativação. */
  atualizadoEm: string
  atualizadoOrdem: number
  /** Conteúdo comunicável (título, descrição, nível) da última vez em que esteve ativo. */
  assinatura: string
  ultimo: { titulo: string; descricao: string; nivel: 'alerta' | 'sinalizado'; origem: { modelo: ModeloId | 'sistema'; itemId?: string } }
}

export interface TrilhaHardStop {
  aberto: boolean
  desde: string | null
}

export interface EstadoInterno extends Estado {
  readonly entrada: EntradaEstado
  estado: EstadoEpisodio
  /** Campos agendáveis (episodio.agendado atualiza). */
  agenda: { dataCirurgia: string | null; horario: string | null; ordem: number | null; dataSugerida: string | null }
  respostas: Partial<Record<ModeloId, Record<string, RespostaInterna>>>
  conclusoes: Partial<Record<ModeloId, ConclusaoInterna>>
  ciclos: CicloLente[]
  alertasComunicados: Record<string, { porId: string; em: string; via: ViaComunicacao; cirurgiaoId: string; observacao: string | null; ordem: number }>
  condutas: Record<string, { texto: string; cirurgiaoId: string; em: string; ordem: number }>
  /** Contador de eventos dobrados (ordem real). */
  contador: number
  trilhaAlertas: Record<string, TrilhaAlerta>
  trilhaHardStops: Partial<Record<CodigoHardStop, TrilhaHardStop>>
  /** Hard stops de resolução escrita: ocorrência aberta até `hardstop.resolvido`. */
  ocorrencias: Partial<Record<CodigoHardStop, { abertaEm: string; fontes: string[] }>>
  gatilhosAnteriores: Partial<Record<CodigoHardStop, string[]>>
  resolucoesHardStop: { codigo: CodigoHardStop; texto: string; porId: string; porPapel: string; em: string }[]
  contatos: Record<string, Contato>
  tcle: { status: StatusTcle; link: string | null; historico: { status: StatusTcle; em: string; porId: string }[] }
  materiais: {
    enviados: { materiais: { id: string; codigo: string; versao: number; titulo: string }[]; em: string; contatoId: string | null; mensagemId: string | null }[]
    linkCriadoEm: string | null
    linkExpiraEm: string | null
    abertoEm: string | null
    quiz: { tentativa: QuizTentativa; erradas: number[]; em: string }[]
  }
  teachBack: { resultado: 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'; observacao: string | null; em: string; porId: string } | null
  teachBacks: { resultado: 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'; em: string }[]
  intercorrencias: { descricao: string; em: string; porId: string; neverEvent: string | null }[]
  quaseEventos: { etapa: string; descricao: string; codigo: string | null; categoria: string | null; automatico: boolean; em: string; porId: string; camposDivergentes: CampoLente[] }[]
  suspensoes: { tipo: 'suspenso' | 'cancelado'; em: string; porId: string; motivo: string; causa: string | null; evitavel: boolean | null }[]
  atrasos: { em: string; minutos: number | null }[]
  mensagensEnfileiradas: { mensagemId: string; gatilho: string; contatoId: string; em: string }[]
  anexos: { anexoId: string; tipoAnexo: string; em: string; porId: string; ciclo: number }[]
  etiquetasCopiadas: { etiqueta: string; em: string; porId: string }[]
  ultimoEventoEm: string
  ultimoSeq: number
}
