// CPF: só para a consulta. O banco guarda apenas o HMAC (feito na API, com segredo do servidor).

/** Só os dígitos. */
export function normalizarCpf(cpf: string): string {
  return (cpf ?? '').replace(/\D+/g, '')
}

/** 11 dígitos, não repetidos, dígitos verificadores corretos. */
export function validarCpf(cpf: string): boolean {
  const d = normalizarCpf(cpf)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  const n = d.split('').map(Number)
  const dv = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += n[i] * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === n[9] && dv(10) === n[10]
}
