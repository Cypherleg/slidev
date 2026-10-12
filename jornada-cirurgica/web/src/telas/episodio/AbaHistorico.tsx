// Histórico legível do episódio a partir da visão (blocos concluídos, comunicações, condutas, TCLE, lente sem valores,
// intercorrências, materiais e avisos). O registro completo de eventos (com correções) está no servidor.
import type { EpisodioVisao, ModeloId } from '@dominio/tipos.ts'
import { ORDEM_MODELOS } from '@dominio/tipos.ts'
import { Cartao, Selo } from '../../componentes/base/index.tsx'
import { formatarDataHora } from '../../componentes/formato.ts'
import { ROTULO_CAMPO_LENTE, ROTULO_ESTADO_MENSAGEM, ROTULO_MODELO, ROTULO_TCLE, ROTULO_TEACH_BACK, ROTULO_VIA, rotuloGatilho } from '../../componentes/rotulos.ts'

export interface ItemHistorico {
  em: string
  titulo: string
  detalhe?: string
  quem?: string
  foraDeHora?: boolean
  tipo: 'bloco' | 'alerta' | 'lente' | 'tcle' | 'contato' | 'material' | 'intercorrencia' | 'aviso' | 'episodio'
}

export function montarHistorico(v: EpisodioVisao): ItemHistorico[] {
  const itens: ItemHistorico[] = []
  itens.push({ em: v.episodio.abertoEm, titulo: 'Episódio aberto (D-7)', tipo: 'episodio' })
  for (const m of ORDEM_MODELOS as readonly ModeloId[]) {
    const c = v.blocos[m]?.concluido
    if (!c) continue
    itens.push({
      em: c.em,
      titulo: `${v.modelos[m]?.titulo ?? ROTULO_MODELO[m]} concluído`,
      quem: c.porNome,
      detalhe: [c.leitorNome ? `leu em voz alta: ${c.leitorNome}` : '', c.confirmadorNome ? `confirmou: ${c.confirmadorNome}` : ''].filter(Boolean).join('; ') || undefined,
      foraDeHora: c.foraDeHora,
      tipo: 'bloco',
    })
  }
  for (const a of v.alertas) {
    if (a.comunicado) itens.push({ em: a.comunicado.em, titulo: `Alerta comunicado ao cirurgião: ${a.titulo}`, quem: a.comunicado.porNome, detalhe: `via ${ROTULO_VIA[a.comunicado.via] ?? a.comunicado.via}`, tipo: 'alerta' })
    if (a.conduta) itens.push({ em: a.conduta.em, titulo: `Conduta escrita: ${a.titulo}`, quem: a.conduta.cirurgiaoNome, detalhe: a.conduta.texto, tipo: 'alerta' })
  }
  const l = v.lente
  if (l.plano) itens.push({ em: l.plano.registradoEm, titulo: 'Plano de LIO registrado', quem: l.plano.registradoPor, tipo: 'lente' })
  if (l.chegada) itens.push({ em: l.chegada.registradoEm, titulo: 'Chegada da LIO registrada', quem: l.chegada.registradoPor, tipo: 'lente' })
  if (l.cp2Resultado)
    itens.push({
      em: l.cp2Resultado.em,
      titulo: `Checkpoint 2: ${l.cp2Resultado.confere ? 'confere' : 'DIVERGE'}`,
      quem: l.cp2Resultado.porNome,
      detalhe: l.cp2Resultado.confere ? undefined : `campos: ${l.cp2Resultado.camposDivergentes.map(c => ROTULO_CAMPO_LENTE[c]).join(', ')}`,
      tipo: 'lente',
    })
  if (l.quarentena) itens.push({ em: l.quarentena.desde, titulo: 'Lente em quarentena', detalhe: l.quarentena.motivo, tipo: 'lente' })
  if (l.quarentena?.resolucao) itens.push({ em: l.quarentena.resolucao.em, titulo: 'Quarentena resolvida por escrito', quem: l.quarentena.resolucao.cirurgiaoNome, detalhe: l.quarentena.resolucao.texto, tipo: 'lente' })
  if (l.timeOutResultado)
    itens.push({
      em: l.timeOutResultado.em,
      titulo: `Leitura da LIO no Time Out: ${l.timeOutResultado.confere ? 'confere' : 'DIVERGE'}`,
      quem: l.timeOutResultado.porNome,
      detalhe: l.timeOutResultado.confere ? undefined : `campos: ${l.timeOutResultado.camposDivergentes.map(c => ROTULO_CAMPO_LENTE[c]).join(', ')}`,
      tipo: 'lente',
    })
  for (const h of v.tcle.historico) itens.push({ em: h.em, titulo: `TCLE: ${ROTULO_TCLE[h.status] ?? h.status}`, quem: h.porNome, tipo: 'tcle' })
  if (v.teachBack) itens.push({ em: v.teachBack.em, titulo: `Teach-back: ${ROTULO_TEACH_BACK[v.teachBack.resultado]}`, quem: v.teachBack.porNome, detalhe: v.teachBack.observacao, tipo: 'contato' })
  for (const c of v.contatos) if (c.confirmadoEm) itens.push({ em: c.confirmadoEm, titulo: `Número confirmado: ${c.nome}`, quem: c.confirmadoPor ?? undefined, tipo: 'contato' })
  for (const m of v.materiais.enviados) itens.push({ em: m.em, titulo: `Material: ${m.titulo} (versão ${m.versao})`, detalhe: ROTULO_ESTADO_MENSAGEM[m.estado], tipo: 'material' })
  if (v.materiais.abertoEm) itens.push({ em: v.materiais.abertoEm, titulo: 'Página do paciente aberta', tipo: 'material' })
  for (const q of v.materiais.quiz) itens.push({ em: q.em, titulo: `Quiz: ${q.aprovado ? 'aprovado' : 'reprovado'} (${q.acertos} de 11)`, tipo: 'material' })
  for (const h of v.hardStopsResolvidos ?? []) itens.push({ em: h.em, titulo: `Hard stop resolvido por escrito: ${h.titulo}`, quem: h.porNome, detalhe: h.resolucao, tipo: 'bloco' })
  for (const i of v.intercorrencias) itens.push({ em: i.em, titulo: 'Intercorrência registrada', quem: i.porNome, detalhe: i.descricao, tipo: 'intercorrencia' })
  for (const m of v.avisosFamilia.mensagens) itens.push({ em: m.criadoEm, titulo: `Aviso: ${rotuloGatilho(m.gatilho)}`, detalhe: `${m.destinoMascarado} · ${ROTULO_ESTADO_MENSAGEM[m.estado] ?? m.estado}`, tipo: 'aviso' })
  return itens.filter(i => i.em).sort((a, b) => a.em.localeCompare(b.em))
}

export function AbaHistorico(props: { visao: EpisodioVisao }) {
  const itens = montarHistorico(props.visao)
  return (
    <Cartao titulo="Histórico do episódio">
      <p className="suave" style={{ margin: 0 }}>
        Em ordem de horário (horário do servidor, America/Sao_Paulo). Marcações fora de hora ficam com o horário real e sinalizadas. Correções são novos registros e não apagam os
        anteriores.
      </p>
      <ol className="linha-tempo">
        {itens.map((i, n) => (
          <li key={`${i.em}-${n}`}>
            <time dateTime={i.em}>{formatarDataHora(i.em)}</time> · <strong>{i.titulo}</strong>
            {i.quem ? ` · ${i.quem}` : ''}
            {i.foraDeHora && (
              <>
                {' '}
                <Selo tipo="atencao">FORA DE HORA</Selo>
              </>
            )}
            {i.detalhe && (
              <span className="suave" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
                {i.detalhe}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Cartao>
  )
}
