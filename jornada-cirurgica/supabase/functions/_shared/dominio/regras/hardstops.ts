// Hard stops (POP §3 e §13.7; briefing §8 regras 1, 3, 4, 7 e 9).
// "Condição que interrompe o fluxo até resolução registrada. Não admite 'resolver depois'."
// Não existe "prosseguir assim mesmo". Cada hard stop tem uma parte por CONDIÇÃO (some quando o registro competente
// corrige a condição) e/ou uma parte com RESOLUÇÃO ESCRITA (ocorrência aberta por um gatilho; só sai com
// `hardstop.resolver` de quem tem competência).

import { ADM, ADM_LEGADO, ALTA, CP1, CP2, D2, SI, TO } from '../modelos/ids.ts'
import type { CodigoHardStop, HardStop, Papel, Transicao } from '../tipos.ts'
import { cicloAtual, ehNao, marcado, nomeMae, quarentenaAberta, rank, RANK, respostasDoModelo, terminal, valor } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import type { AlertaAtivo } from './alertas.ts'
import { ALERTA_OLHO_VERMELHO_D7, ALERTAS_HS6, condutaValida } from './alertas.ts'
import { calcularIdentificacao } from './identificacao.ts'

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

interface Resolucao {
  resolvivelPor: Papel[]
  comoResolver: string
}

export interface DefinicaoHardStop {
  codigo: CodigoHardStop
  titulo: string
  descricao: string
  bloqueia: Transicao[]
  fonte: string
  /** POP §13.9: todo hard stop acionado é registrado como quase-evento. Regras de ordem não são "acionadas". */
  registraQuaseEvento: boolean
  /** Bloqueia os avisos automáticos à família enquanto aberto (regras de ordem não bloqueiam). */
  suspendeAvisos: boolean
  /** Parte por condição: aberto enquanto vale. */
  condicao?: (est: EstadoInterno, cx: ContextoAvaliacao) => boolean
  porCondicao?: Resolucao
  /** Parte com resolução escrita: fontes ativas; uma fonte nova abre ocorrência que só fecha com `hardstop.resolver`. */
  gatilhos?: (est: EstadoInterno, cx: ContextoAvaliacao) => string[]
  porEscrito?: Resolucao
  // Resumo para o catálogo (união das partes).
  resolvivelPor: Papel[]
  exigeResolucaoEscrita: boolean
  comoResolver: string
}

type Def = Omit<DefinicaoHardStop, 'resolvivelPor' | 'exigeResolucaoEscrita' | 'comoResolver'>

function def(d: Def): DefinicaoHardStop {
  const partes = [d.porCondicao, d.porEscrito].filter(Boolean) as Resolucao[]
  return {
    ...d,
    resolvivelPor: [...new Set(partes.flatMap((p) => p.resolvivelPor))],
    exigeResolucaoEscrita: !!d.gatilhos,
    comoResolver: partes.map((p) => p.comoResolver).join(' '),
  }
}

const faseD0AteSignIn = (est: EstadoInterno) => rank(est) >= RANK.d2_concluido && rank(est) < RANK.sign_in_concluido
const tcleAssinado = (est: EstadoInterno) => est.tcle.status === 'assinado' || est.tcle.status === 'olho_conferido'
const identificacaoOk = (v: unknown) => v === 'sim' || v === 'acompanhante'

