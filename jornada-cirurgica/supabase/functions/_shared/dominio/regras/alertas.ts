// Alertas (POP §1: todo item ALERTA chega ao cirurgião no mesmo dia; "registrar e sinalizar" = sinalizado).
// Avaliação pura a partir das respostas atuais. Correção da resposta desativa o alerta (fica `inativo`).

import { ADM, D2, D7 } from '../modelos/ids.ts'
import type { Alerta, ModeloId, NivelAlerta, ValorMedicamento, ValorPessoa } from '../tipos.ts'
import { OLHO_EXTENSO } from '../tipos.ts'
import { diasEntre, formatarData, validarData } from '../util/datas.ts'
import { normalizarNome } from '../util/texto.ts'
import { dataReferencia, ehNao, ehSim, nomeMembro, valor } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'

export interface AlertaAtivo {
  id: string
  origem: { modelo: ModeloId | 'sistema'; itemId?: string }
  titulo: string
  descricao: string
  nivel: NivelAlerta
}

/** Ids de alertas que exigem conduta escrita antes do Sign In (HS6, POP §13.7 item 6 e §9.B). */
export const ALERTAS_HS6 = [`d7:${D7.alfaBloqueador}`, `d7:${D7.anticoagulante}`, `d7:${D7.antiagregante}`]
export const ALERTA_OLHO_VERMELHO_D7 = `d7:${D7.olhoVermelho}`
export const ALERTA_GLP1_PRAZO = `d7:${D7.glp1}.prazo`
export const ALERTA_TEACH_BACK = 'sistema:teach_back_inadequado'
export const ALERTA_QUIZ_OLHO = 'sistema:quiz_olho'

export function medicamento(est: EstadoInterno, itemId: string): ValorMedicamento | null {
  const v = valor(est, 'd7', itemId)
  return v && typeof v === 'object' && !Array.isArray(v) && 'uso' in v ? (v as ValorMedicamento) : null
}

export function usaOuUsou(m: ValorMedicamento | null): boolean {
  return !!m && (m.uso === 'usa' || m.uso === 'ja_usou')
}

function descricaoUso(m: ValorMedicamento): string {
  const partes = [m.uso === 'usa' ? 'Uso atual.' : 'Uso passado.']
  if (m.nomes && m.nomes.trim()) partes.push(`Informado: ${m.nomes.trim()}.`)
  if (m.detalhes && m.detalhes.trim()) partes.push(`Detalhes: ${m.detalhes.trim()}.`)
  return partes.join(' ')
}

/** LIO monofocal planejada (tipo de lente do episódio). Tórica fica fora: o POP lista as categorias à parte. */
export function lioMonofocal(tipoLente: string): boolean {
  return normalizarNome(tipoLente).includes('MONOFOCAL')
}

/**
 * GLP-1/tirzepatida: o prazo de suspensão cabe até a cirurgia?
 * Interpretação ([S], a confirmar): semanal → última aplicação pelo menos 7 dias antes da data da cirurgia;
 * diária → sem uso na véspera nem no dia (última aplicação pelo menos 2 dias antes).
 * null = não dá para calcular (sem data, sem tipo de aplicação ou sem última aplicação).
 */
export function prazoGlp1Cabe(m: ValorMedicamento | null, dataCirurgia: string | null): boolean | null {
  if (!m || m.uso !== 'usa' || !dataCirurgia || !m.aplicacao || !m.ultimaAplicacao || !validarData(m.ultimaAplicacao)) return null
  const dias = diasEntre(m.ultimaAplicacao, dataCirurgia)
  return m.aplicacao === 'semanal' ? dias >= 7 : dias >= 2
}

