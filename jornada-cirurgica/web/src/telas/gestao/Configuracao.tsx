// Configuração editável pela gestora. Nenhum tempo, telefone ou número clínico fica fixado no código.

import { useEffect, useState, type FormEvent } from 'react'
import type { ConfigJornada } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Botao, Campo, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { dataValida, formatarData, lerNumero } from '../../componentes/formato.ts'
import { mensagemErro, useCarga } from './comum/carga.ts'
import { ErroCarga, Retorno } from './comum/componentes.tsx'
import { MARCADORES_ETIQUETA, previaEtiqueta } from './etiquetas.ts'

type ChaveTempo = 'admissao_ate_inicio' | 'duracao_cirurgia' | 'recuperacao_ate_alta'
type ChaveEtiqueta = 'peito' | 'pulseira' | 'caixa_lente' | 'alertas'
type ChaveTelefone = 'hospital' | 'whatsappConcierge' | 'enfermagemForaHorario'

const TEMPOS: { chave: ChaveTempo; rotulo: string }[] = [
  { chave: 'admissao_ate_inicio', rotulo: 'Da admissão até o início da cirurgia' },
  { chave: 'duracao_cirurgia', rotulo: 'Duração da cirurgia' },
  { chave: 'recuperacao_ate_alta', rotulo: 'Da recuperação até a alta' },
]
const ETIQUETAS: { chave: ChaveEtiqueta; rotulo: string }[] = [
  { chave: 'peito', rotulo: 'Etiqueta do peito' },
  { chave: 'pulseira', rotulo: 'Pulseira' },
  { chave: 'caixa_lente', rotulo: 'Caixa da lente' },
  { chave: 'alertas', rotulo: 'Alertas por extenso' },
]
const TELEFONES: { chave: ChaveTelefone; rotulo: string }[] = [
  { chave: 'hospital', rotulo: 'Hospital (horário comercial)' },
  { chave: 'whatsappConcierge', rotulo: 'WhatsApp da concierge' },
  { chave: 'enfermagemForaHorario', rotulo: 'Enfermagem fora do horário comercial' },
]

interface ItemAnestesia {
  id: string
  texto: string
  novo?: boolean
}

interface Formulario {
  tempos: Record<ChaveTempo, string>
  etiquetas: Record<ChaveEtiqueta, string>
  telefones: Record<ChaveTelefone, string>
  limiar: string
  exigirCp2: boolean
  anestesia: ItemAnestesia[]
  feriados: string[]
  assinatura: string
}