export const DEFINICOES_HARD_STOP: DefinicaoHardStop[] = [
  def({
    codigo: 'HS1_DIVERGENCIA_LIO',
    titulo: 'Divergência na LIO: quarentena',
    descricao: 'Divergência entre caixa, plano assinado e biometria original. LIO e ficha em quarentena identificada; caso não confirmado.',
    bloqueia: CONCLUIR_LENTE_ATE_TIME_OUT,
    fonte: 'POP §3 (hard stops) e §13.7 item 1',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est) => {
      const q = cicloAtual(est).quarentena
      return !!q?.aberta && (q.etapa === 'cp1' || q.etapa === 'cp2')
    },
    porCondicao: {
      resolvivelPor: ['cirurgiao'],
      comoResolver:
        'O cirurgião registra a resolução por escrito da quarentena (manter o plano ou novo plano). Ninguém "corrige" a ficha: a conferência é refeita no novo ciclo da lente.',
    },
  }),
  def({
    codigo: 'HS2_BIOMETRIA_AUSENTE',
    titulo: 'Biometria original ausente',
    descricao: 'Biometria original (impressão do ARGOS) ausente na conferência ou na sala. Não se confere contra cópia transcrita.',
    bloqueia: ['concluir:cp1', 'concluir:cp2', 'concluir:d2', 'concluir:sign_in', 'concluir:time_out'],
    fonte: 'POP §3 (hard stops) e §13.7 item 2',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est) => ehNao(est, 'cp1', CP1.biometria) || ehNao(est, 'cp2', CP2.biometria) || ehNao(est, 'sign_in', SI.salaBiometria),
    porCondicao: {
      resolvivelPor: ['concierge', 'conferente', 'circulante'],
      comoResolver: 'Reimprimir do aparelho e refazer a conferência contra a impressão original; depois responder "sim" no item da biometria.',
    },
  }),
  def({
    codigo: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
    titulo: 'Divergência de identidade ou de olho',
    descricao: 'Divergência de identidade ou de olho entre paciente, agenda, TCLE, pulseira ou marcação.',
    bloqueia: ['concluir:d2', 'concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    fonte: 'POP §13.7 item 3',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    gatilhos: (est) => {
      const f: string[] = []
      if (valor(est, 'd2', D2.tcle) === 'olho_divergente') f.push(`d2:${D2.tcle}`)
      if (ehNao(est, 'admissao', ADM.identificacao)) f.push(`admissao:${ADM.identificacao}`)
      if (ehNao(est, 'admissao', ADM.pulseira)) f.push(`admissao:${ADM.pulseira}`)
      if (ehNao(est, 'admissao', ADM.tcleOlho)) f.push(`admissao:${ADM.tcleOlho}`)
      if (ehNao(est, 'sign_in', SI.identificacao)) f.push(`sign_in:${SI.identificacao}`)
      if (ehNao(est, 'time_out', TO.paciente)) f.push(`time_out:${TO.paciente}`)
      if (ehNao(est, 'time_out', TO.marca)) f.push(`time_out:${TO.marca}`)
      return f
    },
    porEscrito: {
      resolvivelPor: ['cirurgiao'],
      comoResolver:
        'O cirurgião registra por escrito a resolução da divergência (hardstop.resolver). O item que divergiu precisa ser conferido de novo e respondido "sim" para o bloco concluir.',
    },
  }),
  def({
    codigo: 'HS4_SEM_ACOMPANHANTE',
    titulo: 'Paciente sem acompanhante',
    descricao: 'Paciente sem acompanhante adulto, lúcido e identificado: não recebe midriático, sedação nem bloqueio; o episódio não passa da admissão.',
    bloqueia: ['concluir:admissao', 'concluir:sign_in', 'concluir:time_out', 'concluir:alta', TRANSICAO_MIDRIATICO],
    fonte: 'POP §8 e §13.7 item 4; [P] CFM 1.886/2008 itens 3.1.d e 3.3; briefing §8 regra 9',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est) => ehNao(est, 'admissao', ADM.acompanhantePresente) || ehNao(est, 'alta', ALTA.acompanhante),
    porCondicao: {
      resolvivelPor: ['enfermagem'],
      comoResolver:
        'Com o acompanhante presente e identificado, responder "sim" no item. Se ninguém virá: suspender e reagendar (cirurgião ou gestora), acionar o contato de emergência.',
    },
  }),
  def({
    codigo: 'HS5_TCLE',
    titulo: 'TCLE ausente, de outro olho, ou dúvida não resolvida',
    descricao: 'TCLE ausente, de outro olho, ou paciente com dúvida não resolvida.',
    bloqueia: ['concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    fonte: 'POP §7, §9.A, §9.B e §13.7 item 5; briefing §8 regra 3',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    // Abre na admissão (D0): TCLE não assinado quando a admissão começa, ou "TCLE assinado" = não. Antes disso é pendência.
    condicao: (est) => {
      const naAdmissao = est.estado === 'd2_concluido' && Object.keys(respostasDoModelo(est, 'admissao')).length > 0
      const depois = rank(est) >= RANK.admitido && rank(est) < RANK.sign_in_concluido
      return ((naAdmissao || depois) && !tcleAssinado(est)) || ehNao(est, 'admissao', ADM.tcle) || ehNao(est, 'admissao', ADM_LEGADO.tcle)
    },
    porCondicao: {
      resolvivelPor: ['concierge', 'conferente', 'enfermagem', 'gestora'],
      comoResolver: 'TCLE assinado registrado (status "assinado" ou "olho conferido") e o item "TCLE assinado no prontuário" respondido "sim". Nunca no balcão, sob pressão.',
    },
    // Dúvida não resolvida na reconfirmação do consentimento (Sign In): resolução escrita do cirurgião.
    gatilhos: (est) => (ehNao(est, 'sign_in', SI.consentimento) ? [`sign_in:${SI.consentimento}`] : []),
    porEscrito: {
      resolvivelPor: ['cirurgiao'],
      comoResolver: 'Dúvida do paciente: o cirurgião esclarece e registra a resolução por escrito; o item do consentimento é respondido de novo.',
    },
  }),
  def({
    codigo: 'HS6_SEM_CONDUTA_ALFA_ANTICOAG',
    titulo: 'α-bloqueador ou anticoagulação sem conduta escrita',
    descricao: 'Alerta de α-bloqueador, anticoagulante ou antiagregante sem conduta escrita do cirurgião (conduta escrita antes da última mudança do registro não vale).',
    bloqueia: ['concluir:sign_in', `marcar:sign_in.${SI.condutaAlertas}`, TRANSICAO_MIDRIATICO],
    fonte: 'POP §13.7 item 6, §9.B e §2 (dot S: conduta escrita antes do D0); [P] AAO Ophthalmic Surgery Checklist',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est, cx) => faseD0AteSignIn(est) && cx.alertas.some((a) => ALERTAS_HS6.includes(a.id) && !condutaValida(est, a.id)),
    porCondicao: { resolvivelPor: ['cirurgiao'], comoResolver: 'O cirurgião escreve a conduta no próprio alerta (painel).' },
  }),
  def({
    codigo: 'HS7_OLHO_VERMELHO',
    titulo: 'Olho vermelho, secreção ou infecção de anexos',
    descricao: 'Olho vermelho, secreção ou infecção de anexos não avaliados pelo cirurgião.',
    bloqueia: ['concluir:d2', 'concluir:admissao', 'concluir:sign_in', 'concluir:time_out', TRANSICAO_MIDRIATICO],
    fonte: 'POP §13.7 item 7',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    gatilhos: (est, cx) => {
      const f: string[] = []
      if (valor(est, 'd2', D2.olhoVermelho) === 'sim') f.push(`d2:${D2.olhoVermelho}`)
      if (valor(est, 'admissao', ADM.olhoVermelho) === 'sim') f.push(`admissao:${ADM.olhoVermelho}`)
      if (
        rank(est) >= RANK.d2_concluido &&
        rank(est) < RANK.time_out_concluido &&
        cx.alertas.some((a) => a.id === ALERTA_OLHO_VERMELHO_D7) &&
        !condutaValida(est, ALERTA_OLHO_VERMELHO_D7)
      ) {
        f.push(ALERTA_OLHO_VERMELHO_D7)
      }
      return f
    },
    porEscrito: { resolvivelPor: ['cirurgiao'], comoResolver: 'O cirurgião avalia e registra a avaliação por escrito (hardstop.resolver).' },
  }),
  def({
    codigo: 'HS8_TROCA_LIO_D0',
    titulo: 'Troca de LIO no dia D',
    descricao: 'Troca de LIO decidida no dia D: novo plano escrito e assinado; checkpoints 1 e 2 refeitos por duas pessoas antes do Time Out. Ordem verbal não vale.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO],
    fonte: 'POP §3 (hard stops) e §13.7 item 8',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est) => {
      const c = cicloAtual(est)
      return c.origem === 'troca_d0' && !c.cp2 && rank(est) < RANK.time_out_concluido
    },
    porCondicao: {
      resolvivelPor: ['cirurgiao', 'concierge', 'conferente'],
      comoResolver: 'Registrar o novo plano (transcrito do plano escrito e assinado), a chegada e o checkpoint 1 (concierge) e o checkpoint 2 cego (segunda conferente).',
    },
  }),
  def({
    codigo: 'HS9_SITIO_NAO_MARCADO',
    titulo: 'Sítio não marcado: midriático bloqueado',
    descricao: 'O cirurgião marca a pele acima do supercílio do olho a operar, com o paciente acordado, antes do midriático.',
    bloqueia: [TRANSICAO_MIDRIATICO],
    fonte: 'POP §13.7 item 9, §0 e §14',
    registraQuaseEvento: false,
    suspendeAvisos: false,
    condicao: (est) => est.estado === 'admitido' && !marcado(est, 'sign_in', SI.marcacao) && !marcado(est, 'sign_in', SI.midriatico),
    porCondicao: { resolvivelPor: ['cirurgiao'], comoResolver: 'O cirurgião marca o sítio e registra no Sign In; só depois o midriático é instilado.' },
  }),
  def({
    codigo: 'HS_LIO_TIME_OUT',
    titulo: 'Divergência no Time Out',
    descricao: 'Divergência detectada no Time Out (leitura da LIO da caixa ou procedimento): a cirurgia não começa.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO, `marcar:time_out.${TO.readBack}`],
    fonte: 'POP §3 (hard stops: divergência detectada no Time Out), §9.C e briefing §6.3',
    registraQuaseEvento: true,
    suspendeAvisos: true,
    condicao: (est) => {
      const q = cicloAtual(est).quarentena
      return !!q?.aberta && q.etapa === 'time_out'
    },
    porCondicao: {
      resolvivelPor: ['cirurgiao'],
      comoResolver: 'LIO: o cirurgião registra a resolução por escrito da quarentena; a lente é conferida de novo (novo ciclo) antes de nova leitura no Time Out.',
    },
    gatilhos: (est) => (ehNao(est, 'time_out', TO.procedimento) ? [`time_out:${TO.procedimento}`] : []),
    porEscrito: {
      resolvivelPor: ['cirurgiao'],
      comoResolver: 'Procedimento: o cirurgião registra a resolução por escrito (hardstop.resolver) e o item é confirmado de novo.',
    },
  }),
  def({
    codigo: 'HS_HOMONIMO_NOME_MAE',
    titulo: 'Homônimo ou nome parecido: nome da mãe obrigatório',
    descricao: 'Homônimo ou nome parecido no mesmo dia cirúrgico: terceiro identificador (nome da mãe) em todas as conferências; cirurgias não consecutivas, se possível.',
    bloqueia: CONCLUIR_LENTE_ATE_TIME_OUT,
    fonte: 'POP §3 (hard stops: homônimo) e briefing §8 regra 1',
    registraQuaseEvento: false,
    suspendeAvisos: true,
    condicao: (est) => rank(est) >= 0 && rank(est) < RANK.time_out_concluido && calcularIdentificacao(est).exigeNomeMae && !nomeMae(est),
    porCondicao: {
      resolvivelPor: ['concierge', 'gestora'],
      comoResolver: 'Registrar o nome da mãe (cadastro do paciente ou item do D-7) e conferi-lo nas conferências seguintes. Se possível, cirurgias não consecutivas.',
    },
  }),
  def({
    codigo: 'HS_ORDEM_SIGN_IN',
    titulo: 'Sign In antes do midriático',
    descricao: 'Sign In antes de midriático, bloqueio ou sedação: identificação ativa e reconfirmação do consentimento primeiro.',
    bloqueia: [TRANSICAO_MIDRIATICO],
    fonte: 'briefing §8 regra 4; POP §9.B',
    registraQuaseEvento: false,
    suspendeAvisos: false,
    condicao: (est) =>
      est.estado === 'admitido' &&
      !marcado(est, 'sign_in', SI.midriatico) &&
      (!identificacaoOk(valor(est, 'sign_in', SI.identificacao)) || valor(est, 'sign_in', SI.consentimento) !== 'sim'),
    porCondicao: { resolvivelPor: ['enfermagem', 'circulante', 'cirurgiao'], comoResolver: 'Registrar a identificação ativa e a reconfirmação do consentimento ("sim") no Sign In.' },
  }),
  def({
    codigo: 'HS_LIO_SEM_DUPLA_CONFERENCIA',
    titulo: 'LIO sem dupla conferência',
    descricao: 'Time Out sem checkpoint 2 (conferência independente) concluído no ciclo atual da lente.',
    bloqueia: ['concluir:time_out', TRANSICAO_LEITURA_LIO],
    fonte: '[S] configurável (config.exigirCp2AntesDoTimeOut); POP §3 e §12 indicador 3',
    registraQuaseEvento: false,
    suspendeAvisos: true,
    condicao: (est) => {
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
    porCondicao: { resolvivelPor: ['conferente'], comoResolver: 'A segunda conferente faz o checkpoint 2 cego e conclui o bloco.' },
  }),
]

