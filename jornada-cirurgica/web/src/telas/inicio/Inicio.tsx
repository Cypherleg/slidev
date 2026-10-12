// Início: atalhos por papel, lista de hoje resumida, alertas abertos para o cirurgião, busca de episódio.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { AcoesEquipe } from '@contrato'
import type { EpisodioResumoDia, Papel } from '@dominio/tipos.ts'
import { ROTULO_ESTADO } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { useTratarErro } from '../../app/erros.tsx'
import { ROTAS_CLINICO } from '../../app/rotasClinico.ts'
import { useSessao } from '../../app/sessao.tsx'
import { Aviso, Botao, Carregando, Cartao, OlhoDestaque, Selo } from '../../componentes/base/index.tsx'
import { dataComDiaDaSemana, formatarData, formatarDataHora, hojeLocal, somarDias } from '../../componentes/formato.ts'
import { temAlgumPapel } from '../../componentes/permissoes.ts'
import { rotuloPapeis } from '../../componentes/rotulos.ts'
import { ROTAS } from '../../rotas.ts'
import { ItemDia, ordenarDia } from '../dia/ItemDia.tsx'

type AlertaAberto = AcoesEquipe['alertas.abertos']['S'][number]

interface Atalho {
  rotulo: string
  descricao: string
  para: string
  papeis?: Papel[]
}

function atalhos(hoje: string): Atalho[] {
  return [
    { rotulo: 'Novo episódio (D-7)', descricao: 'CPF, conferência com documento, olho, cirurgião, lente', para: ROTAS.novoEpisodio, papeis: ['concierge', 'gestora'] },
    { rotulo: `D-2: cirurgias de ${formatarData(somarDias(hoje, 2))}`, descricao: 'Conferência independente da lente, ligação, etiquetas', para: ROTAS.dia(somarDias(hoje, 2)), papeis: ['conferente', 'concierge'] },
    { rotulo: 'Lista de hoje', descricao: 'Ordem, olho, estado, hard stops; abrir a sala', para: ROTAS.dia(hoje) },
    { rotulo: 'Resumo da véspera', descricao: `Cirurgias de ${formatarData(somarDias(hoje, 1))}: alertas sem conduta, lentes, termos`, para: ROTAS.vespera(somarDias(hoje, 1)), papeis: ['cirurgiao', 'gestora'] },
    { rotulo: 'O que falta', descricao: 'Pendências por episódio, de quem dependem e desde quando', para: ROTAS.pendencias },
    { rotulo: 'Gestão', descricao: 'Equipe, modelos de checklist, materiais, configurações, indicadores', para: ROTAS.gestao(), papeis: ['gestora'] },
    { rotulo: 'Meu PIN', descricao: 'Para marcar em seu nome num aparelho compartilhado', para: ROTAS_CLINICO.meuPin },
  ]
}

export default function Inicio() {
  const sessao = useSessao()
  const hoje = hojeLocal()
  const papeis = sessao.papeis
  const lista = atalhos(hoje).filter(a => !a.papeis || temAlgumPapel(papeis, a.papeis))
  const veAlertas = temAlgumPapel(papeis, ['cirurgiao', 'gestora'])
  return (
    <main className="pagina pilha">
      <h1 style={{ margin: 0 }}>Olá, {sessao.quem?.nome}.</h1>
      <p className="suave" style={{ margin: 0 }}>
        {rotuloPapeis(papeis)} · {dataComDiaDaSemana(hoje)}
      </p>
      {sessao.dados && !sessao.dados.membro.temPin && (
        <Aviso tipo="info">
          Você ainda não tem PIN. <Link to={ROTAS_CLINICO.meuPin}>Defina o seu PIN</Link> para marcar em seu nome nos aparelhos compartilhados.
        </Aviso>
      )}
      <nav aria-label="Atalhos" className="grade-2">
        {lista.map(a => (
          <Link key={a.rotulo} to={a.para} className="cartao" style={{ textDecoration: 'none', color: 'inherit', minHeight: 88, display: 'block' }}>
            <strong style={{ color: 'var(--marinho)', fontSize: '1.15rem' }}>{a.rotulo}</strong>
            <span className="suave" style={{ display: 'block' }}>
              {a.descricao}
            </span>
          </Link>
        ))}
      </nav>
      {veAlertas && <AlertasAbertos />}
      <ListaDeHoje hoje={hoje} />
      <BuscaEpisodio />
    </main>
  )
}

