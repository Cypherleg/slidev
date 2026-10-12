// Sessão da equipe: quem fez o login no aparelho e quem está marcando (ator por PIN).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessaoDados } from '@contrato'
import type { Papel } from '@dominio/tipos.ts'
import type { AtorAtual } from '../api/ator.ts'
import { atorAtual, definirAtor, ouvirAtor } from '../api/ator.ts'
import { autenticacao } from '../api/auth.ts'
import { chamar, ErroChamada } from '../api/cliente.ts'

export type EstadoSessao = 'carregando' | 'anonimo' | 'logado' | 'mfa' | 'indisponivel'

export interface QuemMarca {
  id: string
  nome: string
  papeis: Papel[]
  porPin: boolean
}

export interface ValorSessao {
  estado: EstadoSessao
  dados: SessaoDados | null
  ator: AtorAtual | null
  /** Quem está marcando agora: ator do PIN ou o usuário do login. */
  quem: QuemMarca | null
  papeis: Papel[]
  recarregar: () => Promise<void>
  sair: () => Promise<void>
  encerrarAtor: () => Promise<void>
}

const Contexto = createContext<ValorSessao | null>(null)

export function useSessao(): ValorSessao {
  const v = useContext(Contexto)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}

/** Para componentes que funcionam com ou sem sessão (testes, impressão). */
export function useSessaoOpcional(): ValorSessao | null {
  return useContext(Contexto)
}

export function ProvedorSessao(props: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSessao>('carregando')
  const [dados, setDados] = useState<SessaoDados | null>(null)
  const [ator, setAtor] = useState<AtorAtual | null>(() => atorAtual())

  const recarregar = useCallback(async () => {
    const token = await autenticacao.tokenAtual()
    if (!token) {
      setDados(null)
      setEstado('anonimo')
      return
    }
    try {
      const d = await chamar('sessao', {})
      setDados(d)
      setEstado('logado')
      // O servidor não reconheceu o token de ator: descarta.
      if (!d.ator && atorAtual()) definirAtor(null)
    } catch (e) {
      if (e instanceof ErroChamada && e.codigo === 'nao_autenticado' && atorAtual()) {
        // Pode ser o token do PIN expirado: descarta o ator e tenta só com o login.
        definirAtor(null)
        try {
          const d = await chamar('sessao', {}, { semAtor: true })
          setDados(d)
          setEstado('logado')
          return
        } catch {
          /* segue abaixo */
        }
      }
      setDados(null)
      if (e instanceof ErroChamada && e.codigo === 'mfa_exigido') setEstado('mfa')
      else if (e instanceof ErroChamada && e.codigo === 'indisponivel') setEstado('indisponivel')
      else setEstado('anonimo')
    }
  }, [])

  useEffect(() => {
    void recarregar()
    const pararAuth = autenticacao.ouvir(() => void recarregar())
    const pararAtor = ouvirAtor(a => setAtor(a))
    // O token do PIN expira no servidor; a tela acompanha.
    const relogio = setInterval(() => atorAtual(), 15000)
    return () => {
      pararAuth()
      pararAtor()
      clearInterval(relogio)
    }
  }, [recarregar])

  const sair = useCallback(async () => {
    if (atorAtual()) {
      try {
        await chamar('ator.encerrar', {})
      } catch {
        /* o token expira sozinho */
      }
      definirAtor(null)
    }
    await autenticacao.sair()
    setDados(null)
    setEstado('anonimo')
  }, [])

  const encerrarAtor = useCallback(async () => {
    try {
      await chamar('ator.encerrar', {})
    } catch {
      /* o token expira sozinho */
    }
    definirAtor(null)
  }, [])

  const valor = useMemo<ValorSessao>(() => {
    const quem: QuemMarca | null = ator
      ? { id: ator.id, nome: ator.nome, papeis: ator.papeis, porPin: true }
      : dados
        ? { id: dados.membro.id, nome: dados.membro.nome, papeis: dados.membro.papeis, porPin: false }
        : null
    return { estado, dados, ator, quem, papeis: quem?.papeis ?? [], recarregar, sair, encerrarAtor }
  }, [estado, dados, ator, recarregar, sair, encerrarAtor])

  return <Contexto.Provider value={valor}>{props.children}</Contexto.Provider>
}
