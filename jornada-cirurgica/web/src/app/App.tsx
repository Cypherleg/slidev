// Casca + roteador (react-router v7). A página do paciente (/p/:token) fica fora da casca e sem login.
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
import Gestao from '../telas/gestao/Gestao.tsx'
import ImpressaoBranco from '../telas/impressao/ImpressaoBranco.tsx'
import ImpressaoEpisodio from '../telas/impressao/ImpressaoEpisodio.tsx'
import Inicio from '../telas/inicio/Inicio.tsx'
import PaginaPaciente from '../telas/paciente/PaginaPaciente.tsx'
import Pendencias from '../telas/pendencias/Pendencias.tsx'
import ResumoVespera from '../telas/resumo/ResumoVespera.tsx'
import Casca from './Casca.tsx'
import Entrar from './Entrar.tsx'
import { ProvedorNotificacoes } from './notificacoes.tsx'
import { ROTAS_CLINICO } from './rotasClinico.ts'
import { ProvedorSessao, useSessao } from './sessao.tsx'

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
          <Route path={PADROES.paginaPaciente} element={<PaginaPaciente />} />
          <Route element={<ComSessao />}>
            <Route path={PADROES.entrar} element={<Entrar />} />
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
              <Route path={PADROES.pendencias} element={<Pendencias />} />
              <Route path={PADROES.vespera} element={<ResumoVespera />} />
              <Route path={PADROES.gestao} element={<Gestao />} />
              <Route path={PADROES.impressaoEpisodio} element={<ImpressaoEpisodio />} />
              <Route path={PADROES.impressaoBranco} element={<ImpressaoBranco />} />
              <Route path={ROTAS_CLINICO.meuPin} element={<MeuPin />} />
              <Route path="*" element={<NaoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </ProvedorNotificacoes>
    </BrowserRouter>
  )
}
