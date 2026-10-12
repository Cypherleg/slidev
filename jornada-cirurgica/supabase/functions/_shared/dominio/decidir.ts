// Decisão de comandos: valida permissão (papel × comando × item), ordem, hard stops e conferência cega
// contra o estado COMPLETO e devolve o que gravar (eventos, registros de lente, mensagens).
// O domínio nunca recebe hora do cliente: a hora é ctx.agora (servidor). Lança ErroDominio.

import type {
  Ator,
  CategoriaQuaseEvento,
  CausaCancelamento,
  Comando,
  ContextoDecisao,
  Estado,
  LeituraTimeOut,
  MaterialCatalogo,
  NovaMensagem,
  NovoRegistroLente,
  ResultadoDecisao,
  TipoEtiqueta,
} from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import { ADM, D2, D7, ITENS_ALERGIA, SI, SO, TO } from './modelos/ids.ts'
import type {
  CampoLente,
  CodigoHardStop,
  Contato,
  Evento,
  ItemModelo,
  ModeloId,
  NovoEvento,
  Papel,
  StatusTcle,
  TipoContato,
  ValorAlergia,
  ValoresLente,
  ValorMedicamento,
  ValorPessoa,
  ValorResposta,
  ViaComunicacao,
  Visibilidade,
} from './tipos.ts'
import { montarEstado, interno } from './estado/montar.ts'
import {
  cicloAtual,
  concluido,
  cp1Conclusao,
  cp1Herdado,
  dadosCp2,
  dadosPlano,
  ehModeloLente,
  itemDoModelo,
  marcado,
  planoRef,
  quarentenaAberta,
  rank,
  RANK,
  terminal,
  valor,
} from './estado/consultas.ts'
import type { EstadoInterno } from './estado/tipos.ts'
import {
  ALERTAS_HS6,
  alertasDoEstado,
  alertasSemComunicacao,
  avaliarAlertasAtivos,
  condutaValida,
  ehAlertaQuarentena,
  ITENS_CRITICOS_D7,
} from './regras/alertas.ts'
import { impedimentosConclusao, motivoIndisponivel } from './regras/blocos.ts'
import {
  bloqueiosPara,
  codigosAbertos,
  DEFINICAO_POR_CODIGO,
  hardStopsAbertos,
  ocorrenciaEscritaAberta,
  TRANSICAO_LEITURA_LIO,
} from './regras/hardstops.ts'
import { tcleRetidoPorExpectativa } from './regras/tcle.ts'
import { motivosForaDeHoraConclusao, motivosForaDeHoraD0, motivosForaDeHoraResposta } from './regras/horareal.ts'
import { CAMPOS_LENTE, compararLente, validarChegada, validarLeitura, validarPlano, validarValoresLente } from './regras/lente.ts'
import { avisoAtraso, avisosAutomaticos, mensagemEnvioTcle } from './mensagens.ts'
import { PAPEIS_POR_MODELO, papeisPermitidosParaEvento, papelUsado } from './permissoes.ts'
import { dataLocal, validarData, validarHora, validarInstante } from './util/datas.ts'
import { temTexto } from './util/texto.ts'
import { telefoneValido } from './util/telefone.ts'
import { PAPEIS } from './tipos.ts'

// ---------------------------------------------------------------------------
// Erros e permissões
// ---------------------------------------------------------------------------

const erro = (codigo: ErroDominio['codigo'], msg: string, detalhes?: Record<string, unknown>): never => {
  throw new ErroDominio(codigo, msg, detalhes)
}

function exigirPapel(ator: Ator, permitidos: readonly Papel[], acao: string): Papel {
  const p = papelUsado(ator.papeis, permitidos)
  if (!p) erro('SEM_PERMISSAO', `Papel sem permissão para ${acao}.`, { acao, papeisPermitidos: [...permitidos] })
  return p as Papel
}

function exigirNaoTerminal(est: EstadoInterno) {
  if (terminal(est)) erro('ESTADO', est.estado === 'suspenso' ? 'Episódio suspenso.' : 'Episódio cancelado.')
}

function exigirTexto(v: unknown, campo: string, rotulo: string, max = 4000): string {
  if (!temTexto(v)) erro('VALIDACAO', `${rotulo} obrigatório.`, { campo })
  const t = (v as string).trim()
  if (t.length > max) erro('VALIDACAO', `${rotulo} muito longo.`, { campo })
  return t
}

function erroHardStop(transicao: string, hs: { codigo: CodigoHardStop; titulo: string }[]): never {
  return erro('HARD_STOP', `Hard stop aberto: ${hs.map((h) => h.titulo).join('; ')}.`, { transicao, hardStops: hs.map((h) => h.codigo) })
}

function verificarHardStops(est: EstadoInterno, transicao: Parameters<typeof bloqueiosPara>[1]) {
  const hs = bloqueiosPara(est, transicao)
  if (hs.length) erroHardStop(transicao, hs)
}

/** Conferência cega: quem registrou ou viu a conferência 1 não faz a conferência 2. */
function verificarConferenciaCega(est: EstadoInterno, ator: Ator, viu?: boolean) {
  if (viu) erro('CONFERENCIA_CEGA', 'Conferência cega: quem consultou o checkpoint 1 deste episódio não faz o checkpoint 2.')
  // Conservador: qualquer ciclo do episódio (quem viu valores de um ciclo não confere outro).
  if (est.ciclos.some((c) => c.autoresConferencia1.includes(ator.id))) {
    erro('CONFERENCIA_CEGA', 'Conferência cega: quem registrou o plano, a chegada ou o checkpoint 1 não faz o checkpoint 2.')
  }
}

// ---------------------------------------------------------------------------
// Pré-checagens (papel + estado, sem conteúdo). Usadas por decidir e pelo mapa de permissões.
// ---------------------------------------------------------------------------

export function papeisDoItem(modelo: ModeloId, item: ItemModelo): Papel[] {
  return item.papeis.filter((p) => PAPEIS_POR_MODELO[modelo].includes(p))
}

