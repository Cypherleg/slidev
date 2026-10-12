// Fila de saída de mensagens (briefing §7): gatilho, destino mascarado, estado e aviso de modo ensaio.
// Telefone completo nunca aparece em lista (o servidor já entrega mascarado).

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { EstadoMensagem, MensagemSaida } from '@dominio/tipos.ts'
import { useSessaoOpcional } from '../../app/sessao.tsx'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { dataValida, formatarData, formatarDataHora, hojeLocal } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { useCarga } from './comum/carga.ts'
import { ErroCarga, Selo } from './comum/componentes.tsx'
import { ROTULO_ESTADO_MENSAGEM, ROTULO_GATILHO, rotuloDe } from './comum/rotulos.ts'

const TIPO_ESTADO: Record<EstadoMensagem, 'neutro' | 'ok' | 'atencao' | 'perigo'> = {
  ensaio: 'atencao',
  pendente: 'neutro',
  enviando: 'neutro',
  enviado: 'ok',
  entregue: 'ok',
  falhou: 'perigo',
  desconhecido: 'perigo',
  cancelado: 'neutro',
}

const ORDEM_ESTADOS = Object.keys(ROTULO_ESTADO_MENSAGEM) as EstadoMensagem[]

export function AvisoModoEnvio(props: { modo: 'ensaio' | 'real' | undefined; mensagens: MensagemSaida[] }) {
  const ensaio = props.modo === 'ensaio' || (props.modo === undefined && props.mensagens.some(m => m.estado === 'ensaio'))
  if (ensaio) {
    return (
      <Aviso tipo="atencao" titulo="MODO ENSAIO: nenhuma mensagem sai.">
        As mensagens são montadas e registradas na fila, mas não são enviadas a pacientes nem a familiares. O envio real só é ligado com autorização expressa,
        depois do piloto.
      </Aviso>
    )
  }
  if (props.modo === 'real') {
    return (
      <Aviso tipo="info" titulo="Envio real ligado.">
        As mensagens desta fila saem pelo WhatsApp. Estado "desconhecido" (tempo esgotado) é reconciliado antes de qualquer reenvio.
      </Aviso>
    )
  }
  return null
}

export default function Mensagens() {
  const sessao = useSessaoOpcional()
  const [busca, setBusca] = useSearchParams()
  const dataParam = busca.get('data')
  // A fila é consultada por data de cirurgia (sem data, o servidor usa hoje) ou por episódio.
  const data = dataValida(dataParam) ? dataParam : hojeLocal()
  const episodioId = busca.get('episodio') ?? ''

  const carga = useCarga(() => chamar('mensagens.listar', episodioId ? { episodioId } : { data }), [data, episodioId])
  const mensagens = useMemo(() => [...(carga.dados ?? [])].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), [carga.dados])
  const contagem = useMemo(() => {
    const c = new Map<EstadoMensagem, number>()
    for (const m of mensagens) c.set(m.estado, (c.get(m.estado) ?? 0) + 1)
    return c
  }, [mensagens])

  const definir = (chave: 'data' | 'episodio', valor: string | null) => {
    const nova = new URLSearchParams(busca)
    if (valor === null) nova.delete(chave)
    else nova.set(chave, valor)
    setBusca(nova, { replace: true })
  }

  return (
    <div className="pilha">
      <AvisoModoEnvio modo={sessao?.dados?.modoEnvio} mensagens={mensagens} />
      <Cartao titulo="Filtro">
        <div className="filtros">
          {episodioId ? (
            <button type="button" className="botao secundario" onClick={() => definir('episodio', null)}>
              Ver por data de cirurgia
            </button>
          ) : (
            <>
              <div className="campo">
                <label htmlFor="msg-data">Data da cirurgia</label>
                <input id="msg-data" type="date" value={data} onChange={e => definir('data', dataValida(e.target.value) ? e.target.value : null)} />
              </div>
              <button type="button" className="botao secundario" onClick={() => definir('data', null)} disabled={data === hojeLocal()}>
                Hoje
              </button>
            </>
          )}
          <button type="button" className="botao secundario" onClick={carga.recarregar}>
            Atualizar
          </button>
        </div>
        <p className="suave" style={{ margin: 0 }}>
          {episodioId ? 'Mensagens de um episódio' : `Mensagens dos episódios com cirurgia em ${formatarData(data)}`}. Com intercorrência, hard stop aberto, suspensão ou
          cancelamento, nenhuma mensagem automática é gerada: uma pessoa fala com a família.
        </p>
      </Cartao>

      <Cartao titulo="Fila de saída">
        {carga.erro ? (
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        ) : !carga.dados ? (
          <Carregando />
        ) : mensagens.length === 0 ? (
          <p>Nenhuma mensagem com estes filtros.</p>
        ) : (
          <>
            <ul className="contadores" aria-label="Mensagens por estado">
              {ORDEM_ESTADOS.filter(e => contagem.get(e)).map(e => (
                <li key={e}>
                  <strong>{contagem.get(e)}</strong>
                  {ROTULO_ESTADO_MENSAGEM[e]}
                </li>
              ))}
            </ul>
            <div className="rolagem-tabela">
              <table className="tabela">
                <caption className="sr-only">Fila de saída de mensagens</caption>
                <thead>
                  <tr>
                    <th scope="col">Criada em</th>
                    <th scope="col">Gatilho</th>
                    <th scope="col">Destino</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Atualizada em</th>
                    <th scope="col">Texto</th>
                    <th scope="col">Episódio</th>
                  </tr>
                </thead>
                <tbody>
                  {mensagens.map(m => (
                    <tr key={m.id}>
                      <td>{formatarDataHora(m.criadoEm)}</td>
                      <td>
                        {rotuloDe(ROTULO_GATILHO, m.gatilho)}
                        {m.modeloMeta && (
                          <>
                            <br />
                            <span className="suave codigo">modelo {m.modeloMeta}</span>
                          </>
                        )}
                      </td>
                      <td className="codigo">{m.destinoMascarado}</td>
                      <td>
                        <Selo tipo={TIPO_ESTADO[m.estado] ?? 'neutro'}>{rotuloDe(ROTULO_ESTADO_MENSAGEM, m.estado)}</Selo>
                      </td>
                      <td>{formatarDataHora(m.atualizadoEm)}</td>
                      <td>
                        <details className="detalhe-texto">
                          <summary>Ver texto</summary>
                          <p>{m.texto}</p>
                        </details>
                      </td>
                      <td>
                        <Link to={ROTAS.episodio(m.episodioId)}>Abrir</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Cartao>
    </div>
  )
}
