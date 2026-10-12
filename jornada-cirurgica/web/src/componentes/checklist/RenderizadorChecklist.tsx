// Renderizador GENÉRICO de ModeloChecklist (todas as TipoResposta).
// - Mostra `ajuda` como informação do serviço, `pendente` como pendência do POP, autor/hora/fora de hora/correções.
// - Respeita `papeis` (quem responde) e `depoisDe` (ordem obrigatória).
// - Salva por seção (lote) ou item a item (sala): sempre só o que mudou; correção é um novo registro.
// - Nenhum campo em branco: destaca o que falta (`BlocoVisao.faltam`).
import { useMemo, useState } from 'react'
import type { BlocoVisao, ItemModelo, ModeloChecklist, Papel, RespostaAtual, SecaoModelo, ValorResposta } from '@dominio/tipos.ts'
import { Aviso, Botao, Selo } from '../base/index.tsx'
import { formatarDataHora } from '../formato.ts'
import type { Permissao } from '../permissoes.ts'
import { temAlgumPapel } from '../permissoes.ts'
import { ROTULO_HARD_STOP_CURTO, rotuloPapeis } from '../rotulos.ts'
import { CampoResposta } from './CampoResposta.tsx'
import type { RespostaParaEnviar } from './valores.ts'
import { validarValor, valoresIguais } from './valores.ts'

export type { RespostaParaEnviar } from './valores.ts'

interface Rascunho {
  valor: ValorResposta | undefined
  observacao: string
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

  const motivoBloqueio = (item: ItemModelo): string | null => {
    if (props.somenteLeitura) return props.somenteLeitura
    if (props.permissao && !props.permissao.permitido) return props.permissao.motivo ?? 'Sem permissão para responder este checklist.'
    if (!temAlgumPapel(props.papeisAtor, item.papeis)) return `Só ${rotuloPapeis(item.papeis)} responde a este item.`
    const antes = (item.depoisDe ?? []).filter(id => {
      if (respostas[id]) return false
      // No modo por seção, um rascunho válido do item anterior no mesmo lote também vale (o servidor confere a ordem).
      if (modo === 'secao' && rascunhos[id] && validarValor(itemPorId(modelo, id) ?? item, rascunhos[id].valor) === null) return false
      return true
    })
    if (antes.length) return `Registre antes: ${antes.map(id => textos[id] ?? id).join('; ')}.`
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
    if (!lote.length || lote.some(i => validarValor(i, rascunhos[i.id].valor) !== null)) return
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
  mudar: (i: ItemModelo, r: Rascunho | null) => void
  enviar: (chave: string, itens: ItemModelo[]) => Promise<void>
}) {
  const { secao } = p
  const alterados = secao.itens.filter(p.alterado)
  const invalidos = alterados.filter(i => validarValor(i, p.rascunhos[i.id]?.valor) !== null)
  const obrigatorios = secao.itens.filter(i => i.obrigatorio)
  const respondidos = obrigatorios.filter(i => p.respostas[i.id]).length
  const idSecao = idDomItem(p.prefixo, `secao-${secao.id}`)
  return (
    <fieldset className="secao-checklist pilha" id={idSecao}>
      <legend>
        {secao.id.length <= 3 ? `${secao.id}. ` : ''}
        {secao.titulo}
      </legend>
      <p className="suave" style={{ margin: 0 }}>
        {respondidos} de {obrigatorios.length} itens obrigatórios registrados
      </p>
      {secao.itens.map(item => {
        const motivo = p.motivoBloqueio(item)
        const erro = p.alterado(item) ? validarValor(item, p.rascunhos[item.id]?.valor) : null
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
            erro={erro}
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
      <div className="barra-secao">
        <span className="suave">{alterados.length ? `${alterados.length} ${alterados.length === 1 ? 'resposta não registrada' : 'respostas não registradas'}` : 'Nada a registrar nesta seção'}</span>
        <Botao
          onClick={() => void p.enviar(secao.id, secao.itens)}
          desabilitado={alterados.length === 0 || invalidos.length > 0 || p.salvando !== null}
          motivo={invalidos.length > 0 ? 'Complete as respostas destacadas antes de registrar.' : null}
          rotuloAria={`Registrar seção ${secao.titulo}`}
        >
          {p.salvando === secao.id
            ? 'Registrando…'
            : p.modo === 'imediato'
              ? alterados.length === 1
                ? 'Registrar 1 marcação'
                : `Registrar ${alterados.length} marcações`
              : `Salvar seção ${secao.id}`}
        </Botao>
      </div>
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
  erro: string | null
  aoMudar: (r: Rascunho | null) => void
  registrarAgora?: { aoRegistrar: () => void; registrando: boolean }
}) {
  const { item, resposta } = p
  const [verObs, setVerObs] = useState(Boolean(resposta?.observacao))
  const idTexto = `${p.idDom}-texto`
  const desabilitado = Boolean(p.bloqueio)
  const classes = ['item-checklist', p.falta ? 'falta' : '', p.alterado ? 'alterado' : '', resposta && !p.alterado ? 'respondido' : '', desabilitado ? 'desabilitado' : '']
    .filter(Boolean)
    .join(' ')
  const observacao = p.rascunho?.observacao ?? resposta?.observacao ?? ''
  const mudarValor = (v: ValorResposta | undefined) => {
    if (v === undefined && !resposta) {
      p.aoMudar(null)
      return
    }
    p.aoMudar({ valor: v, observacao })
  }
  return (
    <div className={classes} id={p.idDom} data-item={item.id} data-tipo={item.tipo}>
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="texto-item" id={idTexto}>
          {item.texto}
          {item.obrigatorio && <span className="obrigatorio"> (obrigatório)</span>}
        </span>
        <span className="linha" style={{ gap: 6 }}>
          {p.falta && <Selo tipo="perigo">Falta responder</Selo>}
          {p.alterado && <Selo tipo="info">Não registrado</Selo>}
          {item.hardStop && <Selo tipo="perigo" titulo={item.hardStop}>Hard stop: {ROTULO_HARD_STOP_CURTO[item.hardStop] ?? item.hardStop}</Selo>}
        </span>
      </div>
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
      />
      {(verObs || observacao) && !desabilitado ? (
        <div className="campo">
          <label htmlFor={`${p.idDom}-observacao`}>Observação</label>
          <input
            id={`${p.idDom}-observacao`}
            type="text"
            autoComplete="off"
            value={observacao}
            onChange={e => p.aoMudar({ valor: p.valor, observacao: e.target.value })}
          />
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
      {p.bloqueio && (
        <p className="motivo-bloqueio" style={{ margin: 0 }}>
          {p.bloqueio}
        </p>
      )}
      {resposta && (
        <div className="meta-resposta">
          <span>
            Registrado por <strong>{resposta.autorNome}</strong> em {formatarDataHora(resposta.registradoEm)}
          </span>
          {resposta.foraDeHora && <Selo tipo="atencao" titulo="Marcação feita fora de hora: fica com o horário real e sinalizada.">FORA DE HORA</Selo>}
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
