// Rótulos de exibição (português do Brasil) para valores fechados do domínio.

import type { MaterialCatalogo } from '@dominio/index.ts'
import type {
  EstadoMensagem,
  EtapaLente,
  GatilhoAviso,
  ModeloId,
  Papel,
  SeveridadePendencia,
  SituacaoBloco,
  StatusTcle,
  TipoContato,
  TipoResposta,
  ViaComunicacao,
} from '@dominio/tipos.ts'
import { ROTULO_PAPEL } from '@dominio/tipos.ts'

export const ROTULO_MODELO: Record<ModeloId, string> = {
  d7: 'D-7: checklist da concierge',
  cp1: 'Checkpoint 1 da LIO (chegada)',
  cp2: 'Checkpoint 2 da LIO (D-2, independente)',
  d2: 'Confirmações do D-2',
  admissao: 'Admissão',
  sign_in: 'Sign In',
  anestesia: 'Anestesia',
  time_out: 'Time Out',
  sign_out: 'Sign Out',
  alta: 'Alta',
}

export const ROTULO_ETAPA_LENTE: Record<EtapaLente, string> = {
  sem_plano: 'Sem plano registrado',
  plano_registrado: 'Plano registrado, chegada não conferida',
  chegada_conferida: 'Checkpoint 1 concluído, falta o checkpoint 2',
  cp2_confere: 'Checkpoint 2 confere',
  quarentena: 'QUARENTENA',
  time_out_confere: 'Conferida no Time Out',
}

export const ROTULO_STATUS_TCLE: Record<StatusTcle, string> = {
  nao_enviado: 'Não enviado',
  enviado: 'Enviado, não assinado',
  assinado: 'Assinado, olho não conferido',
  olho_conferido: 'Assinado e olho conferido',
}

export const ROTULO_ESTADO_MENSAGEM: Record<EstadoMensagem, string> = {
  ensaio: 'Ensaio (não sai)',
  pendente: 'Pendente',
  enviando: 'Enviando',
  enviado: 'Enviado',
  entregue: 'Entregue',
  falhou: 'Falhou',
  desconhecido: 'Desconhecido: reconciliar antes de reenviar',
  cancelado: 'Cancelado',
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

export const ROTULO_SEVERIDADE: Record<SeveridadePendencia, string> = {
  hard_stop: 'HARD STOP',
  alerta: 'ALERTA',
  pendencia: 'Pendência',
}

export const ORDEM_SEVERIDADE: Record<SeveridadePendencia, number> = { hard_stop: 0, alerta: 1, pendencia: 2 }

export const ROTULO_SITUACAO_BLOCO: Record<SituacaoBloco, string> = {
  bloqueado: 'Bloqueado',
  disponivel: 'Disponível',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
}

export const ROTULO_VIA: Record<ViaComunicacao, string> = {
  presencial: 'presencial',
  telefone: 'telefone',
  whatsapp: 'WhatsApp',
  painel: 'painel',
  outro: 'outra via',
}

export const ROTULO_TIPO_CONTATO: Record<TipoContato, string> = {
  whatsapp_paciente: 'WhatsApp do paciente',
  acompanhante_titular: 'Acompanhante titular',
  acompanhante_reserva: 'Acompanhante reserva',
  familiar_avisos: 'Familiar que recebe os avisos',
  emergencia: 'Contato de emergência',
  cuidador_colirios: 'Quem instila os colírios',
}

export const ROTULO_TIPO_RESPOSTA: Record<TipoResposta, string> = {
  confirmacao: 'Confirmação (conferido)',
  sim_nao: 'Sim / Não',
  opcao: 'Uma opção',
  multipla: 'Várias opções',
  texto: 'Texto',
  data: 'Data',
  hora: 'Hora',
  numero: 'Número',
  olho: 'Olho',
  medicamento: 'Medicamento',
  alergia: 'Alergia',
  pessoa: 'Pessoa',
}

export const ROTULO_TIPO_MATERIAL: Record<MaterialCatalogo['tipo'], string> = {
  video: 'Vídeo de preparo',
  texto: 'Orientação escrita',
  video_tcle: 'Vídeo do TCLE',
  link_tcle: 'Link de assinatura do TCLE',
  outro: 'Outro',
}

export const ROTULO_MOMENTO: Record<MaterialCatalogo['momento'], string> = {
  d7: 'D-7 (dia dos exames)',
  d3: 'D-3',
  d2: 'D-2',
  d1: 'D-1 (véspera)',
  d0: 'D0 (dia da cirurgia)',
  alta: 'Alta',
}

export const ROTULO_PUBLICO: Record<MaterialCatalogo['publico'], string> = {
  paciente: 'Paciente',
  cuidador: 'Cuidador',
  familiar: 'Familiar',
}

export function rotulosPapeis(papeis: readonly Papel[] | undefined | null): string {
  if (!papeis || papeis.length === 0) return '—'
  return papeis.map(p => ROTULO_PAPEL[p] ?? p).join(', ')
}

/** Rótulo do valor quando ele pertence ao conjunto; senão, o próprio valor. */
export function rotuloDe<K extends string>(mapa: Record<K, string>, valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  return (mapa as Record<string, string>)[valor] ?? valor
}
