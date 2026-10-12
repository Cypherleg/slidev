// Superfície pública do domínio. A camada de API e a interface importam SOMENTE daqui.
// As assinaturas abaixo são o contrato entre agentes; a implementação fica nos módulos
// do próprio diretório (modelos/, estado.ts, decidir.ts, regras/, mensagens.ts, ...).
// Funções ainda não implementadas lançam ErroDominio('NAO_IMPLEMENTADO').

import type {
  Alerta,
  CampoLente,
  CodigoHardStop,
  ConfigJornada,
  Contato,
  DadosChegadaLente,
  DadosPlanoLente,
  EpisodioResumoDia,
  EpisodioVisao,
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
  Pendencia,
  QuizTentativa,
  StatusTcle,
  ValoresLente,
  ValorResposta,
  ViaComunicacao,
  Visibilidade,
} from './tipos.ts'

export * from './tipos.ts'

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
  | { tipo: 'intercorrencia.registrar'; descricao: string }
  | { tipo: 'episodio.suspender'; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }
  | { tipo: 'episodio.cancelar'; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }
  | { tipo: 'avisos.atraso'; minutos: number | null }
  | { tipo: 'etiqueta.copiada'; etiqueta: TipoEtiqueta }
  | { tipo: 'quase_evento.registrar'; etapa: 'chegada' | 'd2' | 'd0'; descricao: string }

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

// ---------------------------------------------------------------------------
// Funções (contrato). Implementações substituem os stubs abaixo.
// ---------------------------------------------------------------------------

const naoImplementado = (nome: string): never => {
  throw new ErroDominio('NAO_IMPLEMENTADO', `Função de domínio não implementada: ${nome}`)
}

/** Modelos de checklist v1 transcritos do POP v0.4. */
export function modelosPadrao(): Record<ModeloId, ModeloChecklist> {
  return naoImplementado('modelosPadrao')
}

/** Dobra os eventos num Estado. Funciona com o conjunto completo ou só com os visíveis ao ator. */
export function montarEstado(entrada: EntradaEstado): Estado {
  return naoImplementado(`montarEstado(${entrada.episodio.id})`)
}

/** Valida o comando contra o estado COMPLETO e devolve o que gravar. Lança ErroDominio. */
export function decidir(estado: Estado, comando: Comando, ctx: ContextoDecisao): ResultadoDecisao {
  return naoImplementado(`decidir(${comando.tipo}, ${estado.estado}, ${ctx.ator.id})`)
}

/** Visão do episódio filtrada pelo papel do ator (conferência cega aplicada aqui também). */
export function projetarVisao(estado: Estado, ator: Ator, agora: string): EpisodioVisao {
  return naoImplementado(`projetarVisao(${estado.estado}, ${ator.id}, ${agora})`)
}

/** Linha para a lista do dia e para a projeção `episodios.resumo` (sem valores de lente). */
export function resumoDia(estado: Estado, agora: string): EpisodioResumoDia {
  return naoImplementado(`resumoDia(${estado.estado}, ${agora})`)
}

/** O que falta neste episódio: de quem depende e desde quando. */
export function pendenciasDoEpisodio(estado: Estado, agora: string): Pendencia[] {
  return naoImplementado(`pendenciasDoEpisodio(${estado.estado}, ${agora})`)
}

/** Alertas ativos do episódio (ALERTA e sinalizados), com comunicação e conduta. */
export function alertasDoEpisodio(estado: Estado): Alerta[] {
  return naoImplementado(`alertasDoEpisodio(${estado.estado})`)
}

/** Evento de abertura de episódio (D-7). Valida campos; calcula 2º olho. */
export function abrirEpisodio(
  entrada: {
    episodioId: string
    paciente: Paciente
    olho: Olho
    cirurgiaoId: string
    tipoCirurgia: string
    tipoLente: string
    dataSugerida: string | null
    versoesModelos: Record<ModeloId, string>
    anterioresDoPaciente: { episodioId: string; olho: Olho; dataCirurgia: string | null; estado: EstadoEpisodio }[]
  },
  ctx: ContextoDecisao,
): { evento: NovoEvento; avisos: string[] } {
  return naoImplementado(`abrirEpisodio(${entrada.episodioId}, ${ctx.ator.id})`)
}

/** Evento de cadastro de paciente (dados conferidos com documento com foto). */
export function cadastrarPaciente(
  entrada: {
    pacienteId: string
    nomeCompleto: string
    dataNascimento: string
    nomeMae: string | null
    prontuario: string | null
    datasighId: string | null
    conferidoDatasigh: boolean
    documentoConferido: boolean
  },
  ctx: ContextoDecisao,
): NovoEvento {
  return naoImplementado(`cadastrarPaciente(${entrada.pacienteId}, ${ctx.ator.id})`)
}

/** Etiquetas (texto) a partir dos modelos configuráveis. */
export function gerarEtiquetas(estado: Estado, config: ConfigJornada): Etiqueta[] {
  return naoImplementado(`gerarEtiquetas(${estado.estado}, ${Object.keys(config).length})`)
}

