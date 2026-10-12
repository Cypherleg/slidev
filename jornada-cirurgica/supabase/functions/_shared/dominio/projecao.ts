// Projeção do episódio filtrada pelo papel do ator (conferência cega aplicada aqui também):
// mesmo que o estado contenha os valores, a visão não os entrega a quem não pode ver.
//  - plano/chegada, respostas do checkpoint 1 e foto do plano: concierge, cirurgião, gestora;
//  - valores e respostas do checkpoint 2: conferente, cirurgião, gestora;
//  - leitura do Time Out: circulante, cirurgião, gestora.

import type { Ator, Estado } from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import type {
  CodigoHardStop,
  DadosChegadaLente,
  DadosPlanoLente,
  EpisodioVisao,
  LenteVisao,
  MateriaisVisao,
  RespostaAtual,
  ValorAlergia,
  ValoresLente,
  ValorMedicamento,
} from './tipos.ts'
import { OLHO_EXTENSO, ORDEM_MODELOS } from './tipos.ts'
import type { LeituraTimeOut } from './contrato.ts'
import { interno } from './estado/montar.ts'
import {
  cicloAtual,
  chegadaRef,
  dadosChegada,
  dadosCp2,
  dadosPlano,
  etapaLente,
  nomeMembro,
  planoRef,
  cp1Conclusao,
  rank,
  RANK,
  registroLente,
  respostasDoModelo,
  itemDoModelo,
  valor,
  valorAplicavel,
} from './estado/consultas.ts'
import type { EstadoInterno } from './estado/tipos.ts'
import { alertasDoEstado, medicamento } from './regras/alertas.ts'
import { ADM, D7, ITENS_ALERGIA } from './modelos/ids.ts'
import { blocosVisao } from './regras/blocos.ts'
import { calcularDots } from './regras/dots.ts'
import { DEFINICAO_POR_CODIGO, hardStopsAbertos } from './regras/hardstops.ts'
import { calcularIdentificacao } from './regras/identificacao.ts'
import { contatoHumanoQuiz, pendenciasDoEstado } from './regras/pendencias.ts'
import { motivoSuspensaoAvisos } from './mensagens.ts'
import { PAPEIS_LEITURA, temAlgumPapel } from './permissoes.ts'
import { PRE } from './decidir.ts'
import { dataLocal, idadeEm, inicioDoDiaLocal, somarDias } from './util/datas.ts'

function respostasVisiveis(est: EstadoInterno, ator: Ator): EpisodioVisao['respostas'] {
  const r: EpisodioVisao['respostas'] = {}
  for (const m of ORDEM_MODELOS) {
    if (m === 'cp1' && !temAlgumPapel(ator.papeis, PAPEIS_LEITURA.conferencia_1)) continue
    if (m === 'cp2' && !temAlgumPapel(ator.papeis, PAPEIS_LEITURA.conferencia_2)) continue
    const resp = respostasDoModelo(est, m)
    const out: Record<string, RespostaAtual> = {}
    for (const [id, x] of Object.entries(resp)) {
      out[id] = {
        valor: x.valor,
        observacao: x.observacao,
        autorId: x.autorId,
        autorNome: nomeMembro(est, x.autorId),
        registradoEm: x.registradoEm,
        foraDeHora: x.foraDeHora,
        correcoes: x.correcoes,
      }
    }
    if (Object.keys(out).length) r[m] = out
  }
  return r
}

