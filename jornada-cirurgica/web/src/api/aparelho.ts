// Identificador do aparelho (tablet/computador), guardado no navegador.
// Vai em toda chamada para registrar "autor, horário e aparelho" (regra 6).

const CHAVE = 'jornada.aparelho.id'
let emMemoria: string | null = null

export function obterIdAparelho(): string {
  if (emMemoria) return emMemoria
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo) {
      emMemoria = salvo
      return salvo
    }
    const novo = crypto.randomUUID()
    localStorage.setItem(CHAVE, novo)
    emMemoria = novo
    return novo
  } catch {
    emMemoria = crypto.randomUUID()
    return emMemoria
  }
}
