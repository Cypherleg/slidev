// Sala (tablet): identificação grande, seis blocos (Admissão, Sign In, Anestesia, Time Out, Sign Out, Alta),
// hard stops em destaque, leitura em voz alta no Sign In e no Time Out (quem leu + quem confirmou por PIN),
// leitura cega da LIO no Time Out, intercorrência, suspender/cancelar, avisos à família, contingência em papel.
// Nenhum botão de "prosseguir assim mesmo".
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router'
import type { CausaCancelamento } from '@dominio/index.ts'
import type { ModeloId, Papel } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { useSessao } from '../../app/sessao.tsx'
import { Aviso, Botao, Campo, Carregando, Cartao, EscolhaUnica, Selo } from '../../componentes/base/index.tsx'
import { ListaHardStops } from '../../componentes/episodio/ListaHardStops.tsx'
import { ConclusaoBloco, SeloSituacao } from '../../componentes/episodio/SituacaoBloco.tsx'
import { formatarDataHora, formatarHora } from '../../componentes/formato.ts'
import { CabecalhoIdentificacao } from '../../componentes/identificacao/CabecalhoIdentificacao.tsx'
import { FormularioLeituraTimeOut } from '../../componentes/lente/FormularioLeituraTimeOut.tsx'
import { ResultadoComparacao } from '../../componentes/lente/ValoresLenteExibicao.tsx'
import { permissao, permissaoConcluir, permissaoDoServidor } from '../../componentes/permissoes.ts'
import type { ResultadoPin } from '../../componentes/pin/TrocaPin.tsx'
import { TrocaPin } from '../../componentes/pin/TrocaPin.tsx'
import { BLOCOS_SALA, ROTULO_CAUSA, ROTULO_ESTADO_MENSAGEM, ROTULO_MODELO, rotuloGatilho, rotuloPapeis } from '../../componentes/rotulos.ts'
import { ROTAS } from '../../rotas.ts'
import { mensagemErroCarga } from '../episodio/Episodio.tsx'
import type { PropsPainel } from '../episodio/paineis/comum.tsx'
import { ChecklistDoBloco, motivoEncerrado } from '../episodio/paineis/comum.tsx'
import { useEpisodio } from '../episodio/useEpisodio.ts'

/** Primeiro bloco ainda não concluído (o que a equipe faz agora). */
function blocoAtual(props: PropsPainel): ModeloId {
  for (const m of BLOCOS_SALA) if (props.visao.blocos[m] && props.visao.blocos[m].situacao !== 'concluido') return m
  return 'alta'
}

export default function Sala() {
  const { id } = useParams()
  const sessao = useSessao()
  const ctl = useEpisodio(id)
  const [escolhido, setEscolhido] = useState<ModeloId | null>(null)

  if (ctl.carregando) {
    return (
      <main className="pagina">
        <Carregando texto="Abrindo o paciente…" />
      </main>
    )
  }
  if (!ctl.visao) {
    return (
      <main className="pagina pilha">
        <Aviso tipo="perigo" titulo={mensagemErroCarga(ctl.erroCarga?.codigo ?? '')}>
          Se o painel estiver fora do ar, a cirurgia segue no papel.
        </Aviso>
        <div className="linha">
          <Botao onClick={() => void ctl.recarregar()}>Tentar de novo</Botao>
          <Link to={ROTAS.impressaoBranco('sign_in')}>Checklists em branco</Link>
        </div>
      </main>
    )
  }
  const visao = ctl.visao
  const props: PropsPainel = { ctl, visao, papeis: sessao.papeis }
  const atual = escolhido ?? blocoAtual(props)

  return (
    <main className="pagina pilha">
      <CabecalhoIdentificacao visao={visao} variante="sala" acoes={<QuemMarca />} />
      {visao.episodio.estado === 'suspenso' && <Aviso tipo="perigo" titulo="EPISÓDIO SUSPENSO">Quem informa a família é o cirurgião.</Aviso>}
      {visao.episodio.estado === 'cancelado' && <Aviso tipo="perigo" titulo="EPISÓDIO CANCELADO" />}
      <ListaHardStops
        grande
        hardStops={visao.hardStops}
        papeisAtor={sessao.papeis}
        permissaoServidor={permissaoDoServidor(visao, 'hardstop.resolver')}
        aoResolver={(codigo, resolucao) => ctl.executar('hardstop.resolver', { codigo, resolucao }, 'Resolução registrada')}
      />
      <nav aria-label="Blocos do dia da cirurgia" className="blocos-sala">
        {BLOCOS_SALA.map(m => {
          const b = visao.blocos[m]
          if (!b) return null
          return (
            <button key={m} type="button" className={`botao-bloco ${b.situacao}`} aria-current={atual === m ? 'step' : undefined} onClick={() => setEscolhido(m)}>
              <strong>{visao.modelos[m]?.titulo ?? ROTULO_MODELO[m]}</strong>
              <SeloSituacao bloco={b} />
              {b.concluido && <span className="suave">{formatarHora(b.concluido.em)}</span>}
            </button>
          )
        })}
      </nav>
      <BlocoSala key={atual} {...props} modelo={atual} />
      <AvisosFamilia {...props} />
      <OcorrenciasSala {...props} />
      <Cartao titulo="Contingência em papel">
        <p style={{ margin: 0 }}>Se o painel cair, a cirurgia segue no papel. Item não conferido não é marcado depois; marcação tardia fica com o horário real e sinalizada.</p>
        <div className="linha">
          <Link to={ROTAS.impressaoEpisodio(visao.episodio.id)}>Imprimir o registro deste episódio</Link>
          {BLOCOS_SALA.map(m => (
            <Link key={m} to={ROTAS.impressaoBranco(m)}>
              {ROTULO_MODELO[m]} em branco
            </Link>
          ))}
        </div>
      </Cartao>
    </main>
  )
}

