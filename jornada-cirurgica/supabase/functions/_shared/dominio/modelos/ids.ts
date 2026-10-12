// Ids estáveis dos itens que o motor de regras consulta. Os modelos v1 usam estas constantes;
// a interface pode usá-las para tratar itens especiais (ver docs/notas-agentes/dominio.md).

/** Versão anterior (antes da revisão de fidelidade ao POP). Episódios dessa versão: só dados fictícios. */
export const VERSAO_MODELOS_V1 = 'pop-0.4/1'
/** Versão atual dos modelos (revisão de fidelidade ao POP, 12/10/2026). */
export const VERSAO_MODELOS = 'pop-0.4/2'

export const D7 = {
  nomeCompleto: 'A.nome_completo',
  dataNascimento: 'A.data_nascimento',
  nomeMae: 'A.nome_mae',
  prontuario: 'A.prontuario',
  cirurgiao: 'A.cirurgiao',
  olhoPaciente: 'A.olho_paciente',
  cirurgiaLio: 'A.cirurgia_lio',
  primeiroSegundo: 'A.primeiro_segundo',
  dataPrimeiroOlho: 'A.data_primeiro_olho',
  olhoAcompanhante: 'A.olho_acompanhante',
  dataPrevista: 'A.data_prevista',

  alfaBloqueador: 'B.alfa_bloqueador',
  anticoagulante: 'B.anticoagulante',
  antiagregante: 'B.antiagregante',
  insulina: 'B.insulina_antidiabeticos',
  glp1: 'B.glp1',
  antiHipertensivos: 'B.anti_hipertensivos',
  corticoide: 'B.corticoide_imunossupressor',
  antipsicoticos: 'B.antipsicoticos',
  colirios: 'B.colirios',
  fitoterapicos: 'B.fitoterapicos',

  diabetes: 'C.diabetes',
  diabetesGlicemia: 'C.diabetes_glicemia',
  hipertensao: 'C.hipertensao',
  cardiopatia: 'C.cardiopatia',
  dpoc: 'C.dpoc',
  renal: 'C.renal',
  fistulaBraco: 'C.fistula_braco',
  mastectomia: 'C.mastectomia',
  mastectomiaLado: 'C.mastectomia_lado',
  avc: 'C.avc_parkinson_tremor',
  demencia: 'C.demencia',
  representante: 'C.representante',
  ansiedade: 'C.ansiedade_claustrofobia',
  surdez: 'C.surdez_idioma',
  glaucoma: 'C.glaucoma',
  uveite: 'C.uveite',
  retinopatia: 'C.retinopatia_dmri',
  descolamento: 'C.descolamento_retina',
  refrativa: 'C.cirurgia_refrativa',
  trauma: 'C.trauma_ocular',
  olhoUnico: 'C.olho_unico',
  olhoUnicoQual: 'C.olho_unico_qual',
  baixaVisaoContralateral: 'C.baixa_visao_contralateral',
  olhoVermelho: 'C.olho_vermelho',
  cirurgiaOcularPrevia: 'C.cirurgia_ocular_previa',

  alergiaMedicamentos: 'D.medicamentos',
  alergiaLatex: 'D.latex',
  alergiaIodo: 'D.iodo_pvpi',
  alergiaAdesivo: 'D.adesivo',
  alergiaAnestesicos: 'D.anestesicos',
  alergiaSulfa: 'D.sulfa',
  nenhumaAlergia: 'D.nenhuma',

  deitar: 'E.deitar_30min',
  mobilidade: 'E.mobilidade',
  compreende: 'E.compreende_comandos',
  quemInstila: 'E.quem_instila',
  quemInstilaPessoa: 'E.quem_instila_pessoa',
  quemInstilaOrientacao: 'E.quem_instila_orientacao',
  acompanhanteTitular: 'E.acompanhante_titular',
  acompanhanteReservaSituacao: 'E.acompanhante_reserva_situacao',
  acompanhanteReserva: 'E.acompanhante_reserva',
  emergencia: 'E.contato_emergencia',
  cidadeTransporte: 'E.cidade_transporte',
  whatsapp: 'E.whatsapp',

  esperaEnxergar: 'F.espera_enxergar',
  semOculos: 'F.sem_oculos',
  atividade: 'F.atividade_visual',

  folhasExame: 'G.folhas_exame',
  olhoExame: 'G.olho_exame',
  pacienteConferiu: 'G.paciente_conferiu',
  alertasComunicados: 'G.alertas_comunicados',
  materiais: 'G.materiais',
  concierge: 'G.concierge',
} as const

