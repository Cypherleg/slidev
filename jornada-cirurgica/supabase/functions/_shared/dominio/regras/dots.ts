// Dots da pulseira (POP §2): cor E letra, no máximo 6, calculados dos registros.
// A fonte de verdade é o prontuário; ausência de dot não significa ausência de risco.

import { ADM, D7, ITENS_ALERGIA } from '../modelos/ids.ts'
import type { Dot, LetraDot, ValorAlergia } from '../tipos.ts'
import { ehSim, itemDoModelo, valor, valorAplicavel } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import { medicamento, usaOuUsou } from './alertas.ts'
import { ehOlhoUnico } from './identificacao.ts'

export const LEGENDA_DOTS: Record<LetraDot, Pick<Dot, 'letra' | 'cor' | 'rotulo'>> = {
  A: { letra: 'A', cor: 'vermelho', rotulo: 'Alergia' },
  Q: { letra: 'Q', cor: 'amarelo', rotulo: 'Risco de queda' },
  M: { letra: 'M', cor: 'rosa', rotulo: 'Membro restrito' },
  I: { letra: 'I', cor: 'azul', rotulo: 'IFIS' },
  S: { letra: 'S', cor: 'laranja', rotulo: 'Sangramento' },
  D: { letra: 'D', cor: 'verde', rotulo: 'Diabetes em insulina ou sulfonilureia' },
}

/** Teto de 6 alertas (POP §2 regra 8). A legenda tem exatamente 6 letras. */
export const TETO_DOTS = 6

function alergiaRegistrada(v: unknown): v is ValorAlergia {
  return !!v && typeof v === 'object' && (v as ValorAlergia).tem === true
}

function textoItem(est: EstadoInterno, itemId: string): string {
  const t = itemDoModelo(est, 'd7', itemId)?.texto ?? itemId
  return t.replace(/^Alergia a /, '').replace(/ \(descrever a reação\)$/, '')
}

export function calcularDots(est: EstadoInterno): Dot[] {
  const dots: Dot[] = []
  const add = (letra: LetraDot, motivo: string) => dots.push({ ...LEGENDA_DOTS[letra], motivo })

  // A — Alergia: qualquer alergia registrada.
  const alergias = ITENS_ALERGIA.filter((id) => alergiaRegistrada(valor(est, 'd7', id))).map((id) => textoItem(est, id))
  const nova = valorAplicavel(est, 'admissao', ADM.alergiaNova)
  const partesA: string[] = []
  if (alergias.length) partesA.push(`Alergia registrada: ${alergias.join(', ')}.`)
  if (typeof nova === 'string' && nova.trim()) partesA.push(`Alergia nova na admissão: ${nova.trim()}.`)
  if (partesA.length) add('A', partesA.join(' '))

  // Q — Risco de queda (POP §2): cadeira de rodas, marcha instável, baixa visão no olho contralateral; olho único (§11).
  // Ambliopia sozinha não basta. Gatilho "sedação" do POP: pendente (se todo paciente recebe sedação, Q seria universal).
  const motivosQ: string[] = []
  const mob = valor(est, 'd7', D7.mobilidade)
  if (Array.isArray(mob)) {
    if (mob.includes('cadeira_rodas')) motivosQ.push('cadeira de rodas')
    if (mob.includes('marcha_instavel')) motivosQ.push('marcha instável / risco de queda')
  }
  if (ehSim(est, 'd7', D7.baixaVisaoContralateral)) motivosQ.push('baixa visão no olho contralateral')
  if (ehOlhoUnico(est)) motivosQ.push('olho único (POP §11)')
  if (motivosQ.length) add('Q', `Risco de queda: ${motivosQ.join('; ')}.`)

  // M — Membro restrito: fístula, mastectomia ou esvaziamento axilar.
  const motivosM: string[] = []
  const fistula = valor(est, 'd7', D7.fistulaBraco)
  if (fistula === 'direito' || fistula === 'esquerdo') motivosM.push(`fístula no braço ${fistula}`)
  if (ehSim(est, 'd7', D7.mastectomia)) {
    const lado = valor(est, 'd7', D7.mastectomiaLado)
    motivosM.push(`mastectomia ou esvaziamento axilar${typeof lado === 'string' ? ` (${lado === 'ambos' ? 'ambos os lados' : `lado ${lado}`})` : ''}`)
  }
  if (motivosM.length) add('M', `Membro restrito: ${motivosM.join('; ')}. Não puncionar nem aferir PA naquele braço.`)

  // I — IFIS: α1-bloqueador atual ou passado.
  const alfa = medicamento(est, D7.alfaBloqueador)
  if (usaOuUsou(alfa)) add('I', `α1-bloqueador (${alfa!.uso === 'usa' ? 'uso atual' : 'uso passado'}).`)

  // S — Sangramento: anticoagulante ou antiagregante.
  const motivosS: string[] = []
  const antic = medicamento(est, D7.anticoagulante)
  if (usaOuUsou(antic)) motivosS.push(`anticoagulante (${antic!.uso === 'usa' ? 'uso atual' : 'uso passado'})`)
  const antiag = medicamento(est, D7.antiagregante)
  if (usaOuUsou(antiag)) motivosS.push(`antiagregante (${antiag!.uso === 'usa' ? 'uso atual' : 'uso passado'})`)
  if (motivosS.length) add('S', `Sangramento: ${motivosS.join('; ')}.`)

  // D — Diabetes em insulina ou sulfonilureia.
  const ins = medicamento(est, D7.insulina)
  if (ins && ins.uso === 'usa' && ins.insulinaOuSulfonilureia === true) add('D', 'Insulina ou sulfonilureia em uso.')

  return dots.slice(0, TETO_DOTS)
}

export function textoDot(d: Dot): string {
  return `${d.letra} — ${d.rotulo} (${d.cor})`
}
