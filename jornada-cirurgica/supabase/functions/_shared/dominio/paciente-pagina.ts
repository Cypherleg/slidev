// Auxiliares para a página do paciente e para a prévia do envio de materiais (sem gravar nada).

import type { Ator, ContextoDecisao, Estado, MaterialCatalogo } from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import type { QuizTentativa } from './tipos.ts'
import { interno } from './estado/montar.ts'
import { PRE } from './decidir.ts'
import { contatoWhatsappPaciente, textoTcleEnvio } from './mensagens.ts'
import { podeResponderQuiz, proximaAcaoQuiz } from './quiz.ts'
import { mascararTelefone } from './util/telefone.ts'
import { primeiroNome } from './util/texto.ts'

/** Situação do quiz e do TCLE para a página do paciente (não exibe o olho: a pergunta 1 o confere). */
export function situacaoPaginaPaciente(estado: Estado): {
  primeiroNome: string
  tcleLink: string | null
  tentativas: number
  podeResponder: boolean
  proximaAcao: ReturnType<typeof proximaAcaoQuiz>
  ultimaTentativa: Pick<QuizTentativa, 'aprovado' | 'em'> | null
} {
  const est = interno(estado)
  const tentativas = est.materiais.quiz.map((q) => q.tentativa)
  const ultima = est.materiais.quiz[est.materiais.quiz.length - 1]
  return {
    primeiroNome: primeiroNome(est.entrada.paciente.nomeCompleto),
    tcleLink: est.tcle.link,
    tentativas: tentativas.length,
    podeResponder: est.estado !== 'suspenso' && est.estado !== 'cancelado' && podeResponderQuiz(tentativas),
    proximaAcao: proximaAcaoQuiz(tentativas),
    ultimaTentativa: ultima ? { aprovado: ultima.tentativa.aprovado, em: ultima.tentativa.em || ultima.em } : null,
  }
}

/** Prévia do envio (briefing §6.1: mostrar à concierge o que será enviado, antes de enviar). Não grava nada. */
export function previaMateriais(
  estado: Estado,
  materiais: MaterialCatalogo[],
  ctx: Pick<ContextoDecisao, 'config' | 'envioHabilitado' | 'urlPaginaPaciente'> & { ator: Ator },
): { mensagens: { gatilho: string; destinoMascarado: string; texto: string }[]; materiais: MaterialCatalogo[]; modoEnvio: 'ensaio' | 'real'; impedimentos: string[] } {
  const est = interno(estado)
  const impedimentos: string[] = []
  try {
    PRE.materiais(est, ctx.ator)
  } catch (e) {
    impedimentos.push(e instanceof ErroDominio ? e.message : 'Não permitido.')
  }
  const ativos = (materiais ?? []).filter((m) => m && m.ativo)
  if (!ativos.length) impedimentos.push('Nenhum material ativo no catálogo.')
  if (!ctx.urlPaginaPaciente) impedimentos.push('Endereço da página do paciente não configurado.')
  const contato = contatoWhatsappPaciente(est)
  if (!contato) impedimentos.push('WhatsApp do paciente não cadastrado, sem anuência ou não confirmado.')
  const mensagens: { gatilho: string; destinoMascarado: string; texto: string }[] = []
  if (contato) {
    const t = textoTcleEnvio({
      nomePaciente: primeiroNome(est.entrada.paciente.nomeCompleto),
      nomeConcierge: ctx.config.assinaturaConcierge?.trim() || primeiroNome(ctx.ator.nome),
      olho: est.entrada.episodio.olho,
      link: `${ctx.urlPaginaPaciente ?? ''}[link gerado no envio]`,
      nomeCirurgiao: est.entrada.membros[est.entrada.episodio.cirurgiaoId]?.nome ?? '',
    })
    mensagens.push({ gatilho: 'tcle_envio', destinoMascarado: mascararTelefone(contato.telefone ?? ''), texto: t.texto })
  }
  return { mensagens, materiais: ativos, modoEnvio: ctx.envioHabilitado ? 'real' : 'ensaio', impedimentos }
}
