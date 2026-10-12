// Conferência de LIO (POP §3). Os VALORES da lente não são itens: vêm de lente.plano / lente.chegada /
// lente.cp2 (lente_registros, visibilidade restrita). Aqui ficam só as marcações de cada checkpoint.

import type { ModeloChecklist, Papel } from '../../tipos.ts'
import { CP1, CP2, VERSAO_MODELOS_V1 } from '../ids.ts'
import { FONTE_HOMONIMO, item, NOME_MAE_CONFERENCIA } from './comum.ts'

const A: Papel[] = ['concierge']
const B: Papel[] = ['conferente']
const BIOMETRIA = 'Biometria original (impressão do ARGOS) com plano assinado presente nesta conferência'
const FONTE_BIOMETRIA = 'POP §3 (hard stops: biometria original ausente) e §13.7 item 2'
const AJUDA_BIOMETRIA = 'Não se confere contra cópia transcrita. "Não" abre hard stop: reimprimir do aparelho e refazer a conferência.'
const AJUDA_DIVERGENCIA = '"Não" = divergência: a LIO e a ficha vão para quarentena identificada e o cirurgião é avisado. Ninguém "corrige" a ficha.'

export function modeloCp1(): ModeloChecklist {
  return {
    id: 'cp1',
    versao: VERSAO_MODELOS_V1,
    titulo: 'Checkpoint 1 — chegada da LIO',
    descricao:
      'Funcionária A (substituta definida). Toda conferência parte da impressão original da biometria (ARGOS) com o plano de LIO assinado pelo cirurgião; ficha transcrita não é fonte.',
    papeisConclusao: ['concierge'],
    fonte: 'POP §3 (checkpoint 1)',
    secoes: [
      {
        id: 'CP1',
        titulo: 'Checkpoint 1 — chegada da LIO',
        itens: [
          item(CP1.biometria, BIOMETRIA, 'sim_nao', A, FONTE_BIOMETRIA, { exigeSim: true, hardStop: 'HS2_BIOMETRIA_AUSENTE', ajuda: AJUDA_BIOMETRIA }),
          item(CP1.caixa, 'Caixa íntegra; validade posterior à data da cirurgia; lote anotado', 'sim_nao', A, 'POP §3 (checkpoint 1)', { exigeSim: true }),
          item(CP1.identidade, 'Caixa × plano assinado × biometria original: mesmo nome e data de nascimento', 'sim_nao', A, 'POP §3 (checkpoint 1)', {
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP1.olho, 'Mesmo olho', 'sim_nao', A, 'POP §3 (checkpoint 1)', { exigeSim: true, hardStop: 'HS1_DIVERGENCIA_LIO', ajuda: AJUDA_DIVERGENCIA }),
          item(CP1.modelo, 'Modelo idêntico ao do plano', 'sim_nao', A, 'POP §3 (checkpoint 1)', { exigeSim: true, hardStop: 'HS1_DIVERGENCIA_LIO', ajuda: AJUDA_DIVERGENCIA }),
          item(CP1.dioptria, 'Dioptria idêntica, com sinal e casa decimal', 'sim_nao', A, 'POP §3 (checkpoint 1)', {
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP1.torica, 'Tórica: cilindro e eixo conferidos contra o cálculo tórico impresso', 'sim_nao', A, 'POP §3 (checkpoint 1)', {
            obrigatorio: false,
            exigidoQuando: { contexto: 'lente_torica' },
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP1.etiqueta, 'Etiqueta na caixa com nome, data de nascimento e olho, sem cobrir modelo, dioptria ou validade', 'sim_nao', A, 'POP §3 (checkpoint 1)', {
            exigeSim: true,
          }),
          item(CP1.embalagem, 'Uma embalagem por paciente-olho; caixas de pacientes diferentes nunca no mesmo envelope', 'sim_nao', A, 'POP §3 (checkpoint 1)', {
            exigeSim: true,
          }),
          item(CP1.reserva, 'LIO reserva definida no plano e existente em estoque', 'sim_nao', A, 'POP §3 (checkpoint 1)', { exigeSim: true }),
          item(CP1.nomeMae, NOME_MAE_CONFERENCIA, 'confirmacao', A, FONTE_HOMONIMO, { obrigatorio: false, exigidoQuando: { contexto: 'homonimo_no_dia' } }),
          item(CP1.assinatura, 'Nome legível, data, assinatura (registrados na conclusão)', 'confirmacao', A, 'POP §3 (checkpoint 1)'),
        ],
      },
    ],
  }
}

export function modeloCp2(): ModeloChecklist {
  return {
    id: 'cp2',
    versao: VERSAO_MODELOS_V1,
    titulo: 'Checkpoint 2 — D-2, checagem independente',
    descricao:
      'Funcionária B (substituta definida). Independente significa: B não vê as marcações de A, começa pela biometria original e lê em voz alta. Olho, modelo, dioptria, cilindro e eixo são digitados de novo (conferência cega) e comparados pelo painel.',
    papeisConclusao: ['conferente'],
    fonte: 'POP §3 (checkpoint 2) e briefing §6.3',
    secoes: [
      {
        id: 'CP2',
        titulo: 'Checkpoint 2 — checagem independente',
        itens: [
          item(CP2.biometria, BIOMETRIA, 'sim_nao', B, FONTE_BIOMETRIA, { exigeSim: true, hardStop: 'HS2_BIOMETRIA_AUSENTE', ajuda: AJUDA_BIOMETRIA }),
          item(CP2.identidade, 'Identidade na biometria = plano = etiqueta da caixa (nome + data de nascimento)', 'sim_nao', B, 'POP §3 (checkpoint 2)', {
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP2.olho, 'Olho da biometria usada = olho do plano = olho da agenda = olho do TCLE', 'sim_nao', B, 'POP §3 (checkpoint 2)', {
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP2.colunaModelo, 'Dioptria do plano está na coluna do modelo que veio na caixa (fórmula e constante correspondentes)', 'sim_nao', B, 'POP §3 (checkpoint 2)', {
            exigeSim: true,
            hardStop: 'HS1_DIVERGENCIA_LIO',
            ajuda: AJUDA_DIVERGENCIA,
          }),
          item(CP2.validade, 'Validade e integridade', 'sim_nao', B, 'POP §3 (checkpoint 2)', { exigeSim: true }),
          item(CP2.reserva, 'LIO reserva presente', 'sim_nao', B, 'POP §3 (checkpoint 2)', { exigeSim: true }),
          item(CP2.plausibilidade, 'Sinais de plausibilidade definidos pelo cirurgião (B não interpreta; só sinaliza)', 'texto', B, 'POP §3 (checkpoint 2) [RASCUNHO]', {
            obrigatorio: false,
            ajuda: 'Exemplo usual do POP: diferença interocular de comprimento axial > 0,3 mm ou de K médio > 1 D pede reconfirmação.',
            pendente: 'Critérios de plausibilidade a definir pelo cirurgião (POP §3, [RASCUNHO]). Sem regra no painel: o texto é só registro.',
          }),
          item(CP2.nomeMae, NOME_MAE_CONFERENCIA, 'confirmacao', B, FONTE_HOMONIMO, { obrigatorio: false, exigidoQuando: { contexto: 'homonimo_no_dia' } }),
          item(CP2.assinatura, 'Nome legível, data, assinatura (registrados na conclusão)', 'confirmacao', B, 'POP §3 (checkpoint 2)'),
        ],
      },
    ],
  }
}