/** Itens de alergia (tipo 'alergia') do D-7, na ordem do POP. */
export const ITENS_ALERGIA = [
  D7.alergiaMedicamentos,
  D7.alergiaLatex,
  D7.alergiaIodo,
  D7.alergiaAdesivo,
  D7.alergiaAnestesicos,
  D7.alergiaSulfa,
] as const

export const CP1 = {
  biometria: 'CP1.biometria_original',
  caixa: 'CP1.caixa_integra',
  identidade: 'CP1.identidade',
  olho: 'CP1.olho',
  modelo: 'CP1.modelo',
  dioptria: 'CP1.dioptria',
  torica: 'CP1.torica',
  etiqueta: 'CP1.etiqueta_caixa',
  embalagem: 'CP1.embalagem',
  reserva: 'CP1.reserva',
  nomeMae: 'CP1.nome_mae',
  assinatura: 'CP1.assinatura',
} as const

export const CP2 = {
  biometria: 'CP2.biometria_original',
  identidade: 'CP2.identidade',
  olho: 'CP2.olho',
  colunaModelo: 'CP2.coluna_modelo',
  validade: 'CP2.validade_integridade',
  reserva: 'CP2.reserva',
  plausibilidade: 'CP2.plausibilidade',
  nomeMae: 'CP2.nome_mae',
  assinatura: 'CP2.assinatura',
} as const

export const D2 = {
  presenca: 'D2.presenca',
  acompanhanteConfirmado: 'D2.acompanhante_confirmado',
  acompanhante: 'D2.acompanhante',
  colirios: 'D2.colirios',
  olhoVermelho: 'D2.olho_vermelho',
  mudancaMedicacao: 'D2.mudanca_medicacao',
  mudancaClasses: 'D2.mudanca_classes',
  olhoUnicoConversa: 'D2.olho_unico_conversa',
  tcle: 'D2.tcle',
  quemLigou: 'D2.quem_ligou',
  observacoes: 'D2.observacoes',
} as const

export const ADM = {
  identificacao: 'A.identificacao',
  acompanhantePresente: 'A.acompanhante_presente',
  acompanhante: 'A.acompanhante',
  pulseira: 'A.pulseira',
  pulseiraBraco: 'A.pulseira_braco',
  pulseirasOutras: 'A.pulseiras_outras',
  etiquetaPeito: 'A.etiqueta_peito',
  mudouRemedio: 'A.mudou_remedio',
  mudouClasses: 'A.mudou_classes',
  usaGlp1: 'A.usa_glp1',
  glp1UltimaDose: 'A.glp1_ultima_dose',
  alergias: 'A.alergias_reconfirmadas',
  /** Mantido por compatibilidade: hoje aponta para "alergias reconfirmadas". */
  alergiasDots: 'A.alergias_reconfirmadas',
  alergiaNova: 'A.alergia_nova',
  dotsColados: 'A.dots_colados',
  olhoVermelho: 'A.olho_vermelho',
  coliriosPre: 'A.colirios_pre',
  jejum: 'A.jejum_medicacoes',
  pa: 'A.pa',
  glicemia: 'A.glicemia_capilar',
  /** "TCLE assinado no prontuário" (HS5). Antes da versão pop-0.4/2 era o item único 'A.tcle'. */
  tcle: 'A.tcle_assinado',
  tcleOlho: 'A.tcle_olho',
  nomeMae: 'A.nome_mae',
} as const

/** Ids de versões anteriores ainda reconhecidos pelas regras. */
export const ADM_LEGADO = { tcle: 'A.tcle' } as const

export const SI = {
  identificacao: 'B.identificacao_ativa',
  consentimento: 'B.consentimento',
  marcacao: 'B.marcacao_sitio',
  toricaMarcacao: 'B.torica_marcacao',
  midriatico: 'B.midriatico',
  condutaAlertas: 'B.conduta_alertas',
  posicionamento: 'B.posicionamento',
  monitorizacao: 'B.monitorizacao_acesso',
  salaBiometria: 'B.sala_biometria_plano',
  salaLio: 'B.sala_lio_reserva',
  facoMicroscopio: 'B.faco_microscopio',
  esterilizacao: 'B.esterilizacao',
  dots: 'B.dots_conferidos',
  liosDoDia: 'CP3.lios_do_dia',
  nomeMae: 'B.nome_mae',
} as const

export const AN = {
  jejum: 'AN.jejum_medicacoes',
  monitorizacao: 'AN.monitorizacao_acesso',
  liberacao: 'AN.liberacao_recuperacao',
} as const

export const TO = {
  equipe: 'C.equipe_apresentada',
  paciente: 'C.paciente_confirma',
  marca: 'C.marca_visivel',
  procedimento: 'C.procedimento',
  olhoUnicoPreceptor: 'C.olho_unico_preceptor',
  mesaSoLio: 'CP3.mesa_so_lio_do_paciente',
  readBack: 'C.read_back',
  verbalizados: 'C.alergias_alfa_anticoag_verbalizados',
  antissepsia: 'C.antissepsia_profilaxia',
  dificuldades: 'C.dificuldades_materiais',
  preocupacao: 'C.preocupacao',
  nomeMae: 'C.nome_mae',
} as const

