// Renderizador GENÉRICO de ModeloChecklist (todas as TipoResposta).
// - Mostra `ajuda` como informação do serviço, `pendente` como pendência do POP, autor/hora/fora de hora/correções.
// - Respeita `papeis` (quem responde), `depoisDe` (ordem obrigatória) e `exigeBlocosConcluidos`.
// - Mostra `exigidoQuando` (obrigatório só sob condição, inclusive entre modelos: 'd7:C.olho_unico_qual'),
//   `exigeSim` e `foraDeHoraApos` (hora real, regra 5); pede a observação quando a regra exige.
// - Salva por seção (lote) ou item a item (sala): sempre só o que mudou; correção é um novo registro.
// - Nenhum campo em branco: destaca o que falta (`BlocoVisao.faltam`).
import { useMemo, useState } from 'react'
import type { BlocoVisao, CondicaoItem, ItemModelo, ModeloChecklist, ModeloId, Papel, RespostaAtual, SecaoModelo, ValorResposta } from '@dominio/tipos.ts'
import { Aviso, Botao, Selo } from '../base/index.tsx'
import { formatarDataHora } from '../formato.ts'
import type { Permissao } from '../permissoes.ts'
import { temAlgumPapel } from '../permissoes.ts'
import { ROTULO_HARD_STOP_CURTO, ROTULO_MODELO, rotuloPapeis } from '../rotulos.ts'
import { CampoResposta } from './CampoResposta.tsx'
import { condicaoValeCom, observacaoExigida, opcoesVisiveis, referenciaItem } from './regrasItem.ts'
import type { RespostaParaEnviar } from './valores.ts'
import { validarValor, valoresIguais } from './valores.ts'

export type { RespostaParaEnviar } from './valores.ts'

interface Rascunho {
  valor: ValorResposta | undefined
  observacao: string
}

/** Contexto do episódio para condições dos itens (exigidoQuando, exigeBlocosConcluidos, foraDeHoraApos). */
export interface ContextoChecklist {
  homonimoNoDia?: boolean
  lenteTorica?: boolean
  dotD?: boolean
  blocosConcluidos?: ModeloId[]
  /** Respostas de todos os modelos do episódio (condições entre modelos; opções que dependem do D-7). */
  respostasPorModelo?: Partial<Record<ModeloId, Record<string, RespostaAtual>>>
  /** Modelos do episódio (texto do item de outro modelo citado numa condição). */
  modelos?: Partial<Record<ModeloId, ModeloChecklist>>
}

const ROTULO_CONTEXTO: Record<'homonimo_no_dia' | 'lente_torica' | 'dot_D', { quando: string; agora: string }> = {
  homonimo_no_dia: { quando: 'houver homônimo ou nome parecido no dia', agora: 'há homônimo ou nome parecido no dia' },
  lente_torica: { quando: 'a lente for tórica', agora: 'a lente é tórica' },
  dot_D: { quando: 'houver dot D (insulina ou sulfonilureia)', agora: 'há dot D (insulina ou sulfonilureia)' },
}

export interface CondicaoExibida {
  /** "Responder quando ..." */
  quando: string
  /** "Obrigatório: ..." */
  agora: string
  ativa: boolean
}

export interface PropsRenderizador {
  modelo: ModeloChecklist
  bloco?: BlocoVisao | null
  respostas?: Record<string, RespostaAtual> | null
  papeisAtor: readonly Papel[]
  /** Permissão do servidor para responder este modelo (quando houver). */
  permissao?: Permissao | null
  /** Motivo para mostrar tudo só para leitura (ex.: sem conexão, episódio cancelado). */
  somenteLeitura?: string | null
  /** 'secao': um botão por seção (D-7). 'imediato': cada item tem "Registrar agora" (sala, hora real). */
  modo?: 'secao' | 'imediato'
  /** Envia as respostas; devolve true se o servidor aceitou. */
  aoSalvar: (respostas: RespostaParaEnviar[]) => Promise<boolean>
  /** Prefixo dos ids no DOM (permite dois renderizadores na mesma página). */
  idPrefixo?: string
  /** Mostrar só estas seções. */
  secoes?: string[]
  contexto?: ContextoChecklist
}

