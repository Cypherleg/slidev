// Limites de taxa (PIN e CPF) à prova de concorrência.
// Cada reserva roda numa transação curta e CONFIRMADA, serializada por trava consultiva
// (`pg_advisory_xact_lock`) da chave limitada; a tentativa é gravada ANTES de qualquer avaliação.
//
// PIN: grava `acessos('pin_tentativa', {alvo, tentativa})` antes de conferir o hash; o resultado
// vem depois: `pin_ok` (sucesso) ou `pin_falha` (auditoria). Conta como falha toda tentativa da
// janela que não terminou em `pin_ok` — inclusive as pendentes e as interrompidas (conservador).
// Assim, N requisições paralelas com limite L avaliam no máximo L PINs errados.
//
// CPF: grava `acessos('cpf_consulta')` antes de consultar (Datasigh ou cadastro), contando por
// usuário do LOGIN (a troca por PIN não contorna).

import type { Executor } from './db.ts'
import { uuid } from './cripto.ts'
import { erro } from './erros.ts'
import { comoApi, comoSistema, pinHashDoMembro, buscarMembro, registrarAcesso, S, type ContextoAtorDb, type MembroDb } from './repositorio.ts'
import type { DepsApi } from './servico.ts'

export async function travar(tx: Executor, chave: string): Promise<void> {
  await tx.consulta(`select pg_advisory_xact_lock(hashtextextended($1::text, 7352))`, [chave])
}

export type FinalidadePin = 'ator' | 'confirmacao' | 'definir'

export interface ReservaPin {
  tentativa: string
  alvo: MembroDb | null
  hash: string | null
}

/**
 * Reserva uma avaliação de PIN de `alvoId` feita na sessão `quem.sessaoUsuarioId`.
 * Lança `limite_taxa` sem gravar nada quando o limite já foi atingido.
 */
export async function reservarTentativaPin(deps: DepsApi, quem: ContextoAtorDb, alvoId: string, finalidade: FinalidadePin, agora: Date): Promise<ReservaPin> {
  const cfg = deps.config
  const desde = new Date(agora.getTime() - cfg.janelaPinMin * 60_000).toISOString()
  const tentativa = uuid()
  const r = await deps.db.transacao(async tx => {
    await comoSistema(tx)
    // Ordem fixa das travas (alvo, depois sessão): sem ciclo entre transações.
    await travar(tx, `pin:${alvoId}`)
    await travar(tx, `pin-sessao:${quem.sessaoUsuarioId}`)
    const [c] = await tx.consulta<{ alvo: number; sessao: number }>(
      `select
         (count(*) filter (where recurso = 'pin_tentativa' and detalhe->>'alvo' = $2)
          - count(*) filter (where recurso = 'pin_ok' and detalhe->>'alvo' = $2))::int as alvo,
         (count(*) filter (where recurso = 'pin_tentativa' and sessao_usuario_id = $3::uuid)
          - count(*) filter (where recurso = 'pin_ok' and sessao_usuario_id = $3::uuid))::int as sessao
       from ${S}.acessos where recurso in ('pin_tentativa', 'pin_ok') and registrado_em >= $1::timestamptz`,
      [desde, alvoId, quem.sessaoUsuarioId],
    )
    if ((c?.alvo ?? 0) >= cfg.falhasPinPorAlvo || (c?.sessao ?? 0) >= cfg.falhasPinPorSessao) return null
    const alvo = await buscarMembro(tx, alvoId)
    const hash = alvo && alvo.ativo ? await pinHashDoMembro(tx, alvoId) : null
    await comoApi(tx, quem)
    await registrarAcesso(tx, quem, 'pin_tentativa', { detalhe: { alvo: alvoId, tentativa, finalidade } })
    return { tentativa, alvo, hash }
  })
  if (!r) throw erro('limite_taxa', 'Muitas tentativas de PIN. Aguarde alguns minutos.')
  return r
}

/** Registra o resultado da tentativa (transação própria). */
export async function concluirTentativaPin(deps: DepsApi, quem: ContextoAtorDb, alvoId: string, reserva: ReservaPin, ok: boolean, finalidade: FinalidadePin): Promise<void> {
  await deps.db.transacao(async tx => {
    await comoApi(tx, quem)
    await registrarAcesso(tx, quem, ok ? 'pin_ok' : 'pin_falha', { detalhe: { alvo: alvoId, tentativa: reserva.tentativa, finalidade } })
  })
}

/**
 * Consome uma consulta de CPF do usuário do login (limite por hora). Confirmada antes da consulta.
 */
export async function consumirConsultaCpf(deps: DepsApi, quem: ContextoAtorDb, agora: Date, origem: 'busca' | 'cadastro'): Promise<void> {
  const desde = new Date(agora.getTime() - 3600_000).toISOString()
  await deps.db.transacao(async tx => {
    await comoSistema(tx)
    await travar(tx, `cpf:${quem.sessaoUsuarioId}`)
    const [c] = await tx.consulta<{ n: number }>(
      `select count(*)::int as n from ${S}.acessos where recurso = 'cpf_consulta' and registrado_em >= $1::timestamptz and sessao_usuario_id = $2::uuid`,
      [desde, quem.sessaoUsuarioId],
    )
    if ((c?.n ?? 0) >= deps.config.cpfConsultasHora) throw erro('limite_taxa', 'Limite de consultas de CPF por hora atingido.')
    await comoApi(tx, quem)
    await registrarAcesso(tx, quem, 'cpf_consulta', { detalhe: { origem } })
  })
}
