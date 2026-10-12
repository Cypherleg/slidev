// Resumo para o cirurgião na véspera (briefing §6.6): episódios do dia, alertas sem conduta,
// lentes não conferidas e termos não assinados. Cada linha leva ao episódio.

import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { AcoesEquipe } from '@contrato'
import type { EpisodioResumoDia, EtapaLente, StatusTcle } from '@dominio/tipos.ts'
import { ROTULO_ESTADO } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Carregando, Dots } from '../../componentes/base/index.tsx'
import { dataComDiaDaSemana, dataValida, formatarData, hojeLocal, somarDias } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { useCarga, useTitulo } from '../gestao/comum/carga.ts'
import { ErroCarga, Selo } from '../gestao/comum/componentes.tsx'
import { ROTULO_ETAPA_LENTE, ROTULO_STATUS_TCLE, rotuloDe } from '../gestao/comum/rotulos.ts'
import '../gestao/comum/apoio.css'

type Resumo = AcoesEquipe['resumo.vespera']['S']

function ordenar(eps: EpisodioResumoDia[]): EpisodioResumoDia[] {
  return [...eps].sort(
    (a, b) =>
      (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER) ||
      (a.horario ?? '99:99').localeCompare(b.horario ?? '99:99') ||
      a.pacienteNome.localeCompare(b.pacienteNome, 'pt-BR'),
  )
}

/** Identificação com dois identificadores (nome e nascimento) e o olho por extenso. */
function Identificacao(props: { episodioId: string; nome: string; mapa: Map<string, EpisodioResumoDia> }) {
  const ep = props.mapa.get(props.episodioId)
  return (
    <>
      <strong>{props.nome}</strong>
      {ep && (
        <>
          {' '}
          · nasc. {formatarData(ep.dataNascimento)} · <span className="olho-texto">{ep.olhoExtenso}</span>
        </>
      )}
    </>
  )
}

function Secao(props: { id: string; titulo: string; total: number; vazio: string; children: ReactNode }) {
  return (
    <section className="cartao pilha" aria-labelledby={props.id}>
      <h2 id={props.id} style={{ margin: 0 }}>
        {props.titulo} <Selo tipo={props.total > 0 ? 'atencao' : 'ok'}>{props.total}</Selo>
      </h2>
      {props.total === 0 ? <p>{props.vazio}</p> : props.children}
    </section>
  )
}

