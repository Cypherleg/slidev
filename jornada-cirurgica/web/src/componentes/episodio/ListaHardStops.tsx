// Hard stops abertos em destaque, com "como resolver" e quem pode resolver (briefing regra 3).
// Não existe botão genérico de "prosseguir assim mesmo": só a resolução escrita por quem tem competência.
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CodigoHardStop, HardStop, Papel } from '@dominio/tipos.ts'
import { Botao, Campo, Selo } from '../base/index.tsx'
import { formatarDataHora } from '../formato.ts'
import { temAlgumPapel } from '../permissoes.ts'
import { rotuloPapeis, rotuloTransicao } from '../rotulos.ts'

export function ListaHardStops(props: {
  hardStops: HardStop[]
  papeisAtor: readonly Papel[]
  /** Permissão do servidor para `hardstop.resolver` deste código (chave `hardstop.resolver:<codigo>`), se vier. */
  permissaoPara?: (codigo: CodigoHardStop) => { permitido: boolean; motivo?: string } | null
  aoResolver: (codigo: CodigoHardStop, resolucao: string) => Promise<boolean>
  /** Atalho para onde o hard stop se resolve (ex.: quarentena da lente, nome da mãe). */
  caminhoPara?: (h: HardStop) => ReactNode
  grande?: boolean
}) {
  if (props.hardStops.length === 0) return null
  return (
    <section className="pilha" aria-labelledby="titulo-hard-stops">
      <h2 id="titulo-hard-stops" style={{ color: 'var(--perigo)', margin: 0, fontSize: props.grande ? '1.6rem' : undefined }}>
        {props.hardStops.length === 1 ? 'HARD STOP aberto' : `${props.hardStops.length} HARD STOPS abertos`}: a passagem está bloqueada
      </h2>
      {props.hardStops.map(h => (
        <ItemHardStop
          key={h.codigo}
          h={h}
          papeisAtor={props.papeisAtor}
          permissaoServidor={props.permissaoPara?.(h.codigo) ?? null}
          aoResolver={props.aoResolver}
          caminho={props.caminhoPara?.(h)}
        />
      ))}
    </section>
  )
}

function ItemHardStop(props: {
  h: HardStop
  papeisAtor: readonly Papel[]
  permissaoServidor?: { permitido: boolean; motivo?: string } | null
  aoResolver: (codigo: CodigoHardStop, resolucao: string) => Promise<boolean>
  caminho?: ReactNode
}) {
  const { h } = props
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pode = temAlgumPapel(props.papeisAtor, h.resolvivelPor) && (props.permissaoServidor?.permitido ?? true)
  const idTexto = `resolucao-${h.codigo}`
  return (
    <article className="hard-stop" aria-labelledby={`hs-${h.codigo}`}>
      <h3 id={`hs-${h.codigo}`}>{h.titulo}</h3>
      <p style={{ margin: 0 }}>{h.descricao}</p>
      <p style={{ margin: 0 }}>
        <strong>Como resolver: </strong>
        {h.comoResolver}
      </p>
      <p style={{ margin: 0 }}>
        <strong>Quem pode resolver: </strong>
        {rotuloPapeis(h.resolvivelPor)}
      </p>
      {h.bloqueia.length > 0 && (
        <p style={{ margin: 0 }}>
          <strong>Bloqueia: </strong>
          {h.bloqueia.map(rotuloTransicao).join('; ')}
        </p>
      )}
      {props.caminho && <div>{props.caminho}</div>}
      <p className="suave" style={{ margin: 0 }}>
        Aberto desde {formatarDataHora(h.abertoDesde)} · {h.fonte} <Selo tipo="perigo">{h.codigo}</Selo>
      </p>
      {h.exigeResolucaoEscrita ? (
        pode ? (
          <form
            className="pilha"
            onSubmit={async e => {
              e.preventDefault()
              if (texto.trim().length < 3) return
              setEnviando(true)
              try {
                if (await props.aoResolver(h.codigo, texto.trim())) setTexto('')
              } finally {
                setEnviando(false)
              }
            }}
          >
            <Campo rotulo="Resolução escrita (fica registrada com seu nome e horário)" id={idTexto}>
              <textarea id={idTexto} value={texto} onChange={e => setTexto(e.target.value)} rows={3} />
            </Campo>
            <div>
              <Botao submit tipo="perigo" desabilitado={enviando || texto.trim().length < 3}>
                {enviando ? 'Registrando…' : 'Registrar resolução'}
              </Botao>
            </div>
          </form>
        ) : (
          <p className="motivo-bloqueio" style={{ margin: 0 }}>
            Aguardando resolução escrita de: {rotuloPapeis(h.resolvivelPor)}.{props.permissaoServidor?.motivo ? ` ${props.permissaoServidor.motivo}` : ''}
          </p>
        )
      ) : (
        <p className="motivo-bloqueio" style={{ margin: 0 }}>
          Não se resolve por texto aqui: siga "Como resolver". O bloqueio some quando o registro correspondente for feito por quem tem competência.
        </p>
      )}
    </article>
  )
}
