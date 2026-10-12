// Componentes básicos compartilhados. Mantidos pelo agente web-clínico; o agente web-apoio só usa.
import type { ReactNode } from 'react'
import type { Dot, Olho } from '@dominio/tipos.ts'
import { OLHO_EXTENSO } from '@dominio/tipos.ts'

export function Botao(props: { children: ReactNode; onClick?: () => void; tipo?: 'primario' | 'secundario' | 'perigo'; pequeno?: boolean; desabilitado?: boolean; submit?: boolean; titulo?: string }) {
  const classes = ['botao', props.tipo && props.tipo !== 'primario' ? props.tipo : '', props.pequeno ? 'pequeno' : ''].filter(Boolean).join(' ')
  return (
    <button type={props.submit ? 'submit' : 'button'} className={classes} onClick={props.onClick} disabled={props.desabilitado} title={props.titulo}>
      {props.children}
    </button>
  )
}

export function Cartao(props: { titulo?: ReactNode; children: ReactNode; acoes?: ReactNode }) {
  return (
    <section className="cartao pilha">
      {(props.titulo || props.acoes) && (
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          {props.titulo ? <h2 style={{ margin: 0 }}>{props.titulo}</h2> : <span />}
          {props.acoes}
        </div>
      )}
      {props.children}
    </section>
  )
}

export function Aviso(props: { tipo: 'info' | 'ok' | 'atencao' | 'perigo'; titulo?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`aviso ${props.tipo}`} role={props.tipo === 'perigo' ? 'alert' : 'status'}>
      {props.titulo && <strong>{props.titulo}</strong>}
      {props.children}
    </div>
  )
}

/** Olho sempre por extenso e em destaque (briefing, regra 2). */
export function OlhoDestaque(props: { olho: Olho; grande?: boolean }) {
  return <span className={`olho-destaque${props.grande ? ' grande' : ''}`}>{OLHO_EXTENSO[props.olho]}</span>
}

/** Dots com letra dentro; nunca só cor (POP §2). */
export function Dots(props: { dots: Dot[] }) {
  if (props.dots.length === 0) return <span className="suave">Sem dots. Ausência de dot não significa ausência de risco.</span>
  return (
    <span className="dots">
      {props.dots.map(d => (
        <span key={d.letra} className={`dot ${d.cor}`} title={`${d.rotulo}: ${d.motivo}`} aria-label={`${d.letra}: ${d.rotulo}`}>
          {d.letra}
        </span>
      ))}
    </span>
  )
}

export function Carregando(props: { texto?: string }) {
  return <p className="suave" role="status">{props.texto ?? 'Carregando…'}</p>
}

export function Campo(props: { rotulo: string; id: string; ajuda?: ReactNode; erro?: string | null; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={props.id}>{props.rotulo}</label>
      {props.children}
      {props.ajuda && <span className="ajuda">{props.ajuda}</span>}
      {props.erro && <span className="erro">{props.erro}</span>}
    </div>
  )
}
