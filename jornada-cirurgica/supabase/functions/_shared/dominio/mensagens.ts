// Avisos ao paciente e à família (briefing §7) e mensagens do TCLE (textos aprovados, EXATOS).
// Conteúdo mínimo dos avisos do D0: primeiro nome, etapa, horário e previsão — nunca olho, diagnóstico
// ou detalhe clínico. As mensagens do TCLE citam o olho porque o texto aprovado cita.
// Sem tempo configurado em `config.temposEtapa`, a frase da previsão é removida.

import type { ContextoDecisao, NovaMensagem } from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import type { Contato, GatilhoAviso, Olho } from './tipos.ts'
import { formatarData, horaLocal } from './util/datas.ts'
import { primeiroNome } from './util/texto.ts'
import { digitosTelefone, telefoneValido } from './util/telefone.ts'
import type { EstadoInterno } from './estado/tipos.ts'
import { DEFINICAO_POR_CODIGO, hardStopsQueSuspendemAvisos } from './regras/hardstops.ts'

/**
 * Nomes sugeridos dos modelos na Meta (fora da janela de 24 h exige modelo aprovado).
 * PENDÊNCIA: o cadastro e a aprovação na Meta são feitos pela equipe; os nomes podem mudar.
 */
export const MODELOS_META: Record<string, string> = {
  admissao_concluida: 'jornada_admissao_v1',
  admissao_concluida_sem_previsao: 'jornada_admissao_sem_previsao_v1',
  inicio_cirurgia: 'jornada_inicio_cirurgia_v1',
  inicio_cirurgia_sem_previsao: 'jornada_inicio_cirurgia_sem_previsao_v1',
  fim_cirurgia: 'jornada_fim_cirurgia_v1',
  fim_cirurgia_sem_previsao: 'jornada_fim_cirurgia_sem_previsao_v1',
  alta: 'jornada_alta_v1',
  atraso: 'jornada_atraso_v1',
  atraso_sem_previsao: 'jornada_atraso_sem_previsao_v1',
  tcle_envio: 'jornada_tcle_envio_v1',
  tcle_lembrete: 'jornada_tcle_lembrete_v1',
  tcle_confirmacao: 'jornada_tcle_confirmacao_v1',
}

export interface TextoMensagem {
  texto: string
  modeloMeta: string | null
  parametros: Record<string, string>
}

const temMinutos = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Texto de um aviso do D0 (briefing §7). `minutos` ausente = sem a frase da previsão. */
export function textoAviso(
  gatilho: Extract<GatilhoAviso, 'admissao_concluida' | 'inicio_cirurgia' | 'fim_cirurgia' | 'alta' | 'atraso'>,
  dados: { primeiroNome: string; hora?: string | null; minutos?: number | null },
): TextoMensagem {
  const nome = dados.primeiroNome
  const n = dados.minutos
  const com = temMinutos(n)
  const p: Record<string, string> = { primeiro_nome: nome }
  if (com) p.minutos = String(Math.round(n))
  switch (gatilho) {
    case 'admissao_concluida':
      return {
        texto: com
          ? `Olá. ${nome} já está com a equipe do OFTA VITTA, em preparo para a cirurgia. Previsão para o início: cerca de ${Math.round(n)} minutos. Avisaremos quando começar.`
          : `Olá. ${nome} já está com a equipe do OFTA VITTA, em preparo para a cirurgia. Avisaremos quando começar.`,
        modeloMeta: MODELOS_META[com ? 'admissao_concluida' : 'admissao_concluida_sem_previsao'],
        parametros: p,
      }
    case 'inicio_cirurgia':
      p.hora = dados.hora ?? ''
      return {
        texto: com
          ? `A cirurgia de ${nome} começou às ${p.hora}. Duração prevista: cerca de ${Math.round(n)} minutos. Avisaremos quando terminar.`
          : `A cirurgia de ${nome} começou às ${p.hora}. Avisaremos quando terminar.`,
        modeloMeta: MODELOS_META[com ? 'inicio_cirurgia' : 'inicio_cirurgia_sem_previsao'],
        parametros: p,
      }
    case 'fim_cirurgia':
      p.hora = dados.hora ?? ''
      return {
        texto: com
          ? `A cirurgia de ${nome} terminou às ${p.hora}. Agora é a recuperação, com alta prevista em cerca de ${Math.round(n)} minutos. A equipe chama o acompanhante para as orientações.`
          : `A cirurgia de ${nome} terminou às ${p.hora}. Agora é a recuperação. A equipe chama o acompanhante para as orientações.`,
        modeloMeta: MODELOS_META[com ? 'fim_cirurgia' : 'fim_cirurgia_sem_previsao'],
        parametros: p,
      }
    case 'alta':
      return {
        texto: `${nome} recebeu alta. As orientações e os telefones estão na folha entregue ao acompanhante.`,
        modeloMeta: MODELOS_META.alta,
        parametros: { primeiro_nome: nome },
      }
    case 'atraso':
      return {
        texto: com
          ? `A cirurgia de ${nome} ainda não começou. Nova previsão: cerca de ${Math.round(n)} minutos. Agradecemos a paciência.`
          : `A cirurgia de ${nome} ainda não começou. Agradecemos a paciência.`,
        modeloMeta: MODELOS_META[com ? 'atraso' : 'atraso_sem_previsao'],
        parametros: p,
      }
  }
}

