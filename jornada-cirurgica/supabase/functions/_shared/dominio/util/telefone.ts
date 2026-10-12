// Telefones. Em listas, o número aparece sempre mascarado.

/** Dígitos do telefone, sem o código do país 55 quando presente. */
export function digitosTelefone(telefone: string): string {
  let d = (telefone ?? '').replace(/\D+/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d
}

/** Telefone brasileiro com DDD (10 ou 11 dígitos)? */
export function telefoneValido(telefone: string): boolean {
  const d = digitosTelefone(telefone)
  return d.length === 10 || d.length === 11
}

/** '(44) 9****-**62': DDD, primeiro dígito e os dois últimos. */
export function mascararTelefone(telefone: string): string {
  const d = digitosTelefone(telefone)
  if (d.length < 10) return '****'
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  const mascarado = numero[0] + '*'.repeat(numero.length - 3) + numero.slice(-2)
  const corte = mascarado.length - 4
  return `(${ddd}) ${mascarado.slice(0, corte)}-${mascarado.slice(corte)}`
}
