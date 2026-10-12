// Aba Lente: plano (concierge), foto do plano assinado, chegada + checkpoint 1, checkpoint 2 CEGO (conferente),
// quarentena com resolução escrita do cirurgião, troca no D0 (cirurgião).
// A tela só mostra o que o servidor enviou; para a conferente, as seções do checkpoint 1 nem são montadas.
import { useEffect, useState } from 'react'
import type { DadosPlanoLente, Papel } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Botao, Campo, Cartao, EscolhaUnica, Selo } from '../../componentes/base/index.tsx'
import { dataValida, formatarData, formatarDataHora } from '../../componentes/formato.ts'
import { CampoDioptria, CamposLente, estadoLenteDe, estadoLenteVazio, lerDioptria, lerEstadoLente, resumoValores } from '../../componentes/lente/CamposLente.tsx'
import type { EstadoLente, Sinal } from '../../componentes/lente/CamposLente.tsx'
import { FormularioCego } from '../../componentes/lente/FormularioCego.tsx'
import { ResultadoComparacao, ValoresLenteExibicao } from '../../componentes/lente/ValoresLenteExibicao.tsx'
import { permissao, temAlgumPapel } from '../../componentes/permissoes.ts'
import { ROTULO_ETAPA_LENTE } from '../../componentes/rotulos.ts'
import type { PropsPainel } from './paineis/comum.tsx'
import { ChecklistDoBloco, motivoEncerrado } from './paineis/comum.tsx'

const VEEM_CONFERENCIA_1: Papel[] = ['concierge', 'cirurgiao', 'gestora']
const VEEM_CONFERENCIA_2: Papel[] = ['conferente', 'cirurgiao', 'gestora']

export function AbaLente(props: PropsPainel) {
  const { visao, papeis } = props
  const lente = visao.lente
  // Conferente (sem papel que veja o checkpoint 1): nada do plano é montado na tela, mesmo que viesse.
  const mostraConferencia1 = temAlgumPapel(papeis, VEEM_CONFERENCIA_1)
  const mostraConferencia2 = temAlgumPapel(papeis, VEEM_CONFERENCIA_2)
  return (
    <div className="pilha">
      <Cartao titulo="Situação da lente">
        <p style={{ margin: 0 }}>
          Etapa: <Selo tipo={lente.etapa === 'quarentena' ? 'perigo' : lente.etapa === 'cp2_confere' || lente.etapa === 'time_out_confere' ? 'ok' : 'neutro'}>{ROTULO_ETAPA_LENTE[lente.etapa] ?? lente.etapa}</Selo>
          {lente.ciclo > 1 && (
            <>
              {' '}
              <Selo tipo="atencao">Ciclo {lente.ciclo}: troca de LIO no D0, conferências refeitas</Selo>
            </>
          )}
        </p>
        {lente.cp2Resultado && <ResultadoComparacao titulo="Checkpoint 2 contra o checkpoint 1" resultado={lente.cp2Resultado} />}
        {lente.timeOutResultado && <ResultadoComparacao titulo="Leitura do Time Out" resultado={lente.timeOutResultado} />}
      </Cartao>
      {lente.quarentena && <PainelQuarentena {...props} />}
      {mostraConferencia1 && <PainelPlano {...props} />}
      {mostraConferencia1 && <PainelChegada {...props} />}
      {(mostraConferencia2 || papeis.includes('conferente')) && <PainelCheckpoint2 {...props} />}
      {!mostraConferencia1 && !mostraConferencia2 && (
        <Aviso tipo="info">Os valores da lente só aparecem para quem confere. No Time Out, a circulante lê da caixa na tela da sala.</Aviso>
      )}
      <PainelTrocaD0 {...props} />
    </div>
  )
}

