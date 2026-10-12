// Componentes básicos compartilhados. Mantidos pelo agente web-clínico; o agente web-apoio só usa.
// Exports estáveis: Botao, Cartao, Aviso, OlhoDestaque, Dots, Carregando, Campo (props novas são opcionais).
import type { ReactNode } from 'react'
import type { Dot, Olho } from '@dominio/tipos.ts'
import { OLHO_EXTENSO } from '@dominio/tipos.ts'
import '../estilos.css'

export function Botao(props: {
  children: ReactNode
  onClick?: () => void
  tipo?: 'primario' | 'secundario' | 'perigo'
  pequeno?: boolean
  desabilitado?: boolean
  submit?: boolean
  titulo?: string
  /** Texto para leitor de tela quando o conteúdo visível não basta. */
  rotuloAria?: string
  /** Motivo do bloqueio: exibido abaixo do botão quando desabilitado (cor nunca sozinha). */
  motivo?: string | null
  id?: string
  grande?: boolean
}) {
  const classes = ['botao', props.tipo && props.tipo !== 'primario' ? props.tipo : '', props.pequeno ? 'pequeno' : '', props.grande ? 'grande' : '']
    .filter(Boolean)
    .join(' ')
  const idMotivo = props.id && props.motivo ? `${props.id}-motivo` : undefined
  const botao = (
    <button
      id={props.id}
      type={props.submit ? 'submit' : 'button'}
      className={classes}
      onClick={props.onClick}
      disabled={props.desabilitado}
      title={props.titulo ?? (props.desabilitado && props.motivo ? props.motivo : undefined)}
      aria-label={props.rotuloAria}
      aria-describedby={props.desabilitado ? idMotivo : undefined}
    >
      {props.children}
    </button>
  )
  // Com a prop `motivo` (mesmo nula), a estrutura do DOM fica estável: o botão não é recriado ao habilitar.
  if (props.motivo !== undefined) {
    return (
      <span className="botao-com-motivo">
        {botao}
        {props.desabilitado && props.motivo && (
          <span className="motivo-bloqueio" id={idMotivo}>
            {props.motivo}
          </span>
        )}
      </span>
    )
  }
  return botao
}

export function Cartao(props: { titulo?: ReactNode; children: ReactNode; acoes?: ReactNode; id?: string; destaque?: 'perigo' | 'atencao' | 'ok' }) {
  return (
    <section className={`cartao pilha${props.destaque ? ` destaque-${props.destaque}` : ''}`} id={props.id} aria-labelledby={props.id && props.titulo ? `${props.id}-titulo` : undefined}>
      {(props.titulo || props.acoes) && (
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          {props.titulo ? (
            <h2 style={{ margin: 0 }} id={props.id ? `${props.id}-titulo` : undefined}>
              {props.titulo}
            </h2>
          ) : (
            <span />
          )}
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
export function OlhoDestaque(props: { olho: Olho; grande?: boolean; enorme?: boolean }) {
  const tam = props.enorme ? ' enorme' : props.grande ? ' grande' : ''
  return <span className={`olho-destaque${tam}`}>{OLHO_EXTENSO[props.olho]}</span>
}

/** Dots com letra dentro; nunca só cor (POP §2). `legenda` escreve também o nome do alerta ao lado. */
export function Dots(props: { dots: Dot[]; legenda?: boolean; semTextoVazio?: boolean }) {
  if (props.dots.length === 0) {
    if (props.semTextoVazio) return <span className="suave">Sem dots</span>
    return <span className="suave">Sem dots. Ausência de dot não significa ausência de risco.</span>
  }
  return (
    <span className="dots" role="list" aria-label="Dots da pulseira">
      {props.dots.map(d => (
        <span key={d.letra} role="listitem" className={props.legenda ? 'dot-com-legenda' : undefined}>
          <span className={`dot ${d.cor}`} title={`${d.rotulo}: ${d.motivo}`} aria-label={`${d.letra}: ${d.rotulo}`}>
            {d.letra}
          </span>
          {props.legenda && (
            <span className="dot-legenda">
              <strong>{d.rotulo}</strong>
              <span className="suave"> ({d.motivo})</span>
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

export function Carregando(props: { texto?: string }) {
  return (
    <p className="suave" role="status">
      {props.texto ?? 'Carregando…'}
    </p>
  )
}

export function Campo(props: { rotulo: ReactNode; id: string; ajuda?: ReactNode; erro?: string | null; children: ReactNode; obrigatorio?: boolean }) {
  return (
    <div className="campo">
      <label htmlFor={props.id}>
        {props.rotulo}
        {props.obrigatorio && <span className="obrigatorio"> (obrigatório)</span>}
      </label>
      {props.children}
      {props.ajuda && <span className="ajuda">{props.ajuda}</span>}
      {props.erro && (
        <span className="erro" role="alert">
          {props.erro}
        </span>
      )}
    </div>
  )
}

/** Selo de texto curto (estado, "fora de hora", "falta"). Sempre com texto, nunca só cor. */
export function Selo(props: { children: ReactNode; tipo?: 'info' | 'ok' | 'atencao' | 'perigo' | 'pop' | 'neutro'; titulo?: string }) {
  return (
    <span className={`selo ${props.tipo ?? 'neutro'}`} title={props.titulo}>
      {props.children}
    </span>
  )
}

/** Grupo de botões grandes de escolha única (alvo de toque ≥ 48px). */
export function EscolhaUnica<T extends string>(props: {
  rotulo: ReactNode
  nome: string
  opcoes: { valor: T; rotulo: ReactNode }[]
  valor: T | null | undefined
  aoMudar: (v: T) => void
  desabilitado?: boolean
  grande?: boolean
  idRotulo?: string
}) {
  const idRotulo = props.idRotulo ?? `${props.nome}-rotulo`
  return (
    <div className="escolha" role="radiogroup" aria-labelledby={idRotulo}>
      <span className="escolha-rotulo" id={idRotulo}>
        {props.rotulo}
      </span>
      <div className="opcoes-toque">
        {props.opcoes.map(o => {
          const marcado = props.valor === o.valor
          return (
            <label key={o.valor} className={`opcao-toque${marcado ? ' marcada' : ''}${props.grande ? ' grande' : ''}${props.desabilitado ? ' desabilitada' : ''}`}>
              <input type="radio" name={props.nome} value={o.valor} checked={marcado} disabled={props.desabilitado} onChange={() => props.aoMudar(o.valor)} />
              <span>{o.rotulo}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