function paraFormulario(c: ConfigJornada): Formulario {
  const t = c.temposEtapa ?? {}
  return {
    tempos: {
      admissao_ate_inicio: t.admissao_ate_inicio !== undefined ? String(t.admissao_ate_inicio) : '',
      duracao_cirurgia: t.duracao_cirurgia !== undefined ? String(t.duracao_cirurgia) : '',
      recuperacao_ate_alta: t.recuperacao_ate_alta !== undefined ? String(t.recuperacao_ate_alta) : '',
    },
    etiquetas: {
      peito: c.modelosEtiqueta?.peito ?? '',
      pulseira: c.modelosEtiqueta?.pulseira ?? '',
      caixa_lente: c.modelosEtiqueta?.caixa_lente ?? '',
      alertas: c.modelosEtiqueta?.alertas ?? '',
    },
    telefones: {
      hospital: c.telefones?.hospital ?? '',
      whatsappConcierge: c.telefones?.whatsappConcierge ?? '',
      enfermagemForaHorario: c.telefones?.enfermagemForaHorario ?? '',
    },
    limiar: c.limiarNomeParecido !== undefined && c.limiarNomeParecido !== null ? String(c.limiarNomeParecido).replace('.', ',') : '',
    exigirCp2: Boolean(c.exigirCp2AntesDoTimeOut),
    anestesia: (c.itensAnestesiaExtras ?? []).map(i => ({ id: i.id, texto: i.texto })),
    feriados: [...(c.feriados ?? [])].sort(),
    assinatura: c.assinaturaConcierge ?? '',
  }
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

type Erros = Partial<Record<string, string>>

function validar(f: Formulario): Erros {
  const erros: Erros = {}
  for (const t of TEMPOS) {
    const v = f.tempos[t.chave].trim()
    if (v && !(/^\d+$/.test(v) && Number(v) > 0)) erros[`tempo.${t.chave}`] = 'Use minutos inteiros (maior que zero) ou deixe em branco.'
  }
  const limiar = lerNumero(f.limiar)
  if (limiar === null || limiar <= 0 || limiar > 1) erros.limiar = 'Informe um número entre 0 e 1 (ex.: 0,85).'
  f.anestesia.forEach((i, n) => {
    if (!i.texto.trim()) erros[`anestesia.${n}`] = 'Escreva o item ou remova-o.'
  })
  for (const e of ETIQUETAS) if (!f.etiquetas[e.chave].trim()) erros[`etiqueta.${e.chave}`] = 'O modelo da etiqueta não pode ficar vazio.'
  return erros
}

function paraConfig(f: Formulario): Partial<ConfigJornada> {
  const temposEtapa: ConfigJornada['temposEtapa'] = {}
  for (const t of TEMPOS) {
    const v = f.tempos[t.chave].trim()
    if (v) temposEtapa[t.chave] = Number(v)
  }
  const usados = new Set(f.anestesia.filter(i => !i.novo).map(i => i.id))
  const itens = f.anestesia.map(i => {
    if (!i.novo) return { id: i.id, texto: i.texto.trim() }
    const base = `anestesia_extra_${slug(i.texto) || 'item'}`
    let id = base
    for (let n = 2; usados.has(id); n++) id = `${base}_${n}`
    usados.add(id)
    return { id, texto: i.texto.trim() }
  })
  const telefone = (v: string) => (v.trim() ? v.trim() : null)
  return {
    temposEtapa,
    modelosEtiqueta: { ...f.etiquetas },
    telefones: { hospital: telefone(f.telefones.hospital), whatsappConcierge: telefone(f.telefones.whatsappConcierge), enfermagemForaHorario: telefone(f.telefones.enfermagemForaHorario) },
    limiarNomeParecido: lerNumero(f.limiar) ?? 0,
    exigirCp2AntesDoTimeOut: f.exigirCp2,
    itensAnestesiaExtras: itens,
    feriados: [...new Set(f.feriados)].sort(),
    assinaturaConcierge: f.assinatura.trim() || null,
  }
}

function FormConfig(props: { inicial: ConfigJornada; onSalvo: (c: ConfigJornada) => void }) {
  const [f, setF] = useState<Formulario>(() => paraFormulario(props.inicial))
  const [erros, setErros] = useState<Erros>({})
  const [novoFeriado, setNovoFeriado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [retorno, setRetorno] = useState<{ tipo: 'ok' | 'perigo'; texto: string } | null>(null)

  useEffect(() => setF(paraFormulario(props.inicial)), [props.inicial])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const novos = validar(f)
    setErros(novos)
    if (Object.keys(novos).length) {
      setRetorno({ tipo: 'perigo', texto: `Corrija ${Object.keys(novos).length} campo(s) antes de salvar.` })
      return
    }
    setOcupado(true)
    try {
      const salvo = await chamar('config.salvar', { config: paraConfig(f) })
      setRetorno({ tipo: 'ok', texto: 'Configuração salva. A alteração fica registrada com autor e horário.' })
      props.onSalvo(salvo)
    } catch (err) {
      setRetorno({ tipo: 'perigo', texto: mensagemErro(err) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="pilha" onSubmit={salvar} noValidate aria-label="Configuração">
      <Cartao titulo="Tempos por etapa (minutos)">
        <p style={{ margin: 0 }}>
          Usados na previsão dos avisos à família ("cerca de N minutos"). <strong>Campo vazio: a mensagem sai sem previsão de tempo.</strong> Mais tarde, os
          tempos podem vir das medianas dos registros.
        </p>
        <div className="linha-campos formulario">
          {TEMPOS.map(t => (
            <Campo key={t.chave} rotulo={t.rotulo} id={`tempo-${t.chave}`} erro={erros[`tempo.${t.chave}`]} ajuda="Vazio = sem previsão">
              <input
                id={`tempo-${t.chave}`}
                inputMode="numeric"
                value={f.tempos[t.chave]}
                onChange={e => setF({ ...f, tempos: { ...f.tempos, [t.chave]: e.target.value } })}
                aria-invalid={Boolean(erros[`tempo.${t.chave}`]) || undefined}
              />
            </Campo>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Telefones exibidos ao paciente">
        <p style={{ margin: 0 }}>Aparecem na página do paciente. Campo vazio não aparece.</p>
        <div className="linha-campos formulario">
          {TELEFONES.map(t => (
            <Campo key={t.chave} rotulo={t.rotulo} id={`tel-${t.chave}`}>
              <input
                id={`tel-${t.chave}`}
                type="tel"
                value={f.telefones[t.chave]}
                onChange={e => setF({ ...f, telefones: { ...f.telefones, [t.chave]: e.target.value } })}
              />
            </Campo>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Modelos de etiqueta">
        <p style={{ margin: 0 }}>
          Marcadores:{' '}
          {Object.keys(MARCADORES_ETIQUETA).map((m, i) => (
            <span key={m}>
              {i > 0 && ', '}
              <code>{`{${m}}`}</code>
            </span>
          ))}
          . A pré-visualização usa dados fictícios.
        </p>
        {ETIQUETAS.map(e => {
          const previa = previaEtiqueta(f.etiquetas[e.chave])
          return (
            <div key={e.chave} className="grade-2">
              <Campo rotulo={e.rotulo} id={`etq-${e.chave}`} erro={erros[`etiqueta.${e.chave}`]}>
                <textarea
                  id={`etq-${e.chave}`}
                  className="codigo"
                  style={{ minHeight: 110 }}
                  value={f.etiquetas[e.chave]}
                  onChange={ev => setF({ ...f, etiquetas: { ...f.etiquetas, [e.chave]: ev.target.value } })}
                />
              </Campo>
              <div>
                <strong>Pré-visualização</strong>
                <pre className="previa-etiqueta" aria-label={`Pré-visualização: ${e.rotulo}`}>
                  {previa.texto}
                </pre>
                {previa.desconhecidos.length > 0 && (
                  <p className="erro-campo">Marcador desconhecido: {previa.desconhecidos.map(d => `{${d}}`).join(', ')}</p>
                )}
              </div>
            </div>
          )
        })}
      </Cartao>

      <Cartao titulo="Identificação: nome parecido">
        <Campo
          rotulo="Limiar de nome parecido (0 a 1)"
          id="cfg-limiar"
          erro={erros.limiar}
          ajuda="Parâmetro técnico, a validar. Só serve para ALERTAR nome parecido no mesmo dia; nunca une pessoas."
        >
          <input id="cfg-limiar" inputMode="decimal" value={f.limiar} onChange={e => setF({ ...f, limiar: e.target.value })} aria-invalid={Boolean(erros.limiar) || undefined} />
        </Campo>
      </Cartao>

      <Cartao titulo="Regras a confirmar">
        <label className="opcao-marcar" htmlFor="cfg-cp2">
          <input id="cfg-cp2" type="checkbox" checked={f.exigirCp2} onChange={e => setF({ ...f, exigirCp2: e.target.checked })} />
          <span>
            Exigir o checkpoint 2 da lente concluído antes do Time Out <strong>[S] a confirmar</strong>
          </span>
        </label>
        <p className="suave" style={{ margin: 0 }}>
          Sugestão, não regra do POP: padrão conservador até a decisão do Dr. Augusto. O POP mede a dupla conferência antes do D0, mas não lista a falta do checkpoint 2 como
          hard stop.
        </p>
      </Cartao>

      <Cartao titulo="Bloco de anestesia: itens extras">
        <p style={{ margin: 0 }}>Itens além dos do POP, definidos com o serviço de anestesia. Itens já usados mantêm o identificador.</p>
        {f.anestesia.length === 0 && <p className="suave">Nenhum item extra.</p>}
        {f.anestesia.map((item, n) => (
          <div key={item.novo ? `novo-${n}` : item.id} className="linha" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Campo rotulo={`Item ${n + 1}`} id={`anest-${n}`} erro={erros[`anestesia.${n}`]} ajuda={item.novo ? 'Novo' : `Identificador: ${item.id}`}>
                <input
                  id={`anest-${n}`}
                  value={item.texto}
                  onChange={e => setF({ ...f, anestesia: f.anestesia.map((x, i) => (i === n ? { ...x, texto: e.target.value } : x)) })}
                />
              </Campo>
            </div>
            <Botao tipo="secundario" pequeno onClick={() => setF({ ...f, anestesia: f.anestesia.filter((_, i) => i !== n) })}>
              Remover item {n + 1}
            </Botao>
          </div>
        ))}
        <div>
          <Botao tipo="secundario" onClick={() => setF({ ...f, anestesia: [...f.anestesia, { id: '', texto: '', novo: true }] })}>
            Adicionar item
          </Botao>
        </div>
      </Cartao>

      <Cartao titulo="Feriados">
        <p style={{ margin: 0 }}>Usados na contagem de dia útil (ex.: ligação em até 1 dia útil).</p>
        <div className="linha" style={{ alignItems: 'flex-end' }}>
          <Campo rotulo="Data do feriado" id="cfg-feriado">
            <input id="cfg-feriado" type="date" value={novoFeriado} onChange={e => setNovoFeriado(e.target.value)} />
          </Campo>
          <Botao
            tipo="secundario"
            desabilitado={!dataValida(novoFeriado)}
            onClick={() => {
              if (!dataValida(novoFeriado)) return
              setF({ ...f, feriados: [...new Set([...f.feriados, novoFeriado])].sort() })
              setNovoFeriado('')
            }}
          >
            Adicionar feriado
          </Botao>
        </div>
        {f.feriados.length === 0 ? (
          <p className="suave">Nenhum feriado cadastrado.</p>
        ) : (
          <ul className="contadores">
            {f.feriados.map(d => (
              <li key={d} className="linha">
                <span>{formatarData(d)}</span>
                <Botao tipo="secundario" pequeno onClick={() => setF({ ...f, feriados: f.feriados.filter(x => x !== d) })}>
                  Remover {formatarData(d)}
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Mensagens do TCLE">
        <Campo
          rotulo="Nome fixo de quem assina a mensagem (opcional)"
          id="cfg-assinatura"
          ajuda="Pelo briefing, o nome vem do usuário que envia. Preencha só se o serviço decidir usar um nome fixo (pergunta em aberto)."
        >
          <input id="cfg-assinatura" value={f.assinatura} onChange={e => setF({ ...f, assinatura: e.target.value })} />
        </Campo>
      </Cartao>

      <Retorno retorno={retorno} />
      <div className="linha">
        <Botao submit desabilitado={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar configuração'}
        </Botao>
        <Botao tipo="secundario" onClick={() => setF(paraFormulario(props.inicial))}>
          Desfazer alterações
        </Botao>
      </div>
    </form>
  )
}

export default function Configuracao() {
  const carga = useCarga(() => chamar('config.obter', {}), [])
  if (carga.erro) return <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
  if (!carga.dados) return <Carregando />
  return (
    <div className="pilha">
      <Aviso tipo="info">Toda alteração fica registrada com autor e horário. Valores clínicos e tempos não são fixados no código: vêm daqui.</Aviso>
      <FormConfig inicial={carga.dados} onSalvo={carga.definir} />
    </div>
  )
}