function PainelQuarentena(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const q = visao.lente.quarentena!
  const [texto, setTexto] = useState('')
  const [acao, setAcao] = useState<'manter_plano' | 'novo_plano' | null>(null)
  const p = permissao(visao, papeis, 'lente.resolver_quarentena')
  if (!q.aberta) {
    return q.resolucao ? (
      <Cartao titulo="Quarentena resolvida">
        <p style={{ margin: 0 }}>
          Etapa {q.etapa}: {q.motivo}
        </p>
        <div className="aviso ok">
          <strong>Resolução escrita do cirurgião ({q.resolucao.acao === 'novo_plano' ? 'novo plano' : 'manter o plano'})</strong>
          <span style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{q.resolucao.texto}</span>
          <span className="suave">
            {q.resolucao.cirurgiaoNome}, {formatarDataHora(q.resolucao.em)}
          </span>
        </div>
      </Cartao>
    ) : null
  }
  return (
    <section className="quarentena pilha" aria-labelledby="titulo-quarentena" role="alert">
      <h2 id="titulo-quarentena">Lente em quarentena</h2>
      <p style={{ margin: 0, fontWeight: 700 }}>
        Divergência na etapa {q.etapa === 'cp1' ? 'checkpoint 1 (chegada)' : q.etapa === 'cp2' ? 'checkpoint 2 (D-2)' : 'Time Out'}: {q.motivo}
      </p>
      <p style={{ margin: 0 }}>
        Desde {formatarDataHora(q.desde)}. LIO e ficha ficam em quarentena identificada; o cirurgião é avisado no mesmo dia. O episódio fica bloqueado até a resolução POR ESCRITO do cirurgião.
        Ninguém corrige o valor do outro.
      </p>
      {p.permitido ? (
        <form
          className="pilha"
          onSubmit={async e => {
            e.preventDefault()
            if (!acao || texto.trim().length < 3) return
            if (await ctl.executar('lente.resolver_quarentena', { resolucao: texto.trim(), acao }, 'Resolução da quarentena registrada')) setTexto('')
          }}
        >
          <Campo rotulo="Resolução escrita do cirurgião" id="quarentena-resolucao">
            <textarea id="quarentena-resolucao" rows={4} value={texto} onChange={e => setTexto(e.target.value)} />
          </Campo>
          <EscolhaUnica
            rotulo="Decisão"
            nome="quarentena-acao"
            opcoes={[
              { valor: 'manter_plano', rotulo: 'Manter o plano registrado' },
              { valor: 'novo_plano', rotulo: 'Novo plano (refazer as conferências)' },
            ]}
            valor={acao}
            aoMudar={setAcao}
          />
          <div>
            <Botao submit tipo="perigo" desabilitado={!acao || texto.trim().length < 3 || ctl.ocupado !== null}>
              Registrar resolução
            </Botao>
          </div>
        </form>
      ) : (
        <p className="motivo-bloqueio" style={{ margin: 0 }}>
          Só o cirurgião resolve a quarentena, por escrito.{p.motivo ? ` ${p.motivo}` : ''}
        </p>
      )}
    </section>
  )
}

/** Converte arquivo de imagem em base64 (sem prefixo), reduzindo fotos grandes da câmera. */
async function imagemParaBase64(arquivo: File): Promise<{ base64: string; contentType: 'image/jpeg' | 'image/png' }> {
  const ler = (blob: Blob) =>
    new Promise<string>((ok, falha) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result).split(',')[1] ?? '')
      r.onerror = () => falha(new Error('leitura'))
      r.readAsDataURL(blob)
    })
  const LADO_MAX = 2000
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(arquivo)
      const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
      if (escala < 1 || arquivo.size > 1_500_000) {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bmp.width * escala)
        canvas.height = Math.round(bmp.height * escala)
        canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>(ok => canvas.toBlob(ok, 'image/jpeg', 0.88))
        if (blob) return { base64: await ler(blob), contentType: 'image/jpeg' }
      }
    }
  } catch {
    /* usa o arquivo original */
  }
  return { base64: await ler(arquivo), contentType: arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg' }
}

