// Tela do episódio: cabeçalho fixo de identificação + abas D-7, Lente, D-2, D0, Histórico.
import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { Papel } from '@dominio/tipos.ts'
import { useSessao } from '../../app/sessao.tsx'
import { Aviso, Botao, Carregando } from '../../componentes/base/index.tsx'
import { CAMINHO_HARD_STOP } from '../../componentes/episodio/caminhoHardStop.ts'
import { ListaHardStops } from '../../componentes/episodio/ListaHardStops.tsx'
import { CabecalhoIdentificacao } from '../../componentes/identificacao/CabecalhoIdentificacao.tsx'
import { permissaoDoServidor } from '../../componentes/permissoes.ts'
import { ROTAS } from '../../rotas.ts'
import { AbaD0 } from './AbaD0.tsx'
import { AbaD2 } from './AbaD2.tsx'
import { AbaD7 } from './AbaD7.tsx'
import { AbaHistorico } from './AbaHistorico.tsx'
import { AbaLente } from './AbaLente.tsx'
import { PainelPendencias } from './paineis/PainelPendencias.tsx'
import { useEpisodio } from './useEpisodio.ts'

export type Aba = 'd7' | 'lente' | 'd2' | 'd0' | 'historico'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'd7', rotulo: 'D-7' },
  { id: 'lente', rotulo: 'Lente' },
  { id: 'd2', rotulo: 'D-2' },
  { id: 'd0', rotulo: 'Dia da cirurgia' },
  { id: 'historico', rotulo: 'Histórico' },
]

export function abaPadrao(papeis: Papel[]): Aba {
  if (papeis.includes('concierge') || papeis.includes('gestora')) return 'd7'
  if (papeis.includes('conferente')) return 'd2'
  if (papeis.some(p => p === 'enfermagem' || p === 'circulante' || p === 'anestesista')) return 'd0'
  return 'd7'
}

export function mensagemErroCarga(codigo: string): string {
  switch (codigo) {
    case 'nao_encontrado':
      return 'Episódio não encontrado.'
    case 'sem_permissao':
      return 'Seu papel não tem acesso a este episódio.'
    case 'indisponivel':
      return 'Servidor indisponível: siga o checklist em papel.'
    default:
      return 'Não foi possível abrir o episódio.'
  }
}

export default function Episodio() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const sessao = useSessao()
  const ctl = useEpisodio(id)
  const papeis = sessao.papeis
  const abaParam = params.get('aba') as Aba | null
  const aba: Aba = abaParam && ABAS.some(a => a.id === abaParam) ? abaParam : abaPadrao(papeis)
  const ancora = params.get('ir')

  // Depois de navegar para uma pendência, rola até a âncora.
  useEffect(() => {
    if (!ancora || !ctl.visao) return
    const el = document.getElementById(ancora)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [ancora, aba, ctl.visao])

  if (ctl.carregando) {
    return (
      <main className="pagina">
        <Carregando texto="Abrindo o episódio…" />
      </main>
    )
  }
  if (!ctl.visao) {
    return (
      <main className="pagina pilha">
        <Aviso tipo="perigo" titulo={mensagemErroCarga(ctl.erroCarga?.codigo ?? '')}>
          {ctl.erroCarga?.codigo === 'indisponivel' && (
            <span>
              {' '}
              <Link to={ROTAS.impressaoBranco('d7')}>Checklists em branco</Link>
            </span>
          )}
        </Aviso>
        <div className="linha">
          <Botao onClick={() => void ctl.recarregar()}>Tentar de novo</Botao>
          <Link to={ROTAS.inicio}>Voltar ao início</Link>
        </div>
      </main>
    )
  }

  const visao = ctl.visao
  const mudarAba = (nova: Aba, irPara?: string) => {
    const p = new URLSearchParams(params)
    p.set('aba', nova)
    if (irPara) p.set('ir', irPara)
    else p.delete('ir')
    setParams(p, { replace: false })
  }
  const props = { ctl, visao, papeis }

  return (
    <main className="pagina pilha">
      <CabecalhoIdentificacao
        visao={visao}
        linkPrimeiroOlho={idPrimeiro => <Link to={ROTAS.episodio(idPrimeiro)}>Ver o episódio do 1º olho.</Link>}
        acoes={
          <span className="linha nao-imprimir">
            <Link to={ROTAS.sala(visao.episodio.id)} className="botao secundario pequeno" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Sala
            </Link>
            <Link to={ROTAS.impressaoEpisodio(visao.episodio.id)} className="botao secundario pequeno" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Imprimir
            </Link>
            <Botao pequeno tipo="secundario" onClick={() => void ctl.recarregar()} rotuloAria="Atualizar o episódio">
              Atualizar
            </Botao>
          </span>
        }
      />
      {visao.episodio.estado === 'suspenso' && <Aviso tipo="perigo" titulo="EPISÓDIO SUSPENSO">Avisos automáticos suspensos. Quem informa a família é o cirurgião.</Aviso>}
      {visao.episodio.estado === 'cancelado' && <Aviso tipo="perigo" titulo="EPISÓDIO CANCELADO" />}
      <ListaHardStops
        hardStops={visao.hardStops}
        papeisAtor={papeis}
        permissaoPara={codigo => permissaoDoServidor(visao, 'hardstop.resolver', codigo)}
        caminhoPara={h => {
          const c = CAMINHO_HARD_STOP[h.codigo]
          return c ? (
            <button type="button" className="botao secundario pequeno" onClick={() => mudarAba(c.aba, c.ancora)}>
              {c.rotulo}
            </button>
          ) : null
        }}
        aoResolver={(codigo, resolucao) => ctl.executar('hardstop.resolver', { codigo, resolucao }, 'Resolução registrada')}
      />
      <PainelPendencias pendencias={visao.pendencias} aoIr={d => mudarAba(d.aba, d.ancora)} />
      <div className="abas nao-imprimir" role="tablist" aria-label="Etapas do episódio">
        {ABAS.map(a => (
          <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={`painel-${a.id}`} onClick={() => mudarAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === 'd7' && <AbaD7 {...props} />}
        {aba === 'lente' && <AbaLente {...props} />}
        {aba === 'd2' && <AbaD2 {...props} />}
        {aba === 'd0' && <AbaD0 {...props} />}
        {aba === 'historico' && <AbaHistorico visao={visao} />}
      </div>
    </main>
  )
}