export const PRE = {
  agendar(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('episodio.agendado'), 'agendar')
    exigirNaoTerminal(est)
    if (rank(est) >= RANK.time_out_concluido) erro('ESTADO', 'Cirurgia já iniciada: agenda não muda.')
    return p
  },
  responder(est: EstadoInterno, ator: Ator, modelo: ModeloId, viuCp1?: boolean): Papel {
    const m = est.entrada.modelos[modelo]
    if (!m) erro('VALIDACAO', 'Modelo de checklist inexistente.', { modelo })
    const permitidos = [...new Set(m.secoes.flatMap((s) => s.itens.flatMap((i) => papeisDoItem(modelo, i))))]
    const p = exigirPapel(ator, permitidos, `responder ${m.titulo}`)
    exigirNaoTerminal(est)
    const indisp = motivoIndisponivel(est, modelo)
    if (indisp) erro('ORDEM', indisp, { modelo })
    if (modelo === 'cp1' && cp1Herdado(est)) erro('ESTADO', 'Checkpoint 1 herdado do ciclo anterior (plano mantido pelo cirurgião).')
    if (modelo === 'cp2') verificarConferenciaCega(est, ator, viuCp1)
    return p
  },
  concluir(est: EstadoInterno, ator: Ator, modelo: ModeloId, viuCp1?: boolean): Papel {
    const m = est.entrada.modelos[modelo]
    if (!m) erro('VALIDACAO', 'Modelo de checklist inexistente.', { modelo })
    const p = exigirPapel(ator, m.papeisConclusao.filter((x) => PAPEIS_POR_MODELO[modelo].includes(x)), `concluir ${m.titulo}`)
    exigirNaoTerminal(est)
    if (modelo === 'cp2') verificarConferenciaCega(est, ator, viuCp1)
    if (concluido(est, modelo)) erro('ESTADO', 'Bloco já concluído.', { modelo })
    const indisp = motivoIndisponivel(est, modelo)
    if (indisp) erro('ORDEM', indisp, { modelo })
    const hs = bloqueiosPara(est, `concluir:${modelo}`)
    if (hs.length) erroHardStop(`concluir:${modelo}`, hs)
    const imp = impedimentosConclusao(est, modelo)
    if (imp.length) erro('VALIDACAO', imp[0], { modelo, impedimentos: imp })
    return p
  },
  comunicarAlerta(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('alerta.comunicado'), 'comunicar alerta')
    exigirNaoTerminal(est)
    return p
  },
  condutaAlerta(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('alerta.conduta_registrada'), 'registrar conduta')
    exigirNaoTerminal(est)
    return p
  },
  contato(est: EstadoInterno, ator: Ator, tipo: 'contato.salvo' | 'contato.removido' | 'contato.confirmado'): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento(tipo), 'alterar contatos')
    exigirNaoTerminal(est)
    return p
  },
  teachBack(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('orientacoes.teach_back'), 'registrar teach-back')
    exigirNaoTerminal(est)
    return p
  },
  lenteConcierge(est: EstadoInterno, ator: Ator, etapa: 'plano' | 'chegada'): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento(etapa === 'plano' ? 'lente.plano_registrado' : 'lente.chegada_registrada'), `registrar ${etapa} da LIO`)
    exigirNaoTerminal(est)
    if (rank(est) >= RANK.time_out_concluido) erro('ESTADO', 'Cirurgia já iniciada.')
    if (quarentenaAberta(est)) erro('ESTADO', 'Lente em quarentena: aguarda resolução escrita do cirurgião.')
    const c = cicloAtual(est)
    if (cp1Conclusao(est, c)) erro('ESTADO', 'Checkpoint 1 já concluído neste ciclo: ninguém corrige a ficha. Troca de plano só pelo cirurgião (troca ou resolução de quarentena).')
    if (etapa === 'plano' && c.herdaPlanoDe != null) erro('ESTADO', 'Plano mantido pelo cirurgião neste ciclo: não é digitado de novo.')
    if (etapa === 'chegada' && !planoRef(est, c)) erro('ORDEM', 'Registre o plano da LIO antes da chegada.')
    return p
  },
  cp2(est: EstadoInterno, ator: Ator, viuCp1?: boolean): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('lente.cp2_registrado'), 'fazer o checkpoint 2')
    exigirNaoTerminal(est)
    if (rank(est) >= RANK.time_out_concluido) erro('ESTADO', 'Cirurgia já iniciada.')
    if (quarentenaAberta(est)) erro('ESTADO', 'Lente em quarentena: aguarda resolução escrita do cirurgião.')
    if (!cp1Conclusao(est)) erro('ORDEM', 'Checkpoint 1 não concluído neste ciclo.')
    verificarConferenciaCega(est, ator, viuCp1)
    const c = cicloAtual(est)
    if (c.cp2Registro || c.cp2Resultado) erro('ESTADO', 'Checkpoint 2 já registrado neste ciclo: não há edição do valor digitado.')
    return p
  },
  timeOut(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('lente.time_out_resultado'), 'registrar a leitura da LIO no Time Out')
    exigirNaoTerminal(est)
    if (est.estado !== 'sign_in_concluido') erro('ORDEM', rank(est) < RANK.sign_in_concluido ? 'Sign In não concluído.' : 'Time Out já concluído.')
    verificarHardStops(est, TRANSICAO_LEITURA_LIO)
    if (!planoRef(est)) erro('ORDEM', 'Sem plano da LIO no ciclo atual.')
    if (cicloAtual(est).timeOutResultado?.confere) erro('ESTADO', 'Leitura da LIO já conferida neste ciclo.')
    return p
  },
  resolverQuarentena(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('lente.quarentena_resolvida'), 'resolver a quarentena')
    exigirNaoTerminal(est)
    if (!quarentenaAberta(est)) erro('ESTADO', 'Não há quarentena aberta.')
    return p
  },
  trocaD0(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('lente.troca_d0'), 'trocar a LIO')
    exigirNaoTerminal(est)
    if (rank(est) >= RANK.time_out_concluido) erro('ESTADO', 'Cirurgia já iniciada: mudança intraoperatória usa a reserva do plano (Sign Out).')
    if (quarentenaAberta(est)) erro('ESTADO', 'Lente em quarentena: resolva a quarentena (novo plano ou manter plano).')
    if (!planoRef(est)) erro('ORDEM', 'Não há plano de LIO a trocar.')
    return p
  },
  anexo(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('anexo.adicionado'), 'anexar a foto do plano')
    exigirNaoTerminal(est)
    return p
  },
  tcle(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('tcle.status'), 'registrar o TCLE')
    exigirNaoTerminal(est)
    return p
  },
  materiais(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('material.enviado'), 'enviar materiais')
    exigirNaoTerminal(est)
    if (rank(est) >= RANK.admitido) erro('ESTADO', 'Paciente já admitido.')
    return p
  },
  intercorrencia(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('intercorrencia.registrada'), 'registrar intercorrência')
    exigirNaoTerminal(est)
    return p
  },
  suspender(est: EstadoInterno, ator: Ator, tipo: 'suspenso' | 'cancelado'): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento(tipo === 'suspenso' ? 'episodio.suspenso' : 'episodio.cancelado'), tipo === 'suspenso' ? 'suspender' : 'cancelar')
    if (est.estado === 'cancelado') erro('ESTADO', 'Episódio cancelado.')
    if (tipo === 'suspenso' && est.estado === 'suspenso') erro('ESTADO', 'Episódio já suspenso.')
    if (est.estado === 'alta') erro('ESTADO', 'Paciente já recebeu alta.')
    return p
  },
  atraso(est: EstadoInterno, ator: Ator): Papel {
    const p = exigirPapel(ator, papeisPermitidosParaEvento('avisos.atraso_solicitado'), 'avisar atraso')
    exigirNaoTerminal(est)
    if (rank(est) < RANK.d2_concluido || rank(est) >= RANK.time_out_concluido) erro('ESTADO', 'Aviso de atraso só no dia, antes do início da cirurgia.')
    return p
  },
  etiqueta(_est: EstadoInterno, ator: Ator): Papel {
    return exigirPapel(ator, papeisPermitidosParaEvento('etiqueta.copiada'), 'copiar etiqueta')
  },
  quaseEvento(_est: EstadoInterno, ator: Ator): Papel {
    return exigirPapel(ator, papeisPermitidosParaEvento('quase_evento.registrado'), 'registrar quase-evento')
  },
  resolverHardStop(est: EstadoInterno, ator: Ator, codigo: CodigoHardStop): Papel {
    const def = DEFINICAO_POR_CODIGO[codigo]
    if (!def) erro('VALIDACAO', 'Código de hard stop desconhecido.', { codigo })
    exigirNaoTerminal(est)
    if (!def.gatilhos || !def.porEscrito) erro('VALIDACAO', `Este hard stop não se resolve por texto: ${def.comoResolver}`, { codigo })
    if (!codigosAbertos(est).includes(codigo)) erro('ESTADO', 'Hard stop não está aberto.', { codigo })
    if (!ocorrenciaEscritaAberta(est, codigo)) erro('VALIDACAO', `Este hard stop não se resolve por texto agora: ${def.porCondicao?.comoResolver ?? def.comoResolver}`, { codigo })
    return exigirPapel(ator, def.porEscrito!.resolvivelPor, `resolver ${def.titulo}`)
  },
}

// ---------------------------------------------------------------------------
// Construtor do resultado
// ---------------------------------------------------------------------------

class Resultado {
  readonly eventos: NovoEvento[] = []
  readonly lente: NovoRegistroLente[] = []
  readonly mensagens: NovaMensagem[] = []
  /** Hard stops cujo quase-evento já foi registrado explicitamente neste comando. */
  readonly quaseEventosExplicitos = new Set<CodigoHardStop>()

  constructor(
    readonly est: EstadoInterno,
    readonly ctx: ContextoDecisao,
  ) {}

  evento(
    tipo: NovoEvento['tipo'],
    dados: Record<string, unknown>,
    papel: Papel,
    opts: { visibilidade?: Visibilidade; motivos?: string[]; versaoModelo?: string | null } = {},
  ): NovoEvento {
    const motivos = opts.motivos ?? []
    const ev: NovoEvento = {
      episodioId: this.est.entrada.episodio.id,
      pacienteId: this.est.entrada.paciente.id,
      tipo,
      dados,
      visibilidade: opts.visibilidade ?? 'geral',
      autorId: this.ctx.ator.id,
      autorPapel: papel,
      sessaoUsuarioId: this.ctx.ator.sessaoUsuarioId ?? null,
      aparelhoId: this.ctx.ator.aparelhoId ?? null,
      foraDeHora: motivos.length > 0,
      motivoForaDeHora: motivos.length ? motivos.join(' ') : null,
      versaoModelo: opts.versaoModelo ?? null,
    }
    this.eventos.push(ev)
    return ev
  }