function FotoPlano(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const anexoId = visao.lente.fotoPlanoAnexoId
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const p = permissao(visao, papeis, 'anexo.enviar')
  useEffect(() => {
    setUrl(null)
    if (!anexoId) return
    let vivo = true
    chamar('anexo.url', { episodioId: visao.episodio.id, anexoId })
      .then(r => vivo && setUrl(r.url))
      .catch(() => vivo && setErro('Não foi possível abrir a foto do plano.'))
    return () => {
      vivo = false
    }
  }, [anexoId, visao.episodio.id])
  return (
    <div className="pilha">
      <h3 style={{ margin: 0 }}>Foto do plano de LIO assinado</h3>
      {url ? <img src={url} alt="Foto do plano de LIO assinado pelo cirurgião, na impressão original da biometria" className="foto-plano" /> : <p className="suave">{anexoId ? 'Carregando a foto…' : 'Sem foto anexada.'}</p>}
      {erro && <Aviso tipo="atencao">{erro}</Aviso>}
      {p.permitido && !motivoEncerrado(visao) && (
        <div className="campo">
          <label htmlFor="foto-plano-arquivo">{anexoId ? 'Anexar nova foto (a anterior continua no histórico)' : 'Anexar foto do plano assinado'}</label>
          <input
            id="foto-plano-arquivo"
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            disabled={enviando || ctl.ocupado !== null}
            onChange={async e => {
              const arquivo = e.target.files?.[0]
              e.target.value = ''
              if (!arquivo) return
              setErro(null)
              setEnviando(true)
              try {
                const { base64, contentType } = await imagemParaBase64(arquivo)
                await ctl.executar('anexo.enviar', { tipo: 'foto_plano', contentType, base64 }, 'Foto do plano anexada')
              } catch {
                setErro('Não foi possível ler a imagem.')
              } finally {
                setEnviando(false)
              }
            }}
          />
          {enviando && <span className="ajuda">Enviando a foto…</span>}
        </div>
      )}
    </div>
  )
}

interface EstadoPlano extends EstadoLente {
  temReserva: boolean | null
  reservaModelo: string
  reservaSinal: Sinal
  reservaDioptria: string
  alvoSinal: Sinal
  alvo: string
  dataPedido: string
}

function estadoPlanoDe(p: (DadosPlanoLente & object) | undefined): EstadoPlano {
  const base = p ? estadoLenteDe(p) : estadoLenteVazio()
  const reserva = p?.reserva
  const alvo = p?.alvoRefrativo
  return {
    ...base,
    temReserva: p ? Boolean(reserva) : null,
    reservaModelo: reserva?.modelo ?? '',
    reservaSinal: reserva ? (reserva.dioptria < 0 ? '-' : '+') : null,
    reservaDioptria: reserva ? Math.abs(reserva.dioptria).toFixed(2).replace('.', ',') : '',
    alvoSinal: alvo === null || alvo === undefined ? null : alvo < 0 ? '-' : '+',
    alvo: alvo === null || alvo === undefined ? '' : Math.abs(alvo).toFixed(2).replace('.', ','),
    dataPedido: p?.dataPedido ?? '',
  }
}