function ListaDeHoje(props: { hoje: string }) {
  const tratar = useTratarErro()
  const [lista, setLista] = useState<EpisodioResumoDia[] | null>(null)
  useEffect(() => {
    let vivo = true
    chamar('dia.lista', { data: props.hoje })
      .then(l => vivo && setLista(ordenarDia(l)))
      .catch(e => {
        if (!vivo) return
        setLista([])
        tratar(e)
      })
    return () => {
      vivo = false
    }
  }, [props.hoje, tratar])
  return (
    <Cartao titulo="Cirurgias de hoje" acoes={<Link to={ROTAS.dia(props.hoje)}>Lista completa</Link>}>
      {!lista && <Carregando />}
      {lista && lista.length === 0 && <p className="suave">Nenhuma cirurgia agendada para hoje.</p>}
      {lista && lista.length > 0 && (
        <ol className="lista-dia">
          {lista.map(e => (
            <ItemDia key={e.episodioId} e={e} compacto />
          ))}
        </ol>
      )}
    </Cartao>
  )
}

function AlertasAbertos() {
  const tratar = useTratarErro()
  const [alertas, setAlertas] = useState<AlertaAberto[] | null>(null)
  useEffect(() => {
    let vivo = true
    chamar('alertas.abertos', {})
      .then(a => vivo && setAlertas(a))
      .catch(e => {
        if (!vivo) return
        setAlertas([])
        tratar(e)
      })
    return () => {
      vivo = false
    }
  }, [tratar])
  return (
    <Cartao titulo={`Alertas abertos para o cirurgião${alertas ? ` (${alertas.length})` : ''}`} destaque={alertas && alertas.length > 0 ? 'atencao' : undefined}>
      {!alertas && <Carregando />}
      {alertas && alertas.length === 0 && <p className="suave">Nenhum alerta aguardando conduta.</p>}
      {alertas && alertas.length > 0 && (
        <ul className="lista-simples">
          {alertas.map(a => (
            <li key={`${a.episodioId}-${a.id}`} style={{ marginBottom: 6 }}>
              <strong>{a.pacienteNome}</strong>: {a.nivel === 'alerta' ? 'ALERTA' : 'Sinalizado'}: {a.titulo}. <span className="suave">{a.descricao}</span>{' '}
              {a.comunicado ? <Selo tipo="ok">comunicado {formatarDataHora(a.comunicado.em)}</Selo> : <Selo tipo="perigo">ainda não comunicado</Selo>}{' '}
              {!a.conduta && <Selo tipo="atencao">sem conduta escrita</Selo>} <Link to={`${ROTAS.episodio(a.episodioId, 'd7')}&ir=alertas`}>Abrir</Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function BuscaEpisodio() {
  const tratar = useTratarErro()
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState<EpisodioResumoDia[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  return (
    <Cartao titulo="Buscar episódio">
      <form
        className="linha"
        style={{ alignItems: 'flex-end' }}
        onSubmit={async e => {
          e.preventDefault()
          if (termo.trim().length < 3) return
          setBuscando(true)
          try {
            setResultado(await chamar('episodios.buscar', { termo: termo.trim() }))
          } catch (er) {
            tratar(er)
          } finally {
            setBuscando(false)
          }
        }}
      >
        <div className="campo" style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="busca-termo">Nome do paciente ou prontuário (mínimo 3 letras)</label>
          <input id="busca-termo" type="search" autoComplete="off" value={termo} onChange={e => setTermo(e.target.value)} />
        </div>
        <Botao submit desabilitado={buscando || termo.trim().length < 3}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </Botao>
      </form>
      {resultado && resultado.length === 0 && <p className="suave">Nada encontrado.</p>}
      {resultado && resultado.length > 0 && (
        <ul className="lista-simples">
          {resultado.map(e => (
            <Linha key={e.episodioId}>
              <Link to={ROTAS.episodio(e.episodioId)}>
                <strong>{e.pacienteNome}</strong>
              </Link>{' '}
              · nascimento {formatarData(e.dataNascimento)} · <OlhoDestaque olho={e.olho} /> · {ROTULO_ESTADO[e.estado] ?? e.estado}
            </Linha>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function Linha(props: { children: ReactNode }) {
  return <li style={{ marginBottom: 8 }}>{props.children}</li>
}