  registro(etapa: NovoRegistroLente['etapa'], ciclo: number, dados: NovoRegistroLente['dados'], visibilidade: Visibilidade): NovoRegistroLente {
    const r: NovoRegistroLente = { id: this.ctx.gerarId(), episodioId: this.est.entrada.episodio.id, ciclo, etapa, dados, autorId: this.ctx.ator.id, visibilidade }
    this.lente.push(r)
    return r
  }

  quaseEvento(papel: Papel, etapa: 'chegada' | 'd2' | 'd0', descricao: string, codigo: CodigoHardStop | null, camposDivergentes: CampoLente[] = [], categoria: CategoriaQuaseEvento = 'lio') {
    this.evento('quase_evento.registrado', { etapa, descricao, codigo, categoria, automatico: true, ...(camposDivergentes.length ? { camposDivergentes } : {}) }, papel)
    if (codigo) this.quaseEventosExplicitos.add(codigo)
  }

  /** Estado depois dos eventos e registros já montados. */
  estadoDepois(): EstadoInterno {
    const base = this.est.entrada
    let seq = this.est.ultimoSeq
    const provisorios: Evento[] = this.eventos.map((e, i) => ({ ...e, id: `provisorio:${i}`, seq: ++seq, registradoEm: this.ctx.agora }))
    const registros = this.lente.map((r) => ({ ...r, registradoEm: this.ctx.agora }))
    return interno(montarEstado({ ...base, eventos: [...base.eventos, ...provisorios], lente: [...base.lente, ...registros] }))
  }
}

/** Categoria do quase-evento automático (indicador 4: identidade, olho ou LIO). */
function categoriaDoHardStop(codigo: CodigoHardStop, fontes: string[]): CategoriaQuaseEvento {
  // Indicador 4 (POP §12): só divergências de identidade, olho ou LIO. Biometria ausente (HS2) e troca de LIO
  // decidida pelo cirurgião (HS8) não são divergências: 'outro'.
  if (codigo === 'HS1_DIVERGENCIA_LIO') return 'lio'
  if (codigo === 'HS_LIO_TIME_OUT') return fontes.some((f) => f.endsWith(TO.procedimento)) ? 'outro' : 'lio'
  if (codigo === 'HS3_DIVERGENCIA_IDENTIDADE_OLHO') {
    const olho = [`d2:${D2.tcle}`, `admissao:${ADM.tcleOlho}`, `time_out:${TO.marca}`]
    return fontes.some((f) => olho.includes(f)) ? 'olho' : 'identidade'
  }
  return 'outro'
}

export const MOTIVO_TCLE_RETIDO = 'TCLE retido: realinhar a expectativa em consulta antes do TCLE (POP §1.F); aguarda a conduta do cirurgião no alerta.'

/** POP §1.F: alerta "espera ficar sem óculos com LIO monofocal" sem conduta válida retém o TCLE. */
export const tcleRetido = tcleRetidoPorExpectativa

function etapaDoComando(comando: Comando, est: EstadoInterno): 'chegada' | 'd2' | 'd0' {
  if (comando.tipo === 'lente.plano' || comando.tipo === 'lente.chegada') return 'chegada'
  if ((comando.tipo === 'checklist.responder' || comando.tipo === 'bloco.concluir') && comando.modelo === 'cp1') return 'chegada'
  if (comando.tipo === 'lente.cp2') return 'd2'
  if ((comando.tipo === 'checklist.responder' || comando.tipo === 'bloco.concluir') && (comando.modelo === 'cp2' || comando.modelo === 'd2' || comando.modelo === 'd7')) return 'd2'
  return rank(est) >= RANK.d2_concluido ? 'd0' : 'd2'
}

// ---------------------------------------------------------------------------
// Validação de respostas
// ---------------------------------------------------------------------------

function validarPessoa(v: unknown, item: ItemModelo): ValorPessoa {
  if (!v || typeof v !== 'object' || Array.isArray(v)) erro('VALIDACAO', 'Informe os dados da pessoa.', { itemId: item.id })
  const p = v as ValorPessoa
  const campos = item.camposPessoa ?? ['nome']
  const r: ValorPessoa = { nome: typeof p.nome === 'string' ? p.nome.trim() : '' }
  for (const k of ['parentesco', 'telefone', 'observacao'] as const) if (typeof p[k] === 'string' && p[k]!.trim()) r[k] = p[k]!.trim()
  for (const c of campos) if (!temTexto(r[c])) erro('VALIDACAO', `Campo obrigatório: ${c}.`, { itemId: item.id, campo: c })
  if (r.telefone && !telefoneValido(r.telefone)) erro('VALIDACAO', 'Telefone inválido (DDD + número).', { itemId: item.id, campo: 'telefone' })
  return r
}

function validarMedicamento(v: unknown, item: ItemModelo, hoje: string): ValorMedicamento {
  if (!v || typeof v !== 'object' || Array.isArray(v)) erro('VALIDACAO', 'Informe o uso do medicamento.', { itemId: item.id })
  const m = v as ValorMedicamento
  if (m.uso !== 'nao' && m.uso !== 'usa' && m.uso !== 'ja_usou') erro('VALIDACAO', 'Uso: não, usa ou já usou.', { itemId: item.id, campo: 'uso' })
  const r: ValorMedicamento = { uso: m.uso }
  if (temTexto(m.nomes)) r.nomes = m.nomes.trim()
  if (temTexto(m.detalhes)) r.detalhes = m.detalhes.trim()
  if (m.uso === 'nao') return r
  if (!r.nomes) erro('VALIDACAO', 'Informe o nome (comercial) do medicamento.', { itemId: item.id, campo: 'nomes' })
  // Os registros por classe do D-2 e da admissão herdam `camposMedicamento` do D-7 e seguem as mesmas exigências.
  const ehInsulina = item.id === D7.insulina || Boolean(item.camposMedicamento?.includes('insulina'))
  const ehGlp1 = item.id === D7.glp1 || Boolean(item.camposMedicamento?.includes('glp1'))
  if (ehInsulina && m.uso === 'usa') {
    if (!r.detalhes) erro('VALIDACAO', 'Registrar tipo, dose e horário.', { itemId: item.id, campo: 'detalhes' })
    if (typeof m.insulinaOuSulfonilureia !== 'boolean') erro('VALIDACAO', 'Marque se é insulina ou sulfonilureia (dot D).', { itemId: item.id, campo: 'insulinaOuSulfonilureia' })
  }
  if (typeof m.insulinaOuSulfonilureia === 'boolean') r.insulinaOuSulfonilureia = m.insulinaOuSulfonilureia
  if (item.id === D7.colirios && m.uso === 'usa' && !r.detalhes) erro('VALIDACAO', 'Registrar nome e olho do colírio.', { itemId: item.id, campo: 'detalhes' })
  if (ehGlp1) {
    if (m.aplicacao !== undefined && m.aplicacao !== 'semanal' && m.aplicacao !== 'diaria') erro('VALIDACAO', 'Aplicação: semanal ou diária.', { itemId: item.id, campo: 'aplicacao' })
    if (m.ultimaAplicacao !== undefined && (!validarData(m.ultimaAplicacao) || m.ultimaAplicacao > hoje)) {
      erro('VALIDACAO', 'Data da última aplicação inválida.', { itemId: item.id, campo: 'ultimaAplicacao' })
    }
    if (m.uso === 'usa') {
      if (!r.detalhes) erro('VALIDACAO', 'Registrar a dose.', { itemId: item.id, campo: 'detalhes' })
      if (!m.aplicacao) erro('VALIDACAO', 'Informe se a aplicação é semanal ou diária.', { itemId: item.id, campo: 'aplicacao' })
      if (!m.ultimaAplicacao) erro('VALIDACAO', 'Registrar a data da última aplicação.', { itemId: item.id, campo: 'ultimaAplicacao' })
      if (typeof m.inicioOuAumentoUltimos3Meses !== 'boolean') erro('VALIDACAO', 'Início ou aumento de dose nos últimos 3 meses?', { itemId: item.id, campo: 'inicioOuAumentoUltimos3Meses' })
      if (typeof m.nauseaOuVomito !== 'boolean') erro('VALIDACAO', 'Náusea ou vômito?', { itemId: item.id, campo: 'nauseaOuVomito' })
    }
    if (m.aplicacao) r.aplicacao = m.aplicacao
    if (m.ultimaAplicacao) r.ultimaAplicacao = m.ultimaAplicacao
    if (typeof m.inicioOuAumentoUltimos3Meses === 'boolean') r.inicioOuAumentoUltimos3Meses = m.inicioOuAumentoUltimos3Meses
    if (typeof m.nauseaOuVomito === 'boolean') r.nauseaOuVomito = m.nauseaOuVomito
  }
  return r
}