export const SO = {
  procedimentoOlho: 'D.procedimento_olho',
  etiquetasLio: 'D.etiquetas_lio',
  intercorrencias: 'D.intercorrencias',
  lioSulco: 'CP3.lio_sulco_reserva',
  contagem: 'D.contagem',
  equipamento: 'D.equipamento',
  prescricao: 'D.prescricao_protetor_orientacoes',
  assinaturaCirculante: 'D.assinatura_circulante',
  assinaturaCirurgiao: 'D.assinatura_cirurgiao',
  assinaturaAnestesista: 'D.assinatura_anestesista',
} as const

export const ALTA = {
  orientado: 'CRIT.orientado',
  sinaisVitais: 'CRIT.sinais_vitais',
  semNausea: 'CRIT.sem_nausea_vomito',
  respiracao: 'CRIT.sem_dificuldade_respiratoria',
  liquidos: 'CRIT.ingere_liquidos',
  locomocao: 'CRIT.locomocao',
  sangramento: 'CRIT.sangramento',
  dor: 'CRIT.sem_dor_importante',
  urinaria: 'CRIT.sem_retencao_urinaria',
  altaMedica: 'ALTA.alta_medica',
  acompanhante: 'ALTA.acompanhante_presente',
  teachBack: 'ALTA.teach_back',
  quemInstila: 'ALTA.quem_instila',
  primeiraInstilacao: 'ALTA.primeira_instilacao',
  acessoPulseira: 'ALTA.acesso_pulseira_retirados',
  olhoUnicoApoio: 'ALTA.olho_unico_apoio_domiciliar',
  olhoUnicoLigacao: 'ALTA.olho_unico_ligacao_noite',
  d1Data: 'RET.d1_data',
  d1Hora: 'RET.d1_hora',
  d15Data: 'RET.d15_data',
  d15Hora: 'RET.d15_hora',
  local: 'RET.local',
  docOrientacoes: 'DOC.orientacoes',
  docCartaoColirios: 'DOC.cartao_colirios',
  docReceita: 'DOC.receita',
  docCartaoLio: 'DOC.cartao_lio',
  docRetornos: 'DOC.retornos',
  docTelefones: 'DOC.telefones',
  docAtestado: 'DOC.atestado',
} as const

/** Classes da lista crítica de medicamentos (POP §1.B), na ordem do POP. */
export const CLASSES_MEDICAMENTO = [
  { classe: 'alfa_bloqueador', itemD7: D7.alfaBloqueador, rotulo: 'α1-bloqueador' },
  { classe: 'anticoagulante', itemD7: D7.anticoagulante, rotulo: 'Anticoagulante' },
  { classe: 'antiagregante', itemD7: D7.antiagregante, rotulo: 'Antiagregante' },
  { classe: 'insulina_antidiabeticos', itemD7: D7.insulina, rotulo: 'Insulina e antidiabéticos' },
  { classe: 'glp1', itemD7: D7.glp1, rotulo: 'Análogo de GLP-1 ou tirzepatida' },
  { classe: 'anti_hipertensivos', itemD7: D7.antiHipertensivos, rotulo: 'Anti-hipertensivos' },
  { classe: 'corticoide_imunossupressor', itemD7: D7.corticoide, rotulo: 'Corticoide sistêmico ou imunossupressor' },
  { classe: 'antipsicoticos', itemD7: D7.antipsicoticos, rotulo: 'Antipsicóticos e psicotrópicos' },
  { classe: 'colirios', itemD7: D7.colirios, rotulo: 'Colírios em uso' },
  { classe: 'fitoterapicos', itemD7: D7.fitoterapicos, rotulo: 'Fitoterápicos e suplementos' },
] as const

export type ClasseMedicamento = (typeof CLASSES_MEDICAMENTO)[number]['classe']

/** Item de medicamento da classe registrado no D-2 (mudança de medicação). */
export const medicamentoD2 = (classe: ClasseMedicamento): string => `D2.med.${classe}`
/** Item de medicamento da classe registrado na admissão (mudou remédio nos últimos 7 dias). */
export const medicamentoAdmissao = (classe: ClasseMedicamento): string => `A.med.${classe}`

/** Referência entre modelos para `exigidoQuando`: itens que só valem com OLHO ÚNICO (POP §11). */
export const CONDICAO_OLHO_UNICO = { itemId: `d7:${D7.olhoUnicoQual}`, valores: ['olho_unico'] }
