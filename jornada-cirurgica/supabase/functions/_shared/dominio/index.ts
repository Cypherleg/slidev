// Superfície pública do domínio. A camada de API e a interface importam SOMENTE daqui.
// As assinaturas abaixo são o contrato entre agentes; a implementação fica nos módulos
// do próprio diretório (modelos/, estado/, decidir.ts, regras/, mensagens.ts, ...).

import type {
  Alerta,
  CampoLente,
  ConfigJornada,
  EpisodioResumoDia,
  EpisodioVisao,
  EstadoEpisodio,
  EstadoMensagem,
  GatilhoAviso,
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
} from './tipos.ts'
import type { Ator, Comando, ContextoDecisao, EntradaEstado, Estado, Etiqueta, Indicador, ResultadoDecisao } from './contrato.ts'
import { DEFINICOES_HARD_STOP as DEFS } from './regras/hardstops.ts'

import { modelosPadrao as _modelosPadrao } from './modelos/v1/index.ts'
import { montarEstado as _montarEstado, interno } from './estado/montar.ts'
import { decidir as _decidir } from './decidir.ts'
import { projetarVisao as _projetarVisao } from './projecao.ts'
import { resumoDia as _resumoDia, resumoVespera as _resumoVespera, visaoLeituraDia as _visaoLeituraDia } from './resumos.ts'
import { pendenciasDoEstado } from './regras/pendencias.ts'
import { alertasDoEstado } from './regras/alertas.ts'
import { abrirEpisodio as _abrirEpisodio, cadastrarPaciente as _cadastrarPaciente } from './abertura.ts'
import { gerarEtiquetas as _gerarEtiquetas } from './etiquetas.ts'
import { corrigirQuiz as _corrigirQuiz, perguntasQuiz as _perguntasQuiz } from './quiz.ts'
import { calcularIndicadores as _calcularIndicadores } from './indicadores.ts'
import { compararLente as _compararLente, formatarDioptria as _formatarDioptria } from './regras/lente.ts'
import { normalizarCpf as _normalizarCpf, validarCpf as _validarCpf } from './util/cpf.ts'
import { normalizarNome as _normalizarNome, primeiroNome as _primeiroNome, similaridadeNomes as _similaridadeNomes } from './util/texto.ts'
import { dataLocal as _dataLocal, formatarData as _formatarData, formatarDataHora as _formatarDataHora } from './util/datas.ts'
import { mascararTelefone as _mascararTelefone } from './util/telefone.ts'
import { configPadrao as _configPadrao } from './config.ts'
import { papeisPermitidosParaEvento as _papeisPermitidosParaEvento } from './permissoes.ts'

export * from './tipos.ts'
export * from './contrato.ts'

// ---------------------------------------------------------------------------
// Funções (contrato)
// ---------------------------------------------------------------------------

/** Modelos de checklist v1 transcritos do POP v0.4. `config` opcional: itens extras da anestesia. */
export function modelosPadrao(config?: Pick<ConfigJornada, 'itensAnestesiaExtras'> | null): Record<ModeloId, ModeloChecklist> {
  return _modelosPadrao(config)
}

/** Dobra os eventos num Estado. Funciona com o conjunto completo ou só com os visíveis ao ator. */
export function montarEstado(entrada: EntradaEstado): Estado {
  return _montarEstado(entrada)
}

/** Valida o comando contra o estado COMPLETO e devolve o que gravar. Lança ErroDominio. */
export function decidir(estado: Estado, comando: Comando, ctx: ContextoDecisao): ResultadoDecisao {
  return _decidir(estado, comando, ctx)
}

/** Visão do episódio filtrada pelo papel do ator (conferência cega aplicada aqui também). */
export function projetarVisao(estado: Estado, ator: Ator, agora: string): EpisodioVisao {
  return _projetarVisao(estado, ator, agora)
}

/** Linha para a lista do dia e para a projeção `episodios.resumo` (sem valores de lente). */
export function resumoDia(estado: Estado, agora: string): EpisodioResumoDia {
  return _resumoDia(estado, agora)
}

