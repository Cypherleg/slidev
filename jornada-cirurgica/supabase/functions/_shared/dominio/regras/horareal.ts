// Regra 5 (hora real): o domínio nunca recebe hora do cliente; a hora é a do servidor (ctx.agora).
// Marcação feita fora de hora fica com o horário real e é sinalizada (foraDeHora + motivo):
//  (a) resposta a item de um bloco já concluído (cp1/cp2: no ciclo atual da lente);
//  (b) item de bloco do D0 respondido depois que um bloco POSTERIOR do D0 foi concluído
//      (anestesia: por item, campo `foraDeHoraApos` do modelo);
//  (c) item (ou conclusão) de bloco do D0 registrado em data local diferente da data da cirurgia.

import type { ItemModelo, ModeloId } from '../tipos.ts'
import { concluido, MODELOS_D0, SEQUENCIA_D0 } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import { dataLocal, formatarData } from '../util/datas.ts'

const TITULO: Record<ModeloId, string> = {
  d7: 'D-7',
  cp1: 'checkpoint 1',
  cp2: 'checkpoint 2',
  d2: 'D-2',
  admissao: 'Admissão',
  sign_in: 'Sign In',
  anestesia: 'Anestesia',
  time_out: 'Time Out',
  sign_out: 'Sign Out',
  alta: 'Alta',
}

function motivoDataD0(est: EstadoInterno, agora: string): string | null {
  const hoje = dataLocal(agora)
  const data = est.agenda.dataCirurgia
  if (!data) return `Registrado em ${formatarData(hoje)}, sem data de cirurgia agendada.`
  if (hoje !== data) return `Registrado em ${formatarData(hoje)}; cirurgia em ${formatarData(data)}.`
  return null
}

export function motivosForaDeHoraResposta(est: EstadoInterno, modeloId: ModeloId, item: ItemModelo, agora: string): string[] {
  const r: string[] = []
  if (concluido(est, modeloId)) r.push(`Resposta registrada depois da conclusão do bloco ${TITULO[modeloId]}.`)
  if (MODELOS_D0.includes(modeloId)) {
    if (modeloId === 'anestesia') {
      const apos = item.foraDeHoraApos ?? 'alta'
      if (concluido(est, apos)) r.push(`Item da anestesia registrado depois da conclusão do bloco ${TITULO[apos]}.`)
    } else {
      const idx = SEQUENCIA_D0.indexOf(modeloId)
      const posterior = SEQUENCIA_D0.slice(idx + 1).find((m) => concluido(est, m))
      if (posterior) r.push(`Item registrado depois da conclusão do bloco posterior ${TITULO[posterior]}.`)
    }
    const d = motivoDataD0(est, agora)
    if (d) r.push(d)
  }
  return r
}

export function motivosForaDeHoraConclusao(est: EstadoInterno, modeloId: ModeloId, agora: string): string[] {
  if (!MODELOS_D0.includes(modeloId)) return []
  const d = motivoDataD0(est, agora)
  return d ? [d] : []
}

/** Leitura da LIO no Time Out (evento do D0). */
export function motivosForaDeHoraD0(est: EstadoInterno, agora: string): string[] {
  const d = motivoDataD0(est, agora)
  return d ? [d] : []
}
