// Dobra os eventos do episódio (em ordem de seq) num Estado.
// Funciona com todos os eventos (decisão) ou só com os visíveis ao ator (leitura): a situação da lente
// vem dos eventos de visibilidade 'geral' (sem valores); os valores, de `entrada.lente` quando presentes.

import type { EntradaEstado, Estado } from '../contrato.ts'
import type {
  CampoLente,
  Contato,
  Evento,
  ModeloId,
  QuizTentativa,
  StatusTcle,
  ValorResposta,
  ViaComunicacao,
} from '../tipos.ts'
import { avaliarAlertasAtivos } from '../regras/alertas.ts'
import { atualizarHardStops } from '../regras/hardstops.ts'
import { digitosTelefone } from '../util/telefone.ts'
import { cicloAtual, cicloPorNumero, ESTADO_APOS_CONCLUSAO, terminal } from './consultas.ts'
import type { AcaoQuarentena, CicloLente, ConclusaoInterna, EstadoInterno, EtapaQuarentena, OrigemCiclo, RespostaInterna } from './tipos.ts'

export function novoCiclo(numero: number, origem: OrigemCiclo, em: string, herdaPlanoDe: number | null = null, herdaCp1De: number | null = null): CicloLente {
  return {
    numero,
    origem,
    iniciadoEm: em,
    herdaPlanoDe,
    herdaCp1De,
    plano: null,
    chegada: null,
    respostasCp1: {},
    cp1: null,
    cp2Registro: null,
    cp2Resultado: null,
    respostasCp2: {},
    cp2: null,
    timeOutRegistro: null,
    timeOutResultado: null,
    quarentena: null,
    encerrado: null,
    autoresConferencia1: [],
  }
}

/**
 * Herança do novo ciclo após resolução de quarentena "manter_plano" ([S] interpretação a confirmar):
 * - quarentena no checkpoint 1: plano mantido; chegada, checkpoint 1 e checkpoint 2 refeitos;
 * - quarentena no checkpoint 2: plano, chegada e checkpoint 1 mantidos; checkpoint 2 cego refeito;
 * - quarentena no Time Out: plano mantido; a caixa é conferida de novo (chegada, checkpoints 1 e 2) e lida de novo.
 * "novo_plano" e troca no D0: nada é herdado (plano, chegada, checkpoints 1 e 2 refeitos).
 */
export function herancaManterPlano(cicloAnterior: number, etapa: EtapaQuarentena): { herdaPlanoDe: number; herdaCp1De: number | null } {
  return { herdaPlanoDe: cicloAnterior, herdaCp1De: etapa === 'cp2' ? cicloAnterior : null }
}