export function avaliarAlertasAtivos(est: EstadoInterno): AlertaAtivo[] {
  const r: AlertaAtivo[] = []
  const ep = est.entrada.episodio
  const add = (modelo: ModeloId | 'sistema', itemId: string | undefined, titulo: string, descricao: string, nivel: NivelAlerta, id?: string) =>
    r.push({ id: id ?? `${modelo}:${itemId}`, origem: itemId ? { modelo, itemId } : { modelo }, titulo, descricao, nivel })

  // A. Olho dito pelo paciente × pedido (derivado: "pedido e paciente coincidem?")
  const olhoPac = valor(est, 'd7', D7.olhoPaciente)
  if (olhoPac !== undefined && olhoPac !== ep.olho) {
    add(
      'd7',
      D7.olhoPaciente,
      olhoPac === 'nao_sabe' ? 'Paciente não sabe qual olho vai operar' : 'Olho dito pelo paciente diferente do pedido',
      `Pedido: ${OLHO_EXTENSO[ep.olho]}. Paciente: ${olhoPac === 'OD' || olhoPac === 'OE' ? OLHO_EXTENSO[olhoPac] : 'não sabe'}. Pedido e paciente não coincidem (POP §1.A).`,
      'alerta',
    )
  }

  // B. Medicamentos
  const alfa = medicamento(est, D7.alfaBloqueador)
  if (usaOuUsou(alfa)) add('d7', D7.alfaBloqueador, 'α1-bloqueador: risco de IFIS', `${descricaoUso(alfa!)} Risco de IFIS (intraoperative floppy iris syndrome). Não suspender (POP §1.B).`, 'alerta')
  const antic = medicamento(est, D7.anticoagulante)
  if (usaOuUsou(antic)) add('d7', D7.anticoagulante, 'Anticoagulante', `${descricaoUso(antic!)} Conduta é do cirurgião (POP §1.B).`, 'alerta')
  const antiag = medicamento(est, D7.antiagregante)
  if (usaOuUsou(antiag)) add('d7', D7.antiagregante, 'Antiagregante', `${descricaoUso(antiag!)} Conduta é do cirurgião (POP §1.B).`, 'alerta')
  const glp1 = medicamento(est, D7.glp1)
  if (usaOuUsou(glp1)) {
    const det: string[] = [descricaoUso(glp1!)]
    if (glp1!.aplicacao) det.push(`Aplicação ${glp1!.aplicacao === 'semanal' ? 'semanal' : 'diária'}.`)
    if (glp1!.ultimaAplicacao) det.push(`Última aplicação: ${formatarData(glp1!.ultimaAplicacao)}.`)
    if (glp1!.inicioOuAumentoUltimos3Meses !== undefined) det.push(`Início ou aumento de dose nos últimos 3 meses: ${glp1!.inicioOuAumentoUltimos3Meses ? 'sim' : 'não'}.`)
    if (glp1!.nauseaOuVomito !== undefined) det.push(`Náusea ou vômito: ${glp1!.nauseaOuVomito ? 'sim' : 'não'}.`)
    det.push('A orientação é do cirurgião (POP §1.B).')
    add('d7', D7.glp1, 'Análogo de GLP-1 ou tirzepatida', det.join(' '), 'alerta')
    const data = dataReferencia(est)
    const cabe = prazoGlp1Cabe(glp1, data)
    if (cabe === false) {
      add(
        'd7',
        D7.glp1,
        'GLP-1/tirzepatida: prazo de suspensão não cabe até a cirurgia — avisar o cirurgião no mesmo dia',
        `Última aplicação em ${formatarData(glp1!.ultimaAplicacao!)} (${glp1!.aplicacao === 'semanal' ? 'semanal: suspensão 7 dias antes' : 'diária: sem uso na véspera nem no dia'}); cirurgia em ${formatarData(data!)}. A conduta é do cirurgião (POP §1.B e §14).`,
        'alerta',
        ALERTA_GLP1_PRAZO,
      )
    }
  }
  const antip = medicamento(est, D7.antipsicoticos)
  if (usaOuUsou(antip)) add('d7', D7.antipsicoticos, 'Antipsicótico ou psicotrópico (sinalizado)', `${descricaoUso(antip!)} Há relatos de IFIS com alguns antipsicóticos (POP §1.B).`, 'sinalizado')

  // C. Patologias
  if (ehSim(est, 'd7', D7.demencia)) {
    const rep = valor(est, 'd7', D7.representante) as ValorPessoa | undefined
    const nomeRep = rep && typeof rep === 'object' && rep.nome ? rep.nome : 'não registrado'
    add('d7', D7.demencia, 'Demência ou déficit cognitivo', `Representante: ${nomeRep}. Identificação pelo documento com foto, pulseira e acompanhante; olho confirmado com o acompanhante (POP §11).`, 'alerta')
  }
  if (ehSim(est, 'd7', D7.refrativa)) add('d7', D7.refrativa, 'Cirurgia refrativa prévia', 'LASIK, PRK ou RK: atenção ao cálculo da LIO (POP §1.C).', 'alerta')
  if (ehSim(est, 'd7', D7.olhoUnico)) add('d7', D7.olhoUnico, 'Olho único ou ambliopia', 'Alerta por extenso "OLHO ÚNICO"; regras do POP §11.', 'alerta')
  if (ehSim(est, 'd7', D7.olhoVermelho)) add('d7', D7.olhoVermelho, 'Olho vermelho, secreção ou terçol no D-7', 'Avaliação do cirurgião (POP §1.C e §13.7 item 7).', 'alerta')

  // E. Capacidade e logística
  if (ehNao(est, 'd7', D7.deitar)) add('d7', D7.deitar, 'Não consegue deitar reto e imóvel por 30 min', 'POP §1.E.', 'alerta')
  if (ehNao(est, 'd7', D7.compreende)) add('d7', D7.compreende, 'Não ouve ou não compreende comandos simples', 'POP §1.E.', 'alerta')
  if (valor(est, 'd7', D7.quemInstila) === 'ninguem') {
    add('d7', D7.quemInstila, 'Ninguém disponível para instilar os colírios', 'Alerta ao cirurgião antes da cirurgia, não na alta (POP §10).', 'alerta')
  }

  // F. Expectativa × LIO monofocal
  if (valor(est, 'd7', D7.semOculos) === 'sim' && lioMonofocal(ep.tipoLente)) {
    add('d7', D7.semOculos, 'Espera ficar sem óculos com LIO monofocal planejada', 'Realinhar expectativa em consulta antes do TCLE (POP §1.F).', 'alerta')
  }

  // D-2 e admissão
  if (ehSim(est, 'd2', D2.mudancaMedicacao)) add('d2', D2.mudancaMedicacao, 'Mudança de medicação informada no D-2', 'Avisar o cirurgião (POP §13, procedimento 5).', 'alerta')
  if (ehSim(est, 'admissao', ADM.mudouRemedio)) add('admissao', ADM.mudouRemedio, 'Mudou remédio ou estado de saúde nos últimos 7 dias', 'Avisar o cirurgião (POP §9.A).', 'alerta')

  // Sistema: teach-back e quiz (POP §6)
  if (est.teachBack?.resultado === 'inadequado') {
    add('sistema', undefined, 'Teach-back inadequado', 'Orientação presencial com o cuidador que instila; avaliar capacidade (POP §6 e §11).', 'alerta', ALERTA_TEACH_BACK)
  }
  if (est.materiais.quiz.some((q) => q.tentativa.olhoConfere === false)) {
    add('sistema', undefined, 'Quiz: olho informado diverge da agenda', 'Divergência na pergunta 1 do quiz: ligação no mesmo dia (POP §6).', 'alerta', ALERTA_QUIZ_OLHO)
  }
  return r
}

