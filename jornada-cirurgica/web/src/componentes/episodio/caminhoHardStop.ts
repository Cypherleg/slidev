// Onde cada hard stop se resolve na interface (aba e âncora do episódio). Só navegação; a regra é do servidor.
import type { CodigoHardStop } from '@dominio/tipos.ts'

export type AbaEpisodio = 'd7' | 'lente' | 'd2' | 'd0' | 'historico'

export const CAMINHO_HARD_STOP: Partial<Record<CodigoHardStop, { aba: AbaEpisodio; ancora?: string; rotulo: string }>> = {
  HS1_DIVERGENCIA_LIO: { aba: 'lente', rotulo: 'Abrir a quarentena da lente' },
  HS_LIO_TIME_OUT: { aba: 'lente', rotulo: 'Abrir a quarentena da lente' },
  HS8_TROCA_LIO_D0: { aba: 'lente', ancora: 'plano', rotulo: 'Abrir o novo plano e as conferências' },
  HS_LIO_SEM_DUPLA_CONFERENCIA: { aba: 'lente', ancora: 'checkpoint-2', rotulo: 'Abrir o checkpoint 2' },
  HS_HOMONIMO_NOME_MAE: { aba: 'd7', ancora: 'ck-d7-secao-A', rotulo: 'Registrar o nome da mãe (D-7, seção A)' },
  HS6_SEM_CONDUTA_ALFA_ANTICOAG: { aba: 'd7', ancora: 'alertas', rotulo: 'Abrir os alertas (conduta escrita)' },
  HS5_TCLE: { aba: 'd2', ancora: 'tcle', rotulo: 'Abrir o TCLE' },
}
