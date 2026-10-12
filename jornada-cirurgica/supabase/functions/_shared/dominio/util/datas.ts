// Datas: UTC no dado, America/Sao_Paulo na tela (via Intl; sem tabela de fuso própria).
// Datas de calendário são 'aaaa-mm-dd' e nunca sofrem conversão de fuso.

export const FUSO = 'America/Sao_Paulo'

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

let formatador: Intl.DateTimeFormat | null = null
function partes(instante: Date): { ano: string; mes: string; dia: string; hora: string; minuto: string; segundo: string } {
  formatador ??= new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const parte of formatador.formatToParts(instante)) p[parte.type] = parte.value
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour === '24' ? '00' : p.hour, minuto: p.minute, segundo: p.second }
}

/** 'aaaa-mm-dd' válida (data real do calendário)? */
export function validarData(data: unknown): data is string {
  if (typeof data !== 'string') return false
  const m = RE_DATA.exec(data)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** 'hh:mm' (00:00 a 23:59)? */
export function validarHora(hora: unknown): hora is string {
  return typeof hora === 'string' && RE_HORA.test(hora)
}

/** Instante ISO válido? */
export function validarInstante(iso: unknown): iso is string {
  return typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) && !RE_DATA.test(iso)
}

/** Data local (America/Sao_Paulo) 'aaaa-mm-dd' de um instante ISO. Data de calendário volta igual. */
export function dataLocal(iso: string): string {
  if (RE_DATA.test(iso)) return iso
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const p = partes(new Date(t))
  return `${p.ano}-${p.mes}-${p.dia}`
}

/** Hora local 'hh:mm' de um instante ISO. */
export function horaLocal(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const p = partes(new Date(t))
  return `${p.hora}:${p.minuto}`
}

/** 'dd/mm/aaaa' (data de calendário sem conversão; instante em America/Sao_Paulo). */
export function formatarData(iso: string): string {
  const d = dataLocal(iso)
  const m = RE_DATA.exec(d)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** 'dd/mm/aaaa hh:mm' em America/Sao_Paulo. */
export function formatarDataHora(iso: string): string {
  if (RE_DATA.test(iso)) return formatarData(iso)
  const d = formatarData(iso)
  const h = horaLocal(iso)
  return h ? `${d} ${h}` : d
}

function deslocamentoMs(instanteMs: number): number {
  const p = partes(new Date(instanteMs))
  const comoUtc = Date.UTC(Number(p.ano), Number(p.mes) - 1, Number(p.dia), Number(p.hora), Number(p.minuto), Number(p.segundo))
  return comoUtc - Math.floor(instanteMs / 1000) * 1000
}

/** Instante UTC (ISO) de 'aaaa-mm-dd hh:mm:ss.mmm' no horário de São Paulo. */
export function instanteLocal(data: string, hora = '00:00', segundos = 0, ms = 0): string {
  const m = RE_DATA.exec(data)
  if (!m) throw new Error('data inválida')
  const [hh, mm] = hora.split(':').map(Number)
  const ingenuo = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, segundos, ms)
  let t = ingenuo - deslocamentoMs(ingenuo)
  // Segunda passada para transições de horário de verão (se voltarem a existir).
  t = ingenuo - deslocamentoMs(t)
  return new Date(t).toISOString()
}

export function inicioDoDiaLocal(data: string): string {
  return instanteLocal(data, '00:00', 0, 0)
}

export function fimDoDiaLocal(data: string): string {
  return instanteLocal(data, '23:59', 59, 999)
}

/** Soma dias a uma data de calendário. */
export function somarDias(data: string, dias: number): string {
  const m = RE_DATA.exec(data)
  if (!m) throw new Error('data inválida')
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias))
  return d.toISOString().slice(0, 10)
}

/** Dias de calendário de `a` até `b` (b − a). */
export function diasEntre(a: string, b: string): number {
  const ma = RE_DATA.exec(a)
  const mb = RE_DATA.exec(b)
  if (!ma || !mb) return Number.NaN
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]))
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]))
  return Math.round((tb - ta) / 86_400_000)
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(data: string): number {
  const m = RE_DATA.exec(data)
  if (!m) return Number.NaN
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
}

export function ehDiaUtil(data: string, feriados: readonly string[]): boolean {
  const s = diaDaSemana(data)
  return s !== 0 && s !== 6 && !feriados.includes(data)
}

/** Primeiro dia útil estritamente depois de `data`. */
export function proximoDiaUtil(data: string, feriados: readonly string[]): string {
  let d = somarDias(data, 1)
  for (let i = 0; i < 30 && !ehDiaUtil(d, feriados); i++) d = somarDias(d, 1)
  return d
}

/** Idade em anos completos numa data de referência (ambas 'aaaa-mm-dd'). */
export function idadeEm(nascimento: string, referencia: string): number | null {
  if (!validarData(nascimento) || !validarData(referencia)) return null
  const [an, mn, dn] = nascimento.split('-').map(Number)
  const [ar, mr, dr] = referencia.split('-').map(Number)
  let idade = ar - an
  if (mr < mn || (mr === mn && dr < dn)) idade--
  return idade
}

/** Compara instantes ISO. */
export function antes(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b)
}
