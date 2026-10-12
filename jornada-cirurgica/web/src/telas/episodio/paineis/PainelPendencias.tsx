// O que falta neste episódio: de quem depende e desde quando (briefing §6.6).
import type { Pendencia } from '@dominio/tipos.ts'
import { Selo } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { rotuloPapeis, ROTULO_SEVERIDADE } from '../../../componentes/rotulos.ts'

/** Converte `Pendencia.local` ('d7.B', 'lente.cp2', 'alertas', ...) em aba + âncora. */
export function destinoPendencia(local: string | undefined): { aba: 'd7' | 'lente' | 'd2' | 'd0' | 'historico'; ancora?: string } | null {
  if (!local) return null
  const [base, resto] = local.split('.')
  switch (base) {
    case 'd7':
      return { aba: 'd7', ancora: resto ? `ck-d7-secao-${resto}` : 'checklist-d7' }
    case 'alertas':
      return { aba: 'd7', ancora: 'alertas' }
    case 'contatos':
      return { aba: 'd7', ancora: 'contatos' }
    case 'materiais':
    case 'quiz':
      return { aba: 'd7', ancora: 'materiais' }
    case 'teach_back':
    case 'orientacoes':
      return { aba: 'd7', ancora: 'teach-back' }
    case 'tcle':
      return { aba: 'd2', ancora: 'tcle' }
    case 'lente':
    case 'cp1':
    case 'cp2':
      return { aba: 'lente' }
    case 'd2':
    case 'etiquetas':
      return { aba: 'd2' }
    case 'admissao':
    case 'sign_in':
    case 'anestesia':
    case 'time_out':
    case 'sign_out':
    case 'alta':
    case 'd0':
      return { aba: 'd0' }
    default:
      return null
  }
}

export function PainelPendencias(props: { pendencias: Pendencia[]; aoIr: (destino: { aba: 'd7' | 'lente' | 'd2' | 'd0' | 'historico'; ancora?: string }) => void }) {
  const ordem = { hard_stop: 0, alerta: 1, pendencia: 2 } as const
  const lista = [...props.pendencias].sort((a, b) => ordem[a.severidade] - ordem[b.severidade] || a.desde.localeCompare(b.desde))
  if (lista.length === 0) return <p className="suave">Nada pendente neste episódio.</p>
  return (
    <details className="cartao" open={lista.some(p => p.severidade !== 'pendencia')}>
      <summary style={{ fontWeight: 800, cursor: 'pointer', minHeight: 32 }}>O que falta neste episódio ({lista.length})</summary>
      <ul className="lista-simples" style={{ marginTop: 8 }}>
        {lista.map(p => {
          const destino = destinoPendencia(p.local)
          return (
            <li key={p.id}>
              <Selo tipo={p.severidade === 'hard_stop' ? 'perigo' : p.severidade === 'alerta' ? 'atencao' : 'neutro'}>{ROTULO_SEVERIDADE[p.severidade]}</Selo> {p.descricao}{' '}
              <span className="suave">
                · depende de {rotuloPapeis(p.responsavel)} · desde {formatarDataHora(p.desde)}
                {p.prazo ? ` · prazo ${formatarDataHora(p.prazo)}` : ''}
              </span>{' '}
              {destino && (
                <button type="button" className="botao secundario pequeno" onClick={() => props.aoIr(destino)}>
                  Ir para
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
