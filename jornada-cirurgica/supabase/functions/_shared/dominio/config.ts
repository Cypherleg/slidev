// Configuração padrão. Nenhum tempo de espera nem número clínico fixado aqui (briefing §7).

import type { ConfigJornada } from './tipos.ts'

/**
 * Modelos de etiqueta derivados do POP (marcadores entre chaves).
 * - Peito (POP §2 regra 5): "nome, olho, cirurgia".
 * - Pulseira (POP §9.A, §2, §0): nome, nascimento, prontuário, olho por extenso, dots com letra, alertas por extenso.
 * - Caixa da LIO (POP §3, checkpoint 1): nome, data de nascimento e olho, sem cobrir modelo, dioptria ou validade.
 * - Alertas por extenso (POP §2): "OLHO ÚNICO", "HOMÔNIMO NO DIA", "DÉFICIT COGNITIVO — REPRESENTANTE: nome".
 * Uma linha cujo(s) marcador(es) ficam vazios é omitida (ex.: sem dots, sem alertas).
 */
export const MODELOS_ETIQUETA_PADRAO: ConfigJornada['modelosEtiqueta'] = {
  peito: '{NOME_COMPLETO}\n{OLHO_EXTENSO}\n{CIRURGIA}',
  pulseira: '{NOME_COMPLETO}\nNasc.: {NASCIMENTO}\nPront.: {PRONTUARIO}\n{OLHO_EXTENSO}\n{DOTS}\n{ALERTAS_EXTENSO}',
  caixa_lente: '{NOME_COMPLETO}\nNasc.: {NASCIMENTO}\n{OLHO_EXTENSO}',
  alertas: '{ALERTAS_EXTENSO}',
}

/**
 * Limiar técnico de similaridade (Jaro-Winkler sobre o nome normalizado) para "nome parecido".
 * Não vem do POP: parâmetro técnico a validar com a gestora usando a agenda real (ver notas do agente).
 */
export const LIMIAR_NOME_PARECIDO_PADRAO = 0.9

export function configPadrao(): ConfigJornada {
  return {
    temposEtapa: {},
    modelosEtiqueta: { ...MODELOS_ETIQUETA_PADRAO },
    limiarNomeParecido: LIMIAR_NOME_PARECIDO_PADRAO,
    // [S] interpretação a confirmar: Time Out exige checkpoint 2 concluído no ciclo atual da lente.
    exigirCp2AntesDoTimeOut: true,
    itensAnestesiaExtras: [],
    feriados: [],
    assinaturaConcierge: null,
    // Telefones exibidos ao paciente: configurados pela gestora (não versionar números no código).
    telefones: { hospital: null, whatsappConcierge: null, enfermagemForaHorario: null },
  }
}
