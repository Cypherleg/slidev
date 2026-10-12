// Tipos do domínio da Jornada Cirúrgica (catarata, OFTA VITTA).
// Código puro: sem dependência de runtime (roda em Deno, Node e navegador).
// Imports relativos sempre com extensão .ts.
//
// Fonte das regras: POP de segurança da catarata v0.4 (rascunho) e briefing v1.
// Toda regra que não estiver no POP ou no briefing é pendência marcada, nunca suposição.

// ---------------------------------------------------------------------------
// Valores fechados
// ---------------------------------------------------------------------------

export type Olho = 'OD' | 'OE'
export const OLHO_EXTENSO: Record<Olho, 'OLHO DIREITO' | 'OLHO ESQUERDO'> = {
  OD: 'OLHO DIREITO',
  OE: 'OLHO ESQUERDO',
}

export type Papel =
  | 'concierge'
  | 'conferente'
  | 'enfermagem'
  | 'circulante'
  | 'anestesista'
  | 'cirurgiao'
  | 'gestora'

export const PAPEIS: readonly Papel[] = [
  'concierge',
  'conferente',
  'enfermagem',
  'circulante',
  'anestesista',
  'cirurgiao',
  'gestora',
] as const

export const ROTULO_PAPEL: Record<Papel, string> = {
  concierge: 'Concierge cirúrgica',
  conferente: 'Segunda conferente',
  enfermagem: 'Enfermagem',
  circulante: 'Circulante',
  anestesista: 'Anestesista',
  cirurgiao: 'Cirurgião',
  gestora: 'Gestora',
}

/** Cada modelo de checklist corresponde a um bloco do episódio. */
export type ModeloId =
  | 'd7' // Checklist da concierge, POP §1 (blocos A a G)
  | 'cp1' // Conferência de LIO, checkpoint 1 (chegada), POP §3
  | 'cp2' // Conferência de LIO, checkpoint 2 (D-2, independente), POP §3
  | 'd2' // Confirmações do D-2 (ligação, TCLE, observações), POP §13 procedimento 5 e §8
  | 'admissao' // POP §9.A
  | 'sign_in' // POP §9.B (+ checkpoint 3 da LIO)
  | 'anestesia' // Configurável; itens do POP: jejum e medicações, monitorização e acesso venoso, liberação da recuperação
  | 'time_out' // POP §9.C (+ checkpoint 3 da LIO)
  | 'sign_out' // POP §9.D
  | 'alta' // POP §10

export const ORDEM_MODELOS: readonly ModeloId[] = [
  'd7',
  'cp1',
  'cp2',
  'd2',
  'admissao',
  'sign_in',
  'anestesia',
  'time_out',
  'sign_out',
  'alta',
] as const

/** Visibilidade de um evento. Base da conferência cega (briefing §6.3, regra 7). */
export type Visibilidade =
  | 'geral' // qualquer membro ativo
  | 'conferencia_1' // valores e marcações do checkpoint 1: concierge, cirurgião, gestora
  | 'conferencia_2' // valores e marcações do checkpoint 2: conferente, cirurgião, gestora

export type EstadoEpisodio =
  | 'd7_em_andamento'
  | 'd7_concluido'
  | 'd2_concluido'
  | 'admitido'
  | 'sign_in_concluido'
  | 'time_out_concluido' // cirurgia iniciada
  | 'sign_out_concluido' // cirurgia terminada, recuperação
  | 'alta'
  | 'suspenso'
  | 'cancelado'