function PainelPlano(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const plano = visao.lente.plano
  const p = permissao(visao, papeis, 'lente.plano')
  const [editando, setEditando] = useState(false)
  const [estado, setEstado] = useState<EstadoPlano>(() => estadoPlanoDe(plano))
  const [tentou, setTentou] = useState(false)
  const encerrado = motivoEncerrado(visao)

  const leitura = lerEstadoLente(estado)
  const erros: Record<string, string> = { ...(leitura.erros as Record<string, string>) }
  let reserva: DadosPlanoLente['reserva'] = null
  if (estado.temReserva === null) erros.temReserva = 'Responda se o plano tem LIO reserva.'
  if (estado.temReserva) {
    const d = lerDioptria(estado.reservaSinal, estado.reservaDioptria)
    if (!estado.reservaModelo.trim()) erros.reservaModelo = 'Digite o modelo da reserva.'
    if (d.erro) erros.reservaDioptria = d.erro
    else reserva = { modelo: estado.reservaModelo.trim(), dioptria: d.valor as number }
  }
  let alvo: number | null = null
  if (estado.alvo.trim() || estado.alvoSinal) {
    const a = lerDioptria(estado.alvoSinal, estado.alvo)
    if (a.erro) erros.alvo = a.erro
    else alvo = a.valor
  }
  if (estado.dataPedido && !dataValida(estado.dataPedido)) erros.dataPedido = 'Data inválida.'

  const enviar = async () => {
    setTentou(true)
    if (!leitura.valores || Object.keys(erros).length) return
    const dados: DadosPlanoLente = { ...leitura.valores, reserva, alvoRefrativo: alvo, dataPedido: estado.dataPedido || null }
    if (await ctl.executar('lente.plano', { dados }, plano ? 'Correção do plano registrada' : 'Plano registrado')) {
      setEditando(false)
      setTentou(false)
    }
  }

  const podeEditar = p.permitido && !encerrado
  return (
    <Cartao titulo="Plano de LIO (transcrição do plano assinado)" id="plano">
      <div className="lente-grade">
        <div className="pilha">
          {plano ? <ValoresLenteExibicao valores={plano} /> : <p className="suave">Plano ainda não registrado.</p>}
          {!editando && (
            <div>
              <Botao
                tipo={plano ? 'secundario' : 'primario'}
                desabilitado={!podeEditar}
                motivo={!p.permitido ? p.motivo : encerrado}
                onClick={() => {
                  setEstado(estadoPlanoDe(plano))
                  setEditando(true)
                }}
              >
                {plano ? 'Corrigir o plano (novo registro)' : 'Registrar o plano'}
              </Botao>
            </div>
          )}
          {editando && (
            <form
              className="pilha"
              autoComplete="off"
              onSubmit={e => {
                e.preventDefault()
                void enviar()
              }}
            >
              <Aviso tipo="info">Digite a partir do plano escrito pelo cirurgião na impressão original da biometria. Ficha transcrita não é fonte.</Aviso>
              <CamposLente idPrefixo="plano" estado={estado} aoMudar={x => setEstado(s => ({ ...s, ...x }))} erros={tentou ? leitura.erros : {}} />
              <EscolhaUnica
                rotulo="LIO reserva (sulco) definida no plano?"
                nome="plano-reserva"
                opcoes={[
                  { valor: 'sim', rotulo: 'Sim' },
                  { valor: 'nao', rotulo: 'Não consta no plano' },
                ]}
                valor={estado.temReserva === null ? null : estado.temReserva ? 'sim' : 'nao'}
                aoMudar={v => setEstado(s => ({ ...s, temReserva: v === 'sim' }))}
              />
              {tentou && erros.temReserva && <span className="erro">{erros.temReserva}</span>}
              {estado.temReserva && (
                <div className="subcampos">
                  <Campo rotulo="Modelo da reserva" id="plano-reserva-modelo" erro={tentou ? erros.reservaModelo : null}>
                    <input id="plano-reserva-modelo" type="text" autoComplete="off" value={estado.reservaModelo} onChange={e => setEstado(s => ({ ...s, reservaModelo: e.target.value }))} />
                  </Campo>
                  <CampoDioptria
                    id="plano-reserva-dioptria"
                    rotulo="Dioptria da reserva"
                    sinal={estado.reservaSinal}
                    texto={estado.reservaDioptria}
                    aoMudar={(reservaSinal, reservaDioptria) => setEstado(s => ({ ...s, reservaSinal, reservaDioptria }))}
                    erro={tentou ? erros.reservaDioptria : undefined}
                  />
                </div>
              )}
              <CampoDioptria
                id="plano-alvo"
                rotulo="Alvo refrativo (se escrito no plano)"
                sinal={estado.alvoSinal}
                texto={estado.alvo}
                aoMudar={(alvoSinal, alvo) => setEstado(s => ({ ...s, alvoSinal, alvo }))}
                erro={tentou ? erros.alvo : undefined}
              />
              <Campo rotulo="Data do pedido da lente" id="plano-data-pedido" erro={tentou ? erros.dataPedido : null}>
                <input id="plano-data-pedido" type="date" value={estado.dataPedido} onChange={e => setEstado(s => ({ ...s, dataPedido: e.target.value }))} />
              </Campo>
              {leitura.valores && (
                <p className="aviso info" style={{ margin: 0 }}>
                  <strong>Confira antes de registrar:</strong> {resumoValores(leitura.valores)}
                </p>
              )}
              <div className="linha">
                <Botao submit desabilitado={ctl.ocupado !== null}>
                  {plano ? 'Registrar correção' : 'Registrar plano'}
                </Botao>
                <Botao tipo="secundario" onClick={() => setEditando(false)}>
                  Cancelar
                </Botao>
              </div>
            </form>
          )}
        </div>
        <FotoPlano {...props} />
      </div>
    </Cartao>
  )
}

