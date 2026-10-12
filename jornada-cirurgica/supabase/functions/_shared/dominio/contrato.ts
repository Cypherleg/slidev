// Tipos de entrada/saída do domínio (contrato entre agentes).
// Movidos de index.ts sem alteração de forma; index.ts reexporta tudo daqui.
// Acréscimos permitidos: exports novos e campos opcionais.

import type {
  CodigoHardStop,
  ConfigJornada,
  Contato,
  DadosChegadaLente,
  DadosPlanoLente,
  EstadoEpisodio,
  EstadoMensagem,
  Evento,
  GatilhoAviso,
  MensagemSaida,
  ModeloChecklist,
  ModeloId,
  NovoEvento,
  Olho,
  Paciente,
  Papel,
  StatusTcle,
  ValoresLente,
  ValorResposta,
  ViaComunicacao,
  Visibilidade,
} from './tipos.ts'

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export type CodigoErroDominio =
  | 'NAO_IMPLEMENTADO'
  | 'SEM_PERMISSAO' // papel do ator não pode executar o comando
  | 'HARD_STOP' // hard stop aberto impede a passagem
  | 'ORDEM' // ordem obrigatória não respeitada (regra 4)
  | 'VALIDACAO' // dado inválido ou faltante
  | 'ESTADO' // comando incompatível com o estado do episódio
  | 'CONFERENCIA_CEGA' // ator viu ou registrou a primeira conferência

export class ErroDominio extends Error {
  constructor(
    public readonly codigo: CodigoErroDominio,
    mensagem: string,
    public readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem)
    this.name = 'ErroDominio'
  }
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface Ator {
  id: string
  nome: string
  papeis: Papel[]
  sessaoUsuarioId: string
  aparelhoId: string | null
}

export type EtapaRegistroLente = 'plano' | 'chegada' | 'cp2' | 'time_out'

export interface LeituraTimeOut {
  modelo: string
  dioptria: number
  cilindro: number | null
  eixo: number | null
}

export interface RegistroLente {
  id: string
  episodioId: string
  ciclo: number
  etapa: EtapaRegistroLente
  dados: DadosPlanoLente | DadosChegadaLente | ValoresLente | LeituraTimeOut
  autorId: string
  registradoEm: string
  visibilidade: Visibilidade
}

export type NovoRegistroLente = Omit<RegistroLente, 'registradoEm'>

export interface DadosEpisodioBase {
  id: string
  pacienteId: string
  olho: Olho
  cirurgiaoId: string
  tipoCirurgia: string
  tipoLente: string
  dataSugerida: string | null
  dataCirurgia: string | null
  horario: string | null
  ordem: number | null
  versao: number
  abertoEm: string
  versoesModelos: Record<ModeloId, string>
}

export interface EntradaEstado {
  episodio: DadosEpisodioBase
  paciente: Paciente
  /** Eventos do episódio em ordem de `seq`. Podem ser só os visíveis ao ator (leitura) ou todos (decisão). */
  eventos: Evento[]
  lente: RegistroLente[]
  modelos: Record<ModeloId, ModeloChecklist>
  membros: Record<string, { id: string; nome: string; papeis: Papel[] }>
  mensagens: MensagemSaida[]
  contexto: {
    /** Outros episódios com cirurgia na mesma data (homônimo ou nome parecido). */
    mesmoDia: { episodioId: string; pacienteId: string; nomeCompleto: string; dataNascimento: string }[]
    /** Episódios anteriores do mesmo paciente (2º olho). */
    anterioresDoPaciente: { episodioId: string; olho: Olho; dataCirurgia: string | null; estado: EstadoEpisodio }[]
  }
  config: ConfigJornada
}

/** Estado do episódio após dobrar os eventos. Estrutura interna do domínio. */
export interface Estado {
  readonly entrada: EntradaEstado
  readonly estado: EstadoEpisodio
  /** Campos internos adicionais ficam a critério do módulo de estado. */
  readonly [chave: string]: unknown
}

export interface ContextoDecisao {
  ator: Ator
  agora: string // ISO UTC
  gerarId: () => string // uuid v4 fornecido pela API (o domínio não usa aleatoriedade)
  config: ConfigJornada
  /** Envio a pacientes habilitado? false = modo ensaio (mensagens montadas e registradas, não saem). */
  envioHabilitado: boolean
  /** Base pública da página do paciente, ex.: 'https://.../p/'. */
  urlPaginaPaciente?: string
  /**
   * O ator já consultou dados do checkpoint 1 deste episódio (tabela `acessos`)?
   * A API informa; o domínio recusa o checkpoint 2 nesse caso (conferência cega).
   */
  atorViuConferencia1?: boolean
}

