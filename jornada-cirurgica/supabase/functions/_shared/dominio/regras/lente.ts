// Lente: comparação normalizada e validação dos dados digitados (sem interpretar biometria).

import type { LeituraTimeOut } from '../contrato.ts'
import { ErroDominio } from '../contrato.ts'
import type { CampoLente, DadosChegadaLente, DadosPlanoLente, ValoresLente } from '../tipos.ts'
import { validarData } from '../util/datas.ts'

/** '+21,50 D' (sinal sempre explícito, vírgula decimal, duas casas). */
export function formatarDioptria(valor: number): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return ''
  const v = Math.round(valor * 100) / 100
  const sinal = v < 0 ? '-' : '+'
  return `${sinal}${Math.abs(v).toFixed(2).replace('.', ',')} D`
}

/** Modelo normalizado: maiúsculas, sem acentos, sem espaços. */
export function normalizarModelo(modelo: unknown): string {
  if (typeof modelo !== 'string') return ''
  return modelo.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '')
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? n : Number.NaN
  }
  return Number.NaN
}

function mesmoNumero(a: unknown, b: unknown): boolean {
  const na = numero(a)
  const nb = numero(b)
  if (na === null && nb === null) return true
  if (na === null || nb === null) return false
  if (Number.isNaN(na) || Number.isNaN(nb)) return false
  return Math.abs(na - nb) < 1e-9
}

/**
 * Comparação normalizada de lente (sinal, casa decimal, maiúsculas, espaços).
 * - modelo: maiúsculas e sem espaços;
 * - dioptria, cilindro, eixo: numérico (`null` = `null`; número × `null` diverge);
 * - cilindro e eixo: só contam se algum lado for tórico ou tiver valor (os dois nulos = iguais).
 */
export function compararLente(
  a: Partial<ValoresLente>,
  b: Partial<ValoresLente>,
  campos: CampoLente[],
): { confere: boolean; camposDivergentes: CampoLente[] } {
  const divergentes: CampoLente[] = []
  for (const campo of campos) {
    let igual: boolean
    switch (campo) {
      case 'olho':
        igual = !!a.olho && a.olho === b.olho
        break
      case 'modelo': {
        const ma = normalizarModelo(a.modelo)
        igual = ma.length > 0 && ma === normalizarModelo(b.modelo)
        break
      }
      case 'dioptria': {
        const na = numero(a.dioptria)
        igual = na !== null && mesmoNumero(a.dioptria, b.dioptria)
        break
      }
      case 'cilindro':
      case 'eixo':
        igual = mesmoNumero(a[campo], b[campo])
        break
    }
    if (!igual) divergentes.push(campo)
  }
  return { confere: divergentes.length === 0, camposDivergentes: divergentes }
}

export const CAMPOS_LENTE: CampoLente[] = ['olho', 'modelo', 'dioptria', 'cilindro', 'eixo']

// ---------------------------------------------------------------------------
// Validação (dado digitado). Não há faixa clínica de dioptria: o POP não define (não inventar).
// ---------------------------------------------------------------------------

function erro(msg: string, campo: string): never {
  throw new ErroDominio('VALIDACAO', msg, { campo })
}

function validarModelo(m: unknown, campo = 'modelo'): string {
  if (typeof m !== 'string' || !m.trim()) erro('Modelo da LIO obrigatório.', campo)
  if (m.length > 120) erro('Modelo da LIO muito longo.', campo)
  return m.trim()
}

function validarNumero(n: unknown, campo: string, msg: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) erro(msg, campo)
  return n
}

function validarEixo(e: unknown, campo = 'eixo'): number {
  if (typeof e !== 'number' || !Number.isInteger(e) || e < 0 || e > 180) erro('Eixo: número inteiro de 0 a 180.', campo)
  return e
}

