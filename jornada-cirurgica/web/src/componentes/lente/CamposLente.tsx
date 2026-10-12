// Campos de valores de lente (olho, modelo, dioptria com sinal, tórica, cilindro, eixo).
// Sinal sempre escolhido explicitamente (erro clássico: sinal ± e vírgula decimal, POP §3).
// autoComplete desligado: em aparelho compartilhado o navegador não pode sugerir o que outra pessoa digitou.
import type { Olho, ValoresLente } from '@dominio/tipos.ts'
import { EscolhaUnica } from '../base/index.tsx'
import { formatarDioptria, formatarEixo } from '../formato.ts'

export type Sinal = '+' | '-' | null

export interface EstadoLente {
  olho: Olho | null
  modelo: string
  sinal: Sinal
  dioptria: string
  torica: boolean | null
  sinalCilindro: Sinal
  cilindro: string
  eixo: string
}

export type ErrosLente = Partial<Record<keyof EstadoLente, string>>

export function estadoLenteVazio(): EstadoLente {
  return { olho: null, modelo: '', sinal: null, dioptria: '', torica: null, sinalCilindro: null, cilindro: '', eixo: '' }
}

function separar(valor: number | null | undefined): { sinal: Sinal; texto: string } {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return { sinal: null, texto: '' }
  return { sinal: valor < 0 ? '-' : '+', texto: Math.abs(valor).toFixed(2).replace('.', ',') }
}

/** Estado preenchido a partir de valores existentes (só para correção do próprio registro; nunca no formulário cego). */
export function estadoLenteDe(v: Partial<ValoresLente>): EstadoLente {
  const d = separar(v.dioptria)
  const c = separar(v.cilindro)
  return {
    olho: v.olho ?? null,
    modelo: v.modelo ?? '',
    sinal: d.sinal,
    dioptria: d.texto,
    torica: v.torica ?? null,
    sinalCilindro: c.sinal,
    cilindro: c.texto,
    eixo: v.eixo === null || v.eixo === undefined ? '' : String(v.eixo),
  }
}

const reMagnitude = /^\d{1,2}([.,]\d{1,2})?$/

/** Lê "21,50" + sinal. */
export function lerDioptria(sinal: Sinal, texto: string): { valor: number | null; erro: string | null } {
  const t = texto.trim()
  if (!sinal && !t) return { valor: null, erro: 'Obrigatório: escolha o sinal e digite o valor.' }
  if (!sinal) return { valor: null, erro: 'Escolha o sinal (+ ou −).' }
  if (!reMagnitude.test(t)) return { valor: null, erro: 'Valor inválido. Exemplo: 21,50' }
  const n = Number(t.replace(',', '.'))
  return { valor: sinal === '-' ? -n : n, erro: null }
}

export function lerEixo(texto: string): { valor: number | null; erro: string | null } {
  const t = texto.trim()
  if (!/^\d{1,3}$/.test(t)) return { valor: null, erro: 'Eixo inválido: número inteiro em graus.' }
  const n = Number(t)
  if (n < 0 || n > 180) return { valor: null, erro: 'Eixo deve estar entre 0 e 180 graus.' }
  return { valor: n, erro: null }
}

/** Valida e monta os valores. `exigirOlho` = false para a leitura do Time Out. */
export function lerEstadoLente(e: EstadoLente, exigirOlho = true): { valores: ValoresLente | null; erros: ErrosLente } {
  const erros: ErrosLente = {}
  if (exigirOlho && !e.olho) erros.olho = 'Escolha o olho.'
  if (!e.modelo.trim()) erros.modelo = 'Digite o modelo.'
  const d = lerDioptria(e.sinal, e.dioptria)
  if (d.erro) erros.dioptria = d.erro
  if (e.torica === null) erros.torica = 'Responda se a lente é tórica.'
  let cilindro: number | null = null
  let eixo: number | null = null
  if (e.torica) {
    const c = lerDioptria(e.sinalCilindro, e.cilindro)
    if (c.erro) erros.cilindro = c.erro
    cilindro = c.valor
    const x = lerEixo(e.eixo)
    if (x.erro) erros.eixo = x.erro
    eixo = x.valor
  }
  if (Object.keys(erros).length) return { valores: null, erros }
  return {
    valores: { olho: (e.olho ?? 'OD') as Olho, modelo: e.modelo.trim(), dioptria: d.valor as number, torica: Boolean(e.torica), cilindro, eixo },
    erros,
  }
}

