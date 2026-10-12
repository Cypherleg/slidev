// Fila de saída (briefing §7): mensagens nascem em `mensagens_saida` na mesma transação dos
// eventos. Esta função, chamada pela Edge Function `jornada-envios` (agendador), reivindica
// mensagens `pendente`, confere de novo no domínio se os avisos do episódio estão suspensos e
// envia pela Meta Cloud API SOMENTE com ENVIO_PACIENTES_HABILITADO=true.
// Estados: enviado | falhou | desconhecido (timeout/erro de rede/5xx). `desconhecido` nunca é
// reenviado automaticamente: reconciliação manual. Em modo ensaio nada sai (as mensagens já
// nascem `ensaio` e esta função não reivindica nada).

import { montarEstado, projetarVisao, type Ator } from '../dominio/index.ts'
import type { FetchLike } from './auth.ts'
import type { ConfigApi, ConfigMeta } from './config.ts'
import type { Db, Executor } from './db.ts'
import { camposLogErro } from './erros.ts'
import { restaurarToken } from './link-paciente.ts'
import type { Logger } from './logger.ts'
import { ATOR_SISTEMA_ID, carregarEntrada, comoSistema, S } from './repositorio.ts'

export interface EnvioMeta {
  para: string
  texto: string
  modeloMeta: string | null
  parametros: Record<string, string>
}

export type ResultadoEnvio = { tipo: 'enviado'; provedorId: string } | { tipo: 'falhou'; http: number } | { tipo: 'desconhecido'; http?: number }

export interface ClienteMeta {
  enviar(m: EnvioMeta): Promise<ResultadoEnvio>
}

