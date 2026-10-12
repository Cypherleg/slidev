// Indicadores de adesão ao POP (seção 12), calculados pelo servidor a partir dos episódios do período.

import { useState, type FormEvent } from 'react'
import type { Indicador } from '@dominio/index.ts'
import { chamar } from '../../api/cliente.ts'
import { Botao, Campo, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { dataValida, formatarData, hojeLocal } from '../../componentes/formato.ts'
import { useCarga } from './comum/carga.ts'
import { ErroCarga, Selo } from './comum/componentes.tsx'
import { apresentarIndicador } from './formatoIndicador.ts'

function inicioDoMes(hoje: string): string {
  return `${hoje.slice(0, 7)}-01`
}

export function TabelaIndicadores(props: { indicadores: Indicador[]; de: string; ate: string }) {
  const lista = [...props.indicadores].sort((a, b) => a.numero - b.numero)
  return (
    <div className="rolagem-tabela">
      <table className="tabela">
        <caption>
          Indicadores de adesão ao POP, de {formatarData(props.de)} a {formatarData(props.ate)}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="numero">
              Nº
            </th>
            <th scope="col">Indicador</th>
            <th scope="col" className="numero">
              Numerador
            </th>
            <th scope="col" className="numero">
              Denominador
            </th>
            <th scope="col" className="numero">
              Valor
            </th>
            <th scope="col">Meta</th>
            <th scope="col">Observação</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(i => {
            const a = apresentarIndicador(i)
            return (
              <tr key={i.numero} data-indicador={i.numero}>
                <td className="numero">{i.numero}</td>
                <th scope="row" style={{ fontWeight: 600 }}>
                  {i.nome}
                </th>
                <td className="numero">{a.numerador}</td>
                <td className="numero">{a.denominador}</td>
                <td className="numero">{a.manual ? <Selo tipo="atencao">Registro manual</Selo> : <strong>{a.valor}</strong>}</td>
                <td>{i.meta || '—'}</td>
                <td>{i.observacao ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Indicadores() {
  const hoje = hojeLocal()
  const [de, setDe] = useState(inicioDoMes(hoje))
  const [ate, setAte] = useState(hoje)
  const [periodo, setPeriodo] = useState({ de: inicioDoMes(hoje), ate: hoje })
  const [erro, setErro] = useState<string | null>(null)
  const carga = useCarga(() => chamar('indicadores.calcular', periodo), [periodo.de, periodo.ate])

  const calcular = (e: FormEvent) => {
    e.preventDefault()
    if (!dataValida(de) || !dataValida(ate)) return setErro('Informe as duas datas.')
    if (de > ate) return setErro('A data inicial deve ser anterior ou igual à final.')
    setErro(null)
    if (de === periodo.de && ate === periodo.ate) carga.recarregar()
    else setPeriodo({ de, ate })
  }

  return (
    <div className="pilha">
      <Cartao titulo="Período">
        <form className="filtros" onSubmit={calcular} noValidate aria-label="Período dos indicadores">
          <Campo rotulo="De" id="ind-de">
            <input id="ind-de" type="date" value={de} onChange={e => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" id="ind-ate">
            <input id="ind-ate" type="date" value={ate} onChange={e => setAte(e.target.value)} />
          </Campo>
          <Botao submit>Calcular</Botao>
          <Botao tipo="secundario" onClick={() => window.print()}>
            Imprimir
          </Botao>
        </form>
        {erro && (
          <p className="erro-campo" role="alert">
            {erro}
          </p>
        )}
      </Cartao>
      <Cartao titulo="Indicadores">
        <p className="suave" style={{ margin: 0 }}>
          Fórmulas e metas da seção 12 do POP. Indicadores que dependem de observação direta ou de fonte fora do painel aparecem como "registro manual".
        </p>
        {carga.erro ? (
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        ) : !carga.dados || carga.carregando ? (
          <Carregando texto="Calculando…" />
        ) : carga.dados.length === 0 ? (
          <p>Nenhum indicador para o período.</p>
        ) : (
          <TabelaIndicadores indicadores={carga.dados} de={periodo.de} ate={periodo.ate} />
        )}
      </Cartao>
    </div>
  )
}