function olhoMinusculo(olho: Olho): string {
  return olho === 'OD' ? 'direito' : 'esquerdo'
}

function semTitulo(nome: string): string {
  return nome.replace(/^\s*(dr|dra)\.?\s+/i, '').trim()
}

/** TCLE — envio no D-7 (texto aprovado; o nome da concierge vem do usuário que envia). */
export function textoTcleEnvio(d: { nomePaciente: string; nomeConcierge: string; olho: Olho; link: string; nomeCirurgiao: string }): TextoMensagem {
  const cirurgiao = semTitulo(d.nomeCirurgiao)
  return {
    texto: `Olá, ${d.nomePaciente}. Aqui é a ${d.nomeConcierge}, do hospital OFTA VITTA. Segue o vídeo que explica o termo de consentimento da sua cirurgia de catarata do olho ${olhoMinusculo(d.olho)}. Depois de assistir, abra o link para ler e assinar pelo celular: ${d.link}. Se tiver qualquer dúvida sobre a cirurgia, não assine ainda e me avise. O Dr. ${cirurgiao} esclarece antes.`,
    modeloMeta: MODELOS_META.tcle_envio,
    parametros: { nome: d.nomePaciente, concierge: d.nomeConcierge, olho: olhoMinusculo(d.olho), link: d.link, cirurgiao },
  }
}

/** TCLE — lembrete no D-3, se ainda não assinou (texto aprovado). Gatilho por agendador: pendência. */
export function textoTcleLembrete(d: { nomePaciente: string; dataCirurgia: string; link: string }): TextoMensagem {
  const data = formatarData(d.dataCirurgia)
  return {
    texto: `Olá, ${d.nomePaciente}. Sua cirurgia está marcada para ${data} e o termo de consentimento ainda não foi assinado. O link é este: ${d.link}. Se preferir assinar aqui no hospital, ou se ficou alguma dúvida, é só me responder.`,
    modeloMeta: MODELOS_META.tcle_lembrete,
    parametros: { nome: d.nomePaciente, data, link: d.link },
  }
}

/** TCLE — confirmação (texto aprovado; "uma cópia segue em anexo" depende da plataforma de assinatura: pendência). */
export function textoTcleConfirmacao(d: { nomePaciente: string; dataCirurgia: string }): TextoMensagem {
  const data = formatarData(d.dataCirurgia)
  return {
    texto: `Recebemos o seu termo assinado, ${d.nomePaciente}. Uma cópia segue em anexo. No dia ${data}, venha com um acompanhante adulto.`,
    modeloMeta: MODELOS_META.tcle_confirmacao,
    parametros: { nome: d.nomePaciente, data },
  }
}

// ---------------------------------------------------------------------------
// Destinatários, bloqueio e montagem
// ---------------------------------------------------------------------------

/** Contato apto: cadastrado no episódio, com anuência do paciente, confirmado e com telefone válido (briefing §7). */
export function contatoApto(c: Contato): boolean {
  return !!c.anuenciaPaciente && !!c.confirmadoEm && !!c.telefone && telefoneValido(c.telefone)
}

/** Destinatários dos avisos do D0: 'familiar_avisos' e 'whatsapp_paciente' aptos, sem número repetido. */
export function destinatariosAvisos(est: EstadoInterno): Contato[] {
  const vistos = new Set<string>()
  const r: Contato[] = []
  const lista = Object.values(est.contatos)
    .filter((c) => (c.tipo === 'familiar_avisos' || c.tipo === 'whatsapp_paciente') && contatoApto(c))
    .sort((a, b) => (a.tipo === b.tipo ? a.id.localeCompare(b.id) : a.tipo === 'familiar_avisos' ? -1 : 1))
  for (const c of lista) {
    const d = digitosTelefone(c.telefone!)
    if (vistos.has(d)) continue
    vistos.add(d)
    r.push(c)
  }
  return r
}

/** WhatsApp do paciente apto para o envio do TCLE. */
export function contatoWhatsappPaciente(est: EstadoInterno): Contato | null {
  return (
    Object.values(est.contatos)
      .filter((c) => c.tipo === 'whatsapp_paciente' && contatoApto(c))
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
  )
}

const FALAR_COM_FAMILIA = 'Avisos automáticos suspensos: uma pessoa deve falar com a família (no POP, quem informa é o cirurgião).'