/** Cliente da Meta Cloud API (WhatsApp). Só é usado com envio habilitado. */
export function criarClienteMeta(config: ConfigMeta, f: FetchLike = (u, i) => fetch(u, i)): ClienteMeta {
  return {
    async enviar(m) {
      const para = m.para.replace(/\D/g, '')
      const corpo = m.modeloMeta
        ? {
            messaging_product: 'whatsapp',
            to: para,
            type: 'template',
            template: {
              name: m.modeloMeta,
              language: { code: 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: Object.keys(m.parametros)
                    .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
                    .map(k => ({ type: 'text', text: m.parametros[k] })),
                },
              ],
            },
          }
        : { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: true, body: m.texto } }
      const controle = new AbortController()
      const timer = setTimeout(() => controle.abort(), config.timeoutMs)
      let r: Response
      try {
        r = await f(`https://graph.facebook.com/${config.graphVersao}/${config.phoneId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
          signal: controle.signal,
        })
      } catch {
        return { tipo: 'desconhecido' }
      } finally {
        clearTimeout(timer)
      }
      if (r.status >= 500) return { tipo: 'desconhecido', http: r.status }
      if (!r.ok) return { tipo: 'falhou', http: r.status }
      try {
        const j = (await r.json()) as { messages?: { id?: string }[] }
        const id = j.messages?.[0]?.id
        return id ? { tipo: 'enviado', provedorId: id } : { tipo: 'desconhecido', http: r.status }
      } catch {
        return { tipo: 'desconhecido', http: r.status }
      }
    },
  }
}

export interface DepsFila {
  db: Db
  config: Pick<ConfigApi, 'envioHabilitado' | 'segredoAtor'>
  meta: ClienteMeta | null
  logger: Logger
  relogio?: () => Date
  limite?: number
}

export interface ResultadoFila {
  modo: 'ensaio' | 'real'
  reivindicadas: number
  enviadas: number
  falhas: number
  desconhecidas: number
  canceladas: number
}

const LEITOR_SISTEMA: Ator = { id: ATOR_SISTEMA_ID, nome: 'Sistema', papeis: ['gestora'], sessaoUsuarioId: ATOR_SISTEMA_ID, aparelhoId: null }

interface Reivindicada {
  id: string
  episodioId: string
  telefone: string
  texto: string
  modeloMeta: string | null
  parametros: Record<string, string>
}

async function mudarEstado(tx: Executor, id: string, estado: 'enviado' | 'falhou' | 'desconhecido' | 'cancelado', extra: { provedorId?: string | null; ultimoErro?: string | null; detalhe?: Record<string, unknown> } = {}) {
  await comoSistema(tx)
  await tx.consulta(
    `update ${S}.mensagens_saida set estado = $2, provedor_id = coalesce($3, provedor_id), ultimo_erro = $4, atualizado_em = now() where id = $1::uuid`,
    [id, estado, extra.provedorId ?? null, extra.ultimoErro ?? null],
  )
  await tx.consulta(`insert into ${S}.mensagens_saida_eventos (mensagem_id, estado, detalhe) values ($1::uuid, $2, $3::jsonb)`, [id, estado, extra.detalhe ?? {}])
}

export async function processarFila(deps: DepsFila): Promise<ResultadoFila> {
  const r: ResultadoFila = { modo: deps.config.envioHabilitado ? 'real' : 'ensaio', reivindicadas: 0, enviadas: 0, falhas: 0, desconhecidas: 0, canceladas: 0 }
  if (!deps.config.envioHabilitado || !deps.meta) {
    deps.logger.info('fila', { resultado: deps.config.envioHabilitado ? 'sem_cliente_meta' : 'ensaio', quantidade: 0 })
    return r
  }
  const agora = (deps.relogio ?? (() => new Date()))()
  const limite = Math.min(Math.max(deps.limite ?? 20, 1), 100)
  const lote: Reivindicada[] = await deps.db.transacao(async tx => {
    await comoSistema(tx)
    const linhas = await tx.consulta(`select * from ${S}.reivindicar_mensagens($1::int)`, [limite])
    return linhas.map(l => ({
      id: String(l.id),
      episodioId: String(l.episodio_id),
      telefone: String(l.telefone ?? ''),
      texto: String(l.texto ?? ''),
      modeloMeta: l.modelo_meta === null || l.modelo_meta === undefined ? null : String(l.modelo_meta),
      parametros: (l.parametros ?? {}) as Record<string, string>,
    }))
  })
  r.reivindicadas = lote.length

  for (const m of lote) {
    try {
      // 1) O domínio ainda permite avisos? (intercorrência, hard stop, suspensão, cancelamento)
      const suspensos = await deps.db.transacao(async tx => {
        const entrada = await carregarEntrada(tx, m.episodioId, { tipo: 'completo' })
        if (!entrada) return true
        return projetarVisao(montarEstado(entrada), LEITOR_SISTEMA, agora.toISOString()).avisosFamilia.suspensos
      })
      if (suspensos) {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'cancelado', { ultimoErro: 'avisos_suspensos', detalhe: { motivo: 'avisos_suspensos' } }))
        r.canceladas++
        continue
      }
      // 2) Restaura o link (token cifrado) só agora.
      const conteudo = await restaurarToken(m.texto, m.parametros, deps.config.segredoAtor)
      if (!conteudo || !m.telefone) {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'falhou', { ultimoErro: 'conteudo_indisponivel' }))
        r.falhas++
        continue
      }
      // 3) Envia.
      const res = await deps.meta.enviar({ para: m.telefone, texto: conteudo.texto, modeloMeta: m.modeloMeta, parametros: conteudo.parametros })
      if (res.tipo === 'enviado') {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'enviado', { provedorId: res.provedorId, detalhe: { provedor: 'meta' } }))
        r.enviadas++
      } else if (res.tipo === 'falhou') {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'falhou', { ultimoErro: `http_${res.http}`, detalhe: { http: res.http } }))
        r.falhas++
      } else {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'desconhecido', { ultimoErro: res.http ? `http_${res.http}` : 'timeout_ou_rede', detalhe: { http: res.http ?? null } }))
        r.desconhecidas++
      }
    } catch (e) {
      // Falha local depois de reivindicar: estado desconhecido (não reenviar sem reconciliar).
      deps.logger.erro('fila', { ...camposLogErro(e), resultado: 'erro_local' })
      try {
        await deps.db.transacao(tx => mudarEstado(tx, m.id, 'desconhecido', { ultimoErro: 'erro_local' }))
      } catch {
        /* a mensagem fica em `enviando`; reconciliação manual */
      }
      r.desconhecidas++
    }
  }
  deps.logger.info('fila', { resultado: 'lote', quantidade: r.reivindicadas, enviadas: r.enviadas, falhas: r.falhas, desconhecidas: r.desconhecidas, canceladas: r.canceladas })
  return r
}
