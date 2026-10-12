// O que falta (briefing §6.6): para cada episódio, o que falta, de quem depende e desde quando.
// Filtros por data da cirurgia e por papel (guardados no endereço, para compartilhar a mesma visão).

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { AcoesEquipe } from '@contrato'
import type { Papel } from '@dominio/tipos.ts'
import { PAPEIS, ROTULO_PAPEL } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Carregando } from '../../componentes/base/index.tsx'
import { dataValida, formatarData, formatarDataHora } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { tempoDecorrido, useCarga, useTitulo } from '../gestao/comum/carga.ts'
import { ErroCarga, SeloSeveridade } from '../gestao/comum/componentes.tsx'
import { ORDEM_SEVERIDADE, rotulosPapeis } from '../gestao/comum/rotulos.ts'
import '../gestao/comum/apoio.css'
import { abaDoLocal } from './locais.ts'

type ItemPendencia = AcoesEquipe['pendencias.listar']['S'][number]
interface Grupo {
  episodioId: string
  pacienteNome: string
  olhoExtenso: string
  itens: ItemPendencia[]
  pior: number
  maisAntiga: number
}

function agrupar(lista: ItemPendencia[]): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const p of lista) {
    let g = mapa.get(p.episodioId)
    if (!g) {
      g = { episodioId: p.episodioId, pacienteNome: p.pacienteNome, olhoExtenso: p.olhoExtenso, itens: [], pior: 9, maisAntiga: Number.POSITIVE_INFINITY }
      mapa.set(p.episodioId, g)
    }
    g.itens.push(p)
    g.pior = Math.min(g.pior, ORDEM_SEVERIDADE[p.severidade] ?? 9)
    const t = Date.parse(p.desde)
    if (!Number.isNaN(t)) g.maisAntiga = Math.min(g.maisAntiga, t)
  }
  const grupos = [...mapa.values()]
  for (const g of grupos) {
    g.itens.sort((a, b) => (ORDEM_SEVERIDADE[a.severidade] ?? 9) - (ORDEM_SEVERIDADE[b.severidade] ?? 9) || Date.parse(a.desde) - Date.parse(b.desde))
  }
  grupos.sort((a, b) => a.pior - b.pior || a.maisAntiga - b.maisAntiga || a.pacienteNome.localeCompare(b.pacienteNome, 'pt-BR'))
  return grupos
}

function Prazo(props: { prazo?: string; agora: number }) {
  if (!props.prazo) return null
  const vencido = Date.parse(props.prazo) < props.agora
  return (
    <span>
      Prazo: {formatarDataHora(props.prazo)}
      {vencido && <strong> (vencido)</strong>}
    </span>
  )
}

export default function Pendencias() {
  useTitulo('O que falta · OFTA VITTA')
  const [busca, setBusca] = useSearchParams()
  const dataBruta = busca.get('data') ?? ''
  const data = dataValida(dataBruta) ? dataBruta : ''
  const papelBruto = busca.get('papel') ?? ''
  const papel = (PAPEIS as readonly string[]).includes(papelBruto) ? (papelBruto as Papel) : ''
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const carga = useCarga(() => chamar('pendencias.listar', { data: data || null, papel: papel || null }), [data, papel])
  const grupos = useMemo(() => agrupar(carga.dados ?? []), [carga.dados])
  const total = carga.dados?.length ?? 0
  const hardStops = carga.dados?.filter(p => p.severidade === 'hard_stop').length ?? 0
  const alertas = carga.dados?.filter(p => p.severidade === 'alerta').length ?? 0

  const definirFiltro = (chave: 'data' | 'papel', valor: string) => {
    const nova = new URLSearchParams(busca)
    if (valor) nova.set(chave, valor)
    else nova.delete(chave)
    setBusca(nova, { replace: true })
  }

  return (
    <main className="pagina apoio pilha">
      <h1>O que falta</h1>
      <p className="subtitulo">Lista do que falta em cada episódio, de quem depende e desde quando. Hard stops primeiro.</p>

      <form className="filtros cartao" role="search" aria-label="Filtrar pendências" onSubmit={e => e.preventDefault()}>
        <div className="campo">
          <label htmlFor="filtro-data">Data da cirurgia</label>
          <input id="filtro-data" type="date" value={data} onChange={e => definirFiltro('data', e.target.value)} aria-describedby="filtro-data-ajuda" />
          <span id="filtro-data-ajuda" className="ajuda">
            Sem data: todos os episódios em aberto.
          </span>
        </div>
        <div className="campo">
          <label htmlFor="filtro-papel">Papel responsável</label>
          <select id="filtro-papel" value={papel} onChange={e => definirFiltro('papel', e.target.value)}>
            <option value="">Todos os papéis</option>
            {PAPEIS.map(p => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </div>
        {(data || papel) && (
          <button type="button" className="botao secundario" onClick={() => setBusca(new URLSearchParams(), { replace: true })}>
            Limpar filtros
          </button>
        )}
        <button type="button" className="botao secundario" onClick={carga.recarregar}>
          Atualizar
        </button>
      </form>

      {carga.erro ? (
        <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
      ) : !carga.dados ? (
        <Carregando />
      ) : (
        <>
          <ul className="contadores" aria-label="Resumo">
            <li>
              <strong>{total}</strong>
              {total === 1 ? 'pendência' : 'pendências'}
            </li>
            <li>
              <strong>{grupos.length}</strong>
              {grupos.length === 1 ? 'episódio' : 'episódios'}
            </li>
            <li>
              <strong>{hardStops}</strong>
              {hardStops === 1 ? 'hard stop' : 'hard stops'}
            </li>
            <li>
              <strong>{alertas}</strong>
              {alertas === 1 ? 'alerta' : 'alertas'}
            </li>
            {carga.carregando && <li role="status">Atualizando…</li>}
          </ul>
          <p className="suave">
            {data ? `Cirurgias de ${formatarData(data)}` : 'Todos os episódios em aberto'} · {papel ? ROTULO_PAPEL[papel] : 'todos os papéis'}
          </p>
          {grupos.length === 0 ? (
            <p role="status">Nada pendente com estes filtros.</p>
          ) : (
            grupos.map(g => (
              <section
                key={g.episodioId}
                className={`cartao pilha grupo-episodio${g.pior === 0 ? ' tem-hard-stop' : ''}`}
                aria-labelledby={`grupo-${g.episodioId}`}
              >
                <div className="linha" style={{ justifyContent: 'space-between' }}>
                  <h2 id={`grupo-${g.episodioId}`} style={{ margin: 0 }}>
                    {g.pacienteNome} · <span className="olho-texto">{g.olhoExtenso}</span>
                  </h2>
                  <Link className="botao secundario pequeno" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} to={ROTAS.episodio(g.episodioId)}>
                    Abrir episódio
                  </Link>
                </div>
                <ul className="lista-pendencias">
                  {g.itens.map(p => {
                    const aba = abaDoLocal(p.local)
                    return (
                      <li key={p.id}>
                        <div className="linha">
                          <SeloSeveridade severidade={p.severidade} />
                          <span>{p.descricao}</span>
                        </div>
                        <div className="pendencia-meta">
                          <span>Responsável: {rotulosPapeis(p.responsavel)}</span>
                          <span>
                            Desde: {tempoDecorrido(p.desde, agora)} ({formatarDataHora(p.desde)})
                          </span>
                          <Prazo prazo={p.prazo} agora={agora} />
                          <Link to={ROTAS.episodio(p.episodioId, aba)} aria-label={`Ir para o local: ${p.descricao}`}>
                            Ir para o local
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </main>
  )
}
