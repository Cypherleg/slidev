// TCLE retido (POP §1.F): "espera ficar sem óculos e LIO monofocal planejada → realinhar expectativa em consulta
// antes do TCLE". Enquanto o alerta não tiver conduta escrita do cirurgião, o link/mensagem do TCLE não sai.

import type { EstadoInterno } from '../estado/tipos.ts'
import { ALERTA_EXPECTATIVA, avaliarAlertasAtivos, condutaValida } from './alertas.ts'

export function tcleRetidoPorExpectativa(est: EstadoInterno): boolean {
  return avaliarAlertasAtivos(est).some((a) => a.id === ALERTA_EXPECTATIVA) && !condutaValida(est, ALERTA_EXPECTATIVA)
}