/** Alertas com trilha (gerado em), comunicação e conduta. `incluirInativos` para a visão do episódio. */
export function alertasDoEstado(est: EstadoInterno, incluirInativos = false): Alerta[] {
  const ativos = avaliarAlertasAtivos(est)
  const porId = new Map(ativos.map((a) => [a.id, a]))
  const ids = new Set<string>(ativos.map((a) => a.id))
  if (incluirInativos) for (const id of Object.keys(est.trilhaAlertas)) ids.add(id)
  const r: Alerta[] = []
  for (const id of ids) {
    const a = porId.get(id)
    const trilha = est.trilhaAlertas[id]
    const com = est.alertasComunicados[id]
    const cond = est.condutas[id]
    const base: Alerta = a
      ? { id, origem: a.origem, titulo: a.titulo, descricao: a.descricao, nivel: a.nivel, geradoEm: trilha?.geradoEm ?? est.ultimoEventoEm }
      : {
          id,
          origem: origemDoId(id),
          titulo: 'Alerta sem efeito (resposta corrigida)',
          descricao: 'A resposta que gerou este alerta foi corrigida.',
          nivel: 'alerta',
          geradoEm: trilha?.geradoEm ?? est.ultimoEventoEm,
          inativo: true,
        }
    if (com) base.comunicado = { por: com.porId, porNome: nomeMembro(est, com.porId), em: com.em, via: com.via, cirurgiaoId: com.cirurgiaoId, ...(com.observacao ? { observacao: com.observacao } : {}) }
    if (cond) base.conduta = { texto: cond.texto, cirurgiaoId: cond.cirurgiaoId, cirurgiaoNome: nomeMembro(est, cond.cirurgiaoId), em: cond.em }
    r.push(base)
  }
  return r.sort((x, y) => Date.parse(x.geradoEm) - Date.parse(y.geradoEm) || x.id.localeCompare(y.id))
}

function origemDoId(id: string): Alerta['origem'] {
  const i = id.indexOf(':')
  const modelo = id.slice(0, i) as ModeloId | 'sistema'
  const resto = id.slice(i + 1)
  return modelo === 'sistema' ? { modelo } : { modelo, itemId: resto.replace(/\.prazo$/, '') }
}

/** Alerta de nível ALERTA comunicado ao cirurgião (ou com conduta já escrita por ele). */
export function alertaComunicado(est: EstadoInterno, id: string): boolean {
  return !!est.alertasComunicados[id] || !!est.condutas[id]
}

