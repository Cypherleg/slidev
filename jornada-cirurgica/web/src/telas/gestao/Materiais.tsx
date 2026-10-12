// Catálogo de materiais ao paciente (briefing §6.2): título, tipo, endereço ou conteúdo, momento, público e situação.
// Cada salvamento gera uma nova versão; o envio registra a versão enviada.

import { useMemo, useState, type FormEvent } from 'react'
import type { MaterialCatalogo } from '@dominio/index.ts'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Botao, Campo, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { mensagemErro, useCarga } from './comum/carga.ts'
import { ErroCarga, Retorno, Selo } from './comum/componentes.tsx'
import { ROTULO_MOMENTO, ROTULO_PUBLICO, ROTULO_TIPO_MATERIAL } from './comum/rotulos.ts'

interface Rascunho {
  id?: string
  codigo: string
  titulo: string
  tipo: MaterialCatalogo['tipo']
  url: string
  conteudo: string
  momento: MaterialCatalogo['momento']
  publico: MaterialCatalogo['publico']
  ativo: boolean
}

const NOVO: Rascunho = { codigo: '', titulo: '', tipo: 'video', url: '', conteudo: '', momento: 'd7', publico: 'paciente', ativo: true }
const TIPOS = Object.keys(ROTULO_TIPO_MATERIAL) as MaterialCatalogo['tipo'][]
const MOMENTOS = Object.keys(ROTULO_MOMENTO) as MaterialCatalogo['momento'][]
const PUBLICOS = Object.keys(ROTULO_PUBLICO) as MaterialCatalogo['publico'][]
const EXIGE_URL: MaterialCatalogo['tipo'][] = ['video', 'video_tcle', 'link_tcle']

type Erros = Partial<Record<'codigo' | 'titulo' | 'url' | 'conteudo', string>>

function validarMaterial(r: Rascunho): Erros {
  const erros: Erros = {}
  if (!r.id && !/^[a-z0-9_]+$/.test(r.codigo)) erros.codigo = 'Use letras minúsculas, números e "_" (ex.: video_preparo).'
  if (!r.titulo.trim()) erros.titulo = 'Informe o título.'
  const url = r.url.trim()
  if (url) {
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:') erros.url = 'Use um endereço https://.'
    } catch {
      erros.url = 'Endereço inválido.'
    }
  }
  if (EXIGE_URL.includes(r.tipo) && !url) erros.url = 'Informe o endereço (para vídeo ainda não gravado, use um endereço de exemplo).'
  if ((r.tipo === 'texto' || r.tipo === 'outro') && !url && !r.conteudo.trim()) erros.conteudo = 'Informe o texto ou um endereço.'
  return erros
}

