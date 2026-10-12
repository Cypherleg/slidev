// Avisos flutuantes (erros persistem até fechar; sucesso some sozinho).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface Notificacao {
  tipo: 'ok' | 'info' | 'atencao' | 'perigo'
  titulo: string
  texto?: string
  itens?: string[]
  /** Link ou ação extra. */
  extra?: ReactNode
}

interface NotificacaoInterna extends Notificacao {
  id: number
}

interface ValorNotificacoes {
  notificar: (n: Notificacao) => void
  limpar: () => void
}

const Contexto = createContext<ValorNotificacoes>({ notificar: () => {}, limpar: () => {} })

export function useNotificacoes(): ValorNotificacoes {
  return useContext(Contexto)
}

export function ProvedorNotificacoes(props: { children: ReactNode }) {
  const [lista, setLista] = useState<NotificacaoInterna[]>([])
  const proximo = useRef(1)

  const remover = useCallback((id: number) => setLista(l => l.filter(n => n.id !== id)), [])
  const notificar = useCallback(
    (n: Notificacao) => {
      const id = proximo.current++
      // Uma notificação igual à anterior substitui (evita pilha de avisos repetidos).
      setLista(l => [...l.filter(x => !(x.titulo === n.titulo && x.texto === n.texto)), { ...n, id }].slice(-4))
      if (n.tipo === 'ok' || n.tipo === 'info') setTimeout(() => remover(id), 5000)
    },
    [remover],
  )
  const limpar = useCallback(() => setLista([]), [])
  const valor = useMemo(() => ({ notificar, limpar }), [notificar, limpar])

  return (
    <Contexto.Provider value={valor}>
      {props.children}
      <div className="painel-notificacoes nao-imprimir" aria-live="polite">
        {lista.map(n => (
          <div key={n.id} className={`aviso ${n.tipo} notificacao`} role={n.tipo === 'perigo' ? 'alert' : 'status'}>
            <div>
              <strong>{n.titulo}</strong>
              {n.texto && <span style={{ display: 'block' }}>{n.texto}</span>}
              {n.itens && n.itens.length > 0 && (
                <ul className="lista-simples">
                  {n.itens.map(i => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
              {n.extra}
            </div>
            <button type="button" className="botao secundario pequeno" onClick={() => remover(n.id)} aria-label={`Fechar aviso: ${n.titulo}`}>
              Fechar
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}
