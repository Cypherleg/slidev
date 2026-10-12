// Entrada de resposta para cada TipoResposta do modelo de checklist.
import { useEffect, useState } from 'react'
import type { ItemModelo, OpcaoItem, ValorAlergia, ValorMedicamento, ValorPessoa, ValorResposta } from '@dominio/tipos.ts'
import { EscolhaUnica } from '../base/index.tsx'
import { formatarNumero, lerNumero } from '../formato.ts'
import { camposExtrasMedicamento, ROTULO_CAMPO_PESSOA, ROTULO_USO, rotuloDetalhesMedicamento } from './valores.ts'

export interface PropsCampo {
  item: ItemModelo
  valor: ValorResposta | undefined
  aoMudar: (v: ValorResposta | undefined) => void
  desabilitado: boolean
  /** id DOM único do item (prefixo dos ids dos campos). */
  idBase: string
  /** id do elemento com o texto do item (nome acessível do grupo). */
  idTexto: string
  /** A resposta já registrada é uma confirmação (não pode ser desmarcada). */
  confirmado?: boolean
  /** Opções visíveis, quando dependem de outro registro (padrão: `item.opcoes`). */
  opcoes?: OpcaoItem[]
}

export function CampoResposta(p: PropsCampo) {
  switch (p.item.tipo) {
    case 'confirmacao':
      return <CampoConfirmacao {...p} />
    case 'sim_nao':
      return (
        <EscolhaUnica
          rotulo={<span className="sr-only">Resposta</span>}
          idRotulo={`${p.idBase}-rotulo`}
          nome={`${p.idBase}-sn`}
          opcoes={[
            { valor: 'sim', rotulo: 'Sim' },
            { valor: 'nao', rotulo: 'Não' },
          ]}
          valor={typeof p.valor === 'string' ? p.valor : null}
          aoMudar={v => p.aoMudar(v)}
          desabilitado={p.desabilitado}
        />
      )
    case 'opcao': {
      const opcoes = [...(p.opcoes ?? p.item.opcoes ?? [])]
      if (p.item.permiteNaoSabe) opcoes.push({ valor: 'nao_sabe', rotulo: 'Não sabe' })
      return (
        <EscolhaUnica
          rotulo={<span className="sr-only">Opções</span>}
          idRotulo={`${p.idBase}-rotulo`}
          nome={`${p.idBase}-op`}
          opcoes={opcoes}
          valor={typeof p.valor === 'string' ? p.valor : null}
          aoMudar={v => p.aoMudar(v)}
          desabilitado={p.desabilitado}
        />
      )
    }
    case 'multipla':
      return <CampoMultipla {...p} />
    case 'texto':
      return (
        <textarea
          id={`${p.idBase}-texto`}
          aria-labelledby={p.idTexto}
          className="entrada"
          rows={2}
          value={typeof p.valor === 'string' ? p.valor : ''}
          disabled={p.desabilitado}
          onChange={e => p.aoMudar(e.target.value === '' ? undefined : e.target.value)}
        />
      )
    case 'data':
      return (
        <input
          id={`${p.idBase}-data`}
          aria-labelledby={p.idTexto}
          className="entrada"
          type="date"
          value={typeof p.valor === 'string' ? p.valor : ''}
          disabled={p.desabilitado}
          onChange={e => p.aoMudar(e.target.value === '' ? undefined : e.target.value)}
        />
      )
    case 'hora':
      return (
        <input
          id={`${p.idBase}-hora`}
          aria-labelledby={p.idTexto}
          className="entrada"
          type="time"
          value={typeof p.valor === 'string' ? p.valor : ''}
          disabled={p.desabilitado}
          onChange={e => p.aoMudar(e.target.value === '' ? undefined : e.target.value)}
        />
      )
    case 'numero':
      return <CampoNumero {...p} />
    case 'olho':
      return <CampoOlho {...p} />
    case 'medicamento':
      return <CampoMedicamento {...p} />
    case 'alergia':
      return <CampoAlergia {...p} />
    case 'pessoa':
      return <CampoPessoa {...p} />
  }
  return null
}

function CampoConfirmacao(p: PropsCampo) {
  const marcado = p.valor === true
  return (
    <label className={`confirmacao-toque${marcado ? ' marcada' : ''}`}>
      <input
        type="checkbox"
        id={`${p.idBase}-conf`}
        checked={marcado}
        disabled={p.desabilitado || p.confirmado}
        aria-describedby={p.idTexto}
        onChange={e => p.aoMudar(e.target.checked ? true : undefined)}
      />
      <span>{p.confirmado ? 'Conferido' : marcado ? 'Conferido (ainda não registrado)' : 'Marcar como conferido'}</span>
    </label>
  )
}

