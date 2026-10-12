// Carrega a EpisodioVisao e executa ações que mudam o episódio (sempre com `versao`).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AcaoEquipe, AcoesEquipe } from '@contrato'
import type { EpisodioVisao } from '@dominio/tipos.ts'
import { ouvirAtor } from '../../api/ator.ts'
import { chamar, ErroChamada } from '../../api/cliente.ts'
import { useTratarErro } from '../../app/erros.tsx'
import { useNotificacoes } from '../../app/notificacoes.tsx'

/** Ações que recebem { episodioId, versao } e devolvem a visão atualizada. */
export type AcaoComVersao = {
  [A in AcaoEquipe]: AcoesEquipe[A]['E'] extends { episodioId: string; versao: number } ? (AcoesEquipe[A]['S'] extends EpisodioVisao ? A : never) : never
}[AcaoEquipe]

export type DadosSemVersao<A extends AcaoComVersao> = Omit<AcoesEquipe[A]['E'], 'episodioId' | 'versao'>

export interface ControleEpisodio {
  visao: EpisodioVisao | null
  carregando: boolean
  erroCarga: ErroChamada | null
  /** Ação em andamento (para desabilitar botões). */
  ocupado: string | null
  recarregar: () => Promise<void>
  executar: <A extends AcaoComVersao>(acao: A, dados: DadosSemVersao<A>, mensagemOk?: string) => Promise<boolean>
  /** Ações que não devolvem a visão (ex.: etiqueta.copiada): executa e recarrega. */
  executarERecarregar: <A extends AcaoEquipe>(acao: A, dados: AcoesEquipe[A]['E'], mensagemOk?: string) => Promise<AcoesEquipe[A]['S'] | null>
}

export function useEpisodio(id: string | undefined): ControleEpisodio {
  const [visao, setVisao] = useState<EpisodioVisao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState<ErroChamada | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const ref = useRef<EpisodioVisao | null>(null)
  const tratar = useTratarErro()
  const { notificar } = useNotificacoes()

  const recarregar = useCallback(async () => {
    if (!id) return
    try {
      const v = await chamar('episodio.obter', { episodioId: id })
      ref.current = v
      setVisao(v)
      setErroCarga(null)
    } catch (e) {
      if (e instanceof ErroChamada) {
        setErroCarga(e)
        if (e.codigo === 'nao_autenticado' || e.codigo === 'mfa_exigido') tratar(e)
      } else {
        tratar(e)
      }
    } finally {
      setCarregando(false)
    }
  }, [id, tratar])

  // Só recarrega do zero quando muda o episódio (trocar de aba não recarrega).
  const recarregarRef = useRef(recarregar)
  recarregarRef.current = recarregar
  useEffect(() => {
    setCarregando(true)
    setVisao(null)
    ref.current = null
    void recarregarRef.current()
  }, [id])

  // Troca de quem marca (PIN): a visão é filtrada pelo papel do ator (conferência cega, permissões),
  // então é descartada e recarregada. Os rascunhos da pessoa anterior também somem (a tela é desmontada),
  // para nada ser registrado em nome de quem não digitou.
  useEffect(
    () =>
      ouvirAtor(() => {
        setCarregando(true)
        setVisao(null)
        ref.current = null
        void recarregarRef.current()
      }),
    [],
  )

  const executar = useCallback(
    async <A extends AcaoComVersao>(acao: A, dados: DadosSemVersao<A>, mensagemOk?: string): Promise<boolean> => {
      const atual = ref.current
      if (!atual || !id) return false
      setOcupado(acao)
      try {
        const entrada = { ...dados, episodioId: id, versao: atual.episodio.versao } as unknown as AcoesEquipe[A]['E']
        const nova = (await chamar(acao, entrada)) as unknown as EpisodioVisao
        ref.current = nova
        setVisao(nova)
        if (mensagemOk) notificar({ tipo: 'ok', titulo: mensagemOk })
        return true
      } catch (e) {
        tratar(e, { recarregar: () => void recarregar() })
        return false
      } finally {
        setOcupado(null)
      }
    },
    [id, notificar, recarregar, tratar],
  )

  const executarERecarregar = useCallback(
    async <A extends AcaoEquipe>(acao: A, dados: AcoesEquipe[A]['E'], mensagemOk?: string): Promise<AcoesEquipe[A]['S'] | null> => {
      setOcupado(acao)
      try {
        const r = await chamar(acao, dados)
        if (mensagemOk) notificar({ tipo: 'ok', titulo: mensagemOk })
        await recarregar()
        return r
      } catch (e) {
        tratar(e, { recarregar: () => void recarregar() })
        return null
      } finally {
        setOcupado(null)
      }
    },
    [notificar, recarregar, tratar],
  )

  return { visao, carregando, erroCarga, ocupado, recarregar, executar, executarERecarregar }
}
