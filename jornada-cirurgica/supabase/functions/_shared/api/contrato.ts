// Contrato HTTP entre a interface (web/) e a Edge Function `jornada-cirurgica`.
// Transporte: POST {API_BASE}/jornada-cirurgica  corpo: { acao, dados }
// Cabeçalhos: Authorization: Bearer <JWT da sessão Supabase>
//             x-jornada-aparelho: <uuid do aparelho, gerado e guardado no navegador>
//             x-jornada-ator: <token curto obtido por PIN> (opcional; troca rápida de usuário)
// Resposta:   200 { ok: true, dados }  |  4xx/5xx { ok: false, erro: { codigo, mensagem, detalhes? } }
// Mensagens de erro nunca contêm dados de paciente.
//
// Página do paciente (sem login): POST {API_BASE}/jornada-paciente  corpo: { acao, token, dados }

import type {
  Alerta,
  CausaCancelamento,
  CodigoHardStop,
  ConfigJornada,
  Contato,
  DadosChegadaLente,
  DadosPlanoLente,
  EpisodioResumoDia,
  EpisodioVisao,
  Etiqueta,
  Indicador,
  LeituraTimeOut,
  MaterialCatalogo,
  MensagemSaida,
  ModeloChecklist,
  ModeloId,
  Olho,
  Papel,
  Pendencia,
  QuizTentativa,
  StatusTcle,
  TipoEtiqueta,
  ValoresLente,
  ValorResposta,
  ViaComunicacao,
} from '../dominio/index.ts'

export type CodigoErroApi =
  | 'nao_autenticado' // 401
  | 'sem_permissao' // 403
  | 'mfa_exigido' // 403: cirurgião e gestora precisam de segundo fator (quando habilitado)
  | 'nao_encontrado' // 404
  | 'validacao' // 400
  | 'conflito_versao' // 409: o episódio mudou; recarregar
  | 'hard_stop' // 409: detalhes.hardStops
  | 'ordem' // 409
  | 'conferencia_cega' // 403
  | 'limite_taxa' // 429
  | 'indisponivel' // 503 (nenhuma ação externa foi disparada)

export interface ErroApi {
  codigo: CodigoErroApi
  mensagem: string
  detalhes?: Record<string, unknown>
}

export type RespostaApi<T> = { ok: true; dados: T } | { ok: false; erro: ErroApi }

export interface SessaoDados {
  membro: { id: string; nome: string; papeis: Papel[]; temPin: boolean }
  ator: { id: string; nome: string; papeis: Papel[]; expiraEm: string } | null
  modoEnvio: 'ensaio' | 'real'
  ambiente: 'desenvolvimento' | 'homologacao' | 'producao'
  mfaExigidoPara: Papel[]
  aal: 'aal1' | 'aal2'
}

export interface ResultadoBuscaCpf {
  datasigh: {
    status: 'encontrado' | 'nao_encontrado' | 'indisponivel' | 'nao_configurado'
    /** Só os campos que a API devolveu. */
    campos?: { datasighId?: string; nomeCompleto?: string; dataNascimento?: string; prontuario?: string; telefones?: string[] }
  }
  /** Paciente já cadastrado neste painel (por HMAC do CPF ou id do Datasigh; nunca por nome ou telefone). */
  pacienteExistente: null | {
    id: string
    nomeCompleto: string
    dataNascimento: string
    episodios: { id: string; olho: Olho; estado: string; dataCirurgia: string | null }[]
  }
}

/** Ações da equipe. `E` = entrada, `S` = saída. Toda ação que muda um episódio recebe `versao` e devolve a visão atualizada. */
export interface AcoesEquipe {
  'sessao': { E: Record<string, never>; S: SessaoDados }
  'ator.pin': { E: { membroId: string; pin: string }; S: { token: string; expiraEm: string; ator: { id: string; nome: string; papeis: Papel[] } } }
  /**
   * Confirmação da leitura em voz alta (Sign In, Time Out): PIN de quem confirmou → token de finalidade
   * própria, preso ao episódio, ao bloco, à sessão e ao aparelho, curto e de uso único. Só vale em
   * `bloco.concluir.confirmadorToken`; nunca como `x-jornada-ator`.
   */
  'ator.confirmacao': {
    E: { membroId: string; pin: string; episodioId: string; modelo: ModeloId }
    S: { token: string; expiraEm: string; ator: { id: string; nome: string; papeis: Papel[] } }
  }
  'ator.encerrar': { E: Record<string, never>; S: { ok: true } }
  'membro.definir_pin': { E: { pinNovo: string; pinAtual?: string | null }; S: { ok: true } }
  'membros.ativos': { E: { papel?: Papel }; S: { id: string; nome: string; papeis: Papel[] }[] }

