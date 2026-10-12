// Casca da aplicação da equipe: cabeçalho, aviso fixo do ator por PIN, navegação por papel,
// bloqueio por inatividade (aparelho compartilhado).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import type { Papel } from '@dominio/tipos.ts'
import { Aviso, Botao } from '../componentes/base/index.tsx'
import { formatarHora, hojeLocal, somarDias } from '../componentes/formato.ts'
import { TrocaPin } from '../componentes/pin/TrocaPin.tsx'
import { rotuloPapeis } from '../componentes/rotulos.ts'
import { ROTAS } from '../rotas.ts'
import { ROTAS_CLINICO } from './rotasClinico.ts'
import { useSessao } from './sessao.tsx'

const MINUTOS_INATIVIDADE = (() => {
  const v = Number(import.meta.env.VITE_INATIVIDADE_MIN)
  return Number.isFinite(v) && v > 0 ? v : 10
})()

interface ItemNavegacao {
  rotulo: string
  para: string
  papeis?: Papel[]
  fim?: boolean
}

function itensNavegacao(): ItemNavegacao[] {
  const hoje = hojeLocal()
  return [
    { rotulo: 'Início', para: ROTAS.inicio, fim: true },
    { rotulo: 'Novo episódio', para: ROTAS.novoEpisodio, papeis: ['concierge', 'gestora'] },
    { rotulo: 'Dia cirúrgico', para: ROTAS.dia(hoje) },
    { rotulo: 'Pendências', para: ROTAS.pendencias },
    { rotulo: 'Véspera', para: ROTAS.vespera(somarDias(hoje, 1)), papeis: ['cirurgiao', 'gestora'] },
    { rotulo: 'Gestão', para: ROTAS.gestao(), papeis: ['gestora'] },
  ]
}

/** Dispara `aoExpirar` após `minutos` sem toque, tecla ou rolagem. */
function useInatividade(minutos: number, ativo: boolean, aoExpirar: () => void) {
  const ref = useRef(aoExpirar)
  ref.current = aoExpirar
  useEffect(() => {
    if (!ativo) return
    let timer: ReturnType<typeof setTimeout>
    const reiniciar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => ref.current(), minutos * 60_000)
    }
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const
    for (const ev of eventos) window.addEventListener(ev, reiniciar, { passive: true })
    reiniciar()
    return () => {
      clearTimeout(timer)
      for (const ev of eventos) window.removeEventListener(ev, reiniciar)
    }
  }, [minutos, ativo])
}

