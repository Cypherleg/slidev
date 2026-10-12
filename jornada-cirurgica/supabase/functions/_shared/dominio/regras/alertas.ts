// Alertas (POP §1: "todo item marcado ALERTA chega ao cirurgião no mesmo dia"; "registrar e sinalizar" = sinalizado).
// Avaliação pura a partir das respostas atuais. Corrigir a resposta desativa o alerta (fica `inativo`), mas não o
// apaga em silêncio: toda mudança (geração, conteúdo, desativação) exige nova comunicação ao cirurgião.

import { ADM, D2, D7 } from '../modelos/ids.ts'
import type { Alerta, ModeloId, NivelAlerta, ValorMedicamento, ValorPessoa } from '../tipos.ts'
import { OLHO_EXTENSO } from '../tipos.ts'
import { diasEntre, formatarData, validarData } from '../util/datas.ts'
import { normalizarNome } from '../util/texto.ts'
import { dataReferencia, ehNao, ehSim, nomeMembro, valor, valorAplicavel } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'
import { detectarSegundoOlho } from './identificacao.ts'
import { classeDoItemD7, glp1Efetivo, medicamentoEfetivo, mudancasInformadas } from './medicamentos.ts'
import type { MedicamentoEfetivo } from './medicamentos.ts'
import { CLASSES_MEDICAMENTO } from '../modelos/ids.ts'

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
export const ALERTA_EXPECTATIVA = `d7:${D7.semOculos}`
export const PREFIXO_ALERTA_QUARENTENA = 'lente:quarentena:'
/** Itens do D-7 cuja correção depois do D-7 concluído exige motivo (observação) e nova comunicação. */
export const ITENS_CRITICOS_D7 = [D7.olhoPaciente, D7.alfaBloqueador, D7.anticoagulante, D7.antiagregante, D7.glp1]