  'paciente.buscar_cpf': { E: { cpf: string }; S: ResultadoBuscaCpf }
  'paciente.cadastrar': {
    E: { cpf: string | null; datasighId: string | null; nomeCompleto: string; dataNascimento: string; nomeMae: string | null; prontuario: string | null; conferidoDatasigh: boolean; documentoConferido: boolean }
    S: { pacienteId: string }
  }
  'paciente.corrigir': { E: { pacienteId: string; campo: 'nomeCompleto' | 'dataNascimento' | 'nomeMae' | 'prontuario'; valor: string | null; motivo: string }; S: { ok: true } }

  'episodio.abrir': {
    E: { pacienteId: string; olho: Olho; cirurgiaoId: string; tipoCirurgia: string; tipoLente: string; dataSugerida: string | null }
    S: { episodioId: string; avisos: string[] }
  }
  'episodio.obter': { E: { episodioId: string }; S: EpisodioVisao }
  'episodio.agendar': { E: { episodioId: string; versao: number; dataCirurgia: string | null; horario?: string | null; ordem?: number | null }; S: EpisodioVisao }
  'checklist.responder': {
    E: { episodioId: string; versao: number; modelo: ModeloId; respostas: { itemId: string; valor: ValorResposta; observacao?: string | null }[] }
    S: EpisodioVisao
  }
  /**
   * Sign In e Time Out: `confirmadorToken` = token de `ator.confirmacao` (PIN de quem confirmou a leitura
   * em voz alta). `leitorId`, quando enviado, tem de ser o próprio ator (quem leu é quem conclui).
   */
  'bloco.concluir': { E: { episodioId: string; versao: number; modelo: ModeloId; leitorId?: string | null; confirmadorToken?: string | null }; S: EpisodioVisao }
  'alerta.comunicar': { E: { episodioId: string; versao: number; alertaId: string; via: ViaComunicacao; cirurgiaoId: string; observacao?: string | null }; S: EpisodioVisao }
  'alerta.conduta': { E: { episodioId: string; versao: number; alertaId: string; conduta: string }; S: EpisodioVisao }
  'contato.salvar': { E: { episodioId: string; versao: number; contato: Omit<Contato, 'id' | 'confirmadoEm' | 'confirmadoPor'> & { id?: string } }; S: EpisodioVisao }
  'contato.remover': { E: { episodioId: string; versao: number; contatoId: string }; S: EpisodioVisao }
  'contato.confirmar': { E: { episodioId: string; versao: number; contatoId: string }; S: EpisodioVisao }
  'orientacoes.teach_back': { E: { episodioId: string; versao: number; resultado: 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'; observacao?: string | null }; S: EpisodioVisao }

  'lente.plano': { E: { episodioId: string; versao: number; dados: DadosPlanoLente }; S: EpisodioVisao }
  'lente.chegada': { E: { episodioId: string; versao: number; dados: DadosChegadaLente }; S: EpisodioVisao }
  /** Conferência cega: a resposta nunca traz os valores do checkpoint 1. */
  'lente.cp2': { E: { episodioId: string; versao: number; valores: ValoresLente }; S: EpisodioVisao }
  'lente.time_out': { E: { episodioId: string; versao: number; leitura: LeituraTimeOut }; S: EpisodioVisao }
  'lente.resolver_quarentena': { E: { episodioId: string; versao: number; resolucao: string; acao: 'manter_plano' | 'novo_plano' }; S: EpisodioVisao }
  'lente.troca_d0': { E: { episodioId: string; versao: number; motivo: string }; S: EpisodioVisao }

  'anexo.enviar': { E: { episodioId: string; versao: number; tipo: 'foto_plano'; contentType: 'image/jpeg' | 'image/png'; base64: string }; S: EpisodioVisao }
  'anexo.url': { E: { episodioId: string; anexoId: string }; S: { url: string; expiraEm: string } }

  'tcle.status': { E: { episodioId: string; versao: number; status: Exclude<StatusTcle, 'nao_enviado'>; link?: string | null }; S: EpisodioVisao }
  /** Mostra o pacote (textos e destinatários) ANTES de enviar. Não grava nada. */
  'materiais.previa': {
    E: { episodioId: string }
    /** `avisos`: o que o domínio informa sem impedir o envio (ex.: TCLE retido até realinhar a expectativa). */
    S: { mensagens: { gatilho: string; destinoMascarado: string; texto: string }[]; materiais: MaterialCatalogo[]; modoEnvio: 'ensaio' | 'real'; impedimentos: string[]; avisos: string[] }
  }
  'materiais.enviar': { E: { episodioId: string; versao: number }; S: EpisodioVisao }

  'hardstop.resolver': { E: { episodioId: string; versao: number; codigo: CodigoHardStop; resolucao: string }; S: EpisodioVisao }
  /** `neverEvent` (opcional): olho, paciente ou LIO errados — indicador 5 do POP. */
  'intercorrencia.registrar': { E: { episodioId: string; versao: number; descricao: string; neverEvent?: 'olho_errado' | 'paciente_errado' | 'lio_errada' | null }; S: EpisodioVisao }
  'episodio.suspender': { E: { episodioId: string; versao: number; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }; S: EpisodioVisao }
  'episodio.cancelar': { E: { episodioId: string; versao: number; motivo: string; causa: CausaCancelamento | null; evitavel: boolean | null }; S: EpisodioVisao }
  'avisos.atraso': { E: { episodioId: string; versao: number; minutos: number | null }; S: EpisodioVisao }
  /** `categoria` (opcional): o indicador 4 conta só identidade, olho e LIO. */
  'quase_evento.registrar': {
    E: { episodioId: string; versao: number; etapa: 'chegada' | 'd2' | 'd0'; descricao: string; categoria?: 'identidade' | 'olho' | 'lio' | 'outro' | null }
    S: EpisodioVisao
  }

  'etiquetas.gerar': { E: { episodioId: string }; S: Etiqueta[] }
  'etiqueta.copiada': { E: { episodioId: string; versao: number; etiqueta: TipoEtiqueta }; S: { ok: true } }

  'dia.lista': { E: { data: string }; S: EpisodioResumoDia[] }
  'dia.visao_leitura': { E: { data: string }; S: ReturnType<typeof import('../dominio/index.ts').visaoLeituraDia> }
  'episodios.buscar': { E: { termo?: string; estado?: string; de?: string; ate?: string }; S: EpisodioResumoDia[] }
  'pendencias.listar': { E: { data?: string | null; papel?: Papel | null }; S: (Pendencia & { pacienteNome: string; olhoExtenso: string })[] }
  'resumo.vespera': { E: { data: string }; S: ReturnType<typeof import('../dominio/index.ts').resumoVespera> }
  'indicadores.calcular': { E: { de: string; ate: string }; S: Indicador[] }
  'mensagens.listar': { E: { episodioId?: string; data?: string }; S: MensagemSaida[] }
  'alertas.abertos': { E: Record<string, never>; S: (Alerta & { episodioId: string; pacienteNome: string })[] }

  // Gestão (gestora)
  'membros.listar': { E: Record<string, never>; S: { id: string | null; email: string; nome: string; papeis: Papel[]; ativo: boolean; vinculado: boolean; temPin: boolean }[] }
  'membros.convidar': { E: { email: string; nome: string; papeis: Papel[] }; S: { ok: true } }
  'membros.atualizar': { E: { email: string; nome?: string; papeis?: Papel[]; ativo?: boolean }; S: { ok: true } }
  'membros.resetar_pin': { E: { membroId: string }; S: { ok: true } }
  'modelos.listar': { E: Record<string, never>; S: { id: ModeloId; versao: string; publicadoEm: string; ativo: boolean }[] }
  'modelos.obter': { E: { id: ModeloId; versao?: string }; S: ModeloChecklist }
  'modelos.publicar': { E: { modelo: ModeloChecklist }; S: { ok: true; versao: string } }
  'materiais.listar': { E: Record<string, never>; S: MaterialCatalogo[] }
  'materiais.salvar': { E: { material: Omit<MaterialCatalogo, 'id' | 'versao'> & { id?: string } }; S: MaterialCatalogo }
  'config.obter': { E: Record<string, never>; S: ConfigJornada }
  'config.salvar': { E: { config: Partial<ConfigJornada> }; S: ConfigJornada }
}

export type AcaoEquipe = keyof AcoesEquipe

/** Ações da página do paciente (token no corpo; sem login). */
export interface AcoesPaciente {
  'pagina.obter': {
    E: Record<string, never>
    S: {
      primeiroNome: string
      /** Não exibe o olho: a pergunta 1 do quiz confere o olho contra a agenda. */
      materiais: { id: string; titulo: string; tipo: MaterialCatalogo['tipo']; url: string | null; conteudo: string | null }[]
      tcleLink: string | null
      quiz: { numero: number; texto: string; critica: boolean; pontua: boolean; opcoes: { valor: string; rotulo: string }[]; tipo: 'opcao' | 'quem_instila' }[]
      tentativas: number
      podeResponder: boolean
      ultimaTentativa: Pick<QuizTentativa, 'aprovado' | 'em'> | null
      telefones: ConfigJornada['telefones']
    }
  }
  'material.visualizado': { E: { materialId: string }; S: { ok: true } }
  'quiz.responder': {
    E: { respostas: Record<number, string>; quemInstila?: { eu: boolean; nome?: string } }
    S: { aprovado: boolean; proximaAcao: 'concluido' | 'rever_video_e_tentar_de_novo' | 'aguardar_contato_da_equipe' }
  }
}

export type AcaoPaciente = keyof AcoesPaciente
