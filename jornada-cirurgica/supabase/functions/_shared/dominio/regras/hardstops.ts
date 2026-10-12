// Hard stops (POP §3 e §13.7; briefing §8 regras 1, 3, 4, 7 e 9).
// "Condição que interrompe o fluxo até resolução registrada. Não admite 'resolver depois'."
// Não existe "prosseguir assim mesmo": cada hard stop some quando a condição é corrigida pelo registro
// competente, ou (resolução escrita) quando quem tem competência registra a resolução por escrito.

import { ADM, ALTA, D2, SI, TO } from '../modelos/ids.ts'
import type { CodigoHardStop, HardStop, Papel, Transicao } from '../tipos.ts'
import {
  cicloAtual,
  ehNao,
  marcado,
  quarentenaAberta,
  rank,
  RANK,
  terminal,
  valor,
} from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import type { AlertaAtivo } from './alertas.ts'
import { ALERTA_OLHO_VERMELHO_D7, ALERTAS_HS6 } from './alertas.ts'
import { calcularIdentificacao } from './identificacao.ts'
import { nomeMae } from '../estado/consultas.ts'
import { CP1, CP2 } from '../modelos/ids.ts'

/** Pseudo-item: leitura da LIO da caixa no Time Out (comando lente.time_out). */
export const TRANSICAO_LEITURA_LIO: Transicao = 'marcar:time_out.leitura_lio'
export const TRANSICAO_MIDRIATICO: Transicao = `marcar:sign_in.${SI.midriatico}`

const CONCLUIR_LENTE_ATE_TIME_OUT: Transicao[] = [
  'concluir:cp1',
  'concluir:cp2',
  'concluir:d2',
  'concluir:admissao',
  'concluir:sign_in',
  'concluir:time_out',
]

export interface ContextoAvaliacao {
  alertas: AlertaAtivo[]
}

interface DefinicaoHardStop {
  codigo: CodigoHardStop
  titulo: string
  descricao: string
  bloqueia: Transicao[]
  resolvivelPor: Papel[]
  /** true: só sai com `hardstop.resolver` (texto do papel competente). */
  exigeResolucaoEscrita: boolean
  comoResolver: string
  fonte: string
  /** POP §13.9: todo hard stop acionado é registrado como quase-evento. Regras de ordem não são "acionadas". */
  registraQuaseEvento: boolean
  /** Bloqueia os avisos automáticos à família enquanto aberto (regras de ordem não bloqueiam). */
  suspendeAvisos: boolean
  /** Condição (exigeResolucaoEscrita=false) ou gatilhos ativos (exigeResolucaoEscrita=true: lista de fontes). */
  avaliar(est: EstadoInterno, cx: ContextoAvaliacao): boolean | string[]
}

const faseD0AteSignIn = (est: EstadoInterno) => rank(est) >= RANK.d2_concluido && rank(est) < RANK.sign_in_concluido

