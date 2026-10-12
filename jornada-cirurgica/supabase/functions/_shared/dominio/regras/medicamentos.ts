// Medicamentos da lista crítica (POP §1.B) com o registro mais recente: D-7, mudança informada no D-2 ou
// na admissão (POP §0 "em 7 dias a medicação muda; reconferir no D0"). As regras do D-7 (alertas, dots I/S/D,
// HS6, janela do GLP-1) usam o registro efetivo.

import { ADM, CLASSES_MEDICAMENTO, D2, medicamentoAdmissao, medicamentoD2 } from '../modelos/ids.ts'
import type { ClasseMedicamento } from '../modelos/ids.ts'
import type { ModeloId, ValorMedicamento } from '../tipos.ts'
import { resposta, valor, valorAplicavel } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'

export interface MedicamentoEfetivo {
  valor: ValorMedicamento
  fonte: { modelo: ModeloId; itemId: string }
  ordem: number
  registradoEm: string
}

function ehMedicamento(v: unknown): v is ValorMedicamento {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'uso' in (v as object)
}

export function classeDoItemD7(itemId: string): ClasseMedicamento | null {
  return CLASSES_MEDICAMENTO.find((c) => c.itemD7 === itemId)?.classe ?? null
}

/** Registro efetivo da classe: o mais recente entre D-7, D-2 (se a classe foi marcada como mudada) e admissão. */
export function medicamentoEfetivo(est: EstadoInterno, classe: ClasseMedicamento): MedicamentoEfetivo | null {
  const c = CLASSES_MEDICAMENTO.find((x) => x.classe === classe)
  if (!c) return null
  const candidatos: MedicamentoEfetivo[] = []
  const add = (modelo: ModeloId, itemId: string) => {
    const r = resposta(est, modelo, itemId)
    if (!r || !ehMedicamento(r.valor)) return
    if (modelo !== 'd7' && valorAplicavel(est, modelo, itemId) === undefined) return
    candidatos.push({ valor: r.valor, fonte: { modelo, itemId }, ordem: r.ordem, registradoEm: r.registradoEm })
  }
  add('d7', c.itemD7)
  add('d2', medicamentoD2(classe))
  add('admissao', medicamentoAdmissao(classe))
  if (!candidatos.length) return null
  return candidatos.reduce((a, b) => (b.ordem > a.ordem ? b : a))
}

/**
 * GLP-1/tirzepatida efetivo, com a reconferência do D0 (POP §9.A: "inclusive a data da última dose"):
 * se a admissão registrou "usa" com a data da última dose, essa data recalcula a janela.
 */
export function glp1Efetivo(est: EstadoInterno): MedicamentoEfetivo | null {
  const base = medicamentoEfetivo(est, 'glp1')
  const usa = resposta(est, 'admissao', ADM.usaGlp1)
  const data = resposta(est, 'admissao', ADM.glp1UltimaDose)
  if (usa?.valor === 'sim' && data && typeof data.valor === 'string' && (!base || data.ordem > base.ordem)) {
    const anterior = base?.valor ?? { uso: 'usa' as const }
    return {
      valor: { ...anterior, uso: 'usa', ultimaAplicacao: data.valor },
      fonte: { modelo: 'admissao', itemId: ADM.glp1UltimaDose },
      ordem: data.ordem,
      registradoEm: data.registradoEm,
    }
  }
  if (usa?.valor === 'sim' && !base) return { valor: { uso: 'usa' }, fonte: { modelo: 'admissao', itemId: ADM.usaGlp1 }, ordem: usa.ordem, registradoEm: usa.registradoEm }
  return base
}

/** Classes marcadas como mudadas (D-2 ou admissão), com a observação registrada. */
export function mudancasInformadas(est: EstadoInterno, modelo: 'd2' | 'admissao'): { classes: string[]; observacao: string | null } {
  const idMudou = modelo === 'd2' ? D2.mudancaMedicacao : ADM.mudouRemedio
  const idClasses = modelo === 'd2' ? D2.mudancaClasses : ADM.mudouClasses
  if (valor(est, modelo, idMudou) !== 'sim') return { classes: [], observacao: null }
  const r = resposta(est, modelo, idClasses)
  return { classes: Array.isArray(r?.valor) ? (r!.valor as string[]) : [], observacao: r?.observacao ?? null }
}
