// Modelos de checklist: versões publicadas, visualização legível e publicação de nova versão (briefing regra 11).

import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ModeloChecklist, ModeloId } from '@dominio/tipos.ts'
import { ORDEM_MODELOS, ROTULO_PAPEL } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Botao, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { formatarDataHora } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { mensagemErro, useCarga } from './comum/carga.ts'
import { BotaoConfirmar, ErroCarga, Retorno, Selo } from './comum/componentes.tsx'
import { ROTULO_MODELO, ROTULO_TIPO_RESPOSTA, rotulosPapeis } from './comum/rotulos.ts'
import { validarModelo } from './validarModelo.ts'

type Selecao = { id: ModeloId; versao: string } | null

function linkBranco(id: ModeloId, versao: string) {
  return `${ROTAS.impressaoBranco(id)}?versao=${encodeURIComponent(versao)}`
}

/** Visualização legível de um modelo (sem JSON). */
export function VisaoModelo(props: { modelo: ModeloChecklist }) {
  const m = props.modelo
  return (
    <div className="modelo-visao pilha">
      <div>
        <h3 style={{ marginBottom: 4 }}>
          {m.titulo} <Selo>versão {m.versao}</Selo>
        </h3>
        {m.descricao && <p style={{ margin: '0 0 4px' }}>{m.descricao}</p>}
        <p className="suave" style={{ margin: 0 }}>
          Fonte: {m.fonte} · Quem conclui: {rotulosPapeis(m.papeisConclusao)}
          {m.exigeLeituraEmVozAlta ? ' · Exige leitura em voz alta (quem leu e quem confirmou)' : ''}
        </p>
      </div>
      {m.secoes.map(s => (
        <section key={s.id} aria-label={`Seção ${s.id}`}>
          <h4 style={{ margin: '8px 0 4px' }}>
            {s.id}. {s.titulo}
          </h4>
          {s.itens.map(it => (
            <div key={it.id} className="item-modelo">
              <strong>{it.texto}</strong>
              <dl>
                <dt>Identificador</dt>
                <dd className="codigo">{it.id}</dd>
                <dt>Resposta</dt>
                <dd>
                  {ROTULO_TIPO_RESPOSTA[it.tipo] ?? it.tipo}
                  {it.opcoes?.length ? `: ${it.opcoes.map(o => o.rotulo).join(' / ')}` : ''}
                  {it.permiteNaoSabe ? ' (aceita "não sabe")' : ''}
                  {it.obrigatorio ? ' · obrigatório' : ' · opcional'}
                </dd>
                <dt>Quem marca</dt>
                <dd>{it.papeis.map(p => ROTULO_PAPEL[p] ?? p).join(', ')}</dd>
                {it.alerta && (
                  <>
                    <dt>{it.alerta.nivel === 'alerta' ? 'ALERTA' : 'Sinalizar'}</dt>
                    <dd>{it.alerta.descricao}</dd>
                  </>
                )}
                {it.hardStop && (
                  <>
                    <dt>Hard stop</dt>
                    <dd className="codigo">{it.hardStop}</dd>
                  </>
                )}
                {it.exigeSim && (
                  <>
                    <dt>Conferência</dt>
                    <dd>O bloco só é concluído com a resposta "Sim".</dd>
                  </>
                )}
                {it.exigidoQuando && (
                  <>
                    <dt>Obrigatório quando</dt>
                    <dd className="codigo">
                      {'itemId' in it.exigidoQuando ? `${it.exigidoQuando.itemId} = ${it.exigidoQuando.valores.join(' ou ')}` : it.exigidoQuando.contexto}
                    </dd>
                  </>
                )}
                {it.camposPessoa?.length ? (
                  <>
                    <dt>Campos exigidos</dt>
                    <dd>{it.camposPessoa.join(', ')}</dd>
                  </>
                ) : null}
                {it.exigeBlocosConcluidos?.length ? (
                  <>
                    <dt>Depois dos blocos</dt>
                    <dd>{it.exigeBlocosConcluidos.map(b => ROTULO_MODELO[b] ?? b).join(', ')}</dd>
                  </>
                ) : null}
                {it.foraDeHoraApos && (
                  <>
                    <dt>Hora real</dt>
                    <dd>Fora de hora se respondido depois de concluído: {ROTULO_MODELO[it.foraDeHoraApos] ?? it.foraDeHoraApos}</dd>
                  </>
                )}
                {it.depoisDe?.length ? (
                  <>
                    <dt>Depois de</dt>
                    <dd className="codigo">{it.depoisDe.join(', ')}</dd>
                  </>
                ) : null}
                {it.ajuda && (
                  <>
                    <dt>Ajuda</dt>
                    <dd>{it.ajuda}</dd>
                  </>
                )}
                {it.pendente && (
                  <>
                    <dt>Pendente no POP</dt>
                    <dd>
                      <em>{it.pendente}</em>
                    </dd>
                  </>
                )}
                <dt>Fonte</dt>
                <dd>{it.fonte}</dd>
              </dl>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export default function Modelos() {
  const lista = useCarga(() => chamar('modelos.listar', {}), [])
  const [selecao, setSelecao] = useState<Selecao>(null)
  const visao = useCarga(() => (selecao ? chamar('modelos.obter', { id: selecao.id, versao: selecao.versao }) : Promise.resolve(null)), [selecao?.id, selecao?.versao])
  const [texto, setTexto] = useState('')
  const [validacao, setValidacao] = useState<{ erros: string[]; modelo: ModeloChecklist | null; texto: string } | null>(null)
  const [retorno, setRetorno] = useState<{ tipo: 'ok' | 'perigo'; texto: string } | null>(null)

  const versoes = useMemo(() => {
    const todas = [...(lista.dados ?? [])]
    const ordem = (id: string) => (ORDEM_MODELOS as readonly string[]).indexOf(id)
    return todas.sort((a, b) => ordem(a.id) - ordem(b.id) || Number(b.ativo) - Number(a.ativo) || b.publicadoEm.localeCompare(a.publicadoEm))
  }, [lista.dados])

  const conferir = () => {
    const r = validarModelo(texto)
    setValidacao({ ...r, texto })
  }
  const validoAtual = validacao && validacao.texto === texto && validacao.modelo ? validacao.modelo : null

  return (
    <div className="pilha">
      <Retorno retorno={retorno} />
      <Cartao titulo="Versões publicadas">
        {lista.erro ? (
          <ErroCarga erro={lista.erro} onTentar={lista.recarregar} />
        ) : !lista.dados ? (
          <Carregando />
        ) : versoes.length === 0 ? (
          <p>Nenhum modelo publicado.</p>
        ) : (
          <div className="rolagem-tabela">
            <table className="tabela">
              <caption className="sr-only">Versões dos modelos de checklist</caption>
              <thead>
                <tr>
                  <th scope="col">Modelo</th>
                  <th scope="col">Versão</th>
                  <th scope="col">Publicado em</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {versoes.map(v => (
                  <tr key={`${v.id}-${v.versao}`}>
                    <td>{ROTULO_MODELO[v.id] ?? v.id}</td>
                    <td className="codigo">{v.versao}</td>
                    <td>{formatarDataHora(v.publicadoEm)}</td>
                    <td>{v.ativo ? <Selo tipo="ok">Ativa: vale para novos episódios</Selo> : <span className="suave">Anterior</span>}</td>
                    <td>
                      <div className="acoes">
                        <Botao tipo="secundario" pequeno onClick={() => setSelecao({ id: v.id, versao: v.versao })}>
                          Ver
                        </Botao>
                        <Link to={linkBranco(v.id, v.versao)}>Imprimir em branco</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {selecao && (
        <Cartao
          titulo={`Visualização: ${ROTULO_MODELO[selecao.id] ?? selecao.id}`}
          acoes={
            <Botao tipo="secundario" pequeno onClick={() => setSelecao(null)}>
              Fechar
            </Botao>
          }
        >
          {visao.erro ? <ErroCarga erro={visao.erro} onTentar={visao.recarregar} /> : visao.carregando || !visao.dados ? <Carregando /> : <VisaoModelo modelo={visao.dados} />}
        </Cartao>
      )}

      <Cartao titulo="Publicar nova versão">
        <Aviso tipo="info" titulo="Cada episódio guarda a versão usada.">
          A nova versão vale para os episódios abertos depois da publicação. Os episódios já abertos continuam com a versão que registraram, e nada publicado é
          apagado. O número da nova versão é atribuído pelo servidor (o seguinte ao da última). Mantenha os identificadores (id) dos itens: as regras de alerta e de
          hard stop dependem deles.
        </Aviso>
        <div className="campo">
          <label htmlFor="modelo-json">Modelo em JSON</label>
          <textarea
            id="modelo-json"
            className="codigo"
            spellCheck={false}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            aria-describedby="modelo-json-ajuda"
          />
          <span id="modelo-json-ajuda" className="ajuda">
            Campos: id, titulo, fonte, papeisConclusao, secoes (id, titulo, itens: id, texto, tipo, obrigatorio, papeis, fonte). A versão é atribuída ao publicar.
          </span>
        </div>
        <div className="linha">
          <Botao
            tipo="secundario"
            desabilitado={!visao.dados || visao.carregando}
            titulo={visao.dados ? undefined : 'Abra um modelo em "Ver" para usá-lo como base.'}
            onClick={() => {
              if (!visao.dados) return
              setTexto(JSON.stringify(visao.dados, null, 2))
              setValidacao(null)
            }}
          >
            Usar o modelo exibido como base
          </Botao>
          <Botao tipo="secundario" desabilitado={!texto.trim()} onClick={conferir}>
            Conferir
          </Botao>
          {validoAtual && (
            <BotaoConfirmar
              tipo="primario"
              rotulo="Publicar"
              confirmacao={`Confirmar: publicar nova versão de ${ROTULO_MODELO[validoAtual.id] ?? validoAtual.id}`}
              onConfirmar={async () => {
                try {
                  const r = await chamar('modelos.publicar', { modelo: validoAtual })
                  setRetorno({ tipo: 'ok', texto: `Versão ${r.versao} publicada. Vale para os próximos episódios.` })
                  setTexto('')
                  setValidacao(null)
                  lista.recarregar()
                } catch (e) {
                  setRetorno({ tipo: 'perigo', texto: mensagemErro(e) })
                }
              }}
            />
          )}
        </div>
        {validacao && validacao.texto === texto && (
          <div role="status" aria-live="polite">
            {validacao.erros.length ? (
              <Aviso tipo="perigo" titulo={`O modelo tem ${validacao.erros.length} problema(s):`}>
                <ul className="lista-erros">
                  {validacao.erros.slice(0, 30).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {validacao.erros.length > 30 && <p>… e mais {validacao.erros.length - 30}.</p>}
              </Aviso>
            ) : (
              <Aviso tipo="ok" titulo="Estrutura conferida.">
                {validacao.modelo && (
                  <span>
                    {ROTULO_MODELO[validacao.modelo.id]}: {validacao.modelo.secoes.length} seção(ões),{' '}
                    {validacao.modelo.secoes.reduce((n, s) => n + s.itens.length, 0)} item(ns). O servidor confere de novo ao publicar.
                  </span>
                )}
              </Aviso>
            )}
          </div>
        )}
      </Cartao>
    </div>
  )
}