export const DEFINICAO_POR_CODIGO: Record<CodigoHardStop, DefinicaoHardStop> = Object.fromEntries(
  DEFINICOES_HARD_STOP.map((d) => [d.codigo, d]),
) as Record<CodigoHardStop, DefinicaoHardStop>

/** Atualiza ocorrências e trilha dos hard stops depois de um evento (chamado pela dobra). */
export function atualizarHardStops(est: EstadoInterno, em: string, cx: ContextoAvaliacao): void {
  for (const d of DEFINICOES_HARD_STOP) {
    let aberto = false
    if (!terminal(est)) {
      if (d.gatilhos) {
        const fontes = d.gatilhos(est, cx)
        const anteriores = est.gatilhosAnteriores[d.codigo] ?? []
        const novas = fontes.filter((f) => !anteriores.includes(f))
        if (novas.length) {
          const oc = est.ocorrencias[d.codigo]
          if (oc) oc.fontes = [...new Set([...oc.fontes, ...novas])]
          else est.ocorrencias[d.codigo] = { abertaEm: em, fontes: novas }
        }
        est.gatilhosAnteriores[d.codigo] = fontes
      }
      aberto = !!est.ocorrencias[d.codigo] || (!!d.condicao && d.condicao(est, cx))
    }
    const t = est.trilhaHardStops[d.codigo]
    if (aberto && !t?.aberto) est.trilhaHardStops[d.codigo] = { aberto: true, desde: em }
    else if (!aberto && t?.aberto) est.trilhaHardStops[d.codigo] = { aberto: false, desde: null }
  }
}