/** Perguntas do quiz (POP §6), sem gabarito, para a página do paciente. */
export function perguntasQuiz(): { numero: number; texto: string; critica: boolean; pontua: boolean; opcoes: { valor: string; rotulo: string }[]; tipo: 'opcao' | 'quem_instila' }[] {
  return naoImplementado('perguntasQuiz')
}

/** Corrige uma tentativa (4 críticas + pelo menos 9 de 11 pontuadas; pergunta 1 conferida contra o olho do episódio). */
export function corrigirQuiz(respostas: Record<number, string>, olhoEpisodio: Olho, quemInstila?: { eu: boolean; nome?: string }): QuizTentativa {
  return naoImplementado(`corrigirQuiz(${Object.keys(respostas).length}, ${olhoEpisodio}, ${quemInstila?.eu})`)
}

/** Visão de leitura do dia para o resumo do dia cirúrgico (paciente, olho, lente, ordem, alertas). Só cirurgião e gestora. */
export function visaoLeituraDia(estados: Estado[], ator: Ator, data: string): {
  data: string
  episodios: { ordem: number | null; horario: string | null; paciente: string; nascimento: string; olho: string; lente: { modelo: string; dioptria: string; cilindro: string | null; eixo: number | null; etapa: string } | null; alertas: string[]; dots: string[]; estado: EstadoEpisodio }[]
} {
  return naoImplementado(`visaoLeituraDia(${estados.length}, ${ator.id}, ${data})`)
}

/** Resumo da véspera para o cirurgião: episódios do dia, alertas sem conduta, lentes não conferidas, termos não assinados. */
export function resumoVespera(estados: Estado[], data: string, agora: string): {
  data: string
  episodios: EpisodioResumoDia[]
  alertasSemConduta: { episodioId: string; paciente: string; alerta: string }[]
  lentesNaoConferidas: { episodioId: string; paciente: string; etapa: string }[]
  termosNaoAssinados: { episodioId: string; paciente: string; status: StatusTcle }[]
} {
  return naoImplementado(`resumoVespera(${estados.length}, ${data}, ${agora})`)
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

/** Indicadores da seção 12 do POP calculados a partir dos episódios do período. */
export function calcularIndicadores(estados: Estado[], de: string, ate: string): Indicador[] {
  return naoImplementado(`calcularIndicadores(${estados.length}, ${de}, ${ate})`)
}

/** Comparação normalizada de lente (sinal, casa decimal, maiúsculas, espaços). */
export function compararLente(a: Partial<ValoresLente>, b: Partial<ValoresLente>, campos: CampoLente[]): { confere: boolean; camposDivergentes: CampoLente[] } {
  return naoImplementado(`compararLente(${Object.keys(a).length}, ${Object.keys(b).length}, ${campos.length})`)
}

// Utilitários puros
export function validarCpf(cpf: string): boolean {
  return naoImplementado(`validarCpf(${cpf.length})`)
}
export function normalizarCpf(cpf: string): string {
  return naoImplementado(`normalizarCpf(${cpf.length})`)
}
export function normalizarNome(nome: string): string {
  return naoImplementado(`normalizarNome(${nome.length})`)
}
/** 0..1. Usado só para alertar homônimo/nome parecido; nunca para unir pessoas. */
export function similaridadeNomes(a: string, b: string): number {
  return naoImplementado(`similaridadeNomes(${a.length}, ${b.length})`)
}
/** '+21,50 D' (sinal sempre explícito, vírgula decimal, duas casas). */
export function formatarDioptria(valor: number): string {
  return naoImplementado(`formatarDioptria(${valor})`)
}
/** Data/hora em America/Sao_Paulo para exibição: 'dd/mm/aaaa' e 'dd/mm/aaaa hh:mm'. */
export function formatarData(iso: string): string {
  return naoImplementado(`formatarData(${iso})`)
}
export function formatarDataHora(iso: string): string {
  return naoImplementado(`formatarDataHora(${iso})`)
}
/** Data local (America/Sao_Paulo) 'aaaa-mm-dd' de um instante ISO. */
export function dataLocal(iso: string): string {
  return naoImplementado(`dataLocal(${iso})`)
}
/** Primeiro nome para os avisos (conteúdo mínimo, briefing §7). */
export function primeiroNome(nomeCompleto: string): string {
  return naoImplementado(`primeiroNome(${nomeCompleto.length})`)
}
/** Máscara de telefone para listas: '(44) 9****-**62'. */
export function mascararTelefone(telefone: string): string {
  return naoImplementado(`mascararTelefone(${telefone.length})`)
}
/** Configuração padrão: sem tempos, sem números clínicos; modelos de etiqueta a partir do POP. */
export function configPadrao(): ConfigJornada {
  return naoImplementado('configPadrao')
}

/** Matriz papel × tipo de evento (espelhada na tabela `jornada_cirurgica.permissoes_evento`). */
export function papeisPermitidosParaEvento(tipo: NovoEvento['tipo'], modelo?: ModeloId | null): Papel[] {
  return naoImplementado(`papeisPermitidosParaEvento(${tipo}, ${modelo})`)
}

export type { EstadoMensagem, GatilhoAviso }