function CampoMultipla(p: PropsCampo) {
  const atual = Array.isArray(p.valor) ? p.valor : []
  return (
    <div className="opcoes-toque" role="group" aria-labelledby={p.idTexto}>
      {(p.opcoes ?? p.item.opcoes ?? []).map(o => {
        const marcado = atual.includes(o.valor)
        return (
          <label key={o.valor} className={`opcao-toque${marcado ? ' marcada' : ''}${p.desabilitado ? ' desabilitada' : ''}`}>
            <input
              type="checkbox"
              checked={marcado}
              disabled={p.desabilitado}
              onChange={e => {
                const novo = e.target.checked ? [...atual, o.valor] : atual.filter(x => x !== o.valor)
                p.aoMudar(novo.length ? novo : undefined)
              }}
            />
            <span>{o.rotulo}</span>
          </label>
        )
      })}
    </div>
  )
}

function CampoNumero(p: PropsCampo) {
  const [texto, setTexto] = useState(() => (typeof p.valor === 'number' ? formatarNumero(p.valor) : typeof p.valor === 'string' ? p.valor : ''))
  useEffect(() => {
    // Sincroniza quando o valor externo muda (ex.: rascunho descartado).
    if (typeof p.valor === 'number' && lerNumero(texto) !== p.valor) setTexto(formatarNumero(p.valor))
    if (p.valor === undefined && texto !== '') setTexto('')
  }, [p.valor])
  return (
    <input
      id={`${p.idBase}-numero`}
      aria-labelledby={p.idTexto}
      className="entrada"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      disabled={p.desabilitado}
      onChange={e => {
        setTexto(e.target.value)
        if (e.target.value.trim() === '') p.aoMudar(undefined)
        else {
          const n = lerNumero(e.target.value)
          // Texto inválido fica como texto: a validação mostra "Número inválido".
          p.aoMudar(n ?? e.target.value)
        }
      }}
    />
  )
}