export function CampoDioptria(props: {
  id: string
  rotulo: string
  sinal: Sinal
  texto: string
  aoMudar: (sinal: Sinal, texto: string) => void
  desabilitado?: boolean
  erro?: string
}) {
  const leitura = lerDioptria(props.sinal, props.texto)
  return (
    <div className="campo">
      <span className="escolha-rotulo" id={`${props.id}-rotulo`}>
        {props.rotulo} <span className="obrigatorio">(com sinal e casa decimal)</span>
      </span>
      <div className="dioptria-entrada" role="group" aria-labelledby={`${props.id}-rotulo`}>
        <button
          type="button"
          className="botao-olho"
          style={{ minWidth: 72, minHeight: 56, fontSize: '1.6rem' }}
          aria-pressed={props.sinal === '+'}
          aria-label={`${props.rotulo}: sinal positivo`}
          disabled={props.desabilitado}
          onClick={() => props.aoMudar('+', props.texto)}
        >
          +
        </button>
        <button
          type="button"
          className="botao-olho"
          style={{ minWidth: 72, minHeight: 56, fontSize: '1.6rem' }}
          aria-pressed={props.sinal === '-'}
          aria-label={`${props.rotulo}: sinal negativo`}
          disabled={props.desabilitado}
          onClick={() => props.aoMudar('-', props.texto)}
        >
          −
        </button>
        <input
          id={props.id}
          aria-label={`${props.rotulo}: valor sem sinal`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="21,50"
          value={props.texto}
          disabled={props.desabilitado}
          onChange={e => props.aoMudar(props.sinal, e.target.value)}
          style={{ minHeight: 56, fontSize: '1.3rem' }}
        />
        <span className="previa-dioptria" aria-live="polite">
          {leitura.valor !== null ? formatarDioptria(leitura.valor) : ''}
        </span>
      </div>
      {props.erro && (
        <span className="erro" role="alert">
          {props.erro}
        </span>
      )}
    </div>
  )
}

export function CamposLente(props: {
  idPrefixo: string
  estado: EstadoLente
  aoMudar: (parcial: Partial<EstadoLente>) => void
  erros?: ErrosLente
  desabilitado?: boolean
  mostrarOlho?: boolean
  rotuloModelo?: string
}) {
  const { estado: e, erros = {} } = props
  const id = props.idPrefixo
  return (
    <div className="pilha">
      {props.mostrarOlho !== false && (
        <div className="campo">
          <span className="escolha-rotulo" id={`${id}-olho-rotulo`}>
            Olho
          </span>
          <div className="opcoes-toque" role="group" aria-labelledby={`${id}-olho-rotulo`}>
            {(['OD', 'OE'] as const).map(o => (
              <button key={o} type="button" className="botao-olho" aria-pressed={e.olho === o} disabled={props.desabilitado} onClick={() => props.aoMudar({ olho: o })}>
                {o === 'OD' ? 'OLHO DIREITO' : 'OLHO ESQUERDO'}
              </button>
            ))}
          </div>
          {erros.olho && (
            <span className="erro" role="alert">
              {erros.olho}
            </span>
          )}
        </div>
      )}
      <div className="campo">
        <label htmlFor={`${id}-modelo`}>{props.rotuloModelo ?? 'Modelo da LIO'}</label>
        <input id={`${id}-modelo`} type="text" autoComplete="off" value={e.modelo} disabled={props.desabilitado} onChange={ev => props.aoMudar({ modelo: ev.target.value })} />
        {erros.modelo && (
          <span className="erro" role="alert">
            {erros.modelo}
          </span>
        )}
      </div>
      <CampoDioptria
        id={`${id}-dioptria`}
        rotulo="Dioptria"
        sinal={e.sinal}
        texto={e.dioptria}
        aoMudar={(sinal, dioptria) => props.aoMudar({ sinal, dioptria })}
        desabilitado={props.desabilitado}
        erro={erros.dioptria}
      />
      <EscolhaUnica
        rotulo="Lente tórica?"
        nome={`${id}-torica`}
        opcoes={[
          { valor: 'sim', rotulo: 'Sim' },
          { valor: 'nao', rotulo: 'Não' },
        ]}
        valor={e.torica === null ? null : e.torica ? 'sim' : 'nao'}
        aoMudar={v => props.aoMudar({ torica: v === 'sim' })}
        desabilitado={props.desabilitado}
      />
      {erros.torica && (
        <span className="erro" role="alert">
          {erros.torica}
        </span>
      )}
      {e.torica && (
        <div className="subcampos">
          <CampoDioptria
            id={`${id}-cilindro`}
            rotulo="Cilindro"
            sinal={e.sinalCilindro}
            texto={e.cilindro}
            aoMudar={(sinalCilindro, cilindro) => props.aoMudar({ sinalCilindro, cilindro })}
            desabilitado={props.desabilitado}
            erro={erros.cilindro}
          />
          <div className="campo">
            <label htmlFor={`${id}-eixo`}>Eixo (graus)</label>
            <input
              id={`${id}-eixo`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={e.eixo}
              disabled={props.desabilitado}
              onChange={ev => props.aoMudar({ eixo: ev.target.value })}
              style={{ maxWidth: 140 }}
            />
            {erros.eixo && (
              <span className="erro" role="alert">
                {erros.eixo}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Resumo legível para conferir antes de registrar. */
export function resumoValores(v: ValoresLente | null, exigirOlho = true): string {
  if (!v) return ''
  const partes = []
  if (exigirOlho) partes.push(v.olho === 'OD' ? 'OLHO DIREITO' : 'OLHO ESQUERDO')
  partes.push(`modelo ${v.modelo}`, formatarDioptria(v.dioptria))
  if (v.torica) partes.push(`tórica: cilindro ${formatarDioptria(v.cilindro)}, eixo ${formatarEixo(v.eixo)}`)
  else partes.push('não tórica')
  return partes.join(' · ')
}
