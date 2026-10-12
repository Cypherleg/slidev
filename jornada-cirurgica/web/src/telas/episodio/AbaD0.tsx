// Aba D0: resumo dos seis blocos do dia da cirurgia e atalho para a tela da sala.
import { Link } from 'react-router'
import { Aviso, Cartao } from '../../componentes/base/index.tsx'
import { ConclusaoBloco, SeloSituacao } from '../../componentes/episodio/SituacaoBloco.tsx'
import { BLOCOS_SALA, ROTULO_MODELO } from '../../componentes/rotulos.ts'
import { ROTAS } from '../../rotas.ts'
import type { PropsPainel } from './paineis/comum.tsx'

export function AbaD0(props: PropsPainel) {
  const { visao } = props
  return (
    <div className="pilha">
      <div className="linha">
        <Link to={ROTAS.sala(visao.episodio.id)} className="botao grande" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Abrir na sala (tablet)
        </Link>
        <Link to={ROTAS.impressaoEpisodio(visao.episodio.id)} className="botao secundario" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Imprimir o registro do episódio
        </Link>
      </div>
      <Cartao titulo="Dia da cirurgia: blocos">
        <ol className="lista-simples">
          {BLOCOS_SALA.map(m => {
            const b = visao.blocos[m]
            if (!b) return null
            return (
              <li key={m} className="pilha" style={{ marginBottom: 8 }}>
                <span className="linha">
                  <strong>{visao.modelos[m]?.titulo ?? ROTULO_MODELO[m]}</strong> <SeloSituacao bloco={b} />
                </span>
                <ConclusaoBloco bloco={b} />
                {b.situacao !== 'concluido' && b.faltam.length > 0 && <span className="suave">Faltam {b.faltam.length} itens.</span>}
                {b.situacao !== 'concluido' && b.impedimentos.length > 0 && <span className="motivo-bloqueio">{b.impedimentos.join(' ')}</span>}
              </li>
            )
          })}
        </ol>
      </Cartao>
      {visao.avisosFamilia.suspensos && (
        <Aviso tipo="perigo" titulo="Avisos automáticos à família suspensos: fale com a família">
          {visao.avisosFamilia.motivoSuspensao}
        </Aviso>
      )}
      {visao.intercorrencias.length > 0 && (
        <Cartao titulo="Intercorrências">
          <ul className="lista-simples">
            {visao.intercorrencias.map(i => (
              <li key={i.em}>
                {i.descricao} <span className="suave">({i.porNome})</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  )
}