export interface NovaMensagem {
  id: string
  gatilho: GatilhoAviso
  contatoId: string
  telefone: string
  texto: string
  modeloMeta: string | null
  parametros: Record<string, string>
  chaveIdempotencia: string
  estadoInicial: Extract<EstadoMensagem, 'ensaio' | 'pendente'>
}

export interface ResultadoDecisao {
  eventos: NovoEvento[]
  lente: NovoRegistroLente[]
  mensagens: NovaMensagem[]
}

// ---------------------------------------------------------------------------
// Comandos (cada ação de escrita da API vira um comando validado pelo domínio)
// ---------------------------------------------------------------------------

export type CausaCancelamento =
  | 'sem_acompanhante'
  | 'colirio_nao_usado'
  | 'medicacao_nao_ajustada'
  | 'olho_vermelho_nao_avisado'
  | 'tcle_ausente'
  | 'lio_indisponivel'
  | 'outra'

/** Categoria do quase-evento (indicador 4 do POP §12 conta só identidade, olho e LIO). */
export type CategoriaQuaseEvento = 'identidade' | 'olho' | 'lio' | 'outro'

/** Never events (POP §12, indicador 5). Acréscimo opcional ao comando de intercorrência. */
export type NeverEvent = 'olho_errado' | 'paciente_errado' | 'lio_errada'

export type Comando =
  | { tipo: 'episodio.agendar'; dataCirurgia: string | null; horario?: string | null; ordem?: number | null }
  | { tipo: 'checklist.responder'; modelo: ModeloId; respostas: { itemId: string; valor: ValorResposta; observacao?: string | null }[] }
  | { tipo: 'bloco.concluir'; modelo: ModeloId; leitorId?: string | null; confirmadorId?: string | null }
  | { tipo: 'alerta.comunicar'; alertaId: string; via: ViaComunicacao; cirurgiaoId: string; observacao?: string | null }
  | { tipo: 'alerta.conduta'; alertaId: string; conduta: string }
  | { tipo: 'contato.salvar'; contato: Omit<Contato, 'confirmadoEm' | 'confirmadoPor'> }
  | { tipo: 'contato.remover'; contatoId: string }
  | { tipo: 'contato.confirmar'; contatoId: string }
  | { tipo: 'orientacoes.teach_back'; resultado: 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'; observacao?: string | null }
  | { tipo: 'lente.plano'; dados: DadosPlanoLente }
  | { tipo: 'lente.chegada'; dados: DadosChegadaLente }
  | { tipo: 'lente.cp2'; valores: ValoresLente }
  | { tipo: 'lente.time_out'; leitura: LeituraTimeOut }
  | { tipo: 'lente.resolver_quarentena'; resolucao: string; acao: 'manter_plano' | 'novo_plano' }
  | { tipo: 'lente.troca_d0'; motivo: string }
  | { tipo: 'anexo.adicionar'; anexoId: string; tipoAnexo: 'foto_plano'; sha256: string }
  | { tipo: 'tcle.status'; status: Exclude<StatusTcle, 'nao_enviado'>; link?: string | null }
  | { tipo: 'materiais.enviar'; tokenLink: string; expiraEm: string; materiais: MaterialCatalogo[] }
  | { tipo: 'hardstop.resolver'; codigo: CodigoHardStop; resolucao: string }
  | { tipo: 'intercorrencia.registrar'; descricao: string; neverEvent?: NeverEvent | null }
  | { tipo: 'episodio.suspender'; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }
  | { tipo: 'episodio.cancelar'; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }
  | { tipo: 'avisos.atraso'; minutos: number | null }
  | { tipo: 'etiqueta.copiada'; etiqueta: TipoEtiqueta }
  | { tipo: 'quase_evento.registrar'; etapa: 'chegada' | 'd2' | 'd0'; descricao: string; categoria?: CategoriaQuaseEvento | null }

export interface MaterialCatalogo {
  id: string
  codigo: string
  versao: number
  titulo: string
  tipo: 'video' | 'texto' | 'video_tcle' | 'link_tcle' | 'outro'
  url: string | null
  conteudo: string | null
  momento: 'd7' | 'd3' | 'd2' | 'd1' | 'd0' | 'alta'
  publico: 'paciente' | 'cuidador' | 'familiar'
  ativo: boolean
}

export type TipoEtiqueta = 'peito' | 'pulseira' | 'caixa_lente' | 'alertas'

export interface Etiqueta {
  tipo: TipoEtiqueta
  titulo: string
  texto: string
}

export interface Indicador {
  numero: number
  nome: string
  numerador: number | null
  denominador: number | null
  valor: number | null // fração 0..1, quando aplicável
  meta: string
  observacao?: string // ex.: 'Exige observação direta: registrar manualmente.'
}