export default function Casca() {
  const sessao = useSessao()
  const navegar = useNavigate()
  const [bloqueado, setBloqueado] = useState(false)
  const [trocandoPin, setTrocandoPin] = useState(false)
  const [alturaAtor, setAlturaAtor] = useState(0)
  const refFaixa = useRef<HTMLDivElement | null>(null)
  const dados = sessao.dados
  const temAtor = Boolean(sessao.ator)

  // O cabeçalho de identificação gruda logo abaixo do aviso "Marcando como".
  useLayoutEffect(() => {
    const el = refFaixa.current
    if (!el) {
      setAlturaAtor(0)
      return
    }
    setAlturaAtor(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => setAlturaAtor(el.offsetHeight))
    obs.observe(el)
    return () => obs.disconnect()
  }, [temAtor])

  const bloquear = useCallback(() => {
    setBloqueado(true)
    if (sessao.ator) void sessao.encerrarAtor()
  }, [sessao])

  useInatividade(MINUTOS_INATIVIDADE, !bloqueado && sessao.estado === 'logado', bloquear)

  if (!dados) return null
  const papeisLogin = dados.membro.papeis
  // Navegação pelos papéis de quem está marcando (ator do PIN, se houver; senão o login).
  const papeisNav = new Set<Papel>(sessao.papeis)
  const itens = itensNavegacao().filter(i => !i.papeis || i.papeis.some(p => papeisNav.has(p)))
  const estiloAtor = { '--altura-ator': `${temAtor ? alturaAtor : 0}px` } as CSSProperties

  return (
    <div style={estiloAtor}>
      <header className="casca-topo nao-imprimir">
        <div className="pagina">
          <Link to={ROTAS.inicio} className="marca" aria-label="OFTA VITTA, Jornada Cirúrgica: início">
            OFTA VITTA <small>· Jornada Cirúrgica</small>
          </Link>
          <nav className="navegacao" aria-label="Navegação principal">
            {itens.map(i => (
              <NavLink key={i.rotulo} to={i.para} end={i.fim}>
                {i.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="usuario">
            <span>
              <strong>{dados.membro.nome}</strong>
              <span style={{ opacity: 0.85 }}> · {rotuloPapeis(papeisLogin)}</span>
            </span>
            <Botao tipo="secundario" pequeno onClick={() => setTrocandoPin(true)}>
              Trocar quem marca (PIN)
            </Botao>
            <Link to={ROTAS_CLINICO.meuPin} className="botao secundario pequeno" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Meu PIN
            </Link>
            <Botao
              tipo="secundario"
              pequeno
              onClick={() => {
                void sessao.sair().then(() => navegar(ROTAS.entrar))
              }}
            >
              Sair
            </Botao>
          </div>
        </div>
      </header>
      {(dados.ambiente !== 'producao' || dados.modoEnvio === 'ensaio') && (
        <div className="faixa-ambiente nao-imprimir" role="note">
          <div className="pagina">
            {dados.ambiente === 'desenvolvimento' && <strong>Ambiente de demonstração: somente dados fictícios.</strong>}
            {dados.ambiente === 'homologacao' && <strong>Ambiente de homologação.</strong>}
            {dados.modoEnvio === 'ensaio' && <span>Envio a pacientes em MODO ENSAIO: as mensagens são montadas e registradas, mas não saem.</span>}
          </div>
        </div>
      )}
      {sessao.ator && (
        <div className="faixa-ator" role="status" aria-live="polite" ref={refFaixa}>
          <div className="pagina">
            <span>
              <strong>
                Marcando como: {sessao.ator.nome} ({rotuloPapeis(sessao.ator.papeis)})
              </strong>
              <span className="suave"> · login do aparelho: {dados.membro.nome} · PIN válido até {formatarHora(sessao.ator.expiraEm)}</span>
            </span>
            <span className="linha">
              <Botao pequeno tipo="secundario" onClick={() => setTrocandoPin(true)}>
                Trocar
              </Botao>
              <Botao pequeno onClick={() => void sessao.encerrarAtor()}>
                Encerrar PIN
              </Botao>
            </span>
          </div>
        </div>
      )}
      {trocandoPin && !bloqueado && (
        <div className="bloqueio-tela" role="dialog" aria-modal="true" aria-label="Trocar quem marca">
          <div className="cartao pilha">
            <TrocaPin modo="ator" aoConcluir={() => setTrocandoPin(false)} aoCancelar={() => setTrocandoPin(false)} instrucao="As marcações passam a sair em nome de quem digitar o PIN." />
          </div>
        </div>
      )}
      {bloqueado && (
        <div className="bloqueio-tela" role="dialog" aria-modal="true" aria-labelledby="titulo-bloqueio">
          <div className="cartao pilha">
            <h2 id="titulo-bloqueio">Aparelho bloqueado por inatividade</h2>
            <Aviso tipo="info">Para continuar, quem vai marcar entra com o PIN. A marcação anterior por PIN foi encerrada.</Aviso>
            <TrocaPin modo="ator" titulo="Quem vai usar o aparelho?" aoConcluir={() => setBloqueado(false)} />
            <div>
              <Botao
                tipo="secundario"
                onClick={() => {
                  setBloqueado(false)
                  void sessao.sair().then(() => navegar(ROTAS.entrar))
                }}
              >
                Sair e entrar com e-mail
              </Botao>
            </div>
          </div>
        </div>
      )}
      <div aria-hidden={bloqueado || trocandoPin ? true : undefined}>
        <Outlet />
      </div>
    </div>
  )
}
