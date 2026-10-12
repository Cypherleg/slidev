// Casca + roteador (react-router v7).
// Fora da casca e sem login: a página do paciente (/p/:token, sem nem o provedor de sessão) e os checklists
// em branco (/impressao/branco/:modelo, contingência em papel). O registro preenchido (/impressao/episodio/:id) exige sessão.
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Aviso, Botao, Carregando, Cartao } from '../componentes/base/index.tsx'
import { hojeLocal } from '../componentes/formato.ts'
import { DefinirPin } from '../componentes/pin/DefinirPin.tsx'
import { PADROES, ROTAS } from '../rotas.ts'
import Episodio from '../telas/episodio/Episodio.tsx'
import NovoEpisodio from '../telas/episodio/NovoEpisodio.tsx'
import ListaDia from '../telas/dia/ListaDia.tsx'
import Sala from '../telas/dia/Sala.tsx'
import Inicio from '../telas/inicio/Inicio.tsx'
import Casca from './Casca.tsx'
import Entrar from './Entrar.tsx'
import { ProvedorNotificacoes } from './notificacoes.tsx'
import { ROTAS_CLINICO } from './rotasClinico.ts'
import { ProvedorSessao, useSessao } from './sessao.tsx'

// Telas carregadas sob demanda (pacote menor no tablet; a página do paciente não carrega a interface da equipe).
const PaginaPaciente = lazy(() => import('../telas/paciente/PaginaPaciente.tsx'))
const Gestao = lazy(() => import('../telas/gestao/Gestao.tsx'))
const ImpressaoEpisodio = lazy(() => import('../telas/impressao/ImpressaoEpisodio.tsx'))
const ImpressaoBranco = lazy(() => import('../telas/impressao/ImpressaoBranco.tsx'))
const ResumoVespera = lazy(() => import('../telas/resumo/ResumoVespera.tsx'))
const Pendencias = lazy(() => import('../telas/pendencias/Pendencias.tsx'))

function SobDemanda(props: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="pagina">
          <Carregando />
        </main>
      }
    >
      {props.children}
    </Suspense>
  )
}

function ComSessao() {
  return (
    <ProvedorSessao>
      <Outlet />
    </ProvedorSessao>
  )
}

function ExigeSessao(props: { children: ReactNode }) {
  const sessao = useSessao()
  const local = useLocation()
  if (sessao.estado === 'carregando') {
    return (
      <main className="pagina">
        <Carregando texto="Conferindo a sessão…" />
      </main>
    )
  }
  if (sessao.estado === 'indisponivel') {
    return (
      <main className="pagina pilha">
        <Aviso tipo="perigo" titulo="Servidor indisponível: siga o checklist em papel">
          Não foi possível falar com o servidor. Nenhuma ação foi registrada.
        </Aviso>
        <div className="linha">
          <Botao onClick={() => void sessao.recarregar()}>Tentar de novo</Botao>
        </div>
      </main>
    )
  }
  if (sessao.estado !== 'logado') return <Navigate to={ROTAS.entrar} replace state={{ de: local.pathname + local.search, mfa: sessao.estado === 'mfa' }} />
  return <>{props.children}</>
}

function MeuPin() {
  const sessao = useSessao()
  return (
    <main className="pagina pilha" style={{ maxWidth: 720 }}>
      <h1>Meu PIN</h1>
      <Cartao titulo={sessao.dados?.membro.temPin ? 'Trocar o PIN' : 'Definir o PIN'}>
        <DefinirPin temPin={Boolean(sessao.dados?.membro.temPin)} aoConcluir={() => void sessao.recarregar()} />
      </Cartao>
    </main>
  )
}

function NaoEncontrada() {
  return (
    <main className="pagina pilha">
      <h1>Página não encontrada</h1>
      <p>
        <Link to={ROTAS.inicio}>Voltar ao início</Link>
      </p>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProvedorNotificacoes>
        <Routes>
          <Route
            path={PADROES.paginaPaciente}
            element={
              <SobDemanda>
                <PaginaPaciente />
              </SobDemanda>
            }
          />
          <Route element={<ComSessao />}>
            <Route path={PADROES.entrar} element={<Entrar />} />
            {/* Contingência em papel (regra 12): abre sem sessão e com o servidor fora; não mostra dado de paciente. */}
            <Route
              path={PADROES.impressaoBranco}
              element={
                <SobDemanda>
                  <ImpressaoBranco />
                </SobDemanda>
              }
            />
            <Route
              element={
                <ExigeSessao>
                  <Casca />
                </ExigeSessao>
              }
            >
              <Route index element={<Inicio />} />
              <Route path={PADROES.novoEpisodio} element={<NovoEpisodio />} />
              <Route path={PADROES.episodio} element={<Episodio />} />
              <Route path={ROTAS_CLINICO.diaHoje} element={<Navigate to={ROTAS.dia(hojeLocal())} replace />} />
              <Route path="/dia/hoje" element={<Navigate to={ROTAS.dia(hojeLocal())} replace />} />
              <Route path={PADROES.dia} element={<ListaDia />} />
              <Route path={PADROES.sala} element={<Sala />} />
              <Route
                path={PADROES.pendencias}
                element={
                  <SobDemanda>
                    <Pendencias />
                  </SobDemanda>
                }
              />
              <Route
                path={PADROES.vespera}
                element={
                  <SobDemanda>
                    <ResumoVespera />
                  </SobDemanda>
                }
              />
              <Route
                path={PADROES.gestao}
                element={
                  <SobDemanda>
                    <Gestao />
                  </SobDemanda>
                }
              />
              <Route
                path={PADROES.impressaoEpisodio}
                element={
                  <SobDemanda>
                    <ImpressaoEpisodio />
                  </SobDemanda>
                }
              />
              <Route path={ROTAS_CLINICO.meuPin} element={<MeuPin />} />
              <Route path="*" element={<NaoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </ProvedorNotificacoes>
    </BrowserRouter>
  )
}