function lenteVisao(est: EstadoInterno, ator: Ator): LenteVisao {
  const c = cicloAtual(est)
  const v: LenteVisao = { ciclo: c.numero, etapa: etapaLente(est), origemCiclo: c.origem }
  const veC1 = temAlgumPapel(ator.papeis, PAPEIS_LEITURA.conferencia_1)
  const veC2 = temAlgumPapel(ator.papeis, PAPEIS_LEITURA.conferencia_2)
  const veTo = temAlgumPapel(ator.papeis, PAPEIS_LEITURA.time_out)
  if (veC1) {
    const p = dadosPlano(est)
    const pr = planoRef(est)
    if (p && pr) v.plano = { ...(p as DadosPlanoLente), registradoPor: nomeMembro(est, pr.porId), registradoEm: pr.em }
    const ch = dadosChegada(est)
    const cr = chegadaRef(est)
    if (ch && cr) v.chegada = { ...(ch as DadosChegadaLente), registradoPor: nomeMembro(est, cr.porId), registradoEm: cr.em }
    const foto = [...est.anexos].reverse().find((a) => a.tipoAnexo === 'foto_plano' && a.ciclo <= c.numero)
    v.fotoPlanoAnexoId = foto?.anexoId ?? null
  }
  if (veC2) {
    const cp2 = dadosCp2(est)
    if (cp2 && c.cp2Registro) v.cp2 = { ...(cp2 as ValoresLente), registradoPor: nomeMembro(est, c.cp2Registro.porId), registradoEm: c.cp2Registro.em }
  }
  if (veTo && c.timeOutRegistro) {
    const reg = registroLente(est, c.timeOutRegistro.registroId)
    if (reg) {
      const l = reg.dados as LeituraTimeOut
      v.timeOut = { modelo: l.modelo, dioptria: l.dioptria, cilindro: l.cilindro, eixo: l.eixo, registradoPor: nomeMembro(est, c.timeOutRegistro.porId), registradoEm: c.timeOutRegistro.em }
    }
  }
  if (c.cp2Resultado) v.cp2Resultado = { confere: c.cp2Resultado.confere, camposDivergentes: [...c.cp2Resultado.camposDivergentes], em: c.cp2Resultado.em, porNome: nomeMembro(est, c.cp2Resultado.porId) }
  if (c.timeOutResultado) {
    v.timeOutResultado = { confere: c.timeOutResultado.confere, camposDivergentes: [...c.timeOutResultado.camposDivergentes], em: c.timeOutResultado.em, porNome: nomeMembro(est, c.timeOutResultado.porId) }
  }
  // Quarentena: a do ciclo atual (aberta) ou a última resolvida.
  const comQ = [...est.ciclos].reverse().find((x) => x.quarentena)
  if (comQ?.quarentena) {
    const q = comQ.quarentena
    v.quarentena = {
      aberta: q.aberta,
      etapa: q.etapa,
      motivo: q.motivo,
      desde: q.desde,
      ...(q.resolucao ? { resolucao: { texto: q.resolucao.texto, cirurgiaoNome: nomeMembro(est, q.resolucao.cirurgiaoId), em: q.resolucao.em, acao: q.resolucao.acao } } : {}),
    }
  }
  const falta: NonNullable<LenteVisao['faltaNoCiclo']> = []
  if (!planoRef(est)) falta.push('plano')
  if (!chegadaRef(est)) falta.push('chegada')
  if (!cp1Conclusao(est)) falta.push('cp1')
  if (!c.cp2) falta.push('cp2')
  if (rank(est) >= RANK.admitido && rank(est) < RANK.time_out_concluido && !c.timeOutResultado?.confere) falta.push('time_out')
  v.faltaNoCiclo = falta
  v.ciclosAnteriores = est.ciclos.filter((x) => x.encerrado).map((x) => ({ ciclo: x.numero, encerradoEm: x.encerrado!.em, motivo: x.encerrado!.motivo }))
  return v
}

function materiaisVisao(est: EstadoInterno, agora: string): MateriaisVisao {
  const m = est.materiais
  const enviados: MateriaisVisao['enviados'] = []
  for (const e of m.enviados) {
    const msg = est.entrada.mensagens.find((x) => x.id === e.mensagemId)
    for (const mat of e.materiais) enviados.push({ materialId: mat.id, titulo: mat.titulo, versao: mat.versao, em: e.em, estado: msg?.estado ?? 'pendente' })
  }
  let contatoHumano: MateriaisVisao['contatoHumano'] = null
  const q = contatoHumanoQuiz(est)
  if (q) contatoHumano = q
  else if (est.teachBack?.resultado === 'inadequado') contatoHumano = { motivo: 'teach_back_inadequado', desde: est.teachBack.em }
  else {
    const data = est.agenda.dataCirurgia
    if (data && m.enviados.length && !m.abertoEm) {
      const d3 = inicioDoDiaLocal(somarDias(data, -3))
      if (Date.parse(agora) >= Date.parse(d3) && !est.teachBacks.some((t) => Date.parse(t.em) >= Date.parse(d3))) {
        contatoHumano = { motivo: 'link_nao_aberto_d3', desde: d3 }
      }
    }
  }
  return {
    linkCriadoEm: m.linkCriadoEm,
    linkExpiraEm: m.linkExpiraEm,
    enviados,
    abertoEm: m.abertoEm,
    quiz: m.quiz.map((x) => ({ ...x.tentativa })),
    contatoHumano,
  }
}

