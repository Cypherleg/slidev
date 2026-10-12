// Linha da lista do dia (sem valores de lente).
import { Link } from 'react-router'
import type { EpisodioResumoDia } from '@dominio/tipos.ts'
import { ROTULO_ESTADO } from '@dominio/tipos.ts'
import { Dots, OlhoDestaque, Selo } from '../../componentes/base/index.tsx'
import { formatarData, formatarHora } from '../../componentes/formato.ts'
import { ROTULO_ETAPA_LENTE } from '../../componentes/rotulos.ts'
import { ROTAS } from '../../rotas.ts'

export function ordenarDia(lista: EpisodioResumoDia[]): EpisodioResumoDia[] {
  return [...lista].sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || (a.horario ?? '99:99').localeCompare(b.horario ?? '99:99') || a.pacienteNome.localeCompare(b.pacienteNome, 'pt-BR'))
}

export function ItemDia(props: { e: EpisodioResumoDia; compacto?: boolean }) {
  const { e } = props
  const encerrado = e.estado === 'cancelado' || e.estado === 'suspenso'
  return (
    <li className="item-dia" style={encerrado ? { opacity: 0.75 } : undefined}>
      <div className="ordem" aria-label={e.ordem ? `${e.ordem}º da lista` : 'sem ordem'}>
        {e.ordem ? `${e.ordem}º` : '—'}
        <small>{e.horario ? formatarHora(e.horario) : 'sem horário'}</small>
      </div>
      <div className="pilha" style={{ minWidth: 0 }}>
        <span className="nome">{e.pacienteNome}</span>
        <span className="linha" style={{ gap: 8 }}>
          <span>Nascimento {formatarData(e.dataNascimento)}</span>
          <OlhoDestaque olho={e.olho} />
          <span className="suave">{e.cirurgiaoNome}</span>
          <Selo tipo={encerrado ? 'perigo' : e.estado === 'alta' ? 'ok' : 'info'}>{ROTULO_ESTADO[e.estado] ?? e.estado}</Selo>
        </span>
        <Dots dots={e.dots} semTextoVazio />
        {e.alertasExtenso.length > 0 && (
          <span className="alertas-extenso">
            {e.alertasExtenso.map(a => (
              <span key={a} className="alerta-extenso">
                {a}
              </span>
            ))}
          </span>
        )}
        {e.homonimoOuParecido && (
          <span>
            <span className="alerta-extenso">HOMÔNIMO OU NOME PARECIDO NO DIA: conferir nome da mãe</span>
          </span>
        )}
        {!props.compacto && (
          <span className="contadores">
            <Selo tipo={e.hardStopsAbertos ? 'perigo' : 'ok'}>{e.hardStopsAbertos === 1 ? '1 hard stop' : `${e.hardStopsAbertos} hard stops`}</Selo>
            <Selo tipo={e.pendencias ? 'atencao' : 'ok'}>{e.pendencias === 1 ? '1 pendência' : `${e.pendencias} pendências`}</Selo>
            <Selo tipo={e.alertasSemConduta ? 'perigo' : 'ok'}>{e.alertasSemConduta === 1 ? '1 alerta sem conduta' : `${e.alertasSemConduta} alertas sem conduta`}</Selo>
            <Selo tipo={e.etapaLente === 'quarentena' ? 'perigo' : 'neutro'}>Lente: {ROTULO_ETAPA_LENTE[e.etapaLente] ?? e.etapaLente}</Selo>
            {e.avisosSuspensos && <Selo tipo="perigo">Avisos suspensos: fale com a família</Selo>}
          </span>
        )}
        {props.compacto && (e.hardStopsAbertos > 0 || e.alertasSemConduta > 0) && (
          <span className="contadores">
            {e.hardStopsAbertos > 0 && <Selo tipo="perigo">{e.hardStopsAbertos === 1 ? '1 hard stop' : `${e.hardStopsAbertos} hard stops`}</Selo>}
            {e.alertasSemConduta > 0 && <Selo tipo="perigo">{e.alertasSemConduta === 1 ? '1 alerta sem conduta' : `${e.alertasSemConduta} alertas sem conduta`}</Selo>}
          </span>
        )}
      </div>
      <div className="acoes">
        <Link to={ROTAS.sala(e.episodioId)} className="botao" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} aria-label={`Sala: ${e.pacienteNome}`}>
          Sala
        </Link>
        <Link
          to={ROTAS.episodio(e.episodioId)}
          className="botao secundario"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
          aria-label={`Episódio: ${e.pacienteNome}`}
        >
          Episódio
        </Link>
      </div>
    </li>
  )
}
