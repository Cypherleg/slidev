// Página do paciente (sem login): token longo do link, restrito ao episódio, com validade.
// Tudo como jornada_sistema; eventos com autor_papel 'paciente' e autor = ATOR_SISTEMA_ID.
// A página NÃO devolve o olho (a pergunta 1 do quiz confere o olho contra a agenda).

import {
  corrigirQuiz,
  eventoMaterialAberto,
  eventoQuizRespondido,
  montarEstado,
  perguntasQuiz,
  projetarVisao,
  proximaAcaoQuiz,
  questoesErradas,
  resumoDia,
  situacaoPaginaPaciente,
  type Ator,
  type EntradaEstado,
  type EpisodioVisao,
  type NovoEvento,
} from '../dominio/index.ts'
import type { AcaoPaciente, AcoesPaciente } from './contrato.ts'
import type { Executor } from './db.ts'
import { erro } from './erros.ts'
import { formatoTokenValido, hashToken } from './link-paciente.ts'
import {
  ATOR_SISTEMA_ID,
  atualizarProjecao,
  buscarLinkPorHash,
  carregarEntrada,
  comoSistema,
  inserirEventos,
  materiaisPorIds,
  S,
  travarEpisodio,
} from './repositorio.ts'
import type { DepsApi } from './servico.ts'
import * as v from './validar.ts'

export interface ContextoPaciente {
  deps: DepsApi
  agora: Date
  link: { id: string; episodioId: string; expiraEm: string }
}

type Impl = { [A in AcaoPaciente]: (ctx: ContextoPaciente, dados: v.Obj) => Promise<AcoesPaciente[A]['S']> }

/** Leitor interno com visão completa: usado só no servidor para derivar o que a página mostra. */
const LEITOR_SISTEMA: Ator = { id: ATOR_SISTEMA_ID, nome: 'Sistema', papeis: ['gestora'], sessaoUsuarioId: ATOR_SISTEMA_ID, aparelhoId: null }

const LINK_INVALIDO = 'Link inválido ou expirado. Fale com a equipe do OFTA VITTA.'

export async function validarLinkPaciente(deps: DepsApi, token: unknown, agora: Date): Promise<ContextoPaciente['link']> {
  if (!formatoTokenValido(token)) throw erro('nao_encontrado', LINK_INVALIDO)
  const hash = await hashToken(token)
  const link = await deps.db.transacao(async tx => {
    await comoSistema(tx)
    return buscarLinkPorHash(tx, hash)
  })
  if (!link || link.revogadoEm || Date.parse(link.expiraEm) <= agora.getTime()) throw erro('nao_encontrado', LINK_INVALIDO)
  return { id: link.id, episodioId: link.episodioId, expiraEm: link.expiraEm }
}

interface Carga {
  entrada: EntradaEstado
  visao: EpisodioVisao
}

async function carregar(tx: Executor, ctx: ContextoPaciente): Promise<Carga> {
  await travarEpisodio(tx, ctx.link.episodioId)
  const entrada = await carregarEntrada(tx, ctx.link.episodioId, { tipo: 'completo' })
  if (!entrada) throw erro('nao_encontrado', LINK_INVALIDO)
  const visao = projetarVisao(montarEstado(entrada), LEITOR_SISTEMA, ctx.agora.toISOString())
  if (visao.episodio.estado === 'cancelado') throw erro('nao_encontrado', LINK_INVALIDO)
  return { entrada, visao }
}

/** Evento da página (sem pessoa): autor = ATOR_SISTEMA_ID, papel 'paciente'. */
function eventoPagina(entrada: EntradaEstado, tipo: NovoEvento['tipo'], dados: Record<string, unknown>): NovoEvento {
  return {
    episodioId: entrada.episodio.id,
    pacienteId: entrada.paciente.id,
    tipo,
    dados,
    visibilidade: 'geral',
    autorId: ATOR_SISTEMA_ID,
    autorPapel: 'paciente',
    sessaoUsuarioId: null,
    aparelhoId: null,
    foraDeHora: false,
  }
}

/** Grava um evento do paciente (como jornada_sistema) e atualiza a projeção (versao/resumo). */
async function gravarEventoPaciente(tx: Executor, ctx: ContextoPaciente, entrada: EntradaEstado, ev: NovoEvento): Promise<EntradaEstado> {
  const evento: NovoEvento = { ...ev, episodioId: entrada.episodio.id, pacienteId: entrada.paciente.id, autorId: ATOR_SISTEMA_ID, autorPapel: 'paciente', sessaoUsuarioId: null, aparelhoId: null }
  await comoSistema(tx)
  const eventos = await inserirEventos(tx, [evento], entrada.episodio.versao + 1)
  const nova: EntradaEstado = { ...entrada, episodio: { ...entrada.episodio, versao: entrada.episodio.versao + eventos.length }, eventos: [...entrada.eventos, ...eventos] }
  const estado = montarEstado(nova)
  // jornada_sistema só atualiza versao/resumo: eventos do paciente não mudam o estado do episódio.
  await atualizarProjecao(tx, entrada.episodio.id, entrada.episodio.versao, { versao: nova.episodio.versao, resumo: resumoDia(estado, ctx.agora.toISOString()) })
  return nova
}