function PainelChegada(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const chegada = visao.lente.chegada
  const p = permissao(visao, papeis, 'lente.chegada')
  const encerrado = motivoEncerrado(visao)
  const [dataChegada, setDataChegada] = useState(chegada?.dataChegada ?? '')
  const [lote, setLote] = useState(chegada?.lote ?? '')
  const [formatoValidade, setFormatoValidade] = useState<'dia' | 'mes'>(chegada?.validade && chegada.validade.length === 7 ? 'mes' : 'dia')
  const [validade, setValidade] = useState(chegada?.validade ?? '')
  const [tentou, setTentou] = useState(false)
  const [editando, setEditando] = useState(!chegada)
  const erros: Record<string, string> = {}
  if (!dataValida(dataChegada)) erros.data = 'Informe a data de chegada.'
  if (!lote.trim()) erros.lote = 'Informe o lote.'
  if (formatoValidade === 'dia' ? !dataValida(validade) : !/^\d{4}-(0[1-9]|1[0-2])$/.test(validade)) erros.validade = 'Informe a validade da caixa.'
  const podeEditar = p.permitido && !encerrado && Boolean(visao.lente.plano)
  return (
    <Cartao titulo="Chegada da LIO e checkpoint 1" id="chegada">
      {chegada && (
        <dl className="valores-lente">
          <dt>Chegada</dt>
          <dd>{formatarData(chegada.dataChegada)}</dd>
          <dt>Lote</dt>
          <dd>{chegada.lote}</dd>
          <dt>Validade</dt>
          <dd>{formatarData(chegada.validade)}</dd>
          <dt>Registrado</dt>
          <dd style={{ fontSize: '1rem', fontWeight: 600 }}>
            {chegada.registradoPor}, {formatarDataHora(chegada.registradoEm)}
          </dd>
        </dl>
      )}
      {!visao.lente.plano && <p className="suave">Registre o plano antes da chegada.</p>}
      {chegada && !editando && (
        <div>
          <Botao tipo="secundario" desabilitado={!podeEditar} motivo={!p.permitido ? p.motivo : encerrado} onClick={() => setEditando(true)}>
            Corrigir dados de chegada (novo registro)
          </Botao>
        </div>
      )}
      {editando && podeEditar && (
        <form
          className="grade-2"
          autoComplete="off"
          onSubmit={async e => {
            e.preventDefault()
            setTentou(true)
            if (Object.keys(erros).length) return
            if (await ctl.executar('lente.chegada', { dados: { dataChegada, lote: lote.trim(), validade } }, 'Chegada registrada')) {
              setEditando(false)
              setTentou(false)
            }
          }}
        >
          <Campo rotulo="Data de chegada" id="chegada-data" erro={tentou ? erros.data : null}>
            <input id="chegada-data" type="date" value={dataChegada} onChange={e => setDataChegada(e.target.value)} />
          </Campo>
          <Campo rotulo="Lote" id="chegada-lote" erro={tentou ? erros.lote : null}>
            <input id="chegada-lote" type="text" autoComplete="off" value={lote} onChange={e => setLote(e.target.value)} />
          </Campo>
          <div className="pilha">
            <EscolhaUnica
              rotulo="Validade impressa na caixa"
              nome="chegada-formato-validade"
              opcoes={[
                { valor: 'dia', rotulo: 'Dia, mês e ano' },
                { valor: 'mes', rotulo: 'Só mês e ano' },
              ]}
              valor={formatoValidade}
              aoMudar={v => {
                setFormatoValidade(v)
                setValidade('')
              }}
            />
            <Campo rotulo="Validade" id="chegada-validade" erro={tentou ? erros.validade : null}>
              <input id="chegada-validade" type={formatoValidade === 'dia' ? 'date' : 'month'} value={validade} onChange={e => setValidade(e.target.value)} placeholder={formatoValidade === 'mes' ? 'aaaa-mm' : undefined} />
            </Campo>
          </div>
          <div style={{ alignSelf: 'end' }} className="linha">
            <Botao submit desabilitado={ctl.ocupado !== null}>
              Registrar chegada
            </Botao>
            {chegada && (
              <Botao tipo="secundario" onClick={() => setEditando(false)}>
                Cancelar
              </Botao>
            )}
          </div>
        </form>
      )}
      <h3 style={{ margin: 0 }}>Checkpoint 1: conferência da caixa</h3>
      <ChecklistDoBloco {...props} modelo="cp1" rotuloConcluir="Concluir checkpoint 1" />
    </Cartao>
  )
}