/** Registro efetivo do medicamento da classe do item do D-7 (D-7, D-2 ou admissão; o mais recente vence). */
export function medicamento(est: EstadoInterno, itemIdD7: string): ValorMedicamento | null {
  const classe = classeDoItemD7(itemIdD7)
  if (!classe) return null
  return (classe === 'glp1' ? glp1Efetivo(est) : medicamentoEfetivo(est, classe))?.valor ?? null
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

function sufixoFonte(e: MedicamentoEfetivo | null): string {
  if (!e || e.fonte.modelo === 'd7') return ''
  return e.fonte.modelo === 'd2' ? ' Registro atualizado no D-2.' : ' Registro atualizado na admissão (D0).'
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

const ROTULO_CLASSE: Record<string, string> = Object.fromEntries([
  ...CLASSES_MEDICAMENTO.map((c) => [c.classe, c.rotulo]),
  ['outra', 'outro remédio'],
  ['estado_saude', 'estado de saúde'],
])

function descricaoMudanca(est: EstadoInterno, modelo: 'd2' | 'admissao'): string {
  const m = mudancasInformadas(est, modelo)
  const partes: string[] = []
  if (m.classes.length) partes.push(`O que mudou: ${m.classes.map((c) => ROTULO_CLASSE[c] ?? c).join(', ')}.`)
  if (m.observacao) partes.push(`Observação: ${m.observacao}.`)
  return partes.join(' ')
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
  // Déficit cognitivo: olho confirmado com o acompanhante (POP §11)
  const olhoAcomp = valorAplicavel(est, 'd7', D7.olhoAcompanhante)
  if (olhoAcomp !== undefined && olhoAcomp !== ep.olho) {
    add(
      'd7',
      D7.olhoAcompanhante,
      olhoAcomp === 'nao_sabe' ? 'Acompanhante não sabe qual olho será operado' : 'Olho dito pelo acompanhante diferente do pedido',
      `Pedido: ${OLHO_EXTENSO[ep.olho]}. Acompanhante: ${olhoAcomp === 'OD' || olhoAcomp === 'OE' ? OLHO_EXTENSO[olhoAcomp] : 'não sabe'} (POP §11).`,
      'alerta',
    )
  }
  // Primeiro ou segundo olho × registro do painel (POP §11)
  const ps = valor(est, 'd7', D7.primeiroSegundo)
  if (ps === 'primeiro' || ps === 'segundo') {
    const detectado = detectarSegundoOlho(ep.olho, est.entrada.contexto.anterioresDoPaciente)
    const dataDita = valorAplicavel(est, 'd7', D7.dataPrimeiroOlho)
    let motivo: string | null = null
    if (ps === 'primeiro' && detectado) motivo = 'Resposta "primeiro olho", mas há episódio do outro olho no painel.'
    else if (ps === 'segundo' && !detectado) motivo = 'Resposta "segundo olho", mas não há episódio do outro olho no painel.'
    else if (ps === 'segundo' && detectado?.dataPrimeiro && typeof dataDita === 'string' && dataDita !== detectado.dataPrimeiro) {
      motivo = `Data do 1º olho informada (${formatarData(dataDita)}) diferente da registrada no painel (${formatarData(detectado.dataPrimeiro)}).`
    }
    if (motivo) add('d7', D7.primeiroSegundo, 'Primeiro ou segundo olho: resposta diverge do registro do painel', `${motivo} Risco de usar biometria, plano ou caixa do 1º olho (POP §11).`, 'alerta')
  }

  // B. Medicamentos (registro efetivo: D-7, D-2 ou admissão)
  const ef = (itemD7: string) => {
    const classe = classeDoItemD7(itemD7)!
    return classe === 'glp1' ? glp1Efetivo(est) : medicamentoEfetivo(est, classe)
  }
  const origem = (e: MedicamentoEfetivo, itemD7: string): [ModeloId, string] => [e.fonte.modelo, e.fonte.modelo === 'd7' ? itemD7 : e.fonte.itemId]
  const medAlerta = (itemD7: string, titulo: string, texto: string, nivel: NivelAlerta = 'alerta') => {
    const e = ef(itemD7)
    if (!e || !usaOuUsou(e.valor)) return
    const [m, i] = origem(e, itemD7)
    add(m, i, titulo, `${descricaoUso(e.valor)} ${texto}${sufixoFonte(e)}`, nivel, `d7:${itemD7}`)
  }
  medAlerta(D7.alfaBloqueador, 'α1-bloqueador: risco de IFIS', 'Risco de IFIS (intraoperative floppy iris syndrome). Não suspender (POP §1.B).')
  medAlerta(D7.anticoagulante, 'Anticoagulante', 'Conduta é do cirurgião (POP §1.B).')
  medAlerta(D7.antiagregante, 'Antiagregante', 'Conduta é do cirurgião (POP §1.B).')
  const glp1 = glp1Efetivo(est)
  if (glp1 && usaOuUsou(glp1.valor)) {
    const g = glp1.valor
    const det: string[] = [descricaoUso(g)]
    if (g.aplicacao) det.push(`Aplicação ${g.aplicacao === 'semanal' ? 'semanal' : 'diária'}.`)
    if (g.ultimaAplicacao) det.push(`Última aplicação: ${formatarData(g.ultimaAplicacao)}.`)
    if (g.inicioOuAumentoUltimos3Meses !== undefined) det.push(`Início ou aumento de dose nos últimos 3 meses: ${g.inicioOuAumentoUltimos3Meses ? 'sim' : 'não'}.`)
    if (g.nauseaOuVomito !== undefined) det.push(`Náusea ou vômito: ${g.nauseaOuVomito ? 'sim' : 'não'}.`)
    det.push('A orientação é do cirurgião (POP §1.B).')
    const [m, i] = origem(glp1, D7.glp1)
    add(m, i, 'Análogo de GLP-1 ou tirzepatida', `${det.join(' ')}${sufixoFonte(glp1)}`, 'alerta', `d7:${D7.glp1}`)
    const data = dataReferencia(est)
    if (prazoGlp1Cabe(g, data) === false) {
      add(
        m,
        i,
        'GLP-1/tirzepatida: prazo de suspensão não cabe até a cirurgia — avisar o cirurgião no mesmo dia',
        `Última aplicação em ${formatarData(g.ultimaAplicacao!)} (${g.aplicacao === 'semanal' ? 'semanal: suspensão 7 dias antes' : 'diária: sem uso na véspera nem no dia'}); cirurgia em ${formatarData(data!)}. A conduta é do cirurgião (POP §1.B e §14).`,
        'alerta',
        ALERTA_GLP1_PRAZO,
      )
    }
  }
  medAlerta(D7.antipsicoticos, 'Antipsicótico ou psicotrópico (sinalizado)', 'Há relatos de IFIS com alguns antipsicóticos (POP §1.B).', 'sinalizado')

  // C. Patologias
  if (ehSim(est, 'd7', D7.demencia)) {
    const rep = valorAplicavel(est, 'd7', D7.representante) as ValorPessoa | undefined
    const nomeRep = rep && typeof rep === 'object' && rep.nome ? rep.nome : 'não registrado'
    add('d7', D7.demencia, 'Demência ou déficit cognitivo', `Representante: ${nomeRep}. Identificação pelo documento com foto, pulseira e acompanhante; olho confirmado com o acompanhante (POP §11).`, 'alerta')
  }
  if (ehSim(est, 'd7', D7.refrativa)) add('d7', D7.refrativa, 'Cirurgia refrativa prévia', 'LASIK, PRK ou RK: atenção ao cálculo da LIO (POP §1.C).', 'alerta')
  if (ehSim(est, 'd7', D7.olhoUnico)) {
    const qual = valorAplicavel(est, 'd7', D7.olhoUnicoQual)
    add('d7', D7.olhoUnico, qual === 'ambliopia' ? 'Ambliopia' : 'Olho único ou ambliopia', qual === 'ambliopia' ? 'Ambliopia (POP §1.C).' : 'Alerta por extenso "OLHO ÚNICO"; regras do POP §11.', 'alerta')
  }
  if (ehSim(est, 'd7', D7.olhoVermelho)) add('d7', D7.olhoVermelho, 'Olho vermelho, secreção ou terçol no D-7', 'Avaliação do cirurgião (POP §1.C e §13.7 item 7).', 'alerta')

  // E. Capacidade e logística
  if (ehNao(est, 'd7', D7.deitar)) add('d7', D7.deitar, 'Não consegue deitar reto e imóvel por 30 min', 'POP §1.E.', 'alerta')
  if (ehNao(est, 'd7', D7.compreende)) add('d7', D7.compreende, 'Não ouve ou não compreende comandos simples', 'POP §1.E.', 'alerta')
  if (valor(est, 'd7', D7.quemInstila) === 'ninguem') {
    add('d7', D7.quemInstila, 'Ninguém disponível para instilar os colírios', 'Alerta ao cirurgião antes da cirurgia, não na alta (POP §10).', 'alerta')
  }

  // F. Expectativa × LIO monofocal
  if (valor(est, 'd7', D7.semOculos) === 'sim' && lioMonofocal(ep.tipoLente)) {
    add('d7', D7.semOculos, 'Espera ficar sem óculos com LIO monofocal planejada', 'Realinhar expectativa em consulta antes do TCLE (POP §1.F). Enquanto não houver conduta, o TCLE não é enviado.', 'alerta')
  }

  // D-2 e admissão
  if (ehSim(est, 'd2', D2.mudancaMedicacao)) {
    add('d2', D2.mudancaMedicacao, 'Mudança de medicação informada no D-2', `Avisar o cirurgião (POP §13, procedimento 5; [S] o POP não marca como ALERTA). ${descricaoMudanca(est, 'd2')}`.trim(), 'alerta')
  }
  if (ehSim(est, 'admissao', ADM.mudouRemedio)) {
    add('admissao', ADM.mudouRemedio, 'Mudou remédio ou estado de saúde nos últimos 7 dias', `Avisar o cirurgião (POP §9.A). ${descricaoMudanca(est, 'admissao')}`.trim(), 'alerta')
  }
  if (ehNao(est, 'admissao', ADM.jejum)) {
    add('admissao', ADM.jejum, 'Jejum ou medicações fora da orientação', 'Avisar o cirurgião; a conduta é dele (regras em aberto no POP §14).', 'alerta')
  }

  // Quarentena da LIO: aviso ao cirurgião no mesmo dia (POP §3 e §13, procedimento 3)
  for (const c of est.ciclos) {
    const q = c.quarentena
    if (!q) continue
    const rotulo = q.etapa === 'cp1' ? 'checkpoint 1' : q.etapa === 'cp2' ? 'checkpoint 2' : 'Time Out'
    add(
      q.etapa,
      undefined,
      `LIO em quarentena (${rotulo}, ciclo ${c.numero})`,
      `${q.motivo} Avisar o cirurgião no mesmo dia; resolução só por escrito do cirurgião (POP §3).`,
      'alerta',
      `${PREFIXO_ALERTA_QUARENTENA}${c.numero}`,
    )
  }

  // Sistema: teach-back e quiz (POP §6)
  if (est.teachBack?.resultado === 'inadequado') {
    add('sistema', undefined, 'Teach-back inadequado', 'Orientação presencial com o cuidador que instila; avaliar capacidade (POP §6 e §11).', 'alerta', ALERTA_TEACH_BACK)
  }
  if (est.materiais.quiz.some((q) => q.tentativa.olhoConfere === false)) {
    add('sistema', undefined, 'Quiz: olho informado diverge da agenda', 'Divergência na pergunta 1 do quiz: ligação no mesmo dia (POP §6).', 'alerta', ALERTA_QUIZ_OLHO)
  }
  return r
}

export function ehAlertaQuarentena(id: string): boolean {
  return id.startsWith(PREFIXO_ALERTA_QUARENTENA)
}

function resolucaoQuarentena(est: EstadoInterno, id: string) {
  const n = Number(id.slice(PREFIXO_ALERTA_QUARENTENA.length))
  return est.ciclos.find((c) => c.numero === n)?.quarentena?.resolucao ?? null
}

/** Conduta válida: escrita pelo cirurgião DEPOIS da última mudança do alerta (quarentena: a resolução escrita). */
export function condutaValida(est: EstadoInterno, id: string): boolean {
  if (ehAlertaQuarentena(id)) return !!resolucaoQuarentena(est, id)
  const t = est.trilhaAlertas[id]
  const c = est.condutas[id]
  return !!t && t.ativo && !!c && c.ordem > t.atualizadoOrdem
}

/**
 * Comunicação válida: registrada DEPOIS da última mudança do alerta (gerado, conteúdo corrigido, desativado).
 * Conduta válida do cirurgião também vale como comunicação (ele foi informado).
 */
export function alertaComunicado(est: EstadoInterno, id: string): boolean {
  const t = est.trilhaAlertas[id]
  if (!t) return true
  const com = est.alertasComunicados[id]
  if (com && com.ordem > t.atualizadoOrdem) return true
  return condutaValida(est, id)
}

/** Alertas (nível ALERTA, ativos ou desativados por correção) que ainda exigem comunicação ao cirurgião. */
export function alertasSemComunicacao(est: EstadoInterno): Alerta[] {
  return alertasDoEstado(est, true).filter((a) => a.comunicacaoPendente)
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
    const ultimo = trilha?.ultimo
    const base: Alerta = a
      ? { id, origem: a.origem, titulo: a.titulo, descricao: a.descricao, nivel: a.nivel, geradoEm: trilha?.geradoEm ?? est.ultimoEventoEm }
      : {
          id,
          origem: ultimo?.origem ?? origemDoId(id),
          titulo: ultimo?.titulo ?? 'Alerta sem efeito',
          descricao: 'Resposta corrigida: este alerta deixou de valer. A correção também precisa chegar ao cirurgião.',
          nivel: ultimo?.nivel ?? 'alerta',
          geradoEm: trilha?.geradoEm ?? est.ultimoEventoEm,
          inativo: true,
        }
    if (trilha) base.atualizadoEm = trilha.atualizadoEm
    if (com) base.comunicado = { por: com.porId, porNome: nomeMembro(est, com.porId), em: com.em, via: com.via, cirurgiaoId: com.cirurgiaoId, ...(com.observacao ? { observacao: com.observacao } : {}) }
    if (ehAlertaQuarentena(id)) {
      const res = resolucaoQuarentena(est, id)
      if (res) base.conduta = { texto: res.texto, cirurgiaoId: res.cirurgiaoId, cirurgiaoNome: nomeMembro(est, res.cirurgiaoId), em: res.em }
    } else if (cond) {
      base.conduta = { texto: cond.texto, cirurgiaoId: cond.cirurgiaoId, cirurgiaoNome: nomeMembro(est, cond.cirurgiaoId), em: cond.em }
      if (a && !condutaValida(est, id)) base.condutaDesatualizada = true
    }
    base.comunicacaoPendente = base.nivel === 'alerta' && !alertaComunicado(est, id)
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