function QuemMarca() {
  const sessao = useSessao()
  const [trocando, setTrocando] = useState(false)
  return (
    <div className="pilha nao-imprimir" style={{ alignItems: 'flex-end' }}>
      <span>
        Marcando: <strong>{sessao.quem?.nome}</strong> ({rotuloPapeis(sessao.papeis)})
      </span>
      <Botao pequeno tipo="secundario" onClick={() => setTrocando(true)}>
        Trocar quem marca (PIN)
      </Botao>
      {trocando &&
        createPortal(
          <div className="bloqueio-tela" role="dialog" aria-modal="true" aria-label="Trocar quem marca">
            <div className="cartao pilha">
              <TrocaPin modo="ator" aoConcluir={() => setTrocando(false)} aoCancelar={() => setTrocando(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function BlocoSala(props: PropsPainel & { modelo: ModeloId }) {
  const { visao, modelo } = props
  const m = visao.modelos[modelo]
  const b = visao.blocos[modelo]
  if (!m || !b) return <Aviso tipo="atencao">Bloco indisponível.</Aviso>
  return (
    <Cartao titulo={m.titulo} id={`bloco-${modelo}`}>
      {modelo === 'sign_in' && <p style={{ margin: 0, fontWeight: 700 }}>Antes de midriático, bloqueio ou sedação. Marcação do sítio pelo cirurgião antes do midriático.</p>}
      {modelo === 'time_out' && <p style={{ margin: 0, fontWeight: 700 }}>Antes da incisão: todos param. A circulante lê; o cirurgião confirma em voz alta.</p>}
      {modelo === 'sign_out' && <p style={{ margin: 0, fontWeight: 700 }}>Antes de sair da sala.</p>}
      {modelo === 'time_out' && <LeituraLenteTimeOut {...props} />}
      <ChecklistDoBloco {...props} modelo={modelo} modo="imediato" semConcluir={Boolean(m.exigeLeituraEmVozAlta)} />
      {m.exigeLeituraEmVozAlta && b.situacao !== 'concluido' && <LeituraEmVozAlta {...props} modelo={modelo} />}
      <p className="suave" style={{ margin: 0 }}>
        Regra de ouro: qualquer membro da equipe pode interromper. Item não conferido não é marcado "depois".
      </p>
    </Cartao>
  )
}

function LeituraLenteTimeOut(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const p = permissao(visao, papeis, 'lente.time_out')
  const r = visao.lente.timeOutResultado
  return (
    <div className="pilha">
      {r && <ResultadoComparacao titulo="Leitura da LIO no Time Out" resultado={r} />}
      {r && !r.confere && <Aviso tipo="perigo" titulo="A cirurgia não começa">Registre como quase-evento. A lente vai para quarentena até a resolução escrita do cirurgião.</Aviso>}
      {(!r || !r.confere) && (
        <FormularioLeituraTimeOut
          desabilitado={!p.permitido || Boolean(motivoEncerrado(visao)) || ctl.ocupado !== null}
          motivo={!p.permitido ? p.motivo : motivoEncerrado(visao)}
          aoEnviar={leitura => ctl.executar('lente.time_out', { leitura }, 'Leitura da caixa registrada')}
        />
      )}
    </div>
  )
}

/** Sign In e Time Out: leitura em voz alta (regra 10). Registra quem leu e quem confirmou (PIN do confirmador). */
function LeituraEmVozAlta(props: PropsPainel & { modelo: ModeloId }) {
  const { visao, ctl, papeis, modelo } = props
  const m = visao.modelos[modelo]
  const b = visao.blocos[modelo]
  const [membros, setMembros] = useState<{ id: string; nome: string; papeis: Papel[] }[]>([])
  const [leitorId, setLeitorId] = useState('')
  const [confirmador, setConfirmador] = useState<ResultadoPin | null>(null)
  const [pedindoPin, setPedindoPin] = useState(false)
  useEffect(() => {
    chamar('membros.ativos', {})
      .then(l => setMembros([...l].sort((a, c) => a.nome.localeCompare(c.nome, 'pt-BR'))))
      .catch(() => setMembros([]))
  }, [])
  const perm = permissaoConcluir(visao, papeis, m)
  const motivos: string[] = []
  if (!perm.permitido) motivos.push(perm.motivo ?? 'Sem permissão para concluir.')
  if (b.faltam.length) motivos.push(`Faltam ${b.faltam.length} ${b.faltam.length === 1 ? 'item' : 'itens'} do checklist.`)
  for (const i of b.impedimentos) motivos.push(i)
  if (!leitorId) motivos.push('Escolha quem leu em voz alta.')
  if (!confirmador) motivos.push('Quem confirmou entra com o PIN.')
  const encerrado = motivoEncerrado(visao)
  if (encerrado) motivos.push(encerrado)
  const confirmadorExpirado = confirmador && Date.parse(confirmador.expiraEm) <= Date.now()

  return (
    <section className="leitura-voz-alta pilha" aria-labelledby={`voz-${modelo}`}>
      <h3 id={`voz-${modelo}`} style={{ margin: 0 }}>
        Leitura em voz alta: concluir {m.titulo}
      </h3>
      <p className="instrucao" style={{ margin: 0 }}>
        Leia em voz alta DA CAIXA DA LENTE, DA BIOMETRIA ORIGINAL E DA PULSEIRA, não da tela. O paciente diz nome completo, data de nascimento e olho.
      </p>
      <Campo rotulo="Quem leu em voz alta" id={`leitor-${modelo}`}>
        <select
          id={`leitor-${modelo}`}
          value={leitorId}
          onChange={e => {
            setLeitorId(e.target.value)
            if (confirmador && confirmador.ator.id === e.target.value) setConfirmador(null)
          }}
        >
          <option value="">Escolha…</option>
          {membros.map(x => (
            <option key={x.id} value={x.id}>
              {x.nome} ({rotuloPapeis(x.papeis)})
            </option>
          ))}
        </select>
      </Campo>
      <div className="pilha">
        <span className="escolha-rotulo">Quem confirmou (outra pessoa, com PIN)</span>
        {confirmador && !confirmadorExpirado ? (
          <p className="linha" style={{ margin: 0 }}>
            <Selo tipo="ok">Confirmado por {confirmador.ator.nome}</Selo>
            <Botao pequeno tipo="secundario" onClick={() => setConfirmador(null)}>
              Trocar
            </Botao>
          </p>
        ) : pedindoPin ? (
          <div className="cartao">
            <TrocaPin
              modo="confirmador"
              titulo="Quem confirmou a leitura?"
              excluirIds={leitorId ? [leitorId] : []}
              aoConcluir={r => {
                setConfirmador(r)
                setPedindoPin(false)
              }}
              aoCancelar={() => setPedindoPin(false)}
            />
          </div>
        ) : (
          <div>
            <Botao tipo="secundario" onClick={() => setPedindoPin(true)} desabilitado={!leitorId} motivo={!leitorId ? 'Escolha antes quem leu.' : null}>
              Confirmador: entrar com PIN
            </Botao>
            {confirmadorExpirado && <span className="motivo-bloqueio"> O PIN do confirmador expirou; confirme de novo.</span>}
          </div>
        )}
      </div>
      <div>
        <Botao
          grande
          desabilitado={motivos.length > 0 || Boolean(confirmadorExpirado) || ctl.ocupado !== null}
          onClick={async () => {
            if (!confirmador) return
            const ok = await ctl.executar('bloco.concluir', { modelo, leitorId, confirmadorToken: confirmador.token }, `${m.titulo}: concluído`)
            if (ok) setConfirmador(null)
          }}
        >
          Concluir {m.titulo}
        </Botao>
      </div>
      {motivos.length > 0 && (
        <ul className="lista-simples motivo-bloqueio" aria-label="Por que ainda não pode concluir">
          {motivos.map(x => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <ConclusaoBloco bloco={b} />
    </section>
  )
}

function AvisosFamilia(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const av = visao.avisosFamilia
  const [minutos, setMinutos] = useState('')
  const p = permissao(visao, papeis, 'avisos.atraso')
  const n = minutos.trim() === '' ? null : Number(minutos)
  const valido = n === null || (Number.isInteger(n) && n > 0)
  return (
    <Cartao titulo="Avisos à família" id="avisos-familia" destaque={av.suspensos ? 'perigo' : undefined}>
      {av.suspensos && (
        <Aviso tipo="perigo" titulo="Avisos automáticos SUSPENSOS: fale com a família">
          {av.motivoSuspensao ?? 'Intercorrência, hard stop aberto, suspensão ou cancelamento.'} Quem informa a família é o cirurgião.
        </Aviso>
      )}
      {av.mensagens.length === 0 && <p className="suave">Nenhum aviso gerado ainda.</p>}
      {av.mensagens.length > 0 && (
        <ul className="lista-simples">
          {[...av.mensagens]
            .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
            .map(msg => (
              <li key={msg.id} style={{ marginBottom: 8 }}>
                <strong>{rotuloGatilho(msg.gatilho)}</strong> para {msg.destinoMascarado} ·{' '}
                <Selo tipo={msg.estado === 'falhou' || msg.estado === 'desconhecido' ? 'perigo' : msg.estado === 'entregue' || msg.estado === 'enviado' ? 'ok' : 'neutro'}>
                  {ROTULO_ESTADO_MENSAGEM[msg.estado] ?? msg.estado}
                </Selo>{' '}
                <span className="suave">{formatarDataHora(msg.criadoEm)}</span>
                <details>
                  <summary>Texto</summary>
                  <p className="texto-mensagem">{msg.texto}</p>
                </details>
              </li>
            ))}
        </ul>
      )}
      <form
        className="linha"
        style={{ alignItems: 'flex-end' }}
        onSubmit={async e => {
          e.preventDefault()
          if (!valido) return
          if (await ctl.executar('avisos.atraso', { minutos: n }, 'Aviso de atraso registrado')) setMinutos('')
        }}
      >
        <Campo rotulo="Nova previsão (minutos; vazio = sem previsão)" id="atraso-minutos" erro={valido ? null : 'Número inteiro de minutos.'}>
          <input id="atraso-minutos" type="text" inputMode="numeric" value={minutos} onChange={e => setMinutos(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 160 }} />
        </Campo>
        <Botao
          submit
          tipo="secundario"
          desabilitado={!valido || !p.permitido || av.suspensos || ctl.ocupado !== null || Boolean(motivoEncerrado(visao))}
          motivo={!p.permitido ? p.motivo : av.suspensos ? 'Avisos suspensos: fale com a família pessoalmente.' : null}
        >
          Avisar atraso
        </Botao>
      </form>
      <p className="suave" style={{ margin: 0 }}>
        Conteúdo mínimo: primeiro nome, etapa, horário e previsão. Sem olho, sem diagnóstico, sem detalhe clínico. Aviso de atraso só por ação de uma pessoa.
      </p>
    </Cartao>
  )
}

function OcorrenciasSala(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const [modo, setModo] = useState<'intercorrencia' | 'quase_evento' | 'suspender' | 'cancelar' | null>(null)
  const [texto, setTexto] = useState('')
  const [causa, setCausa] = useState<CausaCancelamento | ''>('')
  const [evitavel, setEvitavel] = useState<'sim' | 'nao' | 'nao_sei' | null>(null)
  const pInter = permissao(visao, papeis, 'intercorrencia.registrar')
  const pQuase = permissao(visao, papeis, 'quase_evento.registrar')
  const pSusp = permissao(visao, papeis, 'episodio.suspender')
  const pCanc = permissao(visao, papeis, 'episodio.cancelar')
  const encerrado = motivoEncerrado(visao)
  const limpar = () => {
    setModo(null)
    setTexto('')
    setCausa('')
    setEvitavel(null)
  }
  const enviar = async () => {
    const t = texto.trim()
    if (t.length < 3) return
    let ok = false
    if (modo === 'intercorrencia') ok = await ctl.executar('intercorrencia.registrar', { descricao: t }, 'Intercorrência registrada: avisos automáticos suspensos')
    if (modo === 'quase_evento') ok = await ctl.executar('quase_evento.registrar', { etapa: 'd0', descricao: t }, 'Quase-evento registrado')
    if (modo === 'suspender' || modo === 'cancelar') {
      if (!evitavel) return
      const dados = { motivo: t, causa: causa || null, evitavel: evitavel === 'nao_sei' ? null : evitavel === 'sim' }
      ok = modo === 'suspender' ? await ctl.executar('episodio.suspender', dados, 'Episódio suspenso') : await ctl.executar('episodio.cancelar', dados, 'Episódio cancelado')
    }
    if (ok) limpar()
  }
  return (
    <Cartao titulo="Intercorrência, quase-evento, suspensão">
      {visao.intercorrencias.length > 0 && (
        <ul className="lista-simples">
          {visao.intercorrencias.map(i => (
            <li key={i.em}>
              {formatarDataHora(i.em)} · {i.descricao} <span className="suave">({i.porNome})</span>
            </li>
          ))}
        </ul>
      )}
      {!modo && (
        <div className="linha">
          <Botao tipo="secundario" desabilitado={!pInter.permitido || Boolean(encerrado)} motivo={!pInter.permitido ? pInter.motivo : null} onClick={() => setModo('intercorrencia')}>
            Registrar intercorrência
          </Botao>
          <Botao tipo="secundario" desabilitado={!pQuase.permitido || Boolean(encerrado)} motivo={!pQuase.permitido ? pQuase.motivo : null} onClick={() => setModo('quase_evento')}>
            Registrar quase-evento
          </Botao>
          <Botao tipo="perigo" desabilitado={!pSusp.permitido || Boolean(encerrado) || visao.episodio.estado === 'suspenso'} motivo={!pSusp.permitido ? pSusp.motivo : null} onClick={() => setModo('suspender')}>
            Suspender
          </Botao>
          <Botao tipo="perigo" desabilitado={!pCanc.permitido || Boolean(encerrado)} motivo={!pCanc.permitido ? pCanc.motivo : null} onClick={() => setModo('cancelar')}>
            Cancelar cirurgia
          </Botao>
        </div>
      )}
      {modo && (
        <form
          className="pilha"
          onSubmit={e => {
            e.preventDefault()
            void enviar()
          }}
        >
          <h3 style={{ margin: 0 }}>
            {modo === 'intercorrencia' ? 'Intercorrência' : modo === 'quase_evento' ? 'Quase-evento (divergência detectada antes de atingir o paciente)' : modo === 'suspender' ? 'Suspender o episódio' : 'Cancelar a cirurgia'}
          </h3>
          {modo === 'intercorrencia' && <Aviso tipo="atencao">Com intercorrência registrada, nenhuma mensagem automática sai para a família.</Aviso>}
          <Campo rotulo={modo === 'suspender' || modo === 'cancelar' ? 'Motivo' : 'Descrição'} id="ocorrencia-texto">
            <textarea id="ocorrencia-texto" rows={3} value={texto} onChange={e => setTexto(e.target.value)} />
          </Campo>
          {(modo === 'suspender' || modo === 'cancelar') && (
            <>
              <Campo rotulo="Causa (indicador de cancelamentos evitáveis)" id="ocorrencia-causa">
                <select id="ocorrencia-causa" value={causa} onChange={e => setCausa(e.target.value as CausaCancelamento)}>
                  <option value="">Não se aplica</option>
                  {(Object.keys(ROTULO_CAUSA) as CausaCancelamento[]).map(c => (
                    <option key={c} value={c}>
                      {ROTULO_CAUSA[c]}
                    </option>
                  ))}
                </select>
              </Campo>
              <EscolhaUnica
                rotulo="Evitável?"
                nome="ocorrencia-evitavel"
                opcoes={[
                  { valor: 'sim', rotulo: 'Sim' },
                  { valor: 'nao', rotulo: 'Não' },
                  { valor: 'nao_sei', rotulo: 'Não sei' },
                ]}
                valor={evitavel}
                aoMudar={setEvitavel}
              />
            </>
          )}
          <div className="linha">
            <Botao submit tipo={modo === 'suspender' || modo === 'cancelar' ? 'perigo' : 'primario'} desabilitado={texto.trim().length < 3 || ((modo === 'suspender' || modo === 'cancelar') && !evitavel) || ctl.ocupado !== null}>
              Registrar
            </Botao>
            <Botao tipo="secundario" onClick={limpar}>
              Voltar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  )
}