export const ROTULO_ESTADO: Record<EstadoEpisodio, string> = {
  d7_em_andamento: 'D-7 em andamento',
  d7_concluido: 'D-7 concluído',
  d2_concluido: 'D-2 concluído',
  admitido: 'Admitido',
  sign_in_concluido: 'Sign In concluído',
  time_out_concluido: 'Em cirurgia',
  sign_out_concluido: 'Recuperação',
  alta: 'Alta',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

// ---------------------------------------------------------------------------
// Modelos de checklist (versionados; cada episódio guarda a versão usada)
// ---------------------------------------------------------------------------

export type TipoResposta =
  | 'confirmacao' // marcação "conferido" (só existe valor true; item não conferido não é marcado)
  | 'sim_nao' // 'sim' | 'nao'
  | 'opcao' // um valor de `opcoes`
  | 'multipla' // vários valores de `opcoes`
  | 'texto'
  | 'data' // 'aaaa-mm-dd'
  | 'hora' // 'hh:mm' (America/Sao_Paulo)
  | 'numero'
  | 'olho' // 'OD' | 'OE' | 'nao_sabe' (quando `permiteNaoSabe`)
  | 'medicamento' // ValorMedicamento
  | 'alergia' // ValorAlergia
  | 'pessoa' // ValorPessoa

export interface OpcaoItem {
  valor: string
  rotulo: string
}

export interface ItemModelo {
  id: string // estável dentro do modelo, ex.: 'B.alfa_bloqueador'
  texto: string // texto do POP, sem paráfrase desnecessária
  tipo: TipoResposta
  opcoes?: OpcaoItem[]
  permiteNaoSabe?: boolean
  obrigatorio: boolean // "nenhum campo fica em branco" (D-7)
  papeis: Papel[] // quem pode marcar/responder
  /** Texto de apoio exibido ao lado do item (ex.: regra do serviço, exemplos de nomes comerciais). */
  ajuda?: string
  /** Descrição legível da regra de alerta, se houver (a avaliação fica no motor de regras). */
  alerta?: { descricao: string; nivel: NivelAlerta }
  /** Itens que precisam estar marcados antes deste (ordem obrigatória, regra 4). */
  depoisDe?: string[]
  /** Código do hard stop relacionado, se houver. */
  hardStop?: CodigoHardStop
  /** Referência no POP, ex.: 'POP §1.B'. */
  fonte: string
  /** Trecho entre colchetes no POP = decisão pendente. Exibir como pendência, nunca como regra. */
  pendente?: string
}

export interface SecaoModelo {
  id: string // ex.: 'A', 'B'
  titulo: string
  itens: ItemModelo[]
}

export interface ModeloChecklist {
  id: ModeloId
  versao: string // ex.: 'pop-0.4/1'
  titulo: string
  descricao?: string
  /** Papéis que podem concluir o bloco. */
  papeisConclusao: Papel[]
  /** Leitura em voz alta: exige registrar quem leu e quem confirmou (Sign In, Time Out). */
  exigeLeituraEmVozAlta?: boolean
  secoes: SecaoModelo[]
  fonte: string
}

// ---------------------------------------------------------------------------
// Valores de resposta
// ---------------------------------------------------------------------------

export type UsoMedicamento = 'nao' | 'usa' | 'ja_usou'

export interface ValorMedicamento {
  uso: UsoMedicamento
  nomes?: string // nomes comerciais informados
  detalhes?: string // dose, horário, tipo
  // Campos específicos de análogos de GLP-1 e tirzepatida (POP §1.B):
  aplicacao?: 'semanal' | 'diaria'
  ultimaAplicacao?: string // 'aaaa-mm-dd'
  inicioOuAumentoUltimos3Meses?: boolean
  nauseaOuVomito?: boolean
  // Insulina e antidiabéticos: marcar se insulina ou sulfonilureia (dot D)
  insulinaOuSulfonilureia?: boolean
}

export interface ValorAlergia {
  tem: boolean
  reacao?: string // obrigatório quando tem = true
}

export interface ValorPessoa {
  nome: string
  parentesco?: string
  telefone?: string
  observacao?: string
}

export type ValorResposta =
  | true
  | 'sim'
  | 'nao'
  | string
  | number
  | string[]
  | ValorMedicamento
  | ValorAlergia
  | ValorPessoa

// ---------------------------------------------------------------------------
// Eventos (registro que só cresce; correção é novo evento)
// ---------------------------------------------------------------------------

export type TipoEvento =
  | 'paciente.cadastrado'
  | 'paciente.corrigido'
  | 'episodio.aberto'
  | 'episodio.agendado'
  | 'episodio.corrigido'
  | 'checklist.item_respondido'
  | 'bloco.concluido'
  | 'alerta.comunicado'
  | 'alerta.conduta_registrada'
  | 'contato.salvo'
  | 'contato.removido'
  | 'contato.confirmado'
  | 'orientacoes.teach_back'
  | 'lente.plano_registrado' // valores em lente_registros (visibilidade conferencia_1)
  | 'lente.chegada_registrada' // lote, validade, data de chegada (visibilidade conferencia_1)
  | 'lente.cp2_registrado' // valores em lente_registros (visibilidade conferencia_2)
  | 'lente.cp2_resultado' // geral: { confere, camposDivergentes } sem valores
  | 'lente.quarentena_aberta' // geral: { etapa, motivo } sem valores
  | 'lente.quarentena_resolvida' // geral: { resolucao (texto do cirurgião), acao }
  | 'lente.time_out_resultado' // geral: { confere, camposDivergentes }
  | 'lente.troca_d0' // geral: novo ciclo exige novo plano e dupla conferência
  | 'anexo.adicionado'
  | 'tcle.status'
  | 'material.enviado'
  | 'material.aberto'
  | 'quiz.respondido'
  | 'link_paciente.criado'
  | 'etiqueta.copiada'
  | 'hardstop.resolvido'
  | 'intercorrencia.registrada'
  | 'episodio.suspenso'
  | 'episodio.cancelado'
  | 'avisos.atraso_solicitado'
  | 'mensagem.enfileirada'
  | 'quase_evento.registrado'
  | 'membro.alterado'
  | 'config.alterada'
  | 'modelo.publicado'
  | 'material.catalogo_alterado'

export interface Evento {
  id: string
  episodioId: string | null
  pacienteId: string | null
  seq: number | null // sequência por episódio (concorrência otimista)
  tipo: TipoEvento
  dados: Record<string, unknown>
  visibilidade: Visibilidade
  autorId: string
  autorPapel: Papel | 'sistema' | 'paciente'
  sessaoUsuarioId: string | null // quem fez o login no aparelho (pode diferir do autor, via PIN)
  aparelhoId: string | null
  registradoEm: string // ISO 8601 UTC, hora do servidor
  foraDeHora: boolean
  motivoForaDeHora?: string | null
  versaoModelo?: string | null
}

/** Evento ainda não gravado (o servidor define id, seq e registradoEm). */
export type NovoEvento = Omit<Evento, 'id' | 'seq' | 'registradoEm'>

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Membro {
  id: string // auth.users.id
  nome: string
  papeis: Papel[]
  ativo: boolean
}

export interface Paciente {
  id: string
  nomeCompleto: string
  dataNascimento: string // 'aaaa-mm-dd'
  nomeMae: string | null
  prontuario: string | null
  datasighId: string | null
  conferidoDatasigh: boolean
}

export type TipoContato =
  | 'whatsapp_paciente'
  | 'acompanhante_titular'
  | 'acompanhante_reserva'
  | 'familiar_avisos'
  | 'emergencia'
  | 'cuidador_colirios'

export interface Contato {
  id: string
  tipo: TipoContato
  nome: string
  parentesco?: string
  telefone?: string
  /** WhatsApp: quem opera o celular. */
  operaCelular?: string
  /** Anuência do paciente para receber avisos/ver a ficha (LGPD). */
  anuenciaPaciente: boolean
  /** Confirmado por resposta do próprio número antes do primeiro aviso (briefing §7). */
  confirmadoEm?: string | null
  confirmadoPor?: string | null
}

// ---------------------------------------------------------------------------
// Alertas, hard stops, dots, pendências
// ---------------------------------------------------------------------------

export type NivelAlerta =
  | 'alerta' // ALERTA do POP: aviso ao cirurgião no mesmo dia + conduta escrita
  | 'sinalizado' // "registrar e sinalizar": aparece ao cirurgião, sem exigir conduta

export interface Alerta {
  id: string // estável: ex.: 'd7:B.alfa_bloqueador'
  origem: { modelo: ModeloId | 'sistema'; itemId?: string }
  titulo: string
  descricao: string
  nivel: NivelAlerta
  geradoEm: string
  comunicado?: { por: string; porNome: string; em: string; via: ViaComunicacao; cirurgiaoId: string; observacao?: string }
  conduta?: { texto: string; cirurgiaoId: string; cirurgiaoNome: string; em: string }
  /** Alerta deixou de valer porque a resposta que o gerou foi corrigida. */
  inativo?: boolean
}

export type ViaComunicacao = 'presencial' | 'telefone' | 'whatsapp' | 'painel' | 'outro'

export type CodigoHardStop =
  | 'HS1_DIVERGENCIA_LIO' // POP §13.7 item 1 e §3 (quarentena)
  | 'HS2_BIOMETRIA_AUSENTE' // POP §13.7 item 2
  | 'HS3_DIVERGENCIA_IDENTIDADE_OLHO' // POP §13.7 item 3
  | 'HS4_SEM_ACOMPANHANTE' // POP §13.7 item 4 e §8
  | 'HS5_TCLE' // POP §13.7 item 5
  | 'HS6_SEM_CONDUTA_ALFA_ANTICOAG' // POP §13.7 item 6
  | 'HS7_OLHO_VERMELHO' // POP §13.7 item 7
  | 'HS8_TROCA_LIO_D0' // POP §13.7 item 8 e §3
  | 'HS9_SITIO_NAO_MARCADO' // POP §13.7 item 9 (ordem: marcação antes do midriático)
  | 'HS_LIO_TIME_OUT' // POP §3: divergência no Time Out, cirurgia não começa
  | 'HS_HOMONIMO_NOME_MAE' // POP §3 e briefing regra 1: homônimo exige 3º identificador
  | 'HS_ORDEM_SIGN_IN' // briefing regra 4: Sign In antes de midriático, bloqueio ou sedação
  | 'HS_LIO_SEM_DUPLA_CONFERENCIA' // [S] configurável: Time Out sem checkpoint 2 concluído

/** Uma passagem que um hard stop pode bloquear. */
export type Transicao =
  | `concluir:${ModeloId}`
  | `marcar:${ModeloId}.${string}`

export interface HardStop {
  codigo: CodigoHardStop
  titulo: string
  descricao: string
  bloqueia: Transicao[]
  /** Quem tem competência para resolver (briefing regra 3). */
  resolvivelPor: Papel[]
  /** true: exige resolução escrita via `hardstop.resolver`; false: some quando a condição é corrigida. */
  exigeResolucaoEscrita: boolean
  comoResolver: string
  abertoDesde: string
  fonte: string
}

export type LetraDot = 'A' | 'Q' | 'M' | 'I' | 'S' | 'D'

export interface Dot {
  letra: LetraDot
  cor: 'vermelho' | 'amarelo' | 'rosa' | 'azul' | 'laranja' | 'verde'
  rotulo: string // 'Alergia', 'Risco de queda', ...
  motivo: string // o que no registro gerou o dot
}

export type SeveridadePendencia = 'hard_stop' | 'alerta' | 'pendencia'

export interface Pendencia {
  id: string // estável
  episodioId: string
  codigo: string
  descricao: string
  responsavel: Papel[]
  desde: string // ISO
  severidade: SeveridadePendencia
  prazo?: string // ISO, quando houver prazo no POP (ex.: até D-2, até 1 dia útil)
  /** Onde resolver, para a interface navegar: ex.: 'd7.B', 'lente.cp2', 'alertas'. */
  local?: string
}

// ---------------------------------------------------------------------------
// Lente (o que cada papel pode ver é filtrado pelo servidor)
// ---------------------------------------------------------------------------

export type CampoLente = 'olho' | 'modelo' | 'dioptria' | 'cilindro' | 'eixo'

export interface ValoresLente {
  olho: Olho
  modelo: string
  dioptria: number // com sinal; exibir sempre com sinal e duas casas: '+21,50'
  torica: boolean
  cilindro: number | null
  eixo: number | null
}

export interface DadosPlanoLente extends ValoresLente {
  reserva?: { modelo: string; dioptria: number } | null
  alvoRefrativo?: number | null
  dataPedido?: string | null
}

export interface DadosChegadaLente {
  dataChegada: string
  lote: string
  validade: string // 'aaaa-mm-dd' ou 'aaaa-mm'
}

export type EtapaLente =
  | 'sem_plano'
  | 'plano_registrado'
  | 'chegada_conferida' // checkpoint 1 concluído
  | 'cp2_confere' // checkpoint 2 concluído sem divergência
  | 'quarentena'
  | 'time_out_confere'

export interface LenteVisao {
  ciclo: number // 1; incrementa em troca no D0
  etapa: EtapaLente
  /** Presente só para quem pode ver a transcrição do checkpoint 1 (concierge, cirurgião, gestora). */
  plano?: DadosPlanoLente & { registradoPor: string; registradoEm: string }
  chegada?: DadosChegadaLente & { registradoPor: string; registradoEm: string }
  /** Presente só para conferente (autora), cirurgião e gestora. */
  cp2?: ValoresLente & { registradoPor: string; registradoEm: string }
  cp2Resultado?: { confere: boolean; camposDivergentes: CampoLente[]; em: string; porNome: string }
  timeOutResultado?: { confere: boolean; camposDivergentes: CampoLente[]; em: string; porNome: string }
  quarentena?: { aberta: boolean; etapa: 'cp1' | 'cp2' | 'time_out'; motivo: string; desde: string; resolucao?: { texto: string; cirurgiaoNome: string; em: string; acao: 'manter_plano' | 'novo_plano' } }
  fotoPlanoAnexoId?: string | null // visível só para quem pode ver o plano
}

// ---------------------------------------------------------------------------
// TCLE, materiais, quiz, avisos
// ---------------------------------------------------------------------------

export type StatusTcle = 'nao_enviado' | 'enviado' | 'assinado' | 'olho_conferido'

export interface TcleVisao {
  status: StatusTcle
  link?: string | null
  historico: { status: StatusTcle; em: string; porNome: string }[]
}

export interface QuizTentativa {
  em: string
  acertos: number // de 11 pontuadas
  criticasOk: boolean
  olhoInformado: Olho | null
  olhoConfere: boolean | null
  aprovado: boolean
  quemInstila?: { eu: boolean; nome?: string }
}

export interface MateriaisVisao {
  linkCriadoEm?: string | null
  linkExpiraEm?: string | null
  enviados: { materialId: string; titulo: string; versao: number; em: string; estado: EstadoMensagem }[]
  abertoEm?: string | null
  quiz: QuizTentativa[]
  /** Situação derivada para o contato humano (POP §6, "Se reprovar"). */
  contatoHumano?: { motivo: 'reprovacao_dupla' | 'erro_olho' | 'link_nao_aberto_d3' | 'teach_back_inadequado'; desde: string } | null
}

export type EstadoMensagem =
  | 'ensaio' // montada e registrada, não sai (ENVIO_PACIENTES_HABILITADO=false)
  | 'pendente'
  | 'enviando'
  | 'enviado'
  | 'entregue'
  | 'falhou'
  | 'desconhecido' // timeout: reconciliar antes de reenviar
  | 'cancelado'

export type GatilhoAviso =
  | 'admissao_concluida'
  | 'inicio_cirurgia' // Time Out concluído
  | 'fim_cirurgia' // Sign Out concluído
  | 'alta'
  | 'atraso' // só por ação de uma pessoa
  | 'tcle_envio'
  | 'tcle_lembrete'
  | 'tcle_confirmacao'
  | 'materiais_preparo'

export interface MensagemSaida {
  id: string
  episodioId: string
  gatilho: GatilhoAviso
  contatoId: string
  destinoMascarado: string // ex.: '(44) 9****-**62' — nunca exibir o número completo em listas
  texto: string
  modeloMeta: string | null
  estado: EstadoMensagem
  criadoEm: string
  atualizadoEm: string
}

export interface AvisosFamiliaVisao {
  suspensos: boolean
  motivoSuspensao?: string // ex.: 'Intercorrência registrada: falar com a família (cirurgião).'
  mensagens: MensagemSaida[]
}

// ---------------------------------------------------------------------------
// Visão do episódio (o que a API devolve; já filtrada pelo papel do ator)
// ---------------------------------------------------------------------------

export interface RespostaAtual {
  valor: ValorResposta
  observacao?: string | null
  autorId: string
  autorNome: string
  registradoEm: string
  foraDeHora: boolean
  /** Número de respostas anteriores do mesmo item (correções são novos eventos). */
  correcoes: number
}

export type SituacaoBloco = 'bloqueado' | 'disponivel' | 'em_andamento' | 'concluido'

export interface BlocoVisao {
  modelo: ModeloId
  situacao: SituacaoBloco
  /** Itens obrigatórios ainda sem resposta. */
  faltam: string[]
  /** Motivos de bloqueio (hard stops abertos ou bloco anterior não concluído). */
  impedimentos: string[]
  concluido?: { em: string; porId: string; porNome: string; leitorNome?: string; confirmadorNome?: string; foraDeHora: boolean }
}

export interface IdentificacaoVisao {
  homonimoNoDia: boolean
  nomesParecidos: { episodioId: string; nomeCompleto: string }[]
  exigeNomeMae: boolean
  segundoOlho: { primeiroEpisodioId: string; dataPrimeiro: string | null } | null
  alertasExtenso: string[] // 'OLHO ÚNICO', 'HOMÔNIMO NO DIA', 'DÉFICIT COGNITIVO — REPRESENTANTE: nome', '2º OLHO — 1º operado em dd/mm/aaaa'
}

export interface EpisodioVisao {
  episodio: {
    id: string
    olho: Olho
    olhoExtenso: 'OLHO DIREITO' | 'OLHO ESQUERDO'
    estado: EstadoEpisodio
    tipoCirurgia: string
    tipoLente: string
    dataSugerida: string | null
    dataCirurgia: string | null
    horario: string | null // 'hh:mm' local
    ordem: number | null
    cirurgiao: { id: string; nome: string }
    versao: number // para concorrência otimista
    versoesModelos: Record<ModeloId, string>
    abertoEm: string
  }
  paciente: Paciente & { idade: number | null }
  modelos: Record<ModeloId, ModeloChecklist>
  respostas: Partial<Record<ModeloId, Record<string, RespostaAtual>>>
  blocos: Record<ModeloId, BlocoVisao>
  alertas: Alerta[]
  hardStops: HardStop[]
  dots: Dot[]
  identificacao: IdentificacaoVisao
  contatos: Contato[]
  lente: LenteVisao
  tcle: TcleVisao
  materiais: MateriaisVisao
  avisosFamilia: AvisosFamiliaVisao
  pendencias: Pendencia[]
  intercorrencias: { descricao: string; em: string; porNome: string }[]
  teachBack: { resultado: 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'; observacao?: string; em: string; porNome: string } | null
  /** Ações que o ator atual pode executar agora, com o motivo quando não pode. */
  permissoes: Record<string, { permitido: boolean; motivo?: string }>
}

/** Linha da lista do dia (sem valores de lente). */
export interface EpisodioResumoDia {
  episodioId: string
  ordem: number | null
  horario: string | null
  pacienteNome: string
  dataNascimento: string
  olho: Olho
  olhoExtenso: string
  cirurgiaoNome: string
  estado: EstadoEpisodio
  dots: Dot[]
  alertasExtenso: string[]
  hardStopsAbertos: number
  pendencias: number
  alertasSemConduta: number
  homonimoOuParecido: boolean
  etapaLente: EtapaLente
  avisosSuspensos: boolean
}

/** Configurações editáveis pela gestora (nenhum número clínico ou de tempo fixado no código). */
export interface ConfigJornada {
  /** Minutos previstos por etapa para os avisos; ausente = mensagem sem previsão. */
  temposEtapa: Partial<Record<'admissao_ate_inicio' | 'duracao_cirurgia' | 'recuperacao_ate_alta', number>>
  /** Modelos de texto das etiquetas, com marcadores {NOME_COMPLETO}, {NASCIMENTO}, {PRONTUARIO}, {OLHO_EXTENSO}, {CIRURGIA}, {DOTS}, {ALERTAS_EXTENSO}, {NOME_MAE}. */
  modelosEtiqueta: Record<'peito' | 'pulseira' | 'caixa_lente' | 'alertas', string>
  /** Limiar de similaridade de nomes (0 a 1) para "nome parecido". Parâmetro técnico, a validar. */
  limiarNomeParecido: number
  /** [S] Time Out exige checkpoint 2 concluído. Padrão conservador, a confirmar. */
  exigirCp2AntesDoTimeOut: boolean
  /** Itens do bloco de anestesia além dos do POP (definidos com o serviço de anestesia). */
  itensAnestesiaExtras: { id: string; texto: string }[]
  /** Feriados (aaaa-mm-dd) para contagem de dia útil. */
  feriados: string[]
  /** Nome exibido do remetente nas mensagens do TCLE (ex.: nome da concierge). */
  assinaturaConcierge?: string | null
  /** Telefones exibidos ao paciente. */
  telefones: { hospital?: string | null; whatsappConcierge?: string | null; enfermagemForaHorario?: string | null }
}
