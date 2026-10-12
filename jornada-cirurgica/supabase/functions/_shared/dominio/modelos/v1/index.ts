import type { ConfigJornada, ModeloChecklist, ModeloId } from '../../tipos.ts'
import { modeloAdmissao, modeloAlta, modeloAnestesia, modeloSignIn, modeloSignOut, modeloTimeOut } from './d0.ts'
import { modeloD2 } from './d2.ts'
import { modeloD7 } from './d7.ts'
import { modeloCp1, modeloCp2 } from './lente.ts'

/**
 * Modelos de checklist v1 (versão 'pop-0.4/1') transcritos do POP v0.4.
 * `config.itensAnestesiaExtras` entra no modelo de anestesia (com versão derivada dos extras).
 */
export function modelosPadrao(config?: Pick<ConfigJornada, 'itensAnestesiaExtras'> | null): Record<ModeloId, ModeloChecklist> {
  return {
    d7: modeloD7(),
    cp1: modeloCp1(),
    cp2: modeloCp2(),
    d2: modeloD2(),
    admissao: modeloAdmissao(),
    sign_in: modeloSignIn(),
    anestesia: modeloAnestesia(config),
    time_out: modeloTimeOut(),
    sign_out: modeloSignOut(),
    alta: modeloAlta(),
  }
}

/** Versões por modelo (para `episodio.versoesModelos`). */
export function versoesDosModelos(modelos: Record<ModeloId, ModeloChecklist>): Record<ModeloId, string> {
  const r = {} as Record<ModeloId, string>
  for (const id of Object.keys(modelos) as ModeloId[]) r[id] = modelos[id].versao
  return r
}