function FormMaterial(props: { inicial: Rascunho; onSalvar: (r: Rascunho) => Promise<boolean>; onCancelar: () => void }) {
  const [r, setR] = useState<Rascunho>(props.inicial)
  const [erros, setErros] = useState<Erros>({})
  const [ocupado, setOcupado] = useState(false)
  const editar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR(atual => ({ ...atual, [k]: v }))
  const mostraConteudo = r.tipo === 'texto' || r.tipo === 'outro'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const novos = validarMaterial(r)
    setErros(novos)
    if (Object.keys(novos).length) return
    setOcupado(true)
    const ok = await props.onSalvar(r)
    setOcupado(false)
    if (ok) props.onCancelar()
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={r.id ? `Editar ${props.inicial.titulo}` : 'Novo material'}>
      <div className="linha-campos">
        <Campo rotulo="Título" id="mat-titulo" erro={erros.titulo}>
          <input id="mat-titulo" value={r.titulo} onChange={e => editar('titulo', e.target.value)} aria-invalid={Boolean(erros.titulo) || undefined} />
        </Campo>
        <Campo rotulo="Código" id="mat-codigo" erro={erros.codigo} ajuda={r.id ? 'O código não muda entre versões.' : 'Identificador estável do material.'}>
          <input id="mat-codigo" value={r.codigo} readOnly={Boolean(r.id)} onChange={e => editar('codigo', e.target.value.trim())} aria-invalid={Boolean(erros.codigo) || undefined} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Tipo" id="mat-tipo">
          <select id="mat-tipo" value={r.tipo} onChange={e => editar('tipo', e.target.value as Rascunho['tipo'])}>
            {TIPOS.map(t => (
              <option key={t} value={t}>
                {ROTULO_TIPO_MATERIAL[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Momento de envio" id="mat-momento">
          <select id="mat-momento" value={r.momento} onChange={e => editar('momento', e.target.value as Rascunho['momento'])}>
            {MOMENTOS.map(m => (
              <option key={m} value={m}>
                {ROTULO_MOMENTO[m]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Público" id="mat-publico">
          <select id="mat-publico" value={r.publico} onChange={e => editar('publico', e.target.value as Rascunho['publico'])}>
            {PUBLICOS.map(p => (
              <option key={p} value={p}>
                {ROTULO_PUBLICO[p]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo
        rotulo={EXIGE_URL.includes(r.tipo) ? 'Endereço (URL)' : 'Endereço (URL), opcional'}
        id="mat-url"
        erro={erros.url}
        ajuda="Arquivo de vídeo direto (.mp4, .webm) abre no player da página do paciente; outros endereços abrem como link."
      >
        <input id="mat-url" type="url" inputMode="url" value={r.url} onChange={e => editar('url', e.target.value)} aria-invalid={Boolean(erros.url) || undefined} />
      </Campo>
      {mostraConteudo && (
        <Campo
          rotulo="Conteúdo (texto)"
          id="mat-conteudo"
          erro={erros.conteudo}
          ajuda='Parágrafos separados por linha em branco; linhas que começam com "- " viram lista; **texto** fica em negrito.'
        >
          <textarea id="mat-conteudo" rows={10} value={r.conteudo} onChange={e => editar('conteudo', e.target.value)} aria-invalid={Boolean(erros.conteudo) || undefined} />
        </Campo>
      )}
      <label className="opcao-marcar" htmlFor="mat-ativo">
        <input id="mat-ativo" type="checkbox" checked={r.ativo} onChange={e => editar('ativo', e.target.checked)} />
        Ativo (entra no pacote enviado ao paciente)
      </label>
      <div className="linha">
        <Botao submit desabilitado={ocupado}>
          {ocupado ? 'Salvando…' : r.id ? 'Salvar nova versão' : 'Salvar'}
        </Botao>
        <Botao tipo="secundario" onClick={props.onCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}

function resumoConteudo(m: MaterialCatalogo): string {
  if (m.url) return m.url
  if (m.conteudo) return m.conteudo.length > 80 ? `${m.conteudo.slice(0, 80)}…` : m.conteudo
  return '—'
}

export default function Materiais() {
  const carga = useCarga(() => chamar('materiais.listar', {}), [])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const [retorno, setRetorno] = useState<{ tipo: 'ok' | 'perigo'; texto: string } | null>(null)

  const linhas = useMemo(() => {
    const lista = [...(carga.dados ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo) || b.versao - a.versao)
    const atual = new Map<string, number>()
    for (const m of lista) if (!atual.has(m.codigo)) atual.set(m.codigo, m.versao)
    return lista.map(m => ({ m, atual: atual.get(m.codigo) === m.versao }))
  }, [carga.dados])
  const visiveis = linhas.filter(l => verAnteriores || l.atual)
  const temAnteriores = linhas.some(l => !l.atual)

  const salvar = async (r: Rascunho): Promise<boolean> => {
    try {
      const salvo = await chamar('materiais.salvar', {
        material: {
          ...(r.id ? { id: r.id } : {}),
          codigo: r.codigo,
          titulo: r.titulo.trim(),
          tipo: r.tipo,
          url: r.url.trim() || null,
          conteudo: r.tipo === 'texto' || r.tipo === 'outro' ? r.conteudo.trim() || null : null,
          momento: r.momento,
          publico: r.publico,
          ativo: r.ativo,
        },
      })
      setRetorno({ tipo: 'ok', texto: `"${salvo.titulo}" salvo como versão ${salvo.versao}.` })
      carga.recarregar()
      return true
    } catch (e) {
      setRetorno({ tipo: 'perigo', texto: mensagemErro(e) })
      return false
    }
  }

  return (
    <div className="pilha">
      <Retorno retorno={retorno} />
      <Aviso tipo="info" titulo="Textos ao paciente">
        Tratamento "o senhor" e "a senhora", sem promessa de resultado e sem emojis. Não cite o olho: a página do paciente não mostra o olho (a pergunta 1 do
        questionário confere o olho com a agenda). Cada salvamento gera uma nova versão; o envio registra a versão enviada.
      </Aviso>
      {rascunho ? (
        <Cartao titulo={rascunho.id ? `Editar: ${rascunho.titulo}` : 'Novo material'}>
          <FormMaterial key={rascunho.id ?? 'novo'} inicial={rascunho} onSalvar={salvar} onCancelar={() => setRascunho(null)} />
        </Cartao>
      ) : (
        <div>
          <Botao onClick={() => setRascunho({ ...NOVO })}>Novo material</Botao>
        </div>
      )}
      <Cartao
        titulo="Catálogo"
        acoes={
          temAnteriores ? (
            <label className="opcao-marcar" htmlFor="mat-anteriores">
              <input id="mat-anteriores" type="checkbox" checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} />
              Mostrar versões anteriores
            </label>
          ) : undefined
        }
      >
        {carga.erro ? (
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        ) : !carga.dados ? (
          <Carregando />
        ) : visiveis.length === 0 ? (
          <p>Nenhum material no catálogo.</p>
        ) : (
          <div className="rolagem-tabela">
            <table className="tabela">
              <caption className="sr-only">Catálogo de materiais</caption>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Momento</th>
                  <th scope="col">Público</th>
                  <th scope="col">Versão</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Endereço ou texto</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ m, atual }) => (
                  <tr key={m.id} className={m.ativo && atual ? undefined : 'inativo'}>
                    <td>
                      {m.titulo}
                      <br />
                      <span className="codigo suave">{m.codigo}</span>
                    </td>
                    <td>{ROTULO_TIPO_MATERIAL[m.tipo] ?? m.tipo}</td>
                    <td>{ROTULO_MOMENTO[m.momento] ?? m.momento}</td>
                    <td>{ROTULO_PUBLICO[m.publico] ?? m.publico}</td>
                    <td className="numero">
                      {m.versao}
                      {!atual && <span className="suave"> (anterior)</span>}
                    </td>
                    <td>{m.ativo ? <Selo tipo="ok">Ativo</Selo> : <Selo tipo="perigo">Inativo</Selo>}</td>
                    <td style={{ wordBreak: 'break-word', maxWidth: 280 }}>{resumoConteudo(m)}</td>
                    <td>
                      {atual && (
                        <Botao
                          tipo="secundario"
                          pequeno
                          onClick={() =>
                            setRascunho({
                              id: m.id,
                              codigo: m.codigo,
                              titulo: m.titulo,
                              tipo: m.tipo,
                              url: m.url ?? '',
                              conteudo: m.conteudo ?? '',
                              momento: m.momento,
                              publico: m.publico,
                              ativo: m.ativo,
                            })
                          }
                        >
                          Editar
                        </Botao>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  )
}