/** O que verbalizar no Time Out para todo paciente, mesmo que negativo (POP §2 regra 4, §9.C). */
function verbalizacaoTimeOut(est: EstadoInterno): NonNullable<EpisodioVisao['verbalizacaoTimeOut']> {
  const alergias = ITENS_ALERGIA.filter((id) => (valor(est, 'd7', id) as ValorAlergia | undefined)?.tem === true).map((id) => {
    const v = valor(est, 'd7', id) as ValorAlergia
    const nome = (itemDoModelo(est, 'd7', id)?.texto ?? id).replace(/^Alergia a /, '').replace(/ \(descrever a reação\)$/, '')
    return v.reacao ? `${nome} (${v.reacao})` : nome
  })
  const nova = valorAplicavel(est, 'admissao', ADM.alergiaNova)
  if (typeof nova === 'string' && nova.trim()) alergias.push(`${nova.trim()} (informada na admissão)`)
  const uso = (m: ValorMedicamento | null, rotulo: string) =>
    !m ? `${rotulo}: não registrado` : m.uso === 'nao' ? `${rotulo}: não usa` : `${rotulo}: ${m.uso === 'usa' ? 'usa' : 'já usou'}${m.nomes ? ` (${m.nomes})` : ''}`
  const antic = medicamento(est, D7.anticoagulante)
  const antiag = medicamento(est, D7.antiagregante)
  return {
    alergias: alergias.length ? alergias : [valor(est, 'd7', D7.nenhumaAlergia) === 'sim' ? 'Nenhuma alergia conhecida' : 'Alergias não registradas'],
    alfaBloqueador: uso(medicamento(est, D7.alfaBloqueador), 'α-bloqueador'),
    anticoagulacao: `${uso(antic, 'Anticoagulante')}; ${uso(antiag, 'antiagregante')}`,
  }
}

/** Mapa ação → { permitido, motivo } para o ator (nomes das ações de api/contrato.ts). */
export function permissoesDoAtor(est: EstadoInterno, ator: Ator): Record<string, { permitido: boolean; motivo?: string }> {
  const r: Record<string, { permitido: boolean; motivo?: string }> = {}
  const testar = (acao: string, f: () => unknown) => {
    try {
      f()
      r[acao] = { permitido: true }
    } catch (e) {
      r[acao] = { permitido: false, motivo: e instanceof ErroDominio ? e.message : 'Não permitido.' }
    }
  }
  const sempre = (acao: string) => (r[acao] = { permitido: true })
  sempre('episodio.obter')
  testar('episodio.agendar', () => PRE.agendar(est, ator))
  for (const m of ORDEM_MODELOS) {
    testar(`checklist.responder:${m}`, () => PRE.responder(est, ator, m))
    testar(`bloco.concluir:${m}`, () => PRE.concluir(est, ator, m))
  }
  const algum = (prefixo: string) => {
    const lista = ORDEM_MODELOS.map((m) => r[`${prefixo}:${m}`])
    const ok = lista.find((x) => x.permitido)
    return ok ? { permitido: true } : { permitido: false, motivo: lista.find((x) => x.motivo)?.motivo ?? 'Não permitido.' }
  }
  r['checklist.responder'] = algum('checklist.responder')
  r['bloco.concluir'] = algum('bloco.concluir')
  testar('alerta.comunicar', () => PRE.comunicarAlerta(est, ator))
  testar('alerta.conduta', () => PRE.condutaAlerta(est, ator))
  testar('contato.salvar', () => PRE.contato(est, ator, 'contato.salvo'))
  testar('contato.remover', () => PRE.contato(est, ator, 'contato.removido'))
  testar('contato.confirmar', () => PRE.contato(est, ator, 'contato.confirmado'))
  testar('orientacoes.teach_back', () => PRE.teachBack(est, ator))
  testar('lente.plano', () => PRE.lenteConcierge(est, ator, 'plano'))
  testar('lente.chegada', () => PRE.lenteConcierge(est, ator, 'chegada'))
  testar('lente.cp2', () => PRE.cp2(est, ator))
  testar('lente.time_out', () => PRE.timeOut(est, ator))
  testar('lente.resolver_quarentena', () => PRE.resolverQuarentena(est, ator))
  testar('lente.troca_d0', () => PRE.trocaD0(est, ator))
  testar('anexo.enviar', () => PRE.anexo(est, ator))
  r['anexo.url'] = temAlgumPapel(ator.papeis, PAPEIS_LEITURA.foto_plano) ? { permitido: true } : { permitido: false, motivo: 'Foto do plano: só concierge, cirurgião e gestora.' }
  testar('tcle.status', () => PRE.tcle(est, ator))
  testar('materiais.previa', () => PRE.materiais(est, ator))
  testar('materiais.enviar', () => PRE.materiais(est, ator))
  const abertos = hardStopsAbertos(est).filter((h) => h.exigeResolucaoEscrita)
  for (const h of abertos) testar(`hardstop.resolver:${h.codigo}`, () => PRE.resolverHardStop(est, ator, h.codigo as CodigoHardStop))
  r['hardstop.resolver'] = abertos.some((h) => r[`hardstop.resolver:${h.codigo}`]?.permitido)
    ? { permitido: true }
    : { permitido: false, motivo: abertos.length ? 'Sem competência para resolver os hard stops abertos.' : 'Nenhum hard stop de resolução escrita aberto.' }
  testar('intercorrencia.registrar', () => PRE.intercorrencia(est, ator))
  testar('episodio.suspender', () => PRE.suspender(est, ator, 'suspenso'))
  testar('episodio.cancelar', () => PRE.suspender(est, ator, 'cancelado'))
  testar('avisos.atraso', () => {
    PRE.atraso(est, ator)
    const m = motivoSuspensaoAvisos(est)
    if (m) throw new ErroDominio('ESTADO', m)
  })
  testar('quase_evento.registrar', () => PRE.quaseEvento(est, ator))
  testar('etiquetas.gerar', () => PRE.etiqueta(est, ator))
  testar('etiqueta.copiada', () => PRE.etiqueta(est, ator))
  return r
}