export function estadoVazio(entrada: EntradaEstado): EstadoInterno {
  const ep = entrada.episodio
  const est: EstadoInterno = {
    entrada,
    estado: 'd7_em_andamento',
    agenda: { dataCirurgia: ep.dataCirurgia, horario: ep.horario, ordem: ep.ordem, dataSugerida: ep.dataSugerida },
    respostas: {},
    conclusoes: {},
    ciclos: [novoCiclo(1, 'inicial', ep.abertoEm)],
    alertasComunicados: {},
    condutas: {},
    trilhaAlertas: {},
    trilhaHardStops: {},
    ocorrencias: {},
    gatilhosAnteriores: {},
    resolucoesHardStop: [],
    contatos: {},
    tcle: { status: 'nao_enviado', link: null, historico: [] },
    materiais: { enviados: [], linkCriadoEm: null, linkExpiraEm: null, abertoEm: null, quiz: [] },
    teachBack: null,
    teachBacks: [],
    intercorrencias: [],
    quaseEventos: [],
    suspensoes: [],
    atrasos: [],
    mensagensEnfileiradas: [],
    anexos: [],
    etiquetasCopiadas: [],
    ultimoEventoEm: ep.abertoEm,
    ultimoSeq: 0,
    contador: 0,
  }
  return est
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function cicloDoEvento(est: EstadoInterno, dados: Record<string, unknown>): CicloLente {
  const n = num(dados.ciclo)
  if (n != null) {
    let c = cicloPorNumero(est, n)
    if (!c) {
      // Ciclo ainda não visto (eventos filtrados): cria para manter a ordem.
      c = novoCiclo(n, 'inicial', est.ultimoEventoEm)
      est.ciclos.push(c)
      est.ciclos.sort((a, b) => a.numero - b.numero)
    }
    return c
  }
  return cicloAtual(est)
}

function adicionarAutor(c: CicloLente, id: string) {
  if (!c.autoresConferencia1.includes(id)) c.autoresConferencia1.push(id)
}

function conclusaoDe(ev: Evento): ConclusaoInterna {
  return {
    em: ev.registradoEm,
    porId: ev.autorId,
    porPapel: ev.autorPapel,
    leitorId: str(ev.dados.leitorId),
    confirmadorId: str(ev.dados.confirmadorId),
    foraDeHora: ev.foraDeHora,
    motivoForaDeHora: ev.motivoForaDeHora ?? null,
    eventoId: ev.id,
  }
}

export function aplicarEvento(est: EstadoInterno, ev: Evento): void {
  const d = (ev.dados ?? {}) as Record<string, unknown>
  est.contador++
  switch (ev.tipo) {
    case 'episodio.agendado':
    case 'episodio.corrigido': {
      if ('dataCirurgia' in d) est.agenda.dataCirurgia = str(d.dataCirurgia)
      if ('horario' in d) est.agenda.horario = str(d.horario)
      if ('ordem' in d) est.agenda.ordem = num(d.ordem)
      if ('dataSugerida' in d) est.agenda.dataSugerida = str(d.dataSugerida)
      break
    }
    case 'checklist.item_respondido': {
      const modelo = d.modelo as ModeloId
      const itemId = str(d.itemId)
      if (!modelo || !itemId) break
      let alvo: Record<string, RespostaInterna>
      if (modelo === 'cp1' || modelo === 'cp2') {
        const c = cicloDoEvento(est, d)
        alvo = modelo === 'cp1' ? c.respostasCp1 : c.respostasCp2
        if (modelo === 'cp1') adicionarAutor(c, ev.autorId)
      } else {
        alvo = est.respostas[modelo] ??= {}
      }
      const anterior = alvo[itemId]
      alvo[itemId] = {
        valor: d.valor as ValorResposta,
        observacao: str(d.observacao),
        autorId: ev.autorId,
        autorPapel: ev.autorPapel,
        registradoEm: ev.registradoEm,
        foraDeHora: ev.foraDeHora,
        motivoForaDeHora: ev.motivoForaDeHora ?? null,
        correcoes: anterior ? anterior.correcoes + 1 : 0,
        eventoId: ev.id,
        ordem: est.contador,
      }
      break
    }
    case 'bloco.concluido': {
      const modelo = d.modelo as ModeloId
      if (!modelo) break
      if (modelo === 'cp1' || modelo === 'cp2') {
        const c = cicloDoEvento(est, d)
        if (modelo === 'cp1') {
          c.cp1 = conclusaoDe(ev)
          adicionarAutor(c, ev.autorId)
        } else {
          c.cp2 = conclusaoDe(ev)
        }
        break
      }
      est.conclusoes[modelo] = conclusaoDe(ev)
      const proximo = ESTADO_APOS_CONCLUSAO[modelo]
      if (proximo && !terminal(est)) est.estado = proximo
      break
    }
    case 'alerta.comunicado': {
      const id = str(d.alertaId)
      if (id) est.alertasComunicados[id] = { porId: ev.autorId, em: ev.registradoEm, via: (str(d.via) ?? 'outro') as ViaComunicacao, cirurgiaoId: str(d.cirurgiaoId) ?? '', observacao: str(d.observacao), ordem: est.contador }
      break
    }
    case 'alerta.conduta_registrada': {
      const id = str(d.alertaId)
      if (id) est.condutas[id] = { texto: str(d.conduta) ?? '', cirurgiaoId: ev.autorId, em: ev.registradoEm, ordem: est.contador }
      break
    }
    case 'contato.salvo': {
      const c = d.contato as Contato | undefined
      if (!c || !c.id) break
      const anterior = est.contatos[c.id]
      const mesmoNumero = anterior && digitosTelefone(anterior.telefone ?? '') === digitosTelefone(c.telefone ?? '')
      const manterConfirmacao = !!anterior && mesmoNumero && c.anuenciaPaciente && anterior.tipo === c.tipo
      est.contatos[c.id] = {
        ...c,
        confirmadoEm: manterConfirmacao ? (anterior.confirmadoEm ?? null) : null,
        confirmadoPor: manterConfirmacao ? (anterior.confirmadoPor ?? null) : null,
      }
      break
    }
    case 'contato.removido': {
      const id = str(d.contatoId)
      if (id) delete est.contatos[id]
      break
    }
    case 'contato.confirmado': {
      const id = str(d.contatoId)
      if (id && est.contatos[id]) est.contatos[id] = { ...est.contatos[id], confirmadoEm: ev.registradoEm, confirmadoPor: ev.autorId }
      break
    }
    case 'orientacoes.teach_back': {
      const resultado = d.resultado as 'adequado_primeira' | 'apos_reorientacao' | 'inadequado'
      est.teachBack = { resultado, observacao: str(d.observacao), em: ev.registradoEm, porId: ev.autorId }
      est.teachBacks.push({ resultado, em: ev.registradoEm })
      break
    }
    case 'lente.plano_registrado': {
      const c = cicloDoEvento(est, d)
      c.plano = { registroId: str(d.registroId), em: ev.registradoEm, porId: ev.autorId }
      adicionarAutor(c, ev.autorId)
      break
    }
    case 'lente.chegada_registrada': {
      const c = cicloDoEvento(est, d)
      c.chegada = { registroId: str(d.registroId), em: ev.registradoEm, porId: ev.autorId }
      adicionarAutor(c, ev.autorId)
      break
    }
    case 'lente.cp2_registrado': {
      const c = cicloDoEvento(est, d)
      c.cp2Registro = { registroId: str(d.registroId), em: ev.registradoEm, porId: ev.autorId }
      break
    }
    case 'lente.cp2_resultado': {
      const c = cicloDoEvento(est, d)
      c.cp2Resultado = {
        confere: d.confere === true,
        camposDivergentes: (Array.isArray(d.camposDivergentes) ? d.camposDivergentes : []) as CampoLente[],
        em: ev.registradoEm,
        porId: ev.autorId,
        registroId: str(d.registroId),
      }
      break
    }
    case 'lente.quarentena_aberta': {
      const c = cicloDoEvento(est, d)
      c.quarentena = {
        aberta: true,
        etapa: (str(d.etapa) ?? 'cp1') as EtapaQuarentena,
        motivo: str(d.motivo) ?? '',
        desde: ev.registradoEm,
        porId: ev.autorId,
        camposDivergentes: (Array.isArray(d.camposDivergentes) ? d.camposDivergentes : []) as CampoLente[],
        itens: (Array.isArray(d.itens) ? d.itens : []) as string[],
      }
      break
    }
    case 'lente.quarentena_resolvida': {
      const c = cicloDoEvento(est, d)
      const acao = (str(d.acao) ?? 'novo_plano') as AcaoQuarentena
      if (c.quarentena) {
        c.quarentena.aberta = false
        c.quarentena.resolucao = { texto: str(d.resolucao) ?? '', cirurgiaoId: ev.autorId, em: ev.registradoEm, acao }
      }
      c.encerrado = { em: ev.registradoEm, motivo: `Quarentena resolvida (${acao === 'manter_plano' ? 'plano mantido' : 'novo plano'})` }
      const n = num(d.novoCiclo) ?? c.numero + 1
      if (!cicloPorNumero(est, n)) {
        const etapa = c.quarentena?.etapa ?? 'cp1'
        const h = acao === 'manter_plano' ? herancaManterPlano(c.numero, etapa) : { herdaPlanoDe: null, herdaCp1De: null }
        est.ciclos.push(novoCiclo(n, acao, ev.registradoEm, h.herdaPlanoDe, h.herdaCp1De))
      }
      break
    }
    case 'lente.time_out_resultado': {
      const c = cicloDoEvento(est, d)
      c.timeOutRegistro = { registroId: str(d.registroId), em: ev.registradoEm, porId: ev.autorId }
      c.timeOutResultado = {
        confere: d.confere === true,
        camposDivergentes: (Array.isArray(d.camposDivergentes) ? d.camposDivergentes : []) as CampoLente[],
        em: ev.registradoEm,
        porId: ev.autorId,
        registroId: str(d.registroId),
      }
      break
    }
    case 'lente.troca_d0': {
      const c = cicloDoEvento(est, d)
      c.encerrado = { em: ev.registradoEm, motivo: 'Troca de LIO no dia D' }
      if (c.quarentena?.aberta) c.quarentena.aberta = false
      const n = num(d.novoCiclo) ?? c.numero + 1
      if (!cicloPorNumero(est, n)) est.ciclos.push(novoCiclo(n, 'troca_d0', ev.registradoEm))
      break
    }
    case 'anexo.adicionado': {
      est.anexos.push({ anexoId: str(d.anexoId) ?? '', tipoAnexo: str(d.tipoAnexo) ?? '', em: ev.registradoEm, porId: ev.autorId, ciclo: num(d.ciclo) ?? cicloAtual(est).numero })
      break
    }
    case 'tcle.status': {
      const status = str(d.status) as StatusTcle | null
      if (status) {
        est.tcle.status = status
        if ('link' in d && d.link !== undefined) est.tcle.link = str(d.link)
        est.tcle.historico.push({ status, em: ev.registradoEm, porId: ev.autorId })
      }
      break
    }
    case 'material.enviado': {
      const lista = Array.isArray(d.materiais) ? (d.materiais as { id: string; codigo: string; versao: number; titulo: string }[]) : []
      est.materiais.enviados.push({ materiais: lista, em: ev.registradoEm, contatoId: str(d.contatoId), mensagemId: str(d.mensagemId) })
      break
    }
    case 'link_paciente.criado': {
      est.materiais.linkCriadoEm = ev.registradoEm
      est.materiais.linkExpiraEm = str(d.expiraEm)
      break
    }
    case 'material.aberto': {
      est.materiais.abertoEm ??= ev.registradoEm
      break
    }
    case 'quiz.respondido': {
      const t = (d.tentativa && typeof d.tentativa === 'object' ? d.tentativa : d) as QuizTentativa
      const erradas = Array.isArray(d.erradas) ? (d.erradas as number[]) : []
      est.materiais.quiz.push({ tentativa: { ...t, em: t.em || ev.registradoEm }, erradas, em: ev.registradoEm })
      break
    }
    case 'etiqueta.copiada': {
      est.etiquetasCopiadas.push({ etiqueta: str(d.etiqueta) ?? '', em: ev.registradoEm, porId: ev.autorId })
      break
    }
    case 'hardstop.resolvido': {
      const codigo = str(d.codigo) as EstadoInterno['resolucoesHardStop'][number]['codigo'] | null
      if (codigo) {
        est.resolucoesHardStop.push({ codigo, texto: str(d.resolucao) ?? '', porId: ev.autorId, porPapel: ev.autorPapel, em: ev.registradoEm })
        delete est.ocorrencias[codigo]
      }
      break
    }
    case 'intercorrencia.registrada': {
      est.intercorrencias.push({ descricao: str(d.descricao) ?? '', em: ev.registradoEm, porId: ev.autorId, neverEvent: str(d.neverEvent) })
      break
    }
    case 'episodio.suspenso':
    case 'episodio.cancelado': {
      const tipo = ev.tipo === 'episodio.suspenso' ? 'suspenso' : 'cancelado'
      est.suspensoes.push({
        tipo,
        em: ev.registradoEm,
        porId: ev.autorId,
        motivo: str(d.motivo) ?? '',
        causa: str(d.causa),
        evitavel: typeof d.evitavel === 'boolean' ? d.evitavel : null,
      })
      est.estado = tipo
      break
    }
    case 'avisos.atraso_solicitado': {
      est.atrasos.push({ em: ev.registradoEm, minutos: num(d.minutos) })
      break
    }
    case 'mensagem.enfileirada': {
      est.mensagensEnfileiradas.push({ mensagemId: str(d.mensagemId) ?? '', gatilho: str(d.gatilho) ?? '', contatoId: str(d.contatoId) ?? '', em: ev.registradoEm })
      break
    }
    case 'quase_evento.registrado': {
      est.quaseEventos.push({
        etapa: str(d.etapa) ?? '',
        descricao: str(d.descricao) ?? '',
        codigo: str(d.codigo),
        categoria: str(d.categoria) ?? categoriaLegada(str(d.codigo)),
        automatico: d.automatico === true,
        em: ev.registradoEm,
        porId: ev.autorId,
        camposDivergentes: (Array.isArray(d.camposDivergentes) ? d.camposDivergentes : []) as CampoLente[],
      })
      break
    }
    default:
      break
  }
  if (Date.parse(ev.registradoEm) > Date.parse(est.ultimoEventoEm)) est.ultimoEventoEm = ev.registradoEm
  if (typeof ev.seq === 'number' && ev.seq > est.ultimoSeq) est.ultimoSeq = ev.seq
}

/** Quase-eventos gravados antes do campo `categoria`: deduz pelo código (manuais sem categoria não contam). */
function categoriaLegada(codigo: string | null): string | null {
  if (codigo === 'HS1_DIVERGENCIA_LIO' || codigo === 'HS_LIO_TIME_OUT') return 'lio'
  if (codigo === 'HS3_DIVERGENCIA_IDENTIDADE_OLHO') return 'identidade'
  return null
}

/** Atualiza alertas (trilha de ativação) e hard stops após um evento. */
export function atualizarDerivados(est: EstadoInterno, em: string): void {
  const alertas = avaliarAlertasAtivos(est)
  const ativos = new Set(alertas.map((a) => a.id))
  for (const a of alertas) {
    const assinatura = `${a.nivel}|${a.titulo}|${a.descricao}`
    const ultimo = { titulo: a.titulo, descricao: a.descricao, nivel: a.nivel, origem: { ...a.origem } }
    const t = est.trilhaAlertas[a.id]
    if (!t) est.trilhaAlertas[a.id] = { geradoEm: em, ativo: true, atualizadoEm: em, atualizadoOrdem: est.contador, assinatura, ultimo }
    else if (!t.ativo || t.assinatura !== assinatura) Object.assign(t, { ativo: true, atualizadoEm: em, atualizadoOrdem: est.contador, assinatura, ultimo })
    else t.ultimo = ultimo
  }
  for (const [id, t] of Object.entries(est.trilhaAlertas)) {
    if (t.ativo && !ativos.has(id)) Object.assign(t, { ativo: false, atualizadoEm: em, atualizadoOrdem: est.contador })
  }
  atualizarHardStops(est, em, { alertas })
}

function ordenar(eventos: Evento[]): Evento[] {
  return [...eventos].sort((a, b) => {
    if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq
    return Date.parse(a.registradoEm) - Date.parse(b.registradoEm)
  })
}

/** Dobra os eventos num Estado. Funciona com o conjunto completo ou só com os visíveis ao ator. */
export function montarEstado(entrada: EntradaEstado): Estado {
  const est = estadoVazio(entrada)
  atualizarDerivados(est, entrada.episodio.abertoEm)
  for (const ev of ordenar(entrada.eventos)) {
    aplicarEvento(est, ev)
    atualizarDerivados(est, ev.registradoEm)
  }
  return est
}

export function interno(estado: Estado): EstadoInterno {
  return estado as EstadoInterno
}
