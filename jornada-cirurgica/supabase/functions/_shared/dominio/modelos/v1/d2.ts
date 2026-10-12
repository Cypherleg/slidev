// Confirmações do D-2 (POP §13 procedimento 5; §8 prevenção; briefing §6.4).

import type { ModeloChecklist, Papel } from '../../tipos.ts'
import { D2, VERSAO_MODELOS_V1 } from '../ids.ts'
import { item } from './comum.ts'

const P: Papel[] = ['conferente', 'concierge']

export function modeloD2(): ModeloChecklist {
  return {
    id: 'd2',
    versao: VERSAO_MODELOS_V1,
    titulo: 'D-2 — Confirmações e TCLE',
    descricao:
      'Ligação de confirmação (no POP, da concierge; o painel registra quem ligou), TCLE assinado do olho certo e observações. Concluir exige D-7 concluído e checkpoint 2 da lente sem divergência.',
    papeisConclusao: ['conferente', 'concierge'],
    fonte: 'POP §13 (procedimento 5), §8 (prevenção) e briefing §6.4',
    secoes: [
      {
        id: 'LIG',
        titulo: 'Ligação de confirmação',
        itens: [
          item(D2.presenca, 'Presença confirmada', 'sim_nao', P, 'POP §13 (procedimento 5)'),
          item(D2.acompanhanteConfirmado, '"Quem vem com o senhor?" Acompanhante adulto confirmado', 'sim_nao', P, 'POP §8 (prevenção) e §13 (procedimento 5)', {
            ajuda: 'Sem acompanhante adulto, lúcido e identificado a cirurgia não é realizada (POP §8).',
          }),
          item(D2.acompanhante, 'Nome do acompanhante conferido (titular ou reserva do D-7)', 'pessoa', P, 'POP §8 (prevenção)', {
            obrigatorio: false,
            exigidoQuando: { itemId: D2.acompanhanteConfirmado, valores: ['sim'] },
            camposPessoa: ['nome'],
          }),
          item(D2.colirios, 'Uso dos colírios pré-operatórios conforme o cartão', 'sim_nao', P, 'POP §13 (procedimento 5) e §4', {
            obrigatorio: false,
            pendente: 'O esquema AL-01 ainda não define colírio pré-operatório ("[informar se há colírio antes da cirurgia]", POP §4 e §14).',
          }),
          item(D2.olhoVermelho, 'Olho vermelho, secreção ou infecção de anexos?', 'sim_nao', P, 'POP §13 (procedimento 5) e §13.7 item 7', {
            hardStop: 'HS7_OLHO_VERMELHO',
            ajuda: '"Sim" abre hard stop: avaliação do cirurgião, registrada por escrito.',
          }),
          item(D2.mudancaMedicacao, 'Mudança de medicação desde o D-7?', 'sim_nao', P, 'POP §13 (procedimento 5)', {
            alerta: { descricao: 'Sim → ALERTA ao cirurgião', nivel: 'alerta' },
          }),
          item(D2.quemLigou, 'Quem ligou (nome)', 'texto', P, 'briefing §6.4'),
        ],
      },
      {
        id: 'TCLE',
        titulo: 'TCLE',
        itens: [
          item(D2.tcle, 'TCLE assinado, do olho certo', 'opcao', P, 'briefing §6.4; POP §7 e §13.7 item 5', {
            opcoes: [
              { valor: 'sim', rotulo: 'Sim: assinado e do olho certo' },
              { valor: 'nao_assinado', rotulo: 'Não assinado ainda' },
              { valor: 'olho_divergente', rotulo: 'Assinado, mas o olho do TCLE diverge da agenda' },
            ],
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
            ajuda: 'Olho divergente abre hard stop de identidade/olho (resolução escrita do cirurgião). Um TCLE por olho e por cirurgia.',
          }),
        ],
      },
      {
        id: 'OBS',
        titulo: 'Observações',
        itens: [item(D2.observacoes, 'Observações', 'texto', P, 'briefing §6.4', { obrigatorio: false })],
      },
    ],
  }
}
