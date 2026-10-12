// Utilitários de texto (nomes). Puros, sem dependências.

/** Sem acentos, maiúsculas, espaços simples. Apóstrofo some ("D'Ávila" → "DAVILA"); outros sinais viram espaço. */
export function normalizarNome(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/['’`´]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Jaro-Winkler (0..1). */
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  const la = a.length
  const lb = b.length
  if (la === 0 || lb === 0) return 0
  const janela = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1)
  const marcA = new Array<boolean>(la).fill(false)
  const marcB = new Array<boolean>(lb).fill(false)
  let coincidencias = 0
  for (let i = 0; i < la; i++) {
    const ini = Math.max(0, i - janela)
    const fim = Math.min(i + janela + 1, lb)
    for (let j = ini; j < fim; j++) {
      if (marcB[j] || a[i] !== b[j]) continue
      marcA[i] = true
      marcB[j] = true
      coincidencias++
      break
    }
  }
  if (coincidencias === 0) return 0
  let transposicoes = 0
  let k = 0
  for (let i = 0; i < la; i++) {
    if (!marcA[i]) continue
    while (!marcB[k]) k++
    if (a[i] !== b[k]) transposicoes++
    k++
  }
  const m = coincidencias
  const jaro = (m / la + m / lb + (m - transposicoes / 2) / m) / 3
  let prefixo = 0
  for (let i = 0; i < Math.min(4, la, lb); i++) {
    if (a[i] === b[i]) prefixo++
    else break
  }
  return jaro + prefixo * 0.1 * (1 - jaro)
}

/**
 * Similaridade de nomes 0..1 (Jaro-Winkler sobre o nome normalizado).
 * Usada SÓ para alertar homônimo/nome parecido no mesmo dia; nunca para unir pessoas.
 */
export function similaridadeNomes(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  return Math.round(jaroWinkler(na, nb) * 10000) / 10000
}

/** Primeiro nome para os avisos (conteúdo mínimo): "JOSÉ DA SILVA" → "José". */
export function primeiroNome(nomeCompleto: string): string {
  const primeiro = (nomeCompleto ?? '').trim().split(/\s+/)[0] ?? ''
  if (!primeiro) return ''
  const minusculo = primeiro.toLocaleLowerCase('pt-BR')
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1)
}

/** Texto não vazio após aparar espaços. */
export function temTexto(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
