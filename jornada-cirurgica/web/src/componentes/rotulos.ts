// Rótulos de exibição (português do Brasil). Os valores fechados vêm do domínio.
import type { CategoriaQuaseEvento, CausaCancelamento, NeverEvent } from '@dominio/index.ts'
import type {
  CampoLente,
  CodigoHardStop,
  EstadoMensagem,
  EtapaLente,
  GatilhoAviso,
  ModeloId,
  Papel,
  SeveridadePendencia,
  SituacaoBloco,
  StatusTcle,
  TipoContato,
  ViaComunicacao,
} from '@dominio/tipos.ts'
import { ROTULO_PAPEL } from '@dominio/tipos.ts'

export const ROTULO_MODELO: Record<ModeloId, string> = {
  d7: 'D-7: checklist da concierge',
  cp1: 'Lente: checkpoint 1 (chegada)',
  cp2: 'Lente: checkpoint 2 (D-2, independente)',
  d2: 'D-2: confirmações',
  admissao: 'Admissão',
  sign_in: 'Sign In',
  anestesia: 'Anestesia',
  time_out: 'Time Out',
  sign_out: 'Sign Out',
  alta: 'Alta',
}

export const BLOCOS_SALA: readonly ModeloId[] = ['admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta']

export const ROTULO_SITUACAO_BLOCO: Record<SituacaoBloco, string> = {
  bloqueado: 'Bloqueado',
  disponivel: 'Disponível',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
}

export const ROTULO_ETAPA_LENTE: Record<EtapaLente, string> = {
  sem_plano: 'Sem plano registrado',
  plano_registrado: 'Plano registrado; aguardando chegada',
  chegada_conferida: 'Chegada conferida (checkpoint 1)',
  cp2_confere: 'Checkpoint 2 confere',
  quarentena: 'QUARENTENA',
  time_out_confere: 'Leitura do Time Out confere',
}

export const ROTULO_CAMPO_LENTE: Record<CampoLente, string> = {
  olho: 'Olho',
  modelo: 'Modelo',
  dioptria: 'Dioptria',
  cilindro: 'Cilindro',
  eixo: 'Eixo',
}

export const ROTULO_VIA: Record<ViaComunicacao, string> = {
  presencial: 'Presencial',
  telefone: 'Telefone',
  whatsapp: 'WhatsApp',
  painel: 'Pelo painel',
  outro: 'Outra via',
}

export const ROTULO_TIPO_CONTATO: Record<TipoContato, string> = {
  whatsapp_paciente: 'WhatsApp para vídeo e TCLE',
  acompanhante_titular: 'Acompanhante titular do dia da cirurgia',
  acompanhante_reserva: 'Acompanhante reserva',
  familiar_avisos: 'Familiar que recebe os avisos do dia da cirurgia',
  emergencia: 'Contato de emergência',
  cuidador_colirios: 'Quem instila os colírios em casa',
}

export const ORDEM_TIPOS_CONTATO: readonly TipoContato[] = [
  'whatsapp_paciente',
  'acompanhante_titular',
  'acompanhante_reserva',
  'familiar_avisos',
  'emergencia',
  'cuidador_colirios',
]

export const ROTULO_TCLE: Record<StatusTcle, string> = {
  nao_enviado: 'Não enviado',
  enviado: 'Enviado',
  assinado: 'Assinado',
  olho_conferido: 'Assinado, olho do TCLE conferido com a agenda',
}

export const ROTULO_ESTADO_MENSAGEM: Record<EstadoMensagem, string> = {
  ensaio: 'Ensaio (montada, não saiu)',
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviada',
  entregue: 'Entregue',
  falhou: 'Falhou',
  desconhecido: 'Estado desconhecido: reconciliar antes de reenviar',
  cancelado: 'Cancelada',
}

export const ROTULO_GATILHO: Record<GatilhoAviso, string> = {
  admissao_concluida: 'Admissão concluída',
  inicio_cirurgia: 'Início da cirurgia',
  fim_cirurgia: 'Fim da cirurgia',
  alta: 'Alta',
  atraso: 'Atraso (manual)',
  tcle_envio: 'TCLE: envio',
  tcle_lembrete: 'TCLE: lembrete',
  tcle_confirmacao: 'TCLE: confirmação',
  materiais_preparo: 'Materiais de preparo',
}

