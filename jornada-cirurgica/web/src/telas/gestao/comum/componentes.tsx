// Componentes de apoio das telas do agente web-apoio (os básicos ficam em componentes/base).

import { useId, useState, type ReactNode } from 'react'
import type { Papel, SeveridadePendencia } from '@dominio/tipos.ts'
import { PAPEIS, ROTULO_PAPEL } from '@dominio/tipos.ts'
import { Aviso, Botao } from '../../../componentes/base/index.tsx'
import { mensagemErro } from './carga.ts'
import { ROTULO_SEVERIDADE } from './rotulos.ts'

/** Severidade sempre com texto (a cor nunca vale sozinha). */
export function SeloSeveridade(props: { severidade: SeveridadePendencia }) {
  return <span className={`selo selo-${props.severidade}`}>{ROTULO_SEVERIDADE[props.severidade]}</span>
}

/** Selo neutro com texto. */
export function Selo(props: { children: ReactNode; tipo?: 'neutro' | 'ok' | 'atencao' | 'perigo' }) {
  return <span className={`selo selo-${props.tipo ?? 'neutro'}`}>{props.children}</span>
}

export function ErroCarga(props: { erro: unknown; onTentar?: () => void; titulo?: string }) {
  return (
    <Aviso tipo="perigo" titulo={props.titulo ?? 'Não foi possível carregar.'}>
      <p style={{ margin: '4px 0' }}>{mensagemErro(props.erro)}</p>
      {props.onTentar && (
        <Botao tipo="secundario" pequeno onClick={props.onTentar}>
          Tentar de novo
        </Botao>
      )}
    </Aviso>
  )
}

/** Ação em dois passos: o primeiro toque pede confirmação explícita. */
export function BotaoConfirmar(props: {
  rotulo: string
  confirmacao: string
  onConfirmar: () => void | Promise<void>
  tipo?: 'primario' | 'secundario' | 'perigo'
  desabilitado?: boolean
}) {
  const [pedindo, setPedindo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!pedindo) {
    return (
      <Botao tipo={props.tipo ?? 'secundario'} pequeno desabilitado={props.desabilitado} onClick={() => setPedindo(true)}>
        {props.rotulo}
      </Botao>
    )
  }
  return (
    <span className="linha" role="group" aria-label={props.confirmacao}>
      <Botao
        tipo={props.tipo === 'perigo' ? 'perigo' : 'primario'}
        pequeno
        desabilitado={ocupado}
        onClick={async () => {
          setOcupado(true)
          try {
            await props.onConfirmar()
          } finally {
            setOcupado(false)
            setPedindo(false)
          }
        }}
      >
        {props.confirmacao}
      </Botao>
      <Botao tipo="secundario" pequeno onClick={() => setPedindo(false)}>
        Cancelar
      </Botao>
    </span>
  )
}

/** Escolha de papéis (caixas de seleção com rótulo por extenso). */
export function EscolhaPapeis(props: { legenda: string; valor: Papel[]; onChange: (papeis: Papel[]) => void; erro?: string | null }) {
  const id = useId()
  return (
    <fieldset className="grupo-opcoes">
      <legend>{props.legenda}</legend>
      <div className="opcoes-grade">
        {PAPEIS.map(p => (
          <label key={p} className="opcao-marcar" htmlFor={`${id}-${p}`}>
            <input
              id={`${id}-${p}`}
              type="checkbox"
              checked={props.valor.includes(p)}
              onChange={e => props.onChange(e.target.checked ? PAPEIS.filter(x => x === p || props.valor.includes(x)) : props.valor.filter(x => x !== p))}
            />
            {ROTULO_PAPEL[p]}
          </label>
        ))}
      </div>
      {props.erro && <span className="erro-campo">{props.erro}</span>}
    </fieldset>
  )
}

/** Mensagem de retorno de uma ação (lida por leitor de tela). */
export function Retorno(props: { retorno: { tipo: 'ok' | 'perigo' | 'atencao' | 'info'; texto: string } | null }) {
  if (!props.retorno) return <div role="status" aria-live="polite" />
  return (
    <div role={props.retorno.tipo === 'perigo' ? 'alert' : 'status'} aria-live="polite" className={`aviso ${props.retorno.tipo}`}>
      {props.retorno.texto}
    </div>
  )
}