export function idDomItem(prefixo: string, itemId: string): string {
  return `${prefixo}-${itemId}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function RenderizadorChecklist(props: PropsRenderizador) {
  const { modelo } = props
  const prefixo = props.idPrefixo ?? `ck-${modelo.id}`
  const modo = props.modo ?? 'secao'
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  const respostas = props.respostas ?? {}
  const faltam = useMemo(() => new Set(props.bloco?.faltam ?? []), [props.bloco])
  const textos = useMemo(() => {
    const t: Record<string, string> = {}
    for (const s of modelo.secoes) for (const i of s.itens) t[i.id] = i.texto
    return t
  }, [modelo])

  const secoes = props.secoes ? modelo.secoes.filter(s => props.secoes!.includes(s.id)) : modelo.secoes

  const valorExibido = (item: ItemModelo): ValorResposta | undefined => (item.id in rascunhos ? rascunhos[item.id].valor : respostas[item.id]?.valor)

  const alterado = (item: ItemModelo): boolean => {
    const r = rascunhos[item.id]
    if (!r) return false
    const atual = respostas[item.id]
    return !valoresIguais(r.valor, atual?.valor) || (r.observacao ?? '') !== (atual?.observacao ?? '')
  }

  const concluidos = props.contexto?.blocosConcluidos ?? []

  const itemDe = (modeloId: ModeloId, itemId: string): ItemModelo | undefined => {
    if (modeloId === modelo.id) return itemPorId(modelo, itemId)
    const outro = props.contexto?.modelos?.[modeloId]
    return outro ? itemPorId(outro, itemId) : undefined
  }
  const valorDe = (modeloId: ModeloId, itemId: string): ValorResposta | undefined => {
    if (modeloId === modelo.id) {
      const i = itemPorId(modelo, itemId)
      return i ? valorExibido(i) : respostas[itemId]?.valor
    }
    return props.contexto?.respostasPorModelo?.[modeloId]?.[itemId]?.valor
  }
  const ativaContexto = (c: Extract<CondicaoItem, { contexto: string }>): boolean =>
    c.contexto === 'homonimo_no_dia' ? Boolean(props.contexto?.homonimoNoDia) : c.contexto === 'lente_torica' ? Boolean(props.contexto?.lenteTorica) : Boolean(props.contexto?.dotD)
  /** O valor de um item condicional só conta quando a condição dele também vale (como no domínio). */
  const condicaoAtiva = (c: CondicaoItem, modeloRef: ModeloId, profundidade = 0): boolean => {
    if ('contexto' in c) return ativaContexto(c)
    const ref = referenciaItem(c.itemId, modeloRef)
    const alvo = itemDe(ref.modelo, ref.itemId)
    if (alvo?.exigidoQuando && profundidade < 4 && !condicaoAtiva(alvo.exigidoQuando, ref.modelo, profundidade + 1)) return false
    return condicaoValeCom(valorDe(ref.modelo, ref.itemId), c.valores)
  }

  /** Condição de `exigidoQuando`: texto legível e se vale agora (com o que está na tela). */
  const condicao = (c: CondicaoItem | undefined): CondicaoExibida | null => {
    if (!c) return null
    if ('contexto' in c) return { ...ROTULO_CONTEXTO[c.contexto], ativa: ativaContexto(c) }
    const ref = referenciaItem(c.itemId, modelo.id)
    const alvo = itemDe(ref.modelo, ref.itemId)
    const rotulos = c.valores.map(x => alvo?.opcoes?.find(o => o.valor === x)?.rotulo ?? (x === 'sim' ? 'Sim' : x === 'nao' ? 'Não' : x)).join(' ou ')
    const nome = `"${alvo?.texto ?? ref.itemId}"${ref.modelo !== modelo.id ? ` (${ROTULO_MODELO[ref.modelo] ?? ref.modelo})` : ''}`
    return { quando: `${nome} for ${rotulos}`, agora: `${nome} é ${rotulos}`, ativa: condicaoAtiva(c, modelo.id) }
  }

  /** Observação obrigatória para o valor atual (null se não exigida). */
  const obsExigida = (item: ItemModelo): string | null =>
    observacaoExigida(item, modelo.id, valorExibido(item), Boolean(respostas[item.id]), concluidos)

  /** Erro que impede registrar o item alterado: valor incompleto ou observação obrigatória vazia. */
  const erroDoItem = (item: ItemModelo): string | null => {
    if (!alterado(item)) return null
    const r = rascunhos[item.id]
    const e = validarValor(item, r?.valor)
    if (e) return e
    const obs = obsExigida(item)
    return obs && !(r?.observacao ?? '').trim() ? obs : null
  }

  // Bloqueio do checklist inteiro: mostrado uma vez no topo, não repetido em cada item.
  const bloqueioGlobal = props.somenteLeitura
    ? props.somenteLeitura
    : props.permissao && !props.permissao.permitido
      ? (props.permissao.motivo ?? 'Sem permissão para responder este checklist.')
      : null

  const motivoBloqueio = (item: ItemModelo): string | null => {
    if (bloqueioGlobal) return bloqueioGlobal
    if (!temAlgumPapel(props.papeisAtor, item.papeis)) return `Só ${rotuloPapeis(item.papeis)} responde a este item.`
    const blocosFaltando = (item.exigeBlocosConcluidos ?? []).filter(m => !concluidos.includes(m))
    if (blocosFaltando.length) return `Só depois de concluir: ${blocosFaltando.map(m => ROTULO_MODELO[m] ?? m).join(', ')}.`
    // Ordem (regra 4): o pré-requisito precisa estar REGISTRADO antes (envio separado); se for sim/não, com "Sim".
    const antes = (item.depoisDe ?? []).filter(id => {
      const r = respostas[id]
      if (!r) return true
      return itemPorId(modelo, id)?.tipo === 'sim_nao' && r.valor !== 'sim'
    })
    if (antes.length) return `Registre antes: ${antes.map(id => (itemPorId(modelo, id)?.tipo === 'sim_nao' ? `${textos[id] ?? id} (com Sim)` : (textos[id] ?? id))).join('; ')}.`
    return null
  }

  const mudar = (item: ItemModelo, r: Rascunho | null) => {
    setRascunhos(atual => {
      const novo = { ...atual }
      if (r === null) delete novo[item.id]
      else novo[item.id] = r
      return novo
    })
  }

  const enviar = async (chave: string, itens: ItemModelo[]) => {
    const lote = itens.filter(alterado)
    if (!lote.length || lote.some(i => erroDoItem(i) !== null)) return
    setSalvando(chave)
    try {
      const ok = await props.aoSalvar(
        lote.map(i => ({
          itemId: i.id,
          valor: rascunhos[i.id].valor as ValorResposta,
          observacao: rascunhos[i.id].observacao.trim() === '' ? null : rascunhos[i.id].observacao.trim(),
        })),
      )
      if (ok) {
        setRascunhos(atual => {
          const novo = { ...atual }
          for (const i of lote) delete novo[i.id]
          return novo
        })
      }
    } finally {
      setSalvando(null)
    }
  }

  const faltamVisiveis = [...faltam].filter(id => secoes.some(s => s.itens.some(i => i.id === id)))

  return (
    <div className="pilha renderizador-checklist" data-modelo={modelo.id}>
      {modelo.descricao && <p className="suave">{modelo.descricao}</p>}
      {bloqueioGlobal && (
        <Aviso tipo="atencao" titulo="Não é possível responder agora">
          {bloqueioGlobal}
        </Aviso>
      )}
      <p className="suave" style={{ fontSize: '.85rem' }}>
        Modelo {modelo.titulo} · versão {modelo.versao} · fonte: {modelo.fonte}
      </p>
      {faltamVisiveis.length > 0 && (
        <Aviso tipo="atencao" titulo={`Faltam ${faltamVisiveis.length} ${faltamVisiveis.length === 1 ? 'item' : 'itens'} (nenhum campo fica em branco)`}>
          <ul className="lista-simples">
            {faltamVisiveis.map(id => (
              <li key={id}>
                <a href={`#${idDomItem(prefixo, id)}`}>{textos[id] ?? id}</a>
              </li>
            ))}
          </ul>
        </Aviso>
      )}
      {secoes.map(secao => (
        <SecaoChecklist
          key={secao.id}
          secao={secao}
          prefixo={prefixo}
          modo={modo}
          respostas={respostas}
          rascunhos={rascunhos}
          faltam={faltam}
          salvando={salvando}
          valorExibido={valorExibido}
          alterado={alterado}
          motivoBloqueio={motivoBloqueio}
          bloqueioGlobal={bloqueioGlobal}
          condicao={condicao}
          concluidos={concluidos}
          erroDoItem={erroDoItem}
          obsExigida={obsExigida}
          opcoes={item => opcoesVisiveis(item, modelo.id, valorExibido(item), props.contexto?.respostasPorModelo)}
          mudar={mudar}
          enviar={enviar}
        />
      ))}
    </div>
  )
}