/** Visão do episódio filtrada pelo papel do ator. */
export function projetarVisao(estado: Estado, ator: Ator, agora: string): EpisodioVisao {
  const est = interno(estado)
  const ent = est.entrada
  const ep = ent.episodio
  const motivoAvisos = motivoSuspensaoAvisos(est)
  const blocos = blocosVisao(est)
  const visao: EpisodioVisao = {
    episodio: {
      id: ep.id,
      olho: ep.olho,
      olhoExtenso: OLHO_EXTENSO[ep.olho],
      estado: est.estado,
      tipoCirurgia: ep.tipoCirurgia,
      tipoLente: ep.tipoLente,
      dataSugerida: est.agenda.dataSugerida,
      dataCirurgia: est.agenda.dataCirurgia,
      horario: est.agenda.horario,
      ordem: est.agenda.ordem,
      cirurgiao: { id: ep.cirurgiaoId, nome: nomeMembro(est, ep.cirurgiaoId) },
      versao: ep.versao,
      versoesModelos: { ...ep.versoesModelos },
      abertoEm: ep.abertoEm,
    },
    paciente: { ...ent.paciente, idade: idadeEm(ent.paciente.dataNascimento, dataLocal(agora)) },
    modelos: ent.modelos,
    respostas: respostasVisiveis(est, ator),
    blocos,
    alertas: alertasDoEstado(est, true),
    hardStops: hardStopsAbertos(est),
    dots: calcularDots(est),
    identificacao: calcularIdentificacao(est),
    contatos: Object.values(est.contatos).map((c) => ({ ...c })),
    lente: lenteVisao(est, ator),
    tcle: { status: est.tcle.status, link: est.tcle.link, historico: est.tcle.historico.map((h) => ({ status: h.status, em: h.em, porNome: nomeMembro(est, h.porId) })) },
    materiais: materiaisVisao(est, agora),
    avisosFamilia: { suspensos: !!motivoAvisos, ...(motivoAvisos ? { motivoSuspensao: motivoAvisos } : {}), mensagens: ent.mensagens.map((m) => ({ ...m })) },
    pendencias: pendenciasDoEstado(est, agora),
    intercorrencias: est.intercorrencias.map((i) => ({ descricao: i.descricao, em: i.em, porNome: nomeMembro(est, i.porId) })),
    teachBack: est.teachBack
      ? { resultado: est.teachBack.resultado, ...(est.teachBack.observacao ? { observacao: est.teachBack.observacao } : {}), em: est.teachBack.em, porNome: nomeMembro(est, est.teachBack.porId) }
      : null,
    permissoes: permissoesDoAtor(est, ator),
    verbalizacaoTimeOut: verbalizacaoTimeOut(est),
    hardStopsResolvidos: est.resolucoesHardStop.map((r) => ({
      codigo: r.codigo,
      titulo: DEFINICAO_POR_CODIGO[r.codigo]?.titulo ?? r.codigo,
      resolucao: r.texto,
      porNome: nomeMembro(est, r.porId),
      em: r.em,
    })),
  }
  return visao
}