/** O que falta neste episódio: de quem depende e desde quando. */
export function pendenciasDoEpisodio(estado: Estado, agora: string): Pendencia[] {
  return pendenciasDoEstado(interno(estado), agora)
}

/** Alertas ativos do episódio (ALERTA e sinalizados), com comunicação e conduta. */
export function alertasDoEpisodio(estado: Estado): Alerta[] {
  return alertasDoEstado(interno(estado))
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
  return _abrirEpisodio(entrada, ctx)
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
  return _cadastrarPaciente(entrada, ctx)
}

/** Etiquetas (texto) a partir dos modelos configuráveis. */
export function gerarEtiquetas(estado: Estado, config: ConfigJornada): Etiqueta[] {
  return _gerarEtiquetas(estado, config)
}

/** Perguntas do quiz (POP §6), sem gabarito, para a página do paciente. */
export function perguntasQuiz(): { numero: number; texto: string; critica: boolean; pontua: boolean; opcoes: { valor: string; rotulo: string }[]; tipo: 'opcao' | 'quem_instila' }[] {
  return _perguntasQuiz()
}

/** Corrige uma tentativa (4 críticas + pelo menos 9 de 11 pontuadas; pergunta 1 conferida contra o olho do episódio). */
export function corrigirQuiz(respostas: Record<number, string>, olhoEpisodio: Olho, quemInstila?: { eu: boolean; nome?: string }): QuizTentativa {
  return _corrigirQuiz(respostas, olhoEpisodio, quemInstila)
}

/** Visão de leitura do dia para o resumo do dia cirúrgico (paciente, olho, lente, ordem, alertas). Só cirurgião e gestora. */
export function visaoLeituraDia(estados: Estado[], ator: Ator, data: string): {
  data: string
  episodios: { ordem: number | null; horario: string | null; paciente: string; nascimento: string; olho: string; lente: { modelo: string; dioptria: string; cilindro: string | null; eixo: number | null; etapa: string } | null; alertas: string[]; dots: string[]; estado: EstadoEpisodio }[]
} {
  return _visaoLeituraDia(estados, ator, data)
}

/** Resumo da véspera para o cirurgião: episódios do dia, alertas sem conduta, lentes não conferidas, termos não assinados. */
export function resumoVespera(estados: Estado[], data: string, agora: string): {
  data: string
  episodios: EpisodioResumoDia[]
  alertasSemConduta: { episodioId: string; paciente: string; alerta: string }[]
  lentesNaoConferidas: { episodioId: string; paciente: string; etapa: string }[]
  termosNaoAssinados: { episodioId: string; paciente: string; status: StatusTcle }[]
} {
  return _resumoVespera(estados, data, agora)
}

/** Indicadores da seção 12 do POP calculados a partir dos episódios do período. */
export function calcularIndicadores(estados: Estado[], de: string, ate: string): Indicador[] {
  return _calcularIndicadores(estados, de, ate)
}

/** Comparação normalizada de lente (sinal, casa decimal, maiúsculas, espaços). */
export function compararLente(a: Partial<ValoresLente>, b: Partial<ValoresLente>, campos: CampoLente[]): { confere: boolean; camposDivergentes: CampoLente[] } {
  return _compararLente(a, b, campos)
}

// Utilitários puros
export function validarCpf(cpf: string): boolean {
  return _validarCpf(cpf)
}
export function normalizarCpf(cpf: string): string {
  return _normalizarCpf(cpf)
}
export function normalizarNome(nome: string): string {
  return _normalizarNome(nome)
}
/** 0..1. Usado só para alertar homônimo/nome parecido; nunca para unir pessoas. */
export function similaridadeNomes(a: string, b: string): number {
  return _similaridadeNomes(a, b)
}
/** '+21,50 D' (sinal sempre explícito, vírgula decimal, duas casas). */
export function formatarDioptria(valor: number): string {
  return _formatarDioptria(valor)
}
/** Data/hora em America/Sao_Paulo para exibição: 'dd/mm/aaaa' e 'dd/mm/aaaa hh:mm'. */
export function formatarData(iso: string): string {
  return _formatarData(iso)
}
export function formatarDataHora(iso: string): string {
  return _formatarDataHora(iso)
}
/** Data local (America/Sao_Paulo) 'aaaa-mm-dd' de um instante ISO. */
export function dataLocal(iso: string): string {
  return _dataLocal(iso)
}
/** Primeiro nome para os avisos (conteúdo mínimo, briefing §7). */
export function primeiroNome(nomeCompleto: string): string {
  return _primeiroNome(nomeCompleto)
}
/** Máscara de telefone para listas: '(44) 9****-**62'. */
export function mascararTelefone(telefone: string): string {
  return _mascararTelefone(telefone)
}
/** Configuração padrão: sem tempos, sem números clínicos; modelos de etiqueta a partir do POP. */
export function configPadrao(): ConfigJornada {
  return _configPadrao()
}