function itemPorId(modelo: ModeloChecklist, id: string): ItemModelo | undefined {
  for (const s of modelo.secoes) for (const i of s.itens) if (i.id === id) return i
  return undefined
}

function SecaoChecklist(p: {
  secao: SecaoModelo
  prefixo: string
  modo: 'secao' | 'imediato'
  respostas: Record<string, RespostaAtual>
  rascunhos: Record<string, Rascunho>
  faltam: Set<string>
  salvando: string | null
  valorExibido: (i: ItemModelo) => ValorResposta | undefined
  alterado: (i: ItemModelo) => boolean
  motivoBloqueio: (i: ItemModelo) => string | null
  bloqueioGlobal: string | null
  condicao: (c: CondicaoItem | undefined) => CondicaoExibida | null
  concluidos: ModeloId[]
  erroDoItem: (i: ItemModelo) => string | null
  obsExigida: (i: ItemModelo) => string | null
  opcoes: (i: ItemModelo) => ItemModelo['opcoes']
  mudar: (i: ItemModelo, r: Rascunho | null) => void
  enviar: (chave: string, itens: ItemModelo[]) => Promise<void>
}) {
  const { secao } = p
  const alterados = secao.itens.filter(p.alterado)
  const invalidos = alterados.filter(i => p.erroDoItem(i) !== null)
  const obrigatorios = secao.itens.filter(i => i.obrigatorio)
  const respondidos = obrigatorios.filter(i => p.respostas[i.id]).length
  const idSecao = idDomItem(p.prefixo, `secao-${secao.id}`)
  return (
    <fieldset className="secao-checklist pilha" id={idSecao}>
      <legend>
        {secao.id.length <= 3 && !secao.titulo.startsWith(`${secao.id}.`) ? `${secao.id}. ` : ''}
        {secao.titulo}
      </legend>
      {secao.itens.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>
          Nenhum item definido nesta seção ainda.
        </p>
      ) : (
        <p className="suave" style={{ margin: 0 }}>
          {respondidos} de {obrigatorios.length} itens obrigatórios registrados
        </p>
      )}
      {secao.itens.map(item => {
        const motivo = p.motivoBloqueio(item)
        const erro = p.erroDoItem(item)
        return (
          <ItemChecklist
            key={item.id}
            item={item}
            idDom={idDomItem(p.prefixo, item.id)}
            resposta={p.respostas[item.id]}
            rascunho={p.rascunhos[item.id]}
            valor={p.valorExibido(item)}
            falta={p.faltam.has(item.id) && !p.alterado(item)}
            alterado={p.alterado(item)}
            bloqueio={motivo}
            motivoVisivel={motivo !== p.bloqueioGlobal}
            erro={erro}
            condicao={p.condicao(item.exigidoQuando)}
            foraDeHora={item.foraDeHoraApos && p.concluidos.includes(item.foraDeHoraApos) ? item.foraDeHoraApos : null}
            observacaoExigida={p.obsExigida(item)}
            opcoes={p.opcoes(item)}
            aoMudar={r => p.mudar(item, r)}
            registrarAgora={
              p.modo === 'imediato'
                ? {
                    aoRegistrar: () => void p.enviar(`item:${item.id}`, [item]),
                    registrando: p.salvando === `item:${item.id}`,
                  }
                : undefined
            }
          />
        )
      })}
      {secao.itens.length > 0 && (
        <div className="barra-secao">
          <span className="suave">
            {alterados.length ? `${alterados.length} ${alterados.length === 1 ? 'resposta não registrada' : 'respostas não registradas'}` : 'Nada a registrar nesta seção'}
          </span>
          <Botao
            onClick={() => void p.enviar(secao.id, secao.itens)}
            desabilitado={alterados.length === 0 || invalidos.length > 0 || p.salvando !== null}
            motivo={invalidos.length > 0 ? 'Complete as respostas destacadas antes de registrar.' : null}
            rotuloAria={`Registrar seção ${secao.titulo}`}
          >
            {p.salvando === secao.id
              ? 'Registrando…'
              : p.modo === 'imediato'
                ? alterados.length === 0
                  ? 'Registrar marcações'
                  : alterados.length === 1
                    ? 'Registrar 1 marcação'
                    : `Registrar ${alterados.length} marcações`
                : `Salvar seção ${secao.id}`}
          </Botao>
        </div>
      )}
    </fieldset>
  )
}

