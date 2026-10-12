// Tratamento padrão de ErroChamada na interface.
// - nao_autenticado: sessão expirada → /entrar (se havia ator por PIN, primeiro descarta só o PIN).
// - conflito_versao: o episódio mudou em outro aparelho → recarregar a visão.
// - hard_stop: mostra os hard stops dos detalhes (sem botão de "prosseguir assim mesmo").
// - indisponivel: "Siga o checklist em papel".
import { useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { Papel } from '@dominio/tipos.ts'
import { atorAtual, definirAtor } from '../api/ator.ts'
import { autenticacao } from '../api/auth.ts'
import { ErroChamada } from '../api/cliente.ts'
import { ROTAS } from '../rotas.ts'
import { rotuloPapeis } from '../componentes/rotulos.ts'
import { useNotificacoes } from './notificacoes.tsx'

export interface HardStopDoErro {
  titulo: string
  comoResolver?: string
  resolvivelPor?: Papel[]
}

/** Lê `detalhes.hardStops` sem confiar no formato (lista de objetos ou de códigos). */
export function hardStopsDoErro(e: ErroChamada): HardStopDoErro[] {
  const lista = e.erro.detalhes?.hardStops
  if (!Array.isArray(lista)) return []
  return lista.map(h => {
    if (typeof h === 'string') return { titulo: h }
    const o = (h ?? {}) as Record<string, unknown>
    return {
      titulo: String(o.titulo ?? o.codigo ?? 'Hard stop'),
      comoResolver: typeof o.comoResolver === 'string' ? o.comoResolver : undefined,
      resolvivelPor: Array.isArray(o.resolvivelPor) ? (o.resolvivelPor as Papel[]) : undefined,
    }
  })
}

export interface OpcoesTratamento {
  /** Recarregar a visão (conflito de versão, hard stop). */
  recarregar?: () => void
}

export function useTratarErro() {
  const navegar = useNavigate()
  const local = useLocation()
  const { notificar } = useNotificacoes()

  return useCallback(
    (e: unknown, opcoes?: OpcoesTratamento) => {
      if (!(e instanceof ErroChamada)) {
        notificar({ tipo: 'perigo', titulo: 'Erro inesperado na tela', texto: 'Nada foi confirmado pelo servidor. Atualize a página; se persistir, siga o checklist em papel.' })
        return
      }
      switch (e.codigo) {
        case 'nao_autenticado': {
          if (atorAtual()) {
            definirAtor(null)
            notificar({ tipo: 'atencao', titulo: 'A troca por PIN expirou', texto: 'Quem for marcar deve entrar de novo com o PIN. Nada foi registrado.' })
            return
          }
          void autenticacao.sair()
          notificar({ tipo: 'atencao', titulo: 'Sessão expirada', texto: 'Entre novamente. Nada foi registrado.' })
          navegar(ROTAS.entrar, { state: { de: local.pathname + local.search } })
          return
        }
        case 'mfa_exigido':
          notificar({ tipo: 'atencao', titulo: 'Segundo fator exigido', texto: 'Cirurgião e gestora confirmam o acesso com o código do aplicativo autenticador.' })
          navegar(ROTAS.entrar, { state: { de: local.pathname + local.search, mfa: true } })
          return
        case 'conflito_versao':
          opcoes?.recarregar?.()
          notificar({
            tipo: 'atencao',
            titulo: 'Outra pessoa alterou este episódio',
            texto: 'A tela foi atualizada com a versão mais recente. Confira e, se ainda for o caso, repita a ação.',
          })
          return
        case 'hard_stop': {
          opcoes?.recarregar?.()
          const hs = hardStopsDoErro(e)
          notificar({
            tipo: 'perigo',
            titulo: 'Hard stop: a passagem está bloqueada',
            texto: hs.length ? 'Resolva antes de prosseguir:' : e.erro.mensagem,
            itens: hs.map(h => [h.titulo, h.comoResolver ? `Como resolver: ${h.comoResolver}` : '', h.resolvivelPor?.length ? `Quem resolve: ${rotuloPapeis(h.resolvivelPor)}` : ''].filter(Boolean).join(' · ')),
          })
          return
        }
        case 'indisponivel':
          notificar({
            tipo: 'perigo',
            titulo: 'Servidor indisponível: siga o checklist em papel',
            texto: 'Nenhuma ação foi registrada. Use os checklists impressos e registre no painel quando ele voltar, marcando como fora de hora.',
            extra: (
              <Link to={ROTAS.impressaoBranco('sign_in')} className="nao-imprimir">
                Checklists em branco
              </Link>
            ),
          })
          return
        case 'ordem':
          opcoes?.recarregar?.()
          notificar({ tipo: 'perigo', titulo: 'Fora da ordem obrigatória', texto: e.erro.mensagem })
          return
        case 'conferencia_cega':
          notificar({
            tipo: 'perigo',
            titulo: 'Conferência cega',
            texto: `${e.erro.mensagem} O checkpoint 2 deve ser feito por quem não registrou nem consultou o checkpoint 1.`,
          })
          return
        case 'sem_permissao':
          notificar({ tipo: 'perigo', titulo: 'Sem permissão para esta ação', texto: e.erro.mensagem })
          return
        case 'limite_taxa':
          notificar({ tipo: 'atencao', titulo: 'Muitas tentativas', texto: 'Aguarde alguns minutos e tente de novo.' })
          return
        case 'nao_encontrado':
          notificar({ tipo: 'perigo', titulo: 'Não encontrado', texto: e.erro.mensagem })
          return
        case 'validacao':
        default:
          notificar({ tipo: 'perigo', titulo: 'Não registrado', texto: e.erro.mensagem })
      }
    },
    [navegar, local.pathname, local.search, notificar],
  )
}