/** Matriz papel × tipo de evento (espelhada na tabela `jornada_cirurgica.permissoes_evento`). */
export function papeisPermitidosParaEvento(tipo: NovoEvento['tipo'], modelo?: ModeloId | null): Papel[] {
  return _papeisPermitidosParaEvento(tipo, modelo)
}

export type { EstadoMensagem, GatilhoAviso }

// ---------------------------------------------------------------------------
// Acréscimos (exports novos; não fazem parte do contrato original)
// ---------------------------------------------------------------------------

export { versoesDosModelos } from './modelos/v1/index.ts'
export { VERSAO_MODELOS_V1, D7, ITENS_ALERGIA, CP1, CP2, D2, ADM, SI, AN, TO, SO, ALTA } from './modelos/ids.ts'
export { linhasMatrizPermissoes, PAPEIS_POR_MODELO, PAPEIS_POR_EVENTO, PAPEIS_LEITURA } from './permissoes.ts'
export { permissoesDoAtor } from './projecao.ts'
export { normalizarModelo, validadePosterior } from './regras/lente.ts'
export { LEGENDA_DOTS, TETO_DOTS, textoDot } from './regras/dots.ts'
export { DEFINICOES_HARD_STOP } from './regras/hardstops.ts'
export { ALERTAS_HS6, ALERTA_GLP1_PRAZO, ALERTA_QUIZ_OLHO, ALERTA_TEACH_BACK, prazoGlp1Cabe } from './regras/alertas.ts'
export { TEXTO_HOMONIMO, TEXTO_NOME_PARECIDO, TEXTO_OLHO_UNICO, textoDeficitCognitivo, textoSegundoOlho } from './regras/identificacao.ts'
export { MODELOS_META, chaveIdempotencia, textoAviso, textoTcleConfirmacao, textoTcleEnvio, textoTcleLembrete } from './mensagens.ts'
export { eventoMaterialAberto, eventoQuizRespondido, MINIMO_ACERTOS, podeResponderQuiz, proximaAcaoQuiz, questoesErradas } from './quiz.ts'
export { previaMateriais, situacaoPaginaPaciente } from './paciente-pagina.ts'
export { preencherModelo } from './etiquetas.ts'
export { corrigirPaciente } from './abertura.ts'
export { ROTULO_ETAPA_LENTE } from './resumos.ts'
export { MODELOS_ETIQUETA_PADRAO, LIMIAR_NOME_PARECIDO_PADRAO } from './config.ts'
export { telefoneValido } from './util/telefone.ts'
export { validarData, validarHora, somarDias, diasEntre, proximoDiaUtil, inicioDoDiaLocal, fimDoDiaLocal, horaLocal } from './util/datas.ts'

/** Catálogo dos hard stops (sem estado): para a interface listar o que existe e como resolver. */
export function catalogoHardStops(): { codigo: string; titulo: string; descricao: string; bloqueia: string[]; resolvivelPor: Papel[]; exigeResolucaoEscrita: boolean; comoResolver: string; fonte: string }[] {
  return DEFS.map((d) => ({
    codigo: d.codigo,
    titulo: d.titulo,
    descricao: d.descricao,
    bloqueia: [...d.bloqueia],
    resolvivelPor: [...d.resolvivelPor],
    exigeResolucaoEscrita: d.exigeResolucaoEscrita,
    comoResolver: d.comoResolver,
    fonte: d.fonte,
  }))
}
