// Formatação para exibição (America/Sao_Paulo na tela, UTC no banco).
// Espelha as funções de exibição do domínio (formatarDioptria, formatarData, formatarDataHora),
// mantidas aqui para a interface não depender de módulos do domínio ainda em construção.

const FUSO = 'America/Sao_Paulo'

const reData = /^(\d{4})-(\d{2})-(\d{2})$/
const reMes = /^(\d{4})-(\d{2})$/

/** '+21,50 D': sinal sempre explícito, vírgula decimal, duas casas. */
export function formatarDioptria(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  const sinal = valor < 0 ? '-' : '+'
  return `${sinal}${Math.abs(valor).toFixed(2).replace('.', ',')} D`
}

/** Eixo da tórica: '90°'. */
export function formatarEixo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return `${Math.round(valor)}°`
}

/** 'dd/mm/aaaa' para data de calendário ('aaaa-mm-dd'), 'mm/aaaa' para mês, ou instante ISO no fuso local. */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return '—'
  const d = reData.exec(valor)
  if (d) return `${d[3]}/${d[2]}/${d[1]}`
  const m = reMes.exec(valor)
  if (m) return `${m[2]}/${m[1]}`
  const t = Date.parse(valor)
  if (Number.isNaN(t)) return valor
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t))
}

/** 'dd/mm/aaaa hh:mm' no fuso local. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(t))
  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

/** 'hh:mm' no fuso local. */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(iso)) return iso.slice(0, 5)
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t))
}

/** Data de hoje no fuso local, 'aaaa-mm-dd'. */
export function hojeLocal(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** Soma dias a uma data de calendário 'aaaa-mm-dd'. */
export function somarDias(data: string, dias: number): string {
  const d = reData.exec(data)
  if (!d) return data
  const t = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + dias)
  return new Date(t).toISOString().slice(0, 10)
}

export function dataValida(data: string | undefined | null): data is string {
  if (!data) return false
  const d = reData.exec(data)
  if (!d) return false
  const t = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])))
  return t.getUTCFullYear() === Number(d[1]) && t.getUTCMonth() === Number(d[2]) - 1 && t.getUTCDate() === Number(d[3])
}

/** 'segunda-feira, 12/10/2026'. */
export function dataComDiaDaSemana(data: string): string {
  if (!dataValida(data)) return data
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${data}T12:00:00Z`))
  return `${dia}, ${formatarData(data)}`
}

/** Número com vírgula decimal (exibição). */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return String(valor).replace('.', ',')
}

/** Lê número digitado com vírgula ou ponto. Devolve null se inválido. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(limpo)) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** Somente dígitos. */
export function digitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

/** '000.000.000-00' enquanto digita. */
export function mascararCpfDigitado(texto: string): string {
  const d = digitos(texto).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Dígitos verificadores do CPF (só para avisar erro de digitação; o servidor valida de novo). */
export function cpfValido(texto: string): boolean {
  const d = digitos(texto)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10])
}