function CampoOlho(p: PropsCampo) {
  const opcoes: { valor: string; rotulo: string }[] = [
    { valor: 'OD', rotulo: 'OLHO DIREITO' },
    { valor: 'OE', rotulo: 'OLHO ESQUERDO' },
  ]
  if (p.item.permiteNaoSabe) opcoes.push({ valor: 'nao_sabe', rotulo: 'NÃO SABE' })
  return (
    <div className="opcoes-toque" role="group" aria-labelledby={p.idTexto}>
      {opcoes.map(o => (
        <button key={o.valor} type="button" className="botao-olho" aria-pressed={p.valor === o.valor} disabled={p.desabilitado} onClick={() => p.aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

function SimNaoBooleano(props: { rotulo: string; nome: string; valor: boolean | undefined; aoMudar: (v: boolean) => void; desabilitado: boolean }) {
  return (
    <EscolhaUnica
      rotulo={props.rotulo}
      nome={props.nome}
      opcoes={[
        { valor: 'sim', rotulo: 'Sim' },
        { valor: 'nao', rotulo: 'Não' },
      ]}
      valor={props.valor === undefined ? null : props.valor ? 'sim' : 'nao'}
      aoMudar={v => props.aoMudar(v === 'sim')}
      desabilitado={props.desabilitado}
    />
  )
}

function CampoMedicamento(p: PropsCampo) {
  const m = (typeof p.valor === 'object' && p.valor !== null && !Array.isArray(p.valor) ? p.valor : {}) as Partial<ValorMedicamento>
  const extras = camposExtrasMedicamento(p.item)
  const mudar = (parcial: Partial<ValorMedicamento>) => {
    const novo = { ...m, ...parcial } as ValorMedicamento
    if (novo.uso === 'nao') {
      // "Não usa" não carrega detalhes de uso.
      p.aoMudar({ uso: 'nao' })
      return
    }
    p.aoMudar(novo)
  }
  return (
    <div className="pilha">
      <EscolhaUnica
        rotulo="Uso"
        nome={`${p.idBase}-uso`}
        opcoes={(Object.keys(ROTULO_USO) as ValorMedicamento['uso'][]).map(u => ({ valor: u, rotulo: ROTULO_USO[u] }))}
        valor={m.uso ?? null}
        aoMudar={uso => mudar({ uso })}
        desabilitado={p.desabilitado}
      />
      {m.uso && m.uso !== 'nao' && (
        <div className="subcampos">
          <div className="campo">
            <label htmlFor={`${p.idBase}-nomes`}>Nomes comerciais informados</label>
            <input id={`${p.idBase}-nomes`} type="text" autoComplete="off" value={m.nomes ?? ''} disabled={p.desabilitado} onChange={e => mudar({ nomes: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor={`${p.idBase}-detalhes`}>{rotuloDetalhesMedicamento(p.item)}</label>
            <input id={`${p.idBase}-detalhes`} type="text" autoComplete="off" value={m.detalhes ?? ''} disabled={p.desabilitado} onChange={e => mudar({ detalhes: e.target.value })} />
          </div>
          {extras.glp1 && (
            <>
              <EscolhaUnica
                rotulo="Aplicação"
                nome={`${p.idBase}-aplicacao`}
                opcoes={[
                  { valor: 'semanal', rotulo: 'Semanal' },
                  { valor: 'diaria', rotulo: 'Diária' },
                ]}
                valor={m.aplicacao ?? null}
                aoMudar={aplicacao => mudar({ aplicacao })}
                desabilitado={p.desabilitado}
              />
              <div className="campo">
                <label htmlFor={`${p.idBase}-ultima`}>Data da última aplicação</label>
                <input id={`${p.idBase}-ultima`} type="date" value={m.ultimaAplicacao ?? ''} disabled={p.desabilitado} onChange={e => mudar({ ultimaAplicacao: e.target.value || undefined })} />
              </div>
              <SimNaoBooleano
                rotulo="Início ou aumento de dose nos últimos 3 meses?"
                nome={`${p.idBase}-inicio`}
                valor={m.inicioOuAumentoUltimos3Meses}
                aoMudar={v => mudar({ inicioOuAumentoUltimos3Meses: v })}
                desabilitado={p.desabilitado}
              />
              <SimNaoBooleano rotulo="Náusea ou vômito?" nome={`${p.idBase}-nausea`} valor={m.nauseaOuVomito} aoMudar={v => mudar({ nauseaOuVomito: v })} desabilitado={p.desabilitado} />
            </>
          )}
          {extras.insulina && (
            <SimNaoBooleano
              rotulo="É insulina ou sulfonilureia?"
              nome={`${p.idBase}-insulina`}
              valor={m.insulinaOuSulfonilureia}
              aoMudar={v => mudar({ insulinaOuSulfonilureia: v })}
              desabilitado={p.desabilitado}
            />
          )}
        </div>
      )}
    </div>
  )
}

function CampoAlergia(p: PropsCampo) {
  const a = (typeof p.valor === 'object' && p.valor !== null && !Array.isArray(p.valor) ? p.valor : {}) as Partial<ValorAlergia>
  return (
    <div className="pilha">
      <SimNaoBooleano
        rotulo="Tem alergia?"
        nome={`${p.idBase}-tem`}
        valor={a.tem}
        aoMudar={tem => p.aoMudar(tem ? { tem: true, reacao: a.reacao ?? '' } : { tem: false })}
        desabilitado={p.desabilitado}
      />
      {a.tem && (
        <div className="campo">
          <label htmlFor={`${p.idBase}-reacao`}>
            Descreva a reação <span className="obrigatorio">(obrigatório)</span>
          </label>
          <textarea id={`${p.idBase}-reacao`} rows={2} value={a.reacao ?? ''} disabled={p.desabilitado} onChange={e => p.aoMudar({ tem: true, reacao: e.target.value })} />
        </div>
      )}
    </div>
  )
}

function CampoPessoa(p: PropsCampo) {
  const pessoa = (typeof p.valor === 'object' && p.valor !== null && !Array.isArray(p.valor) ? p.valor : {}) as Partial<ValorPessoa>
  const exigidos = p.item.camposPessoa?.length ? p.item.camposPessoa : (['nome'] as (keyof ValorPessoa)[])
  const mudar = (parcial: Partial<ValorPessoa>) => {
    const novo = { ...pessoa, ...parcial }
    const vazio = !novo.nome && !novo.parentesco && !novo.telefone && !novo.observacao
    p.aoMudar(vazio ? undefined : ({ ...novo, nome: novo.nome ?? '' } as ValorPessoa))
  }
  const campos: { chave: keyof ValorPessoa; tipo: string }[] = [
    { chave: 'nome', tipo: 'text' },
    { chave: 'parentesco', tipo: 'text' },
    { chave: 'telefone', tipo: 'tel' },
    { chave: 'observacao', tipo: 'text' },
  ]
  return (
    <div className="subcampos">
      {campos.map(c => (
        <div className="campo" key={c.chave}>
          <label htmlFor={`${p.idBase}-${c.chave}`}>
            {ROTULO_CAMPO_PESSOA[c.chave]}
            {exigidos.includes(c.chave) && <span className="obrigatorio"> (obrigatório)</span>}
          </label>
          <input
            id={`${p.idBase}-${c.chave}`}
            type={c.tipo}
            autoComplete="off"
            value={pessoa[c.chave] ?? ''}
            disabled={p.desabilitado}
            onChange={e => mudar({ [c.chave]: c.chave === 'nome' ? e.target.value : e.target.value || undefined })}
          />
        </div>
      ))}
    </div>
  )
}