export const DEFINICOES_HARD_STOP: DefinicaoHardStop[] = [
  {
    codigo: 'HS1_DIVERGENCIA_LIO',
    titulo: 'Divergência na LIO: quarentena',
    descricao: 'Divergência entre caixa, plano assinado e biometria original. LIO e ficha em quarentena identificada; caso não confirmado.',
    bloqueia: CONCLUIR_LENTE_ATE_TIME_OUT,
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver:
      'O cirurgião registra a resolução por escrito da quarentena (manter o plano ou novo plano). Ninguém "corrige" a ficha: a conferência é refeita no novo ciclo da lente.',
    fonte: 'POP §3 (hard stops) e §13.7 item 1',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => {
      const q = cicloAtual(est).quarentena
      return !!q?.aberta && (q.etapa === 'cp1' || q.etapa === 'cp2')
    },
  },
  {
    codigo: 'HS2_BIOMETRIA_AUSENTE',
    titulo: 'Biometria original ausente',
    descricao: 'Biometria original (impressão do ARGOS) ausente na conferência ou na sala. Não se confere contra cópia transcrita.',
    bloqueia: ['concluir:cp1', 'concluir:cp2', 'concluir:d2', 'concluir:sign_in', 'concluir:time_out'],
    resolvivelPor: ['concierge', 'conferente', 'circulante'],
    exigeResolucaoEscrita: false,
    comoResolver: 'Reimprimir do aparelho e refazer a conferência contra a impressão original; depois responder "sim" no item da biometria.',
    fonte: 'POP §3 (hard stops) e §13.7 item 2',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => ehNao(est, 'cp1', CP1.biometria) || ehNao(est, 'cp2', CP2.biometria) || ehNao(est, 'sign_in', SI.salaBiometria),
  },
  {
    codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
    titulo: 'Divergência de identidade ou de olho',
    descricao: 'Divergência de identidade ou de olho entre paciente, agenda, TCLE, pulseira ou marcação.',
    bloqueia: ['concluir:d2', 'concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: true,
    comoResolver:
      'O cirurgião registra por escrito a resolução da divergência (hardstop.resolver). O item que divergiu precisa ser conferido de novo e respondido "sim" para o bloco concluir.',
    fonte: 'POP §13.7 item 3',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => {
      const f: string[] = []
      if (valor(est, 'd2', D2.tcle) === 'olho_divergente') f.push(`d2:${D2.tcle}`)
      if (ehNao(est, 'admissao', ADM.identificacao)) f.push(`admissao:${ADM.identificacao}`)
      if (ehNao(est, 'admissao', ADM.pulseira)) f.push(`admissao:${ADM.pulseira}`)
      if (ehNao(est, 'sign_in', SI.identificacao)) f.push(`sign_in:${SI.identificacao}`)
      if (ehNao(est, 'time_out', TO.paciente)) f.push(`time_out:${TO.paciente}`)
      if (ehNao(est, 'time_out', TO.marca)) f.push(`time_out:${TO.marca}`)
      return f
    },
  },
  {
    codigo: 'HS4_SEM_ACOMPANHANTE',
    titulo: 'Paciente sem acompanhante',
    descricao: 'Paciente sem acompanhante adulto, lúcido e identificado: não recebe midriático, sedação nem bloqueio; o episódio não passa da admissão.',
    bloqueia: ['concluir:admissao', 'concluir:sign_in', 'concluir:time_out', 'concluir:alta', TRANSICAO_MIDRIATICO],
    resolvivelPor: ['enfermagem'],
    exigeResolucaoEscrita: false,
    comoResolver:
      'Com o acompanhante presente e identificado, responder "sim" no item. Se ninguém virá: suspender e reagendar (cirurgião ou gestora), acionar o contato de emergência.',
    fonte: 'POP §8 e §13.7 item 4; [P] CFM 1.886/2008 itens 3.1.d e 3.3; briefing §8 regra 9',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => ehNao(est, 'admissao', ADM.acompanhantePresente) || ehNao(est, 'alta', ALTA.acompanhante),
  },
  {
    codigo: 'HS5_TCLE',
    titulo: 'TCLE ausente, de outro olho, ou dúvida não resolvida',
    descricao: 'TCLE ausente, de outro olho, ou paciente com dúvida não resolvida.',
    bloqueia: ['concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    resolvivelPor: ['concierge', 'conferente', 'enfermagem', 'gestora', 'cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver:
      'TCLE assinado registrado (status "assinado" ou "olho conferido") e o item do TCLE na admissão respondido "sim". Dúvida do paciente: o cirurgião esclarece e o item do consentimento é respondido de novo. Nunca no balcão, sob pressão.',
    fonte: 'POP §7 e §13.7 item 5',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) =>
      (faseD0AteSignIn(est) && est.tcle.status !== 'assinado' && est.tcle.status !== 'olho_conferido') ||
      ehNao(est, 'admissao', ADM.tcle) ||
      ehNao(est, 'sign_in', SI.consentimento),
  },
  {
    codigo: 'HS6_SEM_CONDUTA_ALFA_ANTICOAG',
    titulo: 'α-bloqueador ou anticoagulação sem conduta escrita',
    descricao: 'Alerta de α-bloqueador, anticoagulante ou antiagregante sem conduta escrita do cirurgião.',
    bloqueia: ['concluir:sign_in', `marcar:sign_in.${SI.condutaAlertas}`],
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver: 'O cirurgião escreve a conduta no próprio alerta (painel).',
    fonte: 'POP §13.7 item 6 e §9.B; [P] AAO Ophthalmic Surgery Checklist',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est, cx) => faseD0AteSignIn(est) && cx.alertas.some((a) => ALERTAS_HS6.includes(a.id) && !est.condutas[a.id]),
  },
  {
    codigo: 'HS7_OLHO_VERMELHO',
    titulo: 'Olho vermelho, secreção ou infecção de anexos',
    descricao: 'Olho vermelho, secreção ou infecção de anexos não avaliados pelo cirurgião.',
    bloqueia: ['concluir:d2', 'concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: true,
    comoResolver: 'O cirurgião avalia e registra a avaliação por escrito (hardstop.resolver).',
    fonte: 'POP §13.7 item 7',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est, cx) => {
      const f: string[] = []
      if (valor(est, 'd2', D2.olhoVermelho) === 'sim') f.push(`d2:${D2.olhoVermelho}`)
      if (valor(est, 'admissao', ADM.olhoVermelho) === 'sim') f.push(`admissao:${ADM.olhoVermelho}`)
      if (
        rank(est) >= RANK.d2_concluido &&
        rank(est) < RANK.time_out_concluido &&
        cx.alertas.some((a) => a.id === ALERTA_OLHO_VERMELHO_D7) &&
        !est.condutas[ALERTA_OLHO_VERMELHO_D7]
      ) {
        f.push(ALERTA_OLHO_VERMELHO_D7)
      }
      return f
    },
  },
  {
    codigo: 'HS8_TROCA_LIO_D0',
    titulo: 'Troca de LIO no dia D',
    descricao: 'Troca de LIO decidida no dia D: novo plano escrito e assinado; checkpoints 1 e 2 refeitos por duas pessoas antes do Time Out. Ordem verbal não vale.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO],
    resolvivelPor: ['cirurgiao', 'concierge', 'conferente'],
    exigeResolucaoEscrita: false,
    comoResolver: 'Registrar o novo plano (transcrito do plano escrito e assinado), a chegada e o checkpoint 1 (concierge) e o checkpoint 2 cego (segunda conferente).',
    fonte: 'POP §3 (hard stops) e §13.7 item 8',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => {
      const c = cicloAtual(est)
      return c.origem === 'troca_d0' && !c.cp2 && rank(est) < RANK.time_out_concluido
    },
  },
  {
    codigo: 'HS9_SITIO_NAO_MARCADO',
    titulo: 'Sítio não marcado: midriático bloqueado',
    descricao: 'O cirurgião marca a pele acima do supercílio do olho a operar, com o paciente acordado, antes do midriático.',
    bloqueia: [TRANSICAO_MIDRIATICO],
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver: 'O cirurgião marca o sítio e registra no Sign In; só depois o midriático é instilado.',
    fonte: 'POP §13.7 item 9, §0 e §14',
    registraQuaseEvento: false,
    suspendeAvisos: false,
    avaliar: (est) => est.estado === 'admitido' && !marcado(est, 'sign_in', SI.marcacao) && !marcado(est, 'sign_in', SI.midriatico),
  },
  {
    codigo: 'HS_LIO_TIME_OUT',
    titulo: 'Divergência da LIO no Time Out',
    descricao: 'A leitura da caixa no Time Out diverge do plano ou do checkpoint 2: a cirurgia não começa.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO, `marcar:time_out.${TO.readBack}`],
    resolvivelPor: ['cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver: 'O cirurgião registra a resolução por escrito da quarentena; a lente é conferida de novo (novo ciclo) antes de nova leitura no Time Out.',
    fonte: 'POP §3 (hard stops) e briefing §6.3',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    avaliar: (est) => {
      const q = cicloAtual(est).quarentena
      return !!q?.aberta && q.etapa === 'time_out'
    },
  },
  {
    codigo: 'HS_HOMONIMO_NOME_MAE',
    titulo: 'Homônimo ou nome parecido: nome da mãe obrigatório',
    descricao: 'Homônimo ou nome parecido no mesmo dia cirúrgico: terceiro identificador (nome da mãe) em todas as conferências.',
    bloqueia: CONCLUIR_LENTE_ATE_TIME_OUT,
    resolvivelPor: ['concierge', 'gestora'],
    exigeResolucaoEscrita: false,
    comoResolver: 'Registrar o nome da mãe (cadastro do paciente ou item do D-7) e conferi-lo nas conferências seguintes. Se possível, cirurgias não consecutivas.',
    fonte: 'POP §3 (hard stops: homônimo) e briefing §8 regra 1',
    registraQuaseEvento: false,
    suspendeAvisos: true,
    avaliar: (est) => rank(est) >= 0 && rank(est) < RANK.time_out_concluido && calcularIdentificacao(est).exigeNomeMae && !nomeMae(est),
  },
  {
    codigo: 'HS_ORDEM_SIGN_IN',
    titulo: 'Sign In antes do midriático',
    descricao: 'Sign In antes de midriático, bloqueio ou sedação: identificação ativa e reconfirmação do consentimento primeiro.',
    bloqueia: [TRANSICAO_MIDRIATICO],
    resolvivelPor: ['enfermagem', 'circulante', 'cirurgiao'],
    exigeResolucaoEscrita: false,
    comoResolver: 'Registrar a identificação ativa e a reconfirmação do consentimento ("sim") no Sign In.',
    fonte: 'briefing §8 regra 4; POP §9.B',
    registraQuaseEvento: false,
    suspendeAvisos: false,
    avaliar: (est) =>
      est.estado === 'admitido' &&
      !marcado(est, 'sign_in', SI.midriatico) &&
      (valor(est, 'sign_in', SI.identificacao) !== 'sim' || valor(est, 'sign_in', SI.consentimento) !== 'sim'),
  },
  {
    codigo: 'HS_LIO_SEM_DUPLA_CONFERENCIA',
    titulo: 'LIO sem dupla conferência',
    descricao: 'Time Out sem checkpoint 2 (conferência independente) concluído no ciclo atual da lente.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO],
    resolvivelPor: ['conferente'],
    exigeResolucaoEscrita: false,
    comoResolver: 'A segunda conferente faz o checkpoint 2 cego e conclui o bloco.',
    fonte: '[S] configurável (config.exigirCp2AntesDoTimeOut); POP §3 e §12 indicador 3',
    registraQuaseEvento: false,
    suspendeAvisos: true,
    avaliar: (est) => {
      const c = cicloAtual(est)
      return (
        est.entrada.config.exigirCp2AntesDoTimeOut === true &&
        rank(est) >= RANK.admitido &&
        rank(est) < RANK.time_out_concluido &&
        !c.cp2 &&
        c.origem !== 'troca_d0' &&
        !quarentenaAberta(est)
      )
    },
  },
]

export const DEFINICAO_POR_CODIGO: Record<CodigoHardStop, DefinicaoHardStop> = Object.fromEntries(
  DEFINICOES_HARD_STOP.map((d) => [d.codigo, d]),
) as Record<CodigoHardStop, DefinicaoHardStop>

/** Atualiza ocorrências e trilha dos hard stops depois de um evento (chamado pela dobra). */
export function atualizarHardStops(est: EstadoInterno, em: string, cx: ContextoAvaliacao): void {
  for (const def of DEFINICOES_HARD_STOP) {
    let aberto: boolean
    if (terminal(est)) {
      aberto = false
    } else if (def.exigeResolucaoEscrita) {
      const fontes = def.avaliar(est, cx) as string[]
      const anteriores = est.gatilhosAnteriores[def.codigo] ?? []
      const novas = fontes.filter((f) => !anteriores.includes(f))
      if (novas.length) {
        const oc = est.ocorrencias[def.codigo]
        if (oc) oc.fontes = [...new Set([...oc.fontes, ...novas])]
        else est.ocorrencias[def.codigo] = { abertaEm: em, fontes: novas }
      }
      est.gatilhosAnteriores[def.codigo] = fontes
      aberto = !!est.ocorrencias[def.codigo]
    } else {
      aberto = def.avaliar(est, cx) === true
    }
    const t = est.trilhaHardStops[def.codigo]
    if (aberto && !t?.aberto) est.trilhaHardStops[def.codigo] = { aberto: true, desde: est.ocorrencias[def.codigo]?.abertaEm ?? em }
    else if (!aberto && t?.aberto) est.trilhaHardStops[def.codigo] = { aberto: false, desde: null }
  }
}

export function codigosAbertos(est: EstadoInterno): CodigoHardStop[] {
  return DEFINICOES_HARD_STOP.filter((d) => est.trilhaHardStops[d.codigo]?.aberto).map((d) => d.codigo)
}

export function paraHardStop(def: DefinicaoHardStop, desde: string): HardStop {
  return {
    codigo: def.codigo,
    titulo: def.titulo,
    descricao: def.descricao,
    bloqueia: [...def.bloqueia],
    resolvivelPor: [...def.resolvivelPor],
    exigeResolucaoEscrita: def.exigeResolucaoEscrita,
    comoResolver: def.comoResolver,
    abertoDesde: desde,
    fonte: def.fonte,
  }
}

/** Hard stops abertos agora. */
export function hardStopsAbertos(est: EstadoInterno): HardStop[] {
  const r: HardStop[] = []
  for (const def of DEFINICOES_HARD_STOP) {
    const t = est.trilhaHardStops[def.codigo]
    if (t?.aberto) r.push(paraHardStop(def, t.desde ?? est.ultimoEventoEm))
  }
  return r
}

/** Hard stops abertos que bloqueiam a transição. */
export function bloqueiosPara(est: EstadoInterno, transicao: Transicao): HardStop[] {
  return hardStopsAbertos(est).filter((h) => h.bloqueia.includes(transicao))
}

/** Hard stops abertos que suspendem os avisos à família. */
export function hardStopsQueSuspendemAvisos(est: EstadoInterno): CodigoHardStop[] {
  return codigosAbertos(est).filter((c) => DEFINICAO_POR_CODIGO[c].suspendeAvisos)
}