/** Valida e normaliza (cilindro/eixo nulos quando não tórica). */
export function validarValoresLente(v: ValoresLente, prefixo = ''): ValoresLente {
  if (!v || typeof v !== 'object') erro('Valores da lente ausentes.', prefixo + 'valores')
  if (v.olho !== 'OD' && v.olho !== 'OE') erro('Olho: OD ou OE.', prefixo + 'olho')
  const modelo = validarModelo(v.modelo, prefixo + 'modelo')
  const dioptria = validarNumero(v.dioptria, prefixo + 'dioptria', 'Dioptria: número com sinal.')
  if (typeof v.torica !== 'boolean') erro('Informe se a LIO é tórica.', prefixo + 'torica')
  let cilindro: number | null = null
  let eixo: number | null = null
  if (v.torica) {
    cilindro = validarNumero(v.cilindro, prefixo + 'cilindro', 'Tórica: cilindro obrigatório.')
    eixo = validarEixo(v.eixo, prefixo + 'eixo')
  } else if ((v.cilindro !== null && v.cilindro !== undefined) || (v.eixo !== null && v.eixo !== undefined)) {
    erro('LIO não tórica: cilindro e eixo ficam em branco.', prefixo + 'cilindro')
  }
  return { olho: v.olho, modelo, dioptria, torica: v.torica, cilindro, eixo }
}

export function validarPlano(d: DadosPlanoLente): DadosPlanoLente {
  const base = validarValoresLente(d)
  let reserva: DadosPlanoLente['reserva'] = null
  if (d.reserva !== null && d.reserva !== undefined) {
    reserva = {
      modelo: validarModelo(d.reserva.modelo, 'reserva.modelo'),
      dioptria: validarNumero(d.reserva.dioptria, 'reserva.dioptria', 'Reserva: dioptria com sinal.'),
    }
  }
  let alvoRefrativo: number | null = null
  if (d.alvoRefrativo !== null && d.alvoRefrativo !== undefined) {
    alvoRefrativo = validarNumero(d.alvoRefrativo, 'alvoRefrativo', 'Alvo refrativo: número com sinal.')
  }
  let dataPedido: string | null = null
  if (d.dataPedido !== null && d.dataPedido !== undefined && d.dataPedido !== '') {
    if (!validarData(d.dataPedido)) erro('Data do pedido inválida (aaaa-mm-dd).', 'dataPedido')
    dataPedido = d.dataPedido
  }
  return { ...base, reserva, alvoRefrativo, dataPedido }
}

const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/

export function validarChegada(d: DadosChegadaLente): DadosChegadaLente {
  if (!d || typeof d !== 'object') erro('Dados da chegada ausentes.', 'chegada')
  if (!validarData(d.dataChegada)) erro('Data de chegada inválida (aaaa-mm-dd).', 'dataChegada')
  if (typeof d.lote !== 'string' || !d.lote.trim()) erro('Lote obrigatório.', 'lote')
  if (typeof d.validade !== 'string' || !(validarData(d.validade) || RE_MES.test(d.validade))) {
    erro('Validade: aaaa-mm-dd ou aaaa-mm.', 'validade')
  }
  return { dataChegada: d.dataChegada, lote: d.lote.trim(), validade: d.validade }
}

export function validarLeitura(l: LeituraTimeOut): LeituraTimeOut {
  if (!l || typeof l !== 'object') erro('Leitura da caixa ausente.', 'leitura')
  const modelo = validarModelo(l.modelo)
  const dioptria = validarNumero(l.dioptria, 'dioptria', 'Dioptria: número com sinal.')
  const cilindro = l.cilindro === null || l.cilindro === undefined ? null : validarNumero(l.cilindro, 'cilindro', 'Cilindro: número.')
  const eixo = l.eixo === null || l.eixo === undefined ? null : validarEixo(l.eixo)
  if ((cilindro === null) !== (eixo === null)) erro('Tórica: informe cilindro e eixo juntos.', 'cilindro')
  return { modelo, dioptria, cilindro, eixo }
}

/**
 * Validade da LIO posterior à data da cirurgia (POP §3, checkpoint 1)?
 * 'aaaa-mm' é lido de forma conservadora como o PRIMEIRO dia do mês ([S] interpretação a confirmar).
 * Sem data de cirurgia: null (não dá para conferir).
 */
export function validadePosterior(validade: string, dataCirurgia: string | null): boolean | null {
  if (!dataCirurgia) return null
  const v = RE_MES.test(validade) ? `${validade}-01` : validade
  if (!validarData(v)) return null
  return v > dataCirurgia
}
