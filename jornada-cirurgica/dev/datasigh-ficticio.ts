// Datasigh FICTÍCIO do servidor local. O formato de resposta abaixo é inventado para a
// demonstração e é traduzido pelo mapa de campos (DATASIGH_MAPA_CAMPOS) — NÃO representa a API
// real, cuja documentação ainda não chegou. Só dados fictícios.

export function cpfFicticio(n: number): string {
  const base = `900${String(n).padStart(6, '0')}`
  const d = base.split('').map(Number)
  const dv = (arr: number[]) => {
    const soma = arr.reduce((s, x, i) => s + x * (arr.length + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(d)
  return `${base}${d1}${dv([...d, d1])}`
}

export interface RegistroFicticio {
  id: string
  nome?: string
  nascimento?: string // dd/mm/aaaa (formato fictício)
  prontuario?: string
  celulares?: string[]
}

/** CPFs de teste (prefixo 900, dígitos válidos) → cadastro fictício. */
export const CADASTROS_FICTICIOS: Record<string, RegistroFicticio> = {
  [cpfFicticio(101)]: { id: 'DS-FIC-101', nome: 'Paciente Teste Golf Pereira', nascimento: '12/04/1948', prontuario: 'FIC-101', celulares: ['(00) 90000-0101'] },
  [cpfFicticio(102)]: { id: 'DS-FIC-102', nome: 'Paciente Teste Hotel Ramos', nascimento: '03/11/1952' },
  [cpfFicticio(104)]: { id: 'DS-FIC-104', nome: 'Paciente Teste India Campos', nascimento: '21/07/1944', prontuario: 'FIC-104', celulares: ['(00) 90000-0104', '(00) 3000-0104'] },
}

/** Este CPF simula Datasigh fora do ar (demora mais que o timeout). */
export const CPF_DATASIGH_LENTO = cpfFicticio(103)

export const MAPA_CAMPOS_FICTICIO = JSON.stringify({
  lista: 'pacientes',
  datasighId: 'id',
  nomeCompleto: 'nome',
  dataNascimento: 'nascimento',
  prontuario: 'prontuario',
  telefones: 'celulares',
})

export async function responderDatasighFicticio(url: URL): Promise<{ status: number; corpo: unknown }> {
  if (!/\/pacientes\/?$/.test(url.pathname)) return { status: 404, corpo: {} }
  const cpf = (url.searchParams.get('cpf') ?? '').replace(/\D/g, '')
  if (cpf === CPF_DATASIGH_LENTO) await new Promise(r => setTimeout(r, 12_000))
  const r = CADASTROS_FICTICIOS[cpf]
  return { status: 200, corpo: { pacientes: r ? [r] : [] } }
}