function PainelCheckpoint2(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const lente = visao.lente
  const p = permissao(visao, papeis, 'lente.cp2')
  const encerrado = motivoEncerrado(visao)
  const ehConferente = papeis.includes('conferente')
  return (
    <Cartao titulo="Checkpoint 2 (D-2): conferência independente" id="checkpoint-2">
      {lente.cp2 && (
        <div className="pilha">
          <h3 style={{ margin: 0 }}>Valores digitados no checkpoint 2</h3>
          <ValoresLenteExibicao valores={lente.cp2} />
        </div>
      )}
      {ehConferente && (
        <FormularioCego
          desabilitado={!p.permitido || Boolean(encerrado) || ctl.ocupado !== null}
          motivo={!p.permitido ? p.motivo : encerrado}
          aoEnviar={valores => ctl.executar('lente.cp2', { valores }, 'Checkpoint 2 registrado: o servidor comparou as conferências')}
        />
      )}
      {!ehConferente && !lente.cp2 && !lente.cp2Resultado && <p className="suave">Checkpoint 2 ainda não registrado (feito pela segunda conferente no D-2).</p>}
      <h3 style={{ margin: 0 }}>Itens do checkpoint 2</h3>
      <ChecklistDoBloco {...props} modelo="cp2" rotuloConcluir="Concluir checkpoint 2" />
    </Cartao>
  )
}

function PainelTrocaD0(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const p = permissao(visao, papeis, 'lente.troca_d0')
  const [abrindo, setAbrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!papeis.includes('cirurgiao') || motivoEncerrado(visao)) return null
  return (
    <Cartao titulo="Troca de LIO decidida no dia da cirurgia">
      <p style={{ margin: 0 }}>
        Só com novo plano escrito e assinado; checkpoints 1 e 2 refeitos por duas pessoas antes do Time Out. Ordem verbal não vale.
      </p>
      {!abrindo ? (
        <div>
          <Botao tipo="secundario" desabilitado={!p.permitido} motivo={p.motivo} onClick={() => setAbrindo(true)}>
            Registrar troca de LIO no D0
          </Botao>
        </div>
      ) : (
        <form
          className="pilha"
          onSubmit={async e => {
            e.preventDefault()
            if (motivo.trim().length < 3) return
            if (await ctl.executar('lente.troca_d0', { motivo: motivo.trim() }, 'Troca de LIO registrada: refaça as conferências')) {
              setAbrindo(false)
              setMotivo('')
            }
          }}
        >
          <Campo rotulo="Motivo da troca (escrito pelo cirurgião)" id="troca-motivo">
            <textarea id="troca-motivo" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} />
          </Campo>
          <div className="linha">
            <Botao submit tipo="perigo" desabilitado={motivo.trim().length < 3 || ctl.ocupado !== null}>
              Registrar troca
            </Botao>
            <Botao tipo="secundario" onClick={() => setAbrindo(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  )
}