export function ItemChecklist(p: {
  item: ItemModelo
  idDom: string
  resposta?: RespostaAtual
  rascunho?: Rascunho
  valor: ValorResposta | undefined
  falta: boolean
  alterado: boolean
  bloqueio: string | null
  /** false quando o motivo é do checklist inteiro (já exibido no topo). */
  motivoVisivel?: boolean
  erro: string | null
  /** `exigidoQuando`: texto da condição e se vale agora. */
  condicao?: CondicaoExibida | null
  /** Bloco já concluído depois do qual a marcação fica fora de hora. */
  foraDeHora?: ModeloId | null
  /** A regra exige observação para o valor atual (texto do motivo). */
  observacaoExigida?: string | null
  /** Opções visíveis (quando dependem de outro registro). */
  opcoes?: ItemModelo['opcoes']
  aoMudar: (r: Rascunho | null) => void
  registrarAgora?: { aoRegistrar: () => void; registrando: boolean }
}) {
  const { item, resposta } = p
  const obrigatorioAgora = item.obrigatorio || Boolean(p.condicao?.ativa)
  const [verObs, setVerObs] = useState(Boolean(resposta?.observacao))
  const idTexto = `${p.idDom}-texto`
  const desabilitado = Boolean(p.bloqueio)
  const classes = [
    'item-checklist',
    p.falta ? 'falta' : '',
    p.alterado ? 'alterado' : '',
    resposta && !p.alterado ? 'respondido' : '',
    desabilitado ? 'desabilitado' : '',
    p.condicao && !p.condicao.ativa && !resposta && !p.alterado ? 'condicional-inativo' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const observacao = p.rascunho?.observacao ?? resposta?.observacao ?? ''
  // Item condicional cuja condição não vale (e sem resposta): fica recolhido para não poluir a tela.
  const [expandido, setExpandido] = useState(false)
  const recolhido = Boolean(p.condicao && !p.condicao.ativa && !item.obrigatorio && !resposta && !p.alterado && !expandido)
  const mudarValor = (v: ValorResposta | undefined) => {
    if (v === undefined && !resposta) {
      p.aoMudar(null)
      return
    }
    p.aoMudar({ valor: v, observacao })
  }
  if (recolhido && p.condicao) {
    return (
      <div className={`${classes} recolhido`} id={p.idDom} data-item={item.id} data-tipo={item.tipo}>
        <span className="texto-item" id={idTexto}>
          {item.texto}
        </span>
        <p className="suave" style={{ margin: 0 }}>
          Responder quando {p.condicao.quando}.
        </p>
        {!desabilitado && (
          <div>
            <Botao tipo="secundario" pequeno onClick={() => setExpandido(true)} rotuloAria={`Responder mesmo assim: ${item.texto}`}>
              Responder mesmo assim
            </Botao>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={classes} id={p.idDom} data-item={item.id} data-tipo={item.tipo}>
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="texto-item" id={idTexto}>
          {item.texto}
          {obrigatorioAgora && <span className="obrigatorio"> (obrigatório)</span>}
        </span>
        <span className="linha" style={{ gap: 6 }}>
          {p.falta && <Selo tipo="perigo">Falta responder</Selo>}
          {p.alterado && <Selo tipo="info">Não registrado</Selo>}
          {item.hardStop && (
            <Selo tipo="perigo" titulo={item.hardStop}>
              Hard stop: {ROTULO_HARD_STOP_CURTO[item.hardStop] ?? item.hardStop}
            </Selo>
          )}
        </span>
      </div>
      {p.condicao && (
        <p className="suave" style={{ margin: 0 }}>
          {p.condicao.ativa ? `Obrigatório: ${p.condicao.agora}.` : `Responder quando ${p.condicao.quando}.`}
        </p>
      )}
      {item.exigeSim && (
        <p className="suave" style={{ margin: 0 }}>
          {item.tipo === 'opcao' ? 'Conferência: o bloco não é concluído com a resposta "Não".' : 'Conferência: o bloco só é concluído com a resposta Sim.'}
        </p>
      )}
      {item.exigeSim && p.valor === 'nao' && (
        <p className="info-alerta" role="alert" style={{ margin: 0 }}>
          Resposta Não: o bloco não pode ser concluído até a situação ser resolvida por quem tem competência.
        </p>
      )}
      {p.foraDeHora && (
        <p style={{ margin: 0 }}>
          <Selo tipo="atencao">Será registrado FORA DE HORA</Selo> <span className="suave">({ROTULO_MODELO[p.foraDeHora] ?? p.foraDeHora} já concluído; fica o horário real)</span>
        </p>
      )}
      {item.pendente && (
        <p className="pendencia-pop" style={{ margin: 0 }}>
          <Selo tipo="pop">Pendência do POP</Selo> {item.pendente}
        </p>
      )}
      {item.ajuda && (
        <p className="info-servico" style={{ margin: 0 }}>
          <strong>Informação do serviço (não é orientação ao paciente): </strong>
          {item.ajuda}
        </p>
      )}
      {item.alerta && (
        <p className="info-alerta" style={{ margin: 0 }}>
          {item.alerta.nivel === 'alerta' ? 'Gera ALERTA ao cirurgião (mesmo dia, conduta escrita): ' : 'Sinalizado ao cirurgião: '}
          {item.alerta.descricao}
        </p>
      )}
      <CampoResposta
        item={item}
        valor={p.valor}
        aoMudar={mudarValor}
        desabilitado={desabilitado}
        idBase={p.idDom}
        idTexto={idTexto}
        confirmado={item.tipo === 'confirmacao' && resposta?.valor === true}
        opcoes={p.opcoes}
      />
      {p.observacaoExigida && p.alterado && (
        <p className="info-alerta" style={{ margin: 0 }}>
          Observação obrigatória: {p.observacaoExigida}
        </p>
      )}
      {(verObs || observacao || (p.observacaoExigida && p.alterado)) && !desabilitado ? (
        <div className="campo">
          <label htmlFor={`${p.idDom}-observacao`}>
            Observação{p.observacaoExigida && p.alterado ? <span className="obrigatorio"> (obrigatória)</span> : null}
          </label>
          <input id={`${p.idDom}-observacao`} type="text" autoComplete="off" value={observacao} onChange={e => p.aoMudar({ valor: p.valor, observacao: e.target.value })} />
        </div>
      ) : (
        !desabilitado && (
          <div>
            <Botao tipo="secundario" pequeno onClick={() => setVerObs(true)} rotuloAria={`Adicionar observação: ${item.texto}`}>
              Adicionar observação
            </Botao>
          </div>
        )
      )}
      {p.erro && (
        <p className="erro-item" role="alert" style={{ margin: 0 }}>
          {p.erro}
        </p>
      )}
      {p.bloqueio && p.motivoVisivel !== false && (
        <p className="motivo-bloqueio" style={{ margin: 0 }}>
          {p.bloqueio}
        </p>
      )}
      {resposta && (
        <div className="meta-resposta">
          <span>
            Registrado por <strong>{resposta.autorNome}</strong> em {formatarDataHora(resposta.registradoEm)}
          </span>
          {resposta.foraDeHora && (
            <Selo tipo="atencao" titulo="Marcação feita fora de hora: fica com o horário real e sinalizada.">
              FORA DE HORA
            </Selo>
          )}
          {resposta.correcoes > 0 && <Selo tipo="neutro">{resposta.correcoes === 1 ? '1 correção' : `${resposta.correcoes} correções`}</Selo>}
          {resposta.observacao && <span>Obs.: {resposta.observacao}</span>}
        </div>
      )}
      {p.alterado && (
        <div className="linha">
          {p.registrarAgora && (
            <Botao onClick={p.registrarAgora.aoRegistrar} desabilitado={p.registrarAgora.registrando || Boolean(p.erro)} rotuloAria={`Registrar agora: ${item.texto}`}>
              {p.registrarAgora.registrando ? 'Registrando…' : 'Registrar agora'}
            </Botao>
          )}
          <Botao tipo="secundario" pequeno onClick={() => p.aoMudar(null)} rotuloAria={`Desfazer alteração: ${item.texto}`}>
            Desfazer
          </Botao>
        </div>
      )}
    </div>
  )
}