export const acoesPaciente: Impl = {
  async 'pagina.obter'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      let { entrada, visao } = await carregar(tx, ctx)
      if (!visao.materiais.abertoEm) {
        entrada = await gravarEventoPaciente(tx, ctx, entrada, eventoPagina(entrada, 'material.aberto', { origem: 'pagina', linkId: ctx.link.id }))
        visao = projetarVisao(montarEstado(entrada), LEITOR_SISTEMA, ctx.agora.toISOString())
      }
      // Auditoria de cada abertura da página (sem pessoa; sem dado de paciente no detalhe).
      await comoSistema(tx)
      await tx.consulta(`insert into ${S}.acessos (ator_id, recurso, episodio_id, paciente_id, detalhe) values ($1::uuid, 'pagina_paciente', $2::uuid, $3::uuid, $4::jsonb)`, [
        ATOR_SISTEMA_ID,
        entrada.episodio.id,
        entrada.paciente.id,
        { linkId: ctx.link.id },
      ])
      const ids = [...new Set(visao.materiais.enviados.map(m => m.materialId))]
      const catalogo = await materiaisPorIds(tx, ids)
      const s = situacaoPaginaPaciente(montarEstado(entrada))
      return {
        primeiroNome: s.primeiroNome,
        materiais: catalogo.map(m => ({ id: m.id, titulo: m.titulo, tipo: m.tipo, url: m.url, conteudo: m.conteudo })),
        tcleLink: s.tcleLink,
        quiz: perguntasQuiz(),
        tentativas: s.tentativas,
        podeResponder: s.podeResponder,
        ultimaTentativa: s.ultimaTentativa,
        telefones: entrada.config.telefones,
      }
    })
  },

  async 'material.visualizado'(ctx, d) {
    const materialId = v.uuid(d.materialId, 'materialId')
    await ctx.deps.db.transacao(async tx => {
      const { entrada, visao } = await carregar(tx, ctx)
      const enviado = visao.materiais.enviados.find(m => m.materialId === materialId)
      if (!enviado) throw erro('nao_encontrado')
      await gravarEventoPaciente(tx, ctx, entrada, eventoMaterialAberto({ episodioId: entrada.episodio.id, pacienteId: entrada.paciente.id, autorId: ATOR_SISTEMA_ID, materialId }))
    })
    return { ok: true }
  },

  async 'quiz.responder'(ctx, d) {
    const bruto = v.objetoObrigatorio(d.respostas, 'respostas')
    const respostas: Record<number, string> = {}
    for (const [k, valor] of Object.entries(bruto)) {
      if (!/^\d{1,2}$/.test(k)) throw erro('validacao', 'Resposta inválida.')
      respostas[Number(k)] = v.texto(valor, 'resposta', { max: 200 })
    }
    let quemInstila: { eu: boolean; nome?: string } | undefined
    if (d.quemInstila !== undefined && d.quemInstila !== null) {
      const q = v.objetoObrigatorio(d.quemInstila, 'quemInstila')
      const nome = v.textoOpcional(q.nome, 'quemInstila.nome', { max: 200 })
      quemInstila = { eu: v.booleano(q.eu, 'quemInstila.eu'), ...(nome ? { nome } : {}) }
    }
    return ctx.deps.db.transacao(async tx => {
      const { entrada, visao } = await carregar(tx, ctx)
      if (!situacaoPaginaPaciente(montarEstado(entrada)).podeResponder) throw erro('validacao', 'O questionário não está disponível. A equipe entrará em contato.')
      const olho = entrada.episodio.olho
      const tentativa = { ...corrigirQuiz(respostas, olho, quemInstila), em: ctx.agora.toISOString() }
      await gravarEventoPaciente(
        tx,
        ctx,
        entrada,
        eventoQuizRespondido({ episodioId: entrada.episodio.id, pacienteId: entrada.paciente.id, autorId: ATOR_SISTEMA_ID, tentativa, erradas: questoesErradas(respostas, olho) }),
      )
      const proximaAcao = proximaAcaoQuiz([...visao.materiais.quiz, tentativa]) ?? 'rever_video_e_tentar_de_novo'
      return { aprovado: tentativa.aprovado, proximaAcao }
    })
  },
}

export const ACOES_PACIENTE = Object.keys(acoesPaciente) as AcaoPaciente[]
