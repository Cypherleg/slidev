// Peças comuns dos painéis do episódio.
import type { EpisodioVisao, ModeloId, Papel } from '@dominio/tipos.ts'
import { ORDEM_MODELOS } from '@dominio/tipos.ts'
import { Aviso, Botao } from '../../../componentes/base/index.tsx'
import type { ContextoChecklist } from '../../../componentes/checklist/RenderizadorChecklist.tsx'
import { RenderizadorChecklist } from '../../../componentes/checklist/RenderizadorChecklist.tsx'
import { ConclusaoBloco, SeloSituacao } from '../../../componentes/episodio/SituacaoBloco.tsx'
import { permissaoConcluir, permissaoResponder } from '../../../componentes/permissoes.ts'
import type { ControleEpisodio } from '../useEpisodio.ts'

export interface PropsPainel {
  ctl: ControleEpisodio
  visao: EpisodioVisao
  papeis: Papel[]
}

/** Episódio encerrado: nada mais é marcado. */
export function motivoEncerrado(visao: EpisodioVisao): string | null {
  if (visao.episodio.estado === 'cancelado') return 'Episódio cancelado: nada mais é registrado nele.'
  return null
}

/** Condições dos itens a partir da visão (mesmas regras do domínio, só para exibir). */
export function contextoChecklist(visao: EpisodioVisao): ContextoChecklist {
  const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return {
    homonimoNoDia: visao.identificacao.exigeNomeMae,
    lenteTorica: visao.lente.plano ? visao.lente.plano.torica : normal(visao.episodio.tipoLente).includes('TORIC'),
    dotD: visao.dots.some(d => d.letra === 'D'),
    blocosConcluidos: ORDEM_MODELOS.filter(m => visao.blocos[m]?.situacao === 'concluido'),
  }
}

/** Checklist de um modelo + botão de concluir o bloco. */
export function ChecklistDoBloco(props: PropsPainel & { modelo: ModeloId; modo?: 'secao' | 'imediato'; semConcluir?: boolean; rotuloConcluir?: string }) {
  const { visao, ctl, papeis, modelo } = props
  const m = visao.modelos[modelo]
  const bloco = visao.blocos[modelo]
  if (!m || !bloco) return <Aviso tipo="atencao">Modelo de checklist indisponível para este episódio.</Aviso>
  return (
    <div className="pilha">
      <div className="linha">
        <SeloSituacao bloco={bloco} />
        <ConclusaoBloco bloco={bloco} />
      </div>
      {bloco.impedimentos.length > 0 && bloco.situacao !== 'concluido' && (
        <Aviso tipo="atencao" titulo="Impedimentos deste bloco">
          <ul className="lista-simples">
            {[...new Set(bloco.impedimentos)].map(i => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <RenderizadorChecklist
        modelo={m}
        bloco={bloco}
        respostas={visao.respostas[modelo]}
        papeisAtor={papeis}
        permissao={permissaoResponder(visao, papeis, m)}
        somenteLeitura={motivoEncerrado(visao)}
        modo={props.modo}
        contexto={contextoChecklist(visao)}
        aoSalvar={respostas => ctl.executar('checklist.responder', { modelo, respostas }, 'Respostas registradas')}
      />
      {!props.semConcluir && <ConcluirBloco {...props} />}
    </div>
  )
}

export function ConcluirBloco(props: PropsPainel & { modelo: ModeloId; rotuloConcluir?: string }) {
  const { visao, ctl, papeis, modelo } = props
  const m = visao.modelos[modelo]
  const bloco = visao.blocos[modelo]
  if (!m || !bloco || bloco.situacao === 'concluido') return null
  const perm = permissaoConcluir(visao, papeis, m)
  const motivos: string[] = []
  if (!perm.permitido) motivos.push(perm.motivo ?? 'Sem permissão para concluir.')
  // O servidor já descreve os itens sem resposta nos impedimentos; só repete a contagem se ele não disse.
  if (bloco.faltam.length && !bloco.impedimentos.some(i => /sem resposta/i.test(i)))
    motivos.push(`Faltam ${bloco.faltam.length} ${bloco.faltam.length === 1 ? 'item obrigatório' : 'itens obrigatórios'}.`)
  for (const i of bloco.impedimentos) if (!motivos.includes(i)) motivos.push(i)
  const encerrado = motivoEncerrado(visao)
  if (encerrado) motivos.push(encerrado)
  return (
    <div className="pilha">
      <div>
        <Botao
          grande
          desabilitado={motivos.length > 0 || ctl.ocupado !== null}
          onClick={() => void ctl.executar('bloco.concluir', { modelo }, `${m.titulo}: concluído`)}
        >
          {props.rotuloConcluir ?? `Concluir ${m.titulo}`}
        </Botao>
      </div>
      {motivos.length > 0 && (
        <ul className="lista-simples motivo-bloqueio" aria-label="Por que ainda não pode concluir">
          {motivos.map(x => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
