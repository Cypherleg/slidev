// Pré-visualização dos modelos de etiqueta (texto configurável; impressora ainda não definida).

/** Marcadores aceitos nos modelos de etiqueta, com dados FICTÍCIOS para a pré-visualização. */
export const MARCADORES_ETIQUETA: Record<string, string> = {
  NOME_COMPLETO: 'Paciente Teste Alfa da Silva',
  NASCIMENTO: '01/01/1950',
  PRONTUARIO: 'T-0000',
  OLHO_EXTENSO: 'OLHO DIREITO',
  CIRURGIA: 'Cirurgia de exemplo',
  DOTS: 'A I',
  ALERTAS_EXTENSO: 'OLHO ÚNICO',
  NOME_MAE: 'Mãe Teste da Silva',
}

export function previaEtiqueta(modelo: string): { texto: string; desconhecidos: string[] } {
  const desconhecidos = new Set<string>()
  const texto = modelo.replace(/\{([A-Z_]+)\}/g, (inteiro, nome: string) => {
    if (nome in MARCADORES_ETIQUETA) return MARCADORES_ETIQUETA[nome]
    desconhecidos.add(nome)
    return inteiro
  })
  return { texto, desconhecidos: [...desconhecidos] }
}