export function validarValorItem(item: ItemModelo, v: unknown, hoje: string): ValorResposta {
  const falha = (msg: string): never => erro('VALIDACAO', msg, { itemId: item.id })
  switch (item.tipo) {
    case 'confirmacao':
      if (v !== true) falha('Item de conferência: só existe a marcação "conferido". Item não conferido não é marcado.')
      return true
    case 'sim_nao':
      if (v !== 'sim' && v !== 'nao') falha('Resposta: sim ou não.')
      return v as 'sim' | 'nao'
    case 'opcao':
      if (typeof v !== 'string' || !item.opcoes?.some((o) => o.valor === v)) falha('Opção inválida.')
      return v as string
    case 'multipla': {
      if (!Array.isArray(v) || !v.length) falha('Escolha ao menos uma opção.')
      const lista = [...new Set(v as unknown[])]
      if (!lista.every((x) => typeof x === 'string' && item.opcoes?.some((o) => o.valor === x))) falha('Opção inválida.')
      if (item.id === D7.mobilidade && lista.includes('sem_limitacao') && lista.length > 1) falha('"Sem limitação" não combina com outras opções.')
      return lista as string[]
    }
    case 'texto':
      if (!temTexto(v)) falha('Texto obrigatório ("não" e "nenhuma conhecida" são respostas escritas).')
      if ((v as string).length > 4000) falha('Texto muito longo.')
      return (v as string).trim()
    case 'data':
      if (!validarData(v)) falha('Data inválida (aaaa-mm-dd).')
      return v as string
    case 'hora':
      if (!validarHora(v)) falha('Hora inválida (hh:mm).')
      return v as string
    case 'numero':
      if (typeof v !== 'number' || !Number.isFinite(v)) falha('Número inválido.')
      return v as number
    case 'olho':
      if (v !== 'OD' && v !== 'OE' && !(item.permiteNaoSabe && v === 'nao_sabe')) falha(item.permiteNaoSabe ? 'Olho: OD, OE ou não sabe.' : 'Olho: OD ou OE.')
      return v as string
    case 'medicamento':
      return validarMedicamento(v, item, hoje)
    case 'alergia': {
      if (!v || typeof v !== 'object' || typeof (v as ValorAlergia).tem !== 'boolean') falha('Alergia: informe sim ou não.')
      const a = v as ValorAlergia
      if (a.tem && !temTexto(a.reacao)) falha('Descrever a reação.')
      return a.tem ? { tem: true, reacao: a.reacao!.trim() } : { tem: false }
    }
    case 'pessoa':
      return validarPessoa(v, item)
  }
  return falha('Tipo de item desconhecido.')
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

function agendar(r: Resultado, c: Extract<Comando, { tipo: 'episodio.agendar' }>) {
  const { est, ctx } = r
  const papel = PRE.agendar(est, ctx.ator)
  if (c.dataCirurgia !== null && !validarData(c.dataCirurgia)) erro('VALIDACAO', 'Data da cirurgia inválida (aaaa-mm-dd).', { campo: 'dataCirurgia' })
  if (c.horario !== undefined && c.horario !== null && !validarHora(c.horario)) erro('VALIDACAO', 'Horário inválido (hh:mm).', { campo: 'horario' })
  if (c.ordem !== undefined && c.ordem !== null && (!Number.isInteger(c.ordem) || c.ordem < 1)) erro('VALIDACAO', 'Ordem: inteiro a partir de 1.', { campo: 'ordem' })
  if (c.dataCirurgia !== est.agenda.dataCirurgia && rank(est) >= RANK.admitido) erro('ESTADO', 'Paciente já admitido: a data da cirurgia não muda.')
  const dados: Record<string, unknown> = { dataCirurgia: c.dataCirurgia }
  if (c.horario !== undefined) dados.horario = c.horario
  if (c.ordem !== undefined) dados.ordem = c.ordem
  r.evento('episodio.agendado', dados, papel)
}

function responder(r: Resultado, c: Extract<Comando, { tipo: 'checklist.responder' }>) {
  const { est, ctx } = r
  PRE.responder(est, ctx.ator, c.modelo, ctx.atorViuConferencia1)
  const m = est.entrada.modelos[c.modelo]
  if (!Array.isArray(c.respostas) || !c.respostas.length) erro('VALIDACAO', 'Nenhuma resposta enviada.')
  const ids = c.respostas.map((x) => x.itemId)
  if (new Set(ids).size !== ids.length) erro('VALIDACAO', 'Item repetido no mesmo envio.')
  const itens = c.respostas.map((x) => {
    const i = itemDoModelo(est, c.modelo, x.itemId)
    if (!i) erro('VALIDACAO', 'Item inexistente no modelo.', { modelo: c.modelo, itemId: x.itemId })
    return i as ItemModelo
  })
  // Papel comum a todos os itens do envio.
  const comum = PAPEIS.filter((p) => itens.every((i) => papeisDoItem(c.modelo, i).includes(p)))
  const papel = exigirPapel(ctx.ator, comum, `responder ${m.titulo}`)
  const hoje = dataLocal(ctx.agora)
  const ciclo = ehModeloLente(c.modelo) ? cicloAtual(est).numero : null
  const normalizadas: { item: ItemModelo; valor: ValorResposta; observacao: string | null }[] = []

  for (let k = 0; k < itens.length; k++) {
    const item = itens[k]
    const resp = c.respostas[k]
    // Hard stops que bloqueiam esta marcação (ex.: midriático sem sítio marcado).
    verificarHardStops(est, `marcar:${c.modelo}.${item.id}`)
    // Ordem (regra 4): pré-requisitos registrados ANTES (envios separados).
    for (const pre of item.depoisDe ?? []) {
      if (!marcado(est, c.modelo, pre) || valor(est, c.modelo, pre) === 'nao') {
        const preItem = itemDoModelo(est, c.modelo, pre)
        erro('ORDEM', `Ordem obrigatória: antes, "${preItem?.texto ?? pre}".`, { itemId: item.id, depoisDe: pre, ...(item.hardStop ? { hardStop: item.hardStop } : {}) })
      }
    }
    for (const b of item.exigeBlocosConcluidos ?? []) {
      if (!concluido(est, b)) erro('ORDEM', `Só depois da conclusão do bloco ${est.entrada.modelos[b]?.titulo ?? b}.`, { itemId: item.id, bloco: b })
    }
    const v = validarValorItem(item, resp.valor, hoje)
    const observacao = temTexto(resp.observacao) ? resp.observacao!.trim() : null
    // Regras específicas
    if (item.id === D7.alertasComunicados && c.modelo === 'd7') {
      const pend = alertasSemComunicacao(est)
      if (pend.length) erro('ORDEM', `Há alerta não comunicado ao cirurgião: ${pend[0].titulo}.`, { alertas: pend.map((a) => a.id) })
    }
    if (item.id === D7.materiais && c.modelo === 'd7' && v === 'enviados' && !est.materiais.enviados.some((e) => !!e.mensagemId)) {
      erro('ORDEM', 'Envie o vídeo de preparo e o link do TCLE pelo painel antes de marcar como enviados (TCLE retido também não conta).')
    }
    // Correção de item crítico do D-7 depois de concluído: motivo obrigatório (gera nova comunicação ao cirurgião).
    if (c.modelo === 'd7' && ITENS_CRITICOS_D7.includes(item.id as (typeof ITENS_CRITICOS_D7)[number]) && concluido(est, 'd7') && valor(est, 'd7', item.id) !== undefined && !observacao) {
      erro('VALIDACAO', 'Correção de item crítico depois do D-7 concluído: registre o motivo na observação. O cirurgião precisa ser avisado de novo.', { itemId: item.id })
    }
    // Déficit cognitivo (POP §11): "confirmado com o acompanhante" só com déficit cognitivo registrado no D-7.
    if ((c.modelo === 'admissao' && item.id === ADM.identificacao) || (c.modelo === 'sign_in' && item.id === SI.identificacao)) {
      if (v === 'acompanhante' && valor(est, 'd7', D7.demencia) !== 'sim') erro('VALIDACAO', 'Confirmação com o acompanhante só para paciente com déficit cognitivo registrado no D-7 (POP §11).', { itemId: item.id })
    }
    // O que mudou: "outro remédio" e "estado de saúde" exigem descrição.
    if ((c.modelo === 'd2' && item.id === D2.mudancaClasses) || (c.modelo === 'admissao' && item.id === ADM.mudouClasses)) {
      if (Array.isArray(v) && (v.includes('outra') || v.includes('estado_saude')) && !observacao) erro('VALIDACAO', 'Descreva na observação o que mudou.', { itemId: item.id })
    }
    if (c.modelo === 'd7' && item.id === D7.acompanhanteReservaSituacao && v === 'nenhum' && !observacao) {
      erro('VALIDACAO', 'Sem acompanhante reserva: registre o motivo na observação.', { itemId: item.id })
    }
    // Datas que precisam ser passadas, quando o item se aplica (no mesmo envio ou no registro).
    const valorNoEnvio = (id: string) => c.respostas.find((x) => x.itemId === id)?.valor ?? valor(est, c.modelo, id)
    const aplica =
      (c.modelo === 'd7' && item.id === D7.dataPrimeiroOlho && valorNoEnvio(D7.primeiroSegundo) === 'segundo') ||
      (c.modelo === 'admissao' && item.id === ADM.glp1UltimaDose && valorNoEnvio(ADM.usaGlp1) === 'sim')
    if (aplica && typeof v === 'string' && v > hoje) erro('VALIDACAO', 'Data no futuro.', { itemId: item.id })
    if (c.modelo === 'admissao' && item.id === ADM.pulseiraBraco && v === 'excecao' && !observacao) erro('VALIDACAO', 'Registre o motivo da exceção na observação.', { itemId: item.id })
    if (c.modelo === 'sign_out' && item.id === SO.equipamento && v === 'reportados' && !observacao) erro('VALIDACAO', 'Descreva o problema de equipamento na observação.', { itemId: item.id })
    if (c.modelo === 'sign_out' && item.id === SO.intercorrencias) {
      if (v === 'registradas' && !est.intercorrencias.length) erro('ORDEM', 'Registre a intercorrência no painel antes.', { itemId: item.id })
      if (v === 'sem_intercorrencia' && est.intercorrencias.length) erro('VALIDACAO', 'Há intercorrência registrada neste episódio.', { itemId: item.id })
    }
    if (c.modelo === 'sign_in' && item.id === SI.condutaAlertas) {
      const todos = alertasDoEstado(est, true).filter((a) => ALERTAS_HS6.includes(a.id))
      const ativos = todos.filter((a) => !a.inativo)
      const corrigidosSemAviso = todos.filter((a) => a.inativo && a.comunicacaoPendente)
      if (v === 'nao_se_aplica' && ativos.length) erro('VALIDACAO', 'Há alerta de α-bloqueador, anticoagulante ou antiagregante registrado.', { itemId: item.id })
      if (v === 'nao_se_aplica' && corrigidosSemAviso.length) {
        erro('VALIDACAO', 'Alerta de α-bloqueador ou anticoagulação desativado por correção ainda não comunicado ao cirurgião.', { itemId: item.id, alertas: corrigidosSemAviso.map((a) => a.id) })
      }
      if (v === 'presente' && !ativos.length) erro('VALIDACAO', 'Não há alerta de α-bloqueador, anticoagulante ou antiagregante: use "não se aplica".', { itemId: item.id })
      const semConduta = ativos.filter((a) => !condutaValida(est, a.id))
      if (v === 'presente' && semConduta.length) erro('HARD_STOP', 'Alerta sem conduta escrita do cirurgião.', { hardStops: ['HS6_SEM_CONDUTA_ALFA_ANTICOAG'] })
    }
    if (c.modelo === 'time_out' && item.id === TO.readBack && !cicloAtual(est).timeOutResultado?.confere) {
      erro('ORDEM', 'Read-back só depois da leitura da caixa conferida com o plano.', { itemId: item.id })
    }
    normalizadas.push({ item, valor: v, observacao })
  }

  // Coerência das alergias após o envio (POP §1.D).
  if (c.modelo === 'd7' && ids.some((id) => id === D7.nenhumaAlergia || (ITENS_ALERGIA as readonly string[]).includes(id))) {
    const nenhuma = normalizadas.find((n) => n.item.id === D7.nenhumaAlergia)?.valor ?? valor(est, 'd7', D7.nenhumaAlergia)
    const tem = ITENS_ALERGIA.some((id) => {
      const novo = normalizadas.find((n) => n.item.id === id)
      const v = (novo ? novo.valor : valor(est, 'd7', id)) as ValorAlergia | undefined
      return v?.tem === true
    })
    if (nenhuma === 'sim' && tem) erro('VALIDACAO', '"Nenhuma alergia conhecida" marcada, mas há alergia registrada.', { itemId: D7.nenhumaAlergia })
  }

  const visibilidade: Visibilidade = c.modelo === 'cp1' ? 'conferencia_1' : c.modelo === 'cp2' ? 'conferencia_2' : 'geral'
  for (const n of normalizadas) {
    const dados: Record<string, unknown> = { modelo: c.modelo, itemId: n.item.id, valor: n.valor }
    if (n.observacao) dados.observacao = n.observacao
    if (ciclo != null) dados.ciclo = ciclo
    r.evento('checklist.item_respondido', dados, papel, {
      visibilidade,
      motivos: motivosForaDeHoraResposta(est, c.modelo, n.item, ctx.agora),
      versaoModelo: m.versao,
    })
  }

  // Conferências da LIO: "não" em identidade/olho/modelo/dioptria/eixo → quarentena.
  if (ehModeloLente(c.modelo)) {
    const divergentes = normalizadas.filter((n) => n.item.hardStop === 'HS1_DIVERGENCIA_LIO' && n.valor === 'nao')
    if (divergentes.length && !quarentenaAberta(est)) {
      const etapa = c.modelo
      const motivo = `Divergência na conferência (${etapa === 'cp1' ? 'checkpoint 1' : 'checkpoint 2'}): ${divergentes.map((d) => d.item.texto).join('; ')}.`
      const qPapel = papelUsado(ctx.ator.papeis, papeisPermitidosParaEvento('lente.quarentena_aberta')) ?? papel
      r.evento('lente.quarentena_aberta', { ciclo, etapa, motivo, itens: divergentes.map((d) => d.item.id) }, qPapel)
      r.quaseEvento(papel, etapa === 'cp1' ? 'chegada' : 'd2', motivo, 'HS1_DIVERGENCIA_LIO')
    }
  }
}

function concluirBloco(r: Resultado, c: Extract<Comando, { tipo: 'bloco.concluir' }>) {
  const { est, ctx } = r
  const papel = PRE.concluir(est, ctx.ator, c.modelo, ctx.atorViuConferencia1)
  const m = est.entrada.modelos[c.modelo]
  const dados: Record<string, unknown> = { modelo: c.modelo }
  if (ehModeloLente(c.modelo)) dados.ciclo = cicloAtual(est).numero
  if (m.exigeLeituraEmVozAlta) {
    const leitor = c.leitorId ?? null
    const confirmador = c.confirmadorId ?? null
    if (!leitor || !confirmador) erro('VALIDACAO', 'Leitura em voz alta: registre quem leu e quem confirmou.', { campo: !leitor ? 'leitorId' : 'confirmadorId' })
    if (leitor === confirmador) erro('VALIDACAO', 'Quem lê e quem confirma precisam ser pessoas diferentes.', { campo: 'confirmadorId' })
    const ml = est.entrada.membros[leitor!]
    const mc = est.entrada.membros[confirmador!]
    if (!ml || !mc) erro('VALIDACAO', 'Leitor ou confirmador não é membro ativo da equipe.')
    if (c.modelo === 'time_out') {
      if (!ml.papeis.includes('circulante')) erro('VALIDACAO', 'Time Out: a circulante lê.', { campo: 'leitorId' })
      if (!mc.papeis.includes('cirurgiao')) erro('VALIDACAO', 'Time Out: o cirurgião confirma em voz alta.', { campo: 'confirmadorId' })
    } else {
      const ok = PAPEIS_POR_MODELO[c.modelo]
      if (!ml.papeis.some((p) => ok.includes(p)) || !mc.papeis.some((p) => ok.includes(p))) erro('VALIDACAO', 'Leitor e confirmador precisam ser da equipe do bloco.')
    }
    dados.leitorId = leitor
    dados.confirmadorId = confirmador
  }
  r.evento('bloco.concluido', dados, papel, { motivos: motivosForaDeHoraConclusao(est, c.modelo, ctx.agora), versaoModelo: m.versao })
  const gatilhos: Partial<Record<ModeloId, 'admissao_concluida' | 'inicio_cirurgia' | 'fim_cirurgia' | 'alta'>> = {
    admissao: 'admissao_concluida',
    time_out: 'inicio_cirurgia',
    sign_out: 'fim_cirurgia',
    alta: 'alta',
  }
  const gatilho = gatilhos[c.modelo]
  if (gatilho) {
    const depois = r.estadoDepois()
    for (const msg of avisosAutomaticos(depois, gatilho, ctx)) {
      r.mensagens.push(msg)
      r.evento('mensagem.enfileirada', { mensagemId: msg.id, gatilho: msg.gatilho, contatoId: msg.contatoId, estadoInicial: msg.estadoInicial }, papel)
    }
  }
}

function comunicarAlerta(r: Resultado, c: Extract<Comando, { tipo: 'alerta.comunicar' }>) {
  const { est, ctx } = r
  const papel = PRE.comunicarAlerta(est, ctx.ator)
  // Alerta ativo ou desativado por correção (a correção também chega ao cirurgião).
  if (!est.trilhaAlertas[c.alertaId]) erro('VALIDACAO', 'Alerta inexistente.', { alertaId: c.alertaId })
  const vias: ViaComunicacao[] = ['presencial', 'telefone', 'whatsapp', 'painel', 'outro']
  if (!vias.includes(c.via)) erro('VALIDACAO', 'Via de comunicação inválida.', { campo: 'via' })
  const cir = est.entrada.membros[c.cirurgiaoId]
  if (!cir || !cir.papeis.includes('cirurgiao')) erro('VALIDACAO', 'Informe o cirurgião avisado.', { campo: 'cirurgiaoId' })
  const dados: Record<string, unknown> = { alertaId: c.alertaId, via: c.via, cirurgiaoId: c.cirurgiaoId }
  if (temTexto(c.observacao)) dados.observacao = c.observacao.trim()
  r.evento('alerta.comunicado', dados, papel)
}

function condutaAlerta(r: Resultado, c: Extract<Comando, { tipo: 'alerta.conduta' }>) {
  const { est, ctx } = r
  const papel = PRE.condutaAlerta(est, ctx.ator)
  if (ehAlertaQuarentena(c.alertaId)) erro('VALIDACAO', 'Quarentena da LIO: a conduta é a resolução por escrito da quarentena.', { alertaId: c.alertaId })
  if (!avaliarAlertasAtivos(est).some((a) => a.id === c.alertaId)) erro('VALIDACAO', 'Alerta inexistente ou sem efeito.', { alertaId: c.alertaId })
  r.evento('alerta.conduta_registrada', { alertaId: c.alertaId, conduta: exigirTexto(c.conduta, 'conduta', 'Conduta') }, papel)
}

const TIPOS_CONTATO: TipoContato[] = ['whatsapp_paciente', 'acompanhante_titular', 'acompanhante_reserva', 'familiar_avisos', 'emergencia', 'cuidador_colirios']

function salvarContato(r: Resultado, c: Extract<Comando, { tipo: 'contato.salvar' }>) {
  const { est, ctx } = r
  const papel = PRE.contato(est, ctx.ator, 'contato.salvo')
  const k = c.contato
  if (!k || !temTexto(k.id)) erro('VALIDACAO', 'Contato sem identificador.', { campo: 'id' })
  if (!TIPOS_CONTATO.includes(k.tipo)) erro('VALIDACAO', 'Tipo de contato inválido.', { campo: 'tipo' })
  const nome = exigirTexto(k.nome, 'nome', 'Nome', 200)
  if (typeof k.anuenciaPaciente !== 'boolean') erro('VALIDACAO', 'Registre se o paciente deu anuência.', { campo: 'anuenciaPaciente' })
  const precisaTelefone = k.tipo !== 'cuidador_colirios'
  if (precisaTelefone && !temTexto(k.telefone)) erro('VALIDACAO', 'Telefone obrigatório.', { campo: 'telefone' })
  if (temTexto(k.telefone) && !telefoneValido(k.telefone)) erro('VALIDACAO', 'Telefone inválido (DDD + número).', { campo: 'telefone' })
  const contato: Omit<Contato, 'confirmadoEm' | 'confirmadoPor'> = { id: k.id.trim(), tipo: k.tipo, nome, anuenciaPaciente: k.anuenciaPaciente }
  if (temTexto(k.parentesco)) contato.parentesco = k.parentesco.trim()
  if (temTexto(k.telefone)) contato.telefone = k.telefone.trim()
  if (temTexto(k.operaCelular)) contato.operaCelular = k.operaCelular.trim()
  r.evento('contato.salvo', { contato }, papel)
}

function removerContato(r: Resultado, c: Extract<Comando, { tipo: 'contato.remover' }>) {
  const papel = PRE.contato(r.est, r.ctx.ator, 'contato.removido')
  if (!r.est.contatos[c.contatoId]) erro('VALIDACAO', 'Contato inexistente.', { contatoId: c.contatoId })
  r.evento('contato.removido', { contatoId: c.contatoId }, papel)
}

function confirmarContato(r: Resultado, c: Extract<Comando, { tipo: 'contato.confirmar' }>) {
  const papel = PRE.contato(r.est, r.ctx.ator, 'contato.confirmado')
  const k = r.est.contatos[c.contatoId]
  if (!k) erro('VALIDACAO', 'Contato inexistente.', { contatoId: c.contatoId })
  if (!k.telefone || !telefoneValido(k.telefone)) erro('VALIDACAO', 'Contato sem telefone válido.', { contatoId: c.contatoId })
  r.evento('contato.confirmado', { contatoId: c.contatoId }, papel)
}

function teachBack(r: Resultado, c: Extract<Comando, { tipo: 'orientacoes.teach_back' }>) {
  const papel = PRE.teachBack(r.est, r.ctx.ator)
  if (!['adequado_primeira', 'apos_reorientacao', 'inadequado'].includes(c.resultado)) erro('VALIDACAO', 'Resultado do teach-back inválido.', { campo: 'resultado' })
  const dados: Record<string, unknown> = { resultado: c.resultado }
  if (temTexto(c.observacao)) dados.observacao = c.observacao.trim()
  r.evento('orientacoes.teach_back', dados, papel)
}

function lentePlano(r: Resultado, c: Extract<Comando, { tipo: 'lente.plano' }>) {
  const { est, ctx } = r
  const papel = PRE.lenteConcierge(est, ctx.ator, 'plano')
  const dados = validarPlano(c.dados)
  const ciclo = cicloAtual(est).numero
  const reg = r.registro('plano', ciclo, dados, 'conferencia_1')
  r.evento('lente.plano_registrado', { ciclo, registroId: reg.id }, papel)
  if (dados.olho !== est.entrada.episodio.olho) {
    const motivo = 'Olho do plano diferente do olho do episódio.'
    r.evento('lente.quarentena_aberta', { ciclo, etapa: 'cp1', motivo, camposDivergentes: ['olho'] }, papel)
    r.quaseEvento(papel, 'chegada', motivo, 'HS1_DIVERGENCIA_LIO', ['olho'])
  }
}

function lenteChegada(r: Resultado, c: Extract<Comando, { tipo: 'lente.chegada' }>) {
  const { est, ctx } = r
  const papel = PRE.lenteConcierge(est, ctx.ator, 'chegada')
  const dados = validarChegada(c.dados)
  const ciclo = cicloAtual(est).numero
  const reg = r.registro('chegada', ciclo, dados, 'conferencia_1')
  r.evento('lente.chegada_registrada', { ciclo, registroId: reg.id }, papel)
}

function camposDaLente(a: Partial<ValoresLente>, b: Partial<ValoresLente>): CampoLente[] {
  return CAMPOS_LENTE.filter((x) => x !== 'olho' || (a.olho !== undefined && b.olho !== undefined))
}

function lenteCp2(r: Resultado, c: Extract<Comando, { tipo: 'lente.cp2' }>) {
  const { est, ctx } = r
  const papel = PRE.cp2(est, ctx.ator, ctx.atorViuConferencia1)
  const valores = validarValoresLente(c.valores)
  const plano = dadosPlano(est)
  if (!plano) erro('ESTADO', 'Plano do ciclo indisponível para a comparação (a decisão exige o estado completo).')
  const ciclo = cicloAtual(est).numero
  const contraPlano = compararLente(valores, plano!, camposDaLente(valores, plano!))
  const contraEpisodio = compararLente(valores, { olho: est.entrada.episodio.olho }, ['olho'])
  const camposDivergentes = CAMPOS_LENTE.filter((x) => contraPlano.camposDivergentes.includes(x) || contraEpisodio.camposDivergentes.includes(x))
  const confere = camposDivergentes.length === 0
  const reg = r.registro('cp2', ciclo, valores, 'conferencia_2')
  r.evento('lente.cp2_registrado', { ciclo, registroId: reg.id }, papel)
  r.evento('lente.cp2_resultado', { ciclo, registroId: reg.id, confere, camposDivergentes }, papel)
  if (!confere) {
    const motivo = 'Conferência cega (checkpoint 2) divergente do plano ou do olho do episódio.'
    r.evento('lente.quarentena_aberta', { ciclo, etapa: 'cp2', motivo, camposDivergentes }, papel)
    r.quaseEvento(papel, 'd2', `${motivo} Campos: ${camposDivergentes.join(', ')}.`, 'HS1_DIVERGENCIA_LIO', camposDivergentes)
  }
}

function lenteTimeOut(r: Resultado, c: Extract<Comando, { tipo: 'lente.time_out' }>) {
  const { est, ctx } = r
  const papel = PRE.timeOut(est, ctx.ator)
  const leitura: LeituraTimeOut = validarLeitura(c.leitura)
  const plano = dadosPlano(est)
  if (!plano) erro('ESTADO', 'Plano do ciclo indisponível para a comparação (a decisão exige o estado completo).')
  const campos: CampoLente[] = ['modelo', 'dioptria', 'cilindro', 'eixo']
  const div = new Set(compararLente(leitura, plano!, campos).camposDivergentes)
  const cp2 = dadosCp2(est)
  if (cp2) for (const x of compararLente(leitura, cp2, campos).camposDivergentes) div.add(x)
  const camposDivergentes = CAMPOS_LENTE.filter((x) => div.has(x))
  const confere = camposDivergentes.length === 0
  const ciclo = cicloAtual(est).numero
  // Leitura restrita (circulante, cirurgião, gestora: filtro por etapa no banco). Visibilidade do registro:
  // 'conferencia_1' (não expõe nada à segunda conferente).
  const reg = r.registro('time_out', ciclo, leitura, 'conferencia_1')
  const motivos = motivosForaDeHoraD0(est, ctx.agora)
  r.evento('lente.time_out_resultado', { ciclo, registroId: reg.id, confere, camposDivergentes }, papel, { motivos })
  if (!confere) {
    const motivo = 'Leitura da caixa no Time Out divergente do plano ou do checkpoint 2: a cirurgia não começa.'
    r.evento('lente.quarentena_aberta', { ciclo, etapa: 'time_out', motivo, camposDivergentes }, papel)
    r.quaseEvento(papel, 'd0', `${motivo} Campos: ${camposDivergentes.join(', ')}.`, 'HS_LIO_TIME_OUT', camposDivergentes)
  }
}

function resolverQuarentena(r: Resultado, c: Extract<Comando, { tipo: 'lente.resolver_quarentena' }>) {
  const { est, ctx } = r
  const papel = PRE.resolverQuarentena(est, ctx.ator)
  if (c.acao !== 'manter_plano' && c.acao !== 'novo_plano') erro('VALIDACAO', 'Ação: manter o plano ou novo plano.', { campo: 'acao' })
  const resolucao = exigirTexto(c.resolucao, 'resolucao', 'Resolução por escrito')
  const ciclo = cicloAtual(est)
  const q = ciclo.quarentena!
  if (c.acao === 'manter_plano') {
    const plano = dadosPlano(est)
    if (plano && plano.olho !== est.entrada.episodio.olho) {
      erro('VALIDACAO', 'O olho do plano difere do olho do episódio: manter o plano não é possível. Registre novo plano ou cancele o episódio.')
    }
  }
  r.evento('lente.quarentena_resolvida', { ciclo: ciclo.numero, novoCiclo: ciclo.numero + 1, etapa: q.etapa, acao: c.acao, resolucao }, papel)
}

function trocaD0(r: Resultado, c: Extract<Comando, { tipo: 'lente.troca_d0' }>) {
  const { est, ctx } = r
  const papel = PRE.trocaD0(est, ctx.ator)
  const motivo = exigirTexto(c.motivo, 'motivo', 'Motivo da troca')
  const ciclo = cicloAtual(est).numero
  r.evento('lente.troca_d0', { cicloAnterior: ciclo, novoCiclo: ciclo + 1, motivo }, papel)
}

function anexo(r: Resultado, c: Extract<Comando, { tipo: 'anexo.adicionar' }>) {
  const papel = PRE.anexo(r.est, r.ctx.ator)
  if (!temTexto(c.anexoId)) erro('VALIDACAO', 'Anexo sem identificador.', { campo: 'anexoId' })
  if (c.tipoAnexo !== 'foto_plano') erro('VALIDACAO', 'Tipo de anexo inválido.', { campo: 'tipoAnexo' })
  if (typeof c.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(c.sha256)) erro('VALIDACAO', 'SHA-256 em hexadecimal minúsculo (64).', { campo: 'sha256' })
  r.evento('anexo.adicionado', { anexoId: c.anexoId, tipoAnexo: c.tipoAnexo, sha256: c.sha256, ciclo: cicloAtual(r.est).numero }, papel)
}

function tcleStatus(r: Resultado, c: Extract<Comando, { tipo: 'tcle.status' }>) {
  const { est, ctx } = r
  const papel = PRE.tcle(est, ctx.ator)
  const validos: StatusTcle[] = ['enviado', 'assinado', 'olho_conferido']
  if (!validos.includes(c.status)) erro('VALIDACAO', 'Status do TCLE inválido.', { campo: 'status' })
  if (c.status === 'olho_conferido' && est.tcle.status !== 'assinado' && est.tcle.status !== 'olho_conferido') erro('ORDEM', 'Olho conferido só depois do TCLE assinado.')
  const dados: Record<string, unknown> = { status: c.status }
  if (c.link !== undefined && c.link !== null) {
    if (typeof c.link !== 'string' || !/^https:\/\/\S+$/i.test(c.link.trim())) erro('VALIDACAO', 'Link do TCLE inválido (https).', { campo: 'link' })
    dados.link = c.link.trim()
  }
  r.evento('tcle.status', dados, papel)
}

function materiaisEnviar(r: Resultado, c: Extract<Comando, { tipo: 'materiais.enviar' }>) {
  const { est, ctx } = r
  const papel = PRE.materiais(est, ctx.ator)
  if (!temTexto(c.tokenLink) || c.tokenLink.length < 16) erro('VALIDACAO', 'Token do link inválido.', { campo: 'tokenLink' })
  if (!validarInstante(c.expiraEm) || Date.parse(c.expiraEm) <= Date.parse(ctx.agora)) erro('VALIDACAO', 'Validade do link inválida.', { campo: 'expiraEm' })
  let materiais: MaterialCatalogo[] = (c.materiais ?? []).filter((m) => m && m.ativo)
  if (!materiais.length) erro('VALIDACAO', 'Nenhum material ativo para enviar.', { campo: 'materiais' })
  if (!ctx.urlPaginaPaciente) erro('VALIDACAO', 'Endereço da página do paciente não configurado.')
  const link = `${ctx.urlPaginaPaciente}${c.tokenLink}`
  // POP §1.F: com expectativa a realinhar em consulta e sem conduta, o TCLE fica retido (os materiais de preparo podem ir).
  if (tcleRetido(est)) {
    materiais = materiais.filter((m) => m.tipo !== 'video_tcle' && m.tipo !== 'link_tcle')
    if (!materiais.length) erro('ESTADO', MOTIVO_TCLE_RETIDO, { campo: 'materiais' })
    r.evento('link_paciente.criado', { expiraEm: c.expiraEm }, papel)
    r.evento(
      'material.enviado',
      { materiais: materiais.map((m) => ({ id: m.id, codigo: m.codigo, versao: m.versao, titulo: m.titulo })), contatoId: null, mensagemId: null, gatilho: 'materiais_preparo', tcleRetido: true },
      papel,
    )
    return
  }
  const msg = mensagemEnvioTcle(est, link, ctx)
  r.evento('link_paciente.criado', { expiraEm: c.expiraEm }, papel)
  r.evento(
    'material.enviado',
    { materiais: materiais.map((m) => ({ id: m.id, codigo: m.codigo, versao: m.versao, titulo: m.titulo })), contatoId: msg.contatoId, mensagemId: msg.id, gatilho: msg.gatilho },
    papel,
  )
  r.mensagens.push(msg)
  r.evento('mensagem.enfileirada', { mensagemId: msg.id, gatilho: msg.gatilho, contatoId: msg.contatoId, estadoInicial: msg.estadoInicial }, papel)
}

function resolverHardStop(r: Resultado, c: Extract<Comando, { tipo: 'hardstop.resolver' }>) {
  const papel = PRE.resolverHardStop(r.est, r.ctx.ator, c.codigo)
  r.evento('hardstop.resolvido', { codigo: c.codigo, resolucao: exigirTexto(c.resolucao, 'resolucao', 'Resolução por escrito') }, papel)
}

function intercorrencia(r: Resultado, c: Extract<Comando, { tipo: 'intercorrencia.registrar' }>) {
  const papel = PRE.intercorrencia(r.est, r.ctx.ator)
  const dados: Record<string, unknown> = { descricao: exigirTexto(c.descricao, 'descricao', 'Descrição') }
  if (c.neverEvent !== undefined && c.neverEvent !== null) {
    if (!['olho_errado', 'paciente_errado', 'lio_errada'].includes(c.neverEvent)) erro('VALIDACAO', 'Never event inválido.', { campo: 'neverEvent' })
    dados.neverEvent = c.neverEvent
  }
  r.evento('intercorrencia.registrada', dados, papel)
}

const CAUSAS: CausaCancelamento[] = ['sem_acompanhante', 'colirio_nao_usado', 'medicacao_nao_ajustada', 'olho_vermelho_nao_avisado', 'tcle_ausente', 'lio_indisponivel', 'outra']

function suspenderOuCancelar(r: Resultado, c: Extract<Comando, { tipo: 'episodio.suspender' | 'episodio.cancelar' }>) {
  const tipo = c.tipo === 'episodio.suspender' ? 'suspenso' : 'cancelado'
  const papel = PRE.suspender(r.est, r.ctx.ator, tipo)
  const motivo = exigirTexto(c.motivo, 'motivo', 'Motivo')
  if (c.causa === null || !CAUSAS.includes(c.causa)) erro('VALIDACAO', 'Informe a causa (indicador 6 do POP).', { campo: 'causa' })
  if (c.evitavel !== null && typeof c.evitavel !== 'boolean') erro('VALIDACAO', 'Evitável: sim, não ou em branco.', { campo: 'evitavel' })
  // As causas listadas no indicador 6 são, pelo POP, causas evitáveis; "outra" depende do registro.
  const evitavel = c.evitavel ?? (c.causa === 'outra' ? null : true)
  r.evento(tipo === 'suspenso' ? 'episodio.suspenso' : 'episodio.cancelado', { motivo, causa: c.causa, evitavel }, papel)
}

function atraso(r: Resultado, c: Extract<Comando, { tipo: 'avisos.atraso' }>) {
  const { est, ctx } = r
  const papel = PRE.atraso(est, ctx.ator)
  if (c.minutos !== null && (typeof c.minutos !== 'number' || !Number.isFinite(c.minutos) || c.minutos <= 0)) erro('VALIDACAO', 'Minutos: número positivo ou em branco.', { campo: 'minutos' })
  const mensagens = avisoAtraso(est, c.minutos, ctx)
  r.evento('avisos.atraso_solicitado', { minutos: c.minutos }, papel)
  for (const msg of mensagens) {
    r.mensagens.push(msg)
    r.evento('mensagem.enfileirada', { mensagemId: msg.id, gatilho: msg.gatilho, contatoId: msg.contatoId, estadoInicial: msg.estadoInicial }, papel)
  }
}

function etiquetaCopiada(r: Resultado, c: Extract<Comando, { tipo: 'etiqueta.copiada' }>) {
  const papel = PRE.etiqueta(r.est, r.ctx.ator)
  const validas: TipoEtiqueta[] = ['peito', 'pulseira', 'caixa_lente', 'alertas']
  if (!validas.includes(c.etiqueta)) erro('VALIDACAO', 'Etiqueta inválida.', { campo: 'etiqueta' })
  r.evento('etiqueta.copiada', { etiqueta: c.etiqueta }, papel)
}

function quaseEventoManual(r: Resultado, c: Extract<Comando, { tipo: 'quase_evento.registrar' }>) {
  const papel = PRE.quaseEvento(r.est, r.ctx.ator)
  if (!['chegada', 'd2', 'd0'].includes(c.etapa)) erro('VALIDACAO', 'Etapa: chegada, D-2 ou D0.', { campo: 'etapa' })
  if (c.categoria !== undefined && c.categoria !== null && !['identidade', 'olho', 'lio', 'outro'].includes(c.categoria)) erro('VALIDACAO', 'Categoria: identidade, olho, LIO ou outro.', { campo: 'categoria' })
  const dados: Record<string, unknown> = { etapa: c.etapa, descricao: exigirTexto(c.descricao, 'descricao', 'Descrição'), codigo: null, automatico: false }
  if (c.categoria) dados.categoria = c.categoria
  r.evento('quase_evento.registrado', dados, papel)
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Valida o comando contra o estado COMPLETO e devolve o que gravar. Lança ErroDominio. */
export function decidir(estado: Estado, comando: Comando, ctx: ContextoDecisao): ResultadoDecisao {
  const est = interno(estado)
  if (!ctx?.ator?.id) erro('SEM_PERMISSAO', 'Ator não identificado.')
  if (!validarInstante(ctx.agora)) erro('VALIDACAO', 'Hora do servidor inválida.')
  const r = new Resultado(est, ctx)
  switch (comando.tipo) {
    case 'episodio.agendar':
      agendar(r, comando)
      break
    case 'checklist.responder':
      responder(r, comando)
      break
    case 'bloco.concluir':
      concluirBloco(r, comando)
      break
    case 'alerta.comunicar':
      comunicarAlerta(r, comando)
      break
    case 'alerta.conduta':
      condutaAlerta(r, comando)
      break
    case 'contato.salvar':
      salvarContato(r, comando)
      break
    case 'contato.remover':
      removerContato(r, comando)
      break
    case 'contato.confirmar':
      confirmarContato(r, comando)
      break
    case 'orientacoes.teach_back':
      teachBack(r, comando)
      break
    case 'lente.plano':
      lentePlano(r, comando)
      break
    case 'lente.chegada':
      lenteChegada(r, comando)
      break
    case 'lente.cp2':
      lenteCp2(r, comando)
      break
    case 'lente.time_out':
      lenteTimeOut(r, comando)
      break
    case 'lente.resolver_quarentena':
      resolverQuarentena(r, comando)
      break
    case 'lente.troca_d0':
      trocaD0(r, comando)
      break
    case 'anexo.adicionar':
      anexo(r, comando)
      break
    case 'tcle.status':
      tcleStatus(r, comando)
      break
    case 'materiais.enviar':
      materiaisEnviar(r, comando)
      break
    case 'hardstop.resolver':
      resolverHardStop(r, comando)
      break
    case 'intercorrencia.registrar':
      intercorrencia(r, comando)
      break
    case 'episodio.suspender':
    case 'episodio.cancelar':
      suspenderOuCancelar(r, comando)
      break
    case 'avisos.atraso':
      atraso(r, comando)
      break
    case 'etiqueta.copiada':
      etiquetaCopiada(r, comando)
      break
    case 'quase_evento.registrar':
      quaseEventoManual(r, comando)
      break
    default:
      erro('VALIDACAO', 'Comando desconhecido.', { tipo: (comando as { tipo?: string }).tipo })
  }

  // POP §13.9: todo hard stop acionado é registrado como quase-evento (sem caráter punitivo).
  if (r.eventos.length) {
    const antes = new Set(codigosAbertos(est))
    const depois = r.estadoDepois()
    const papelQe = r.eventos[0].autorPapel as Papel
    for (const h of hardStopsAbertos(depois)) {
      const def = DEFINICAO_POR_CODIGO[h.codigo]
      if (!def.registraQuaseEvento || r.quaseEventosExplicitos.has(h.codigo)) continue
      const fontesAntes = est.ocorrencias[h.codigo]?.fontes ?? []
      const fontesNovas = (depois.ocorrencias[h.codigo]?.fontes ?? []).filter((f) => !fontesAntes.includes(f))
      if (antes.has(h.codigo) && !fontesNovas.length) continue
      r.quaseEvento(papelQe, etapaDoComando(comando, est), `Hard stop acionado: ${def.titulo}.`, h.codigo, [], categoriaDoHardStop(h.codigo, depois.ocorrencias[h.codigo]?.fontes ?? []))
    }
  }
  return { eventos: r.eventos, lente: r.lente, mensagens: r.mensagens }
}