export function rotuloGatilho(g: string): string {
  return (ROTULO_GATILHO as Record<string, string>)[g] ?? g
}

export const ROTULO_CAUSA: Record<CausaCancelamento, string> = {
  sem_acompanhante: 'Sem acompanhante',
  colirio_nao_usado: 'Colírio não usado',
  medicacao_nao_ajustada: 'Medicação não ajustada',
  olho_vermelho_nao_avisado: 'Olho vermelho não avisado',
  tcle_ausente: 'TCLE ausente',
  lio_indisponivel: 'LIO indisponível',
  outra: 'Outra',
}

export const ROTULO_CATEGORIA_QUASE_EVENTO: Record<CategoriaQuaseEvento, string> = {
  identidade: 'Identidade do paciente',
  olho: 'Olho',
  lio: 'LIO (lente)',
  outro: 'Outro',
}

export const ROTULO_NEVER_EVENT: Record<NeverEvent, string> = {
  olho_errado: 'Sim: olho errado',
  paciente_errado: 'Sim: paciente errado',
  lio_errada: 'Sim: LIO errada implantada',
}

export const ROTULO_TEACH_BACK: Record<'adequado_primeira' | 'apos_reorientacao' | 'inadequado', string> = {
  adequado_primeira: 'Adequado de primeira',
  apos_reorientacao: 'Adequado após reorientação',
  inadequado: 'Inadequado: precisa de conduta (alerta ao cirurgião)',
}

export const ROTULO_SEVERIDADE: Record<SeveridadePendencia, string> = {
  hard_stop: 'HARD STOP',
  alerta: 'ALERTA',
  pendencia: 'Pendência',
}

export const ROTULO_HARD_STOP_CURTO: Record<CodigoHardStop, string> = {
  HS1_DIVERGENCIA_LIO: 'Divergência da LIO',
  HS2_BIOMETRIA_AUSENTE: 'Biometria original ausente',
  HS3_DIVERGENCIA_IDENTIDADE_OLHO: 'Divergência de identidade ou olho',
  HS4_SEM_ACOMPANHANTE: 'Sem acompanhante',
  HS5_TCLE: 'TCLE',
  HS6_SEM_CONDUTA_ALFA_ANTICOAG: 'Sem conduta escrita (α-bloqueador / anticoagulação)',
  HS7_OLHO_VERMELHO: 'Olho vermelho não avaliado',
  HS8_TROCA_LIO_D0: 'Troca de LIO no D0',
  HS9_SITIO_NAO_MARCADO: 'Sítio não marcado',
  HS_LIO_TIME_OUT: 'Divergência no Time Out',
  HS_HOMONIMO_NOME_MAE: 'Homônimo: falta o nome da mãe',
  HS_ORDEM_SIGN_IN: 'Ordem do Sign In',
  HS_LIO_SEM_DUPLA_CONFERENCIA: 'LIO sem dupla conferência',
}

export function rotuloPapel(p: Papel | string): string {
  return (ROTULO_PAPEL as Record<string, string>)[p] ?? p
}

export function rotuloPapeis(papeis: readonly (Papel | string)[]): string {
  if (papeis.length === 0) return '—'
  const r = papeis.map(rotuloPapel)
  if (r.length === 1) return r[0]
  return `${r.slice(0, -1).join(', ')} ou ${r[r.length - 1]}`
}

/** Transição bloqueada por um hard stop, em texto legível. */
export function rotuloTransicao(t: string): string {
  const [tipo, resto] = t.split(':')
  if (!resto) return t
  if (tipo === 'concluir') return `concluir ${ROTULO_MODELO[resto as ModeloId] ?? resto}`
  if (tipo === 'marcar') {
    const [modelo, ...item] = resto.split('.')
    return `marcar item ${item.join('.')} de ${ROTULO_MODELO[modelo as ModeloId] ?? modelo}`
  }
  return t
}