/** Bloqueio total dos avisos: intercorrência, hard stop aberto, suspensão ou cancelamento. */
export function motivoSuspensaoAvisos(est: EstadoInterno): string | null {
  if (est.estado === 'suspenso') return `Episódio suspenso. ${FALAR_COM_FAMILIA}`
  if (est.estado === 'cancelado') return `Episódio cancelado. ${FALAR_COM_FAMILIA}`
  if (est.intercorrencias.length) return `Intercorrência registrada. ${FALAR_COM_FAMILIA}`
  const hs = hardStopsQueSuspendemAvisos(est)
  if (hs.length) return `Hard stop aberto (${hs.map((c) => DEFINICAO_POR_CODIGO[c].titulo).join('; ')}). ${FALAR_COM_FAMILIA}`
  return null
}

export function chaveIdempotencia(episodioId: string, gatilho: GatilhoAviso, contatoId: string, ocorrencia: number | string): string {
  return `jc1:${episodioId}:${gatilho}:${contatoId}:${ocorrencia}`
}

function nova(ctx: ContextoDecisao, est: EstadoInterno, gatilho: GatilhoAviso, contato: Contato, t: TextoMensagem, ocorrencia: number | string): NovaMensagem {
  return {
    id: ctx.gerarId(),
    gatilho,
    contatoId: contato.id,
    telefone: digitosTelefone(contato.telefone!),
    texto: t.texto,
    modeloMeta: t.modeloMeta,
    parametros: t.parametros,
    chaveIdempotencia: chaveIdempotencia(est.entrada.episodio.id, gatilho, contato.id, ocorrencia),
    estadoInicial: ctx.envioHabilitado ? 'pendente' : 'ensaio',
  }
}

const TEMPO_POR_GATILHO = {
  admissao_concluida: 'admissao_ate_inicio',
  inicio_cirurgia: 'duracao_cirurgia',
  fim_cirurgia: 'recuperacao_ate_alta',
} as const

/**
 * Avisos automáticos (admissão concluída, Time Out concluído, Sign Out concluído, alta), avaliados no
 * estado DEPOIS da conclusão. Bloqueio total → nenhuma mensagem.
 */
export function avisosAutomaticos(
  estDepois: EstadoInterno,
  gatilho: Extract<GatilhoAviso, 'admissao_concluida' | 'inicio_cirurgia' | 'fim_cirurgia' | 'alta'>,
  ctx: ContextoDecisao,
): NovaMensagem[] {
  if (motivoSuspensaoAvisos(estDepois)) return []
  const nome = primeiroNome(estDepois.entrada.paciente.nomeCompleto)
  const chaveTempo = gatilho === 'alta' ? null : TEMPO_POR_GATILHO[gatilho]
  const minutos = chaveTempo ? (ctx.config.temposEtapa?.[chaveTempo] ?? null) : null
  const t = textoAviso(gatilho, { primeiroNome: nome, hora: horaLocal(ctx.agora), minutos })
  return destinatariosAvisos(estDepois).map((c) => nova(ctx, estDepois, gatilho, c, t, 1))
}

/** Aviso de atraso (só por ação de uma pessoa). Lança ESTADO se os avisos estiverem suspensos. */
export function avisoAtraso(est: EstadoInterno, minutos: number | null, ctx: ContextoDecisao): NovaMensagem[] {
  const motivo = motivoSuspensaoAvisos(est)
  if (motivo) throw new ErroDominio('ESTADO', motivo)
  const nome = primeiroNome(est.entrada.paciente.nomeCompleto)
  const t = textoAviso('atraso', { primeiroNome: nome, minutos })
  const ocorrencia = est.atrasos.length + 1
  return destinatariosAvisos(est).map((c) => nova(ctx, est, 'atraso', c, t, ocorrencia))
}

/** Mensagem de envio do TCLE (D-7) com o link da página do paciente. */
export function mensagemEnvioTcle(est: EstadoInterno, link: string, ctx: ContextoDecisao): NovaMensagem {
  const contato = contatoWhatsappPaciente(est)
  if (!contato) throw new ErroDominio('VALIDACAO', 'Cadastre e confirme o WhatsApp do paciente (com anuência) antes de enviar.')
  const cirurgiao = est.entrada.membros[est.entrada.episodio.cirurgiaoId]?.nome ?? ''
  const concierge = ctx.config.assinaturaConcierge?.trim() || primeiroNome(ctx.ator.nome)
  const t = textoTcleEnvio({
    nomePaciente: primeiroNome(est.entrada.paciente.nomeCompleto),
    nomeConcierge: concierge,
    olho: est.entrada.episodio.olho,
    link,
    nomeCirurgiao: cirurgiao,
  })
  return nova(ctx, est, 'tcle_envio', contato, t, est.materiais.enviados.length + 1)
}