export default function ResumoVespera() {
  const { data: param = '' } = useParams()
  const navegar = useNavigate()
  const data = dataValida(param) ? param : ''
  useTitulo('Resumo da véspera · OFTA VITTA')

  const carga = useCarga<Resumo | null>(() => (data ? chamar('resumo.vespera', { data }) : Promise.resolve(null)), [data])
  const r = carga.dados
  const episodios = useMemo(() => ordenar(r?.episodios ?? []), [r])
  const mapa = useMemo(() => new Map(episodios.map(e => [e.episodioId, e])), [episodios])

  const amanha = somarDias(hojeLocal(), 1)

  return (
    <main className="pagina apoio pilha">
      <h1>Resumo da véspera</h1>
      <nav className="filtros nao-imprimir" aria-label="Escolher a data">
        <div className="campo">
          <label htmlFor="data-vespera">Cirurgias do dia</label>
          <input id="data-vespera" type="date" value={data} onChange={e => dataValida(e.target.value) && navegar(ROTAS.vespera(e.target.value))} />
        </div>
        {data && (
          <>
            <Link className="botao secundario" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} to={ROTAS.vespera(somarDias(data, -1))}>
              Dia anterior
            </Link>
            <Link className="botao secundario" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} to={ROTAS.vespera(somarDias(data, 1))}>
              Dia seguinte
            </Link>
          </>
        )}
        {data !== amanha && (
          <Link className="botao secundario" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} to={ROTAS.vespera(amanha)}>
            Amanhã
          </Link>
        )}
        <button type="button" className="botao secundario" onClick={() => window.print()}>
          Imprimir
        </button>
      </nav>

      {!data ? (
        <p role="alert">Data inválida. Escolha a data das cirurgias.</p>
      ) : carga.erro ? (
        <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
      ) : !r ? (
        <Carregando />
      ) : (
        <>
          <p className="subtitulo">
            Cirurgias de <strong>{dataComDiaDaSemana(data)}</strong>
          </p>
          <ul className="contadores" aria-label="Resumo do dia">
            <li>
              <strong>{episodios.length}</strong>
              {episodios.length === 1 ? 'episódio' : 'episódios'}
            </li>
            <li>
              <strong>{r.alertasSemConduta.length}</strong>
              {r.alertasSemConduta.length === 1 ? 'alerta sem conduta' : 'alertas sem conduta'}
            </li>
            <li>
              <strong>{r.lentesNaoConferidas.length}</strong>
              {r.lentesNaoConferidas.length === 1 ? 'lente não conferida' : 'lentes não conferidas'}
            </li>
            <li>
              <strong>{r.termosNaoAssinados.length}</strong>
              {r.termosNaoAssinados.length === 1 ? 'termo não assinado' : 'termos não assinados'}
            </li>
          </ul>

          <Secao id="sec-alertas" titulo="Alertas sem conduta" total={r.alertasSemConduta.length} vazio="Nenhum alerta aguardando conduta.">
            <p className="suave">A conduta é escrita pelo cirurgião, no episódio.</p>
            <ul className="lista-pendencias">
              {r.alertasSemConduta.map((a, i) => (
                <li key={`${a.episodioId}-${i}`}>
                  <span>
                    <Identificacao episodioId={a.episodioId} nome={a.paciente} mapa={mapa} />
                  </span>
                  <span>
                    <Selo tipo="atencao">ALERTA</Selo> {a.alerta}
                  </span>
                  <Link to={ROTAS.episodio(a.episodioId)}>Abrir episódio para escrever a conduta</Link>
                </li>
              ))}
            </ul>
          </Secao>

          <Secao id="sec-lentes" titulo="Lentes não conferidas" total={r.lentesNaoConferidas.length} vazio="Todas as lentes do dia estão conferidas.">
            <ul className="lista-pendencias">
              {r.lentesNaoConferidas.map((l, i) => (
                <li key={`${l.episodioId}-${i}`}>
                  <span>
                    <Identificacao episodioId={l.episodioId} nome={l.paciente} mapa={mapa} />
                  </span>
                  <span>
                    Situação: <strong>{rotuloDe(ROTULO_ETAPA_LENTE, l.etapa as EtapaLente)}</strong>
                  </span>
                  <Link to={ROTAS.episodio(l.episodioId, 'lente')}>Abrir a lente do episódio</Link>
                </li>
              ))}
            </ul>
          </Secao>

          <Secao id="sec-termos" titulo="Termos não assinados" total={r.termosNaoAssinados.length} vazio="Todos os termos do dia estão assinados.">
            <ul className="lista-pendencias">
              {r.termosNaoAssinados.map((t, i) => (
                <li key={`${t.episodioId}-${i}`}>
                  <span>
                    <Identificacao episodioId={t.episodioId} nome={t.paciente} mapa={mapa} />
                  </span>
                  <span>
                    TCLE: <strong>{rotuloDe(ROTULO_STATUS_TCLE, t.status as StatusTcle)}</strong>
                  </span>
                  <Link to={ROTAS.episodio(t.episodioId, 'd2')}>Abrir o TCLE do episódio</Link>
                </li>
              ))}
            </ul>
          </Secao>

          <section className="cartao pilha" aria-labelledby="sec-episodios">
            <h2 id="sec-episodios" style={{ margin: 0 }}>
              Episódios do dia
            </h2>
            {episodios.length === 0 ? (
              <p>Nenhuma cirurgia agendada para esta data.</p>
            ) : (
              <div className="rolagem-tabela">
                <table className="tabela">
                  <caption className="sr-only">Episódios do dia {formatarData(data)}, em ordem</caption>
                  <thead>
                    <tr>
                      <th scope="col">Ordem</th>
                      <th scope="col">Paciente</th>
                      <th scope="col">Olho</th>
                      <th scope="col">Cirurgião</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Lente</th>
                      <th scope="col">Alertas</th>
                      <th scope="col">Pendências</th>
                      <th scope="col">
                        <span className="sr-only">Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {episodios.map(e => (
                      <tr key={e.episodioId}>
                        <td>
                          {e.ordem ?? '—'}
                          {e.horario ? ` · ${e.horario}` : ''}
                        </td>
                        <td>
                          <strong>{e.pacienteNome}</strong>
                          <br />
                          nasc. {formatarData(e.dataNascimento)}
                          {e.homonimoOuParecido && (
                            <>
                              <br />
                              <Selo tipo="perigo">HOMÔNIMO OU NOME PARECIDO</Selo>
                            </>
                          )}
                        </td>
                        <td>
                          <span className="olho-texto">{e.olhoExtenso}</span>
                        </td>
                        <td>{e.cirurgiaoNome}</td>
                        <td>
                          {ROTULO_ESTADO[e.estado] ?? e.estado}
                          {e.avisosSuspensos && (
                            <>
                              <br />
                              <span className="suave">Avisos à família suspensos</span>
                            </>
                          )}
                        </td>
                        <td>{e.etapaLente === 'quarentena' ? <Selo tipo="perigo">QUARENTENA</Selo> : rotuloDe(ROTULO_ETAPA_LENTE, e.etapaLente)}</td>
                        <td>
                          {e.alertasExtenso.length > 0 && (
                            <ul className="contadores" style={{ display: 'grid', gap: 4 }}>
                              {e.alertasExtenso.map(a => (
                                <li key={a}>
                                  <strong style={{ fontSize: '1rem' }}>{a}</strong>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Dots dots={e.dots} />
                          {e.alertasSemConduta > 0 && (
                            <>
                              <br />
                              <Selo tipo="atencao">{e.alertasSemConduta} sem conduta</Selo>
                            </>
                          )}
                        </td>
                        <td>
                          {e.hardStopsAbertos > 0 && (
                            <>
                              <Selo tipo="perigo">
                                {e.hardStopsAbertos} {e.hardStopsAbertos === 1 ? 'HARD STOP' : 'HARD STOPS'}
                              </Selo>
                              <br />
                            </>
                          )}
                          {e.pendencias} {e.pendencias === 1 ? 'pendência' : 'pendências'}
                        </td>
                        <td>
                          <Link to={ROTAS.episodio(e.episodioId)}>Abrir episódio</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
