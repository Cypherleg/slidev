// Alertas do episódio: comunicar ao cirurgião (via, cirurgião, observação) e conduta escrita (só cirurgião).
// A concierge nunca orienta suspender medicamento; a conduta é do cirurgião.
import { useEffect, useState } from 'react'
import type { Alerta, Papel, ViaComunicacao } from '@dominio/tipos.ts'
import { chamar } from '../../../api/cliente.ts'
import { Aviso, Botao, Campo, Cartao, Selo } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import { ROTULO_VIA } from '../../../componentes/rotulos.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

function useCirurgioes() {
  const [lista, setLista] = useState<{ id: string; nome: string; papeis: Papel[] }[]>([])
  useEffect(() => {
    chamar('membros.ativos', { papel: 'cirurgiao' })
      .then(setLista)
      .catch(() => setLista([]))
  }, [])
  return lista
}

export function PainelAlertas(props: PropsPainel) {
  const { visao } = props
  // Alerta desativado por correção continua na lista enquanto a comunicação ao cirurgião estiver pendente.
  const ativos = visao.alertas.filter(a => !a.inativo || a.comunicacaoPendente)
  const inativos = visao.alertas.filter(a => a.inativo && !a.comunicacaoPendente)
  const cirurgioes = useCirurgioes()
  const semConduta = ativos.filter(a => !a.inativo && a.nivel === 'alerta' && (!a.conduta || a.condutaDesatualizada)).length
  const semComunicacao = ativos.filter(a => a.comunicacaoPendente ?? !a.comunicado).length
  return (
    <Cartao titulo={`Alertas ao cirurgião (${ativos.length})`} id="alertas" destaque={semConduta > 0 || semComunicacao > 0 ? 'atencao' : undefined}>
      <Aviso tipo="info">
        Todo ALERTA chega ao cirurgião no mesmo dia, com registro de quem avisou, quando e por qual via. A conduta é escrita pelo cirurgião. Não oriente o paciente a suspender ou
        alterar medicamento.
      </Aviso>
      {ativos.length === 0 && <p className="suave">Nenhum alerta ativo.</p>}
      {(semComunicacao > 0 || semConduta > 0) && (
        <p style={{ margin: 0 }}>
          {semComunicacao > 0 && <Selo tipo="perigo">{semComunicacao === 1 ? '1 comunicação pendente' : `${semComunicacao} comunicações pendentes`}</Selo>}{' '}
          {semConduta > 0 && <Selo tipo="atencao">{semConduta === 1 ? '1 alerta sem conduta válida' : `${semConduta} alertas sem conduta válida`}</Selo>}
        </p>
      )}
      {ativos.map(a => (
        <ItemAlerta key={a.id} alerta={a} {...props} cirurgioes={cirurgioes} />
      ))}
      {inativos.length > 0 && (
        <details>
          <summary>Alertas que deixaram de valer (resposta corrigida) e já comunicados: {inativos.length}</summary>
          <ul className="lista-simples">
            {inativos.map(a => (
              <li key={a.id}>
                {a.titulo}: {a.descricao}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Cartao>
  )
}

function ItemAlerta(props: PropsPainel & { alerta: Alerta; cirurgioes: { id: string; nome: string }[] }) {
  const { alerta: a, visao, ctl, papeis } = props
  const [via, setVia] = useState<ViaComunicacao | ''>('')
  const [cirurgiaoId, setCirurgiaoId] = useState(visao.episodio.cirurgiao.id)
  const [obs, setObs] = useState('')
  const [conduta, setConduta] = useState('')
  const encerrado = motivoEncerrado(visao)
  const pComunicar = permissao(visao, papeis, 'alerta.comunicar', { alvo: a.id })
  const pConduta = permissao(visao, papeis, 'alerta.conduta', { alvo: a.id })
  const idBase = `alerta-${a.id}`.replace(/[^A-Za-z0-9_-]/g, '_')
  const nomeCirurgiao = (id: string) => props.cirurgioes.find(c => c.id === id)?.nome ?? (id === visao.episodio.cirurgiao.id ? visao.episodio.cirurgiao.nome : 'cirurgião')
  // Comunicação pendente: nunca comunicado, ou o alerta mudou depois da última comunicação.
  const pendenteComunicar = a.comunicacaoPendente ?? !a.comunicado
  const condutaValida = a.conduta && !a.condutaDesatualizada ? a.conduta : null
  return (
    <article className={`pilha ${a.nivel === 'alerta' ? 'hard-stop' : 'aviso atencao'}`} style={a.nivel === 'alerta' ? { borderWidth: 2 } : undefined} aria-labelledby={`${idBase}-t`}>
      <h3 id={`${idBase}-t`} style={{ margin: 0, color: a.nivel === 'alerta' ? 'var(--perigo)' : undefined }}>
        {a.nivel === 'alerta' ? 'ALERTA' : 'Sinalizado'}: {a.titulo}
      </h3>
      {a.inativo && (
        <p style={{ margin: 0 }}>
          <Selo tipo="atencao">Deixou de valer (resposta corrigida)</Selo> <span className="suave">A mudança ainda precisa ser comunicada ao cirurgião.</span>
        </p>
      )}
      <p style={{ margin: 0 }}>{a.descricao}</p>
      <p className="suave" style={{ margin: 0 }}>
        Gerado em {formatarDataHora(a.geradoEm)}
        {a.atualizadoEm && a.atualizadoEm !== a.geradoEm ? ` · alterado em ${formatarDataHora(a.atualizadoEm)}` : ''}
      </p>
      {a.comunicado && pendenteComunicar && (
        <p style={{ margin: 0 }}>
          <Selo tipo="atencao">Comunicação anterior não vale mais</Selo>{' '}
          <span className="suave">
            O alerta mudou depois da comunicação de {formatarDataHora(a.comunicado.em)} ({a.comunicado.porNome}, via {ROTULO_VIA[a.comunicado.via] ?? a.comunicado.via}). Comunique de novo.
          </span>
        </p>
      )}
      {a.comunicado && !pendenteComunicar ? (
        <p style={{ margin: 0 }}>
          <Selo tipo="ok">Comunicado</Selo> por <strong>{a.comunicado.porNome}</strong> em {formatarDataHora(a.comunicado.em)}, via {ROTULO_VIA[a.comunicado.via] ?? a.comunicado.via}, a{' '}
          {nomeCirurgiao(a.comunicado.cirurgiaoId)}
          {a.comunicado.observacao ? `. Obs.: ${a.comunicado.observacao}` : ''}
        </p>
      ) : (
        <form
          className="pilha"
          onSubmit={async e => {
            e.preventDefault()
            if (!via) return
            const ok = await ctl.executar('alerta.comunicar', { alertaId: a.id, via, cirurgiaoId, observacao: obs.trim() || null }, 'Comunicação registrada')
            if (ok) setObs('')
          }}
        >
          <p style={{ margin: 0 }}>
            <Selo tipo="perigo">{a.comunicado ? 'Comunicar de novo ao cirurgião' : 'Ainda não comunicado'}</Selo>
          </p>
          <div className="grade-2">
            <Campo rotulo="Via" id={`${idBase}-via`}>
              <select id={`${idBase}-via`} value={via} onChange={e => setVia(e.target.value as ViaComunicacao)} disabled={!pComunicar.permitido || Boolean(encerrado)}>
                <option value="">Escolha…</option>
                {(Object.keys(ROTULO_VIA) as ViaComunicacao[]).map(v => (
                  <option key={v} value={v}>
                    {ROTULO_VIA[v]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Cirurgião avisado" id={`${idBase}-cir`}>
              <select id={`${idBase}-cir`} value={cirurgiaoId} onChange={e => setCirurgiaoId(e.target.value)} disabled={!pComunicar.permitido || Boolean(encerrado)}>
                {!props.cirurgioes.some(c => c.id === visao.episodio.cirurgiao.id) && <option value={visao.episodio.cirurgiao.id}>{visao.episodio.cirurgiao.nome}</option>}
                {props.cirurgioes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Observação (opcional)" id={`${idBase}-obs`}>
            <input id={`${idBase}-obs`} type="text" value={obs} onChange={e => setObs(e.target.value)} disabled={!pComunicar.permitido || Boolean(encerrado)} />
          </Campo>
          <div>
            <Botao submit desabilitado={!via || !pComunicar.permitido || Boolean(encerrado) || ctl.ocupado !== null} motivo={!pComunicar.permitido ? pComunicar.motivo : encerrado}>
              Registrar que o cirurgião foi avisado
            </Botao>
          </div>
        </form>
      )}
      {a.conduta && a.condutaDesatualizada && (
        <div className="aviso atencao">
          <strong>Conduta DESATUALIZADA: escrita antes da última mudança do alerta, não vale mais</strong>
          <span style={{ whiteSpace: 'pre-wrap', display: 'block', textDecoration: 'line-through' }}>{a.conduta.texto}</span>
          <span className="suave">
            {a.conduta.cirurgiaoNome}, {formatarDataHora(a.conduta.em)}
          </span>
        </div>
      )}
      {condutaValida ? (
        <div className="aviso ok">
          <strong>Conduta escrita do cirurgião</strong>
          <span style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{condutaValida.texto}</span>
          <span className="suave">
            {condutaValida.cirurgiaoNome}, {formatarDataHora(condutaValida.em)}
          </span>
        </div>
      ) : a.nivel === 'alerta' && !a.inativo ? (
        pConduta.permitido && !encerrado ? (
          <form
            className="pilha"
            onSubmit={async e => {
              e.preventDefault()
              if (conduta.trim().length < 3) return
              if (await ctl.executar('alerta.conduta', { alertaId: a.id, conduta: conduta.trim() }, 'Conduta registrada')) setConduta('')
            }}
          >
            <Campo rotulo={a.condutaDesatualizada ? 'Nova conduta escrita (cirurgião)' : 'Conduta escrita (cirurgião)'} id={`${idBase}-conduta`}>
              <textarea id={`${idBase}-conduta`} rows={3} value={conduta} onChange={e => setConduta(e.target.value)} />
            </Campo>
            <div>
              <Botao submit desabilitado={conduta.trim().length < 3 || ctl.ocupado !== null}>
                Registrar conduta
              </Botao>
            </div>
          </form>
        ) : (
          <p className="motivo-bloqueio" style={{ margin: 0 }}>
            {a.condutaDesatualizada ? 'Aguardando nova conduta escrita do cirurgião.' : 'Aguardando conduta escrita do cirurgião.'}
          </p>
        )
      ) : null}
    </article>
  )
}