export function codigosAbertos(est: EstadoInterno): CodigoHardStop[] {
  return DEFINICOES_HARD_STOP.filter((d) => est.trilhaHardStops[d.codigo]?.aberto).map((d) => d.codigo)
}

/** Há ocorrência aberta da parte com resolução escrita? */
export function ocorrenciaEscritaAberta(est: EstadoInterno, codigo: CodigoHardStop): boolean {
  return !!est.ocorrencias[codigo]
}

/** Hard stop no formato da visão. Quando a parte escrita está aberta, a resolução exigida é a escrita. */
export function paraHardStop(d: DefinicaoHardStop, desde: string, est?: EstadoInterno): HardStop {
  const escrita = !!est && !!d.porEscrito && ocorrenciaEscritaAberta(est, d.codigo)
  const condicaoVale = !!est && !!d.condicao && d.condicao(est, { alertas: [] }) // só para o texto
  const r = escrita ? d.porEscrito! : (d.porCondicao ?? d.porEscrito!)
  const comoResolver = escrita && condicaoVale && d.porCondicao ? `${d.porEscrito!.comoResolver} ${d.porCondicao.comoResolver}` : r.comoResolver
  return {
    codigo: d.codigo,
    titulo: d.titulo,
    descricao: d.descricao,
    bloqueia: [...d.bloqueia],
    resolvivelPor: [...r.resolvivelPor],
    exigeResolucaoEscrita: est ? escrita : d.exigeResolucaoEscrita,
    comoResolver: est ? comoResolver : d.comoResolver,
    abertoDesde: desde,
    fonte: d.fonte,
  }
}

/** Hard stops abertos agora. */
export function hardStopsAbertos(est: EstadoInterno): HardStop[] {
  const r: HardStop[] = []
  for (const d of DEFINICOES_HARD_STOP) {
    const t = est.trilhaHardStops[d.codigo]
    if (t?.aberto) r.push(paraHardStop(d, t.desde ?? est.ultimoEventoEm, est))
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
