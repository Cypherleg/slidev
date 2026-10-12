// Página do paciente: link único, sem login, celular primeiro (briefing §6.2; POP §5, §6 e §7).
// Fonte grande e alto contraste (o público tem catarata). Tratamento "o senhor" / "a senhora".
// NUNCA exibe o olho: a pergunta 1 do quiz confere o olho dito pelo paciente contra a agenda.
// Só renderiza campos conhecidos do contrato; qualquer campo extra vindo do servidor é ignorado.

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import type { AcoesPaciente } from '@contrato'
import { chamarPaciente } from '../../api/cliente.ts'
import './paciente.css'

type Pagina = AcoesPaciente['pagina.obter']['S']
type Pergunta = Pagina['quiz'][number]
type Material = Pagina['materiais'][number]
type ProximaAcao = AcoesPaciente['quiz.responder']['S']['proximaAcao']
type QuemInstila = { eu: boolean; nome?: string }

type Carga = { tipo: 'carregando' } | { tipo: 'link_indisponivel' } | { tipo: 'sem_conexao' } | { tipo: 'ok'; pagina: Pagina }

/** Situação do questionário na tela. */
type Situacao = 'responder' | 'responder_de_novo' | 'rever' | 'aprovado' | 'contato' | 'indisponivel'

const TITULO_ABA = 'Preparo para a cirurgia · OFTA VITTA'

function codigoErro(e: unknown): string | null {
  if (e && typeof e === 'object' && 'erro' in e) {
    const c = (e as { erro?: { codigo?: unknown } }).erro?.codigo
    return typeof c === 'string' ? c : null
  }
  return null
}

function situacaoInicial(p: Pagina): Situacao {
  if (p.podeResponder) {
    return p.tentativas > 0 && p.ultimaTentativa && !p.ultimaTentativa.aprovado ? 'responder_de_novo' : 'responder'
  }
  if (p.ultimaTentativa?.aprovado) return 'aprovado'
  if (p.ultimaTentativa) return 'contato'
  return 'indisponivel'
}

function situacaoDaResposta(acao: ProximaAcao): Situacao {
  if (acao === 'concluido') return 'aprovado'
  if (acao === 'rever_video_e_tentar_de_novo') return 'rever'
  return 'contato'
}

/** Arquivo de vídeo direto (abre no player da página); outros endereços abrem como link. */
function ehVideoDireto(url: string): boolean {
  try {
    const u = new URL(url, 'https://exemplo.invalid/')
    return /\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(u.pathname)
  } catch {
    return false
  }
}

function hrefTelefone(numero: string): string {
  return `tel:${numero.replace(/[^\d+]/g, '')}`
}

function focar(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.focus()
  el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

// ---------------------------------------------------------------------------
// Texto das orientações (catálogo da gestora): parágrafos, listas com "- " e **negrito**.
// Renderizado como texto (sem HTML vindo do servidor).
// ---------------------------------------------------------------------------

function comNegrito(texto: string): ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : <Fragment key={i}>{parte}</Fragment>))
}

function TextoOrientacao(props: { texto: string }) {
  const linhas = props.texto.replace(/\r\n/g, '\n').split('\n')
  const blocos: ReactNode[] = []
  let paragrafo: string[] = []
  let lista: string[] = []
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      const atual = paragrafo
      blocos.push(
        <p key={blocos.length}>
          {atual.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {comNegrito(l)}
            </Fragment>
          ))}
        </p>,
      )
      paragrafo = []
    }
  }
  const fecharLista = () => {
    if (lista.length) {
      const atual = lista
      blocos.push(
        <ul key={blocos.length}>
          {atual.map((l, i) => (
            <li key={i}>{comNegrito(l)}</li>
          ))}
        </ul>,
      )
      lista = []
    }
  }
  for (const linha of linhas) {
    if (!linha.trim()) {
      fecharParagrafo()
      fecharLista()
      continue
    }
    const item = /^\s*[-•*]\s+(.*)$/.exec(linha)
    if (item) {
      fecharParagrafo()
      lista.push(item[1])
    } else {
      fecharLista()
      paragrafo.push(linha.trim())
    }
  }
  fecharParagrafo()
  fecharLista()
  return <div className="pac-texto">{blocos}</div>
}

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

function MaterialVideo(props: { material: Material; onAbrir: () => void }) {
  const { material, onAbrir } = props
  if (!material.url) return <p>O vídeo ainda não está disponível.</p>
  if (ehVideoDireto(material.url)) {
    return (
      <>
        <video className="pac-video" controls preload="metadata" playsInline src={material.url} onPlay={onAbrir} aria-label={material.titulo}>
          <a href={material.url} target="_blank" rel="noopener noreferrer" onClick={onAbrir}>
            Assistir ao vídeo
          </a>
        </video>
        <p>
          <a href={material.url} target="_blank" rel="noopener noreferrer" onClick={onAbrir}>
            Se o vídeo não abrir aqui, toque neste link.
          </a>
        </p>
      </>
    )
  }
  return (
    <a className="pac-botao" href={material.url} target="_blank" rel="noopener noreferrer" onClick={onAbrir}>
      Assistir ao vídeo
    </a>
  )
}

function MaterialTexto(props: { material: Material; onAbrir: () => void; rotuloAbrir: string }) {
  const { material, onAbrir } = props
  const [aberto, setAberto] = useState(false)
  const idConteudo = `material-${material.id}`
  if (material.conteudo && material.conteudo.trim()) {
    return (
      <>
        <button
          type="button"
          className="pac-botao secundario"
          aria-expanded={aberto}
          aria-controls={idConteudo}
          onClick={() => {
            if (!aberto) onAbrir()
            setAberto(!aberto)
          }}
        >
          {aberto ? 'Fechar' : props.rotuloAbrir}
        </button>
        <div id={idConteudo} hidden={!aberto}>
          {aberto && <TextoOrientacao texto={material.conteudo} />}
        </div>
      </>
    )
  }
  if (material.url) {
    return (
      <a className="pac-botao secundario" href={material.url} target="_blank" rel="noopener noreferrer" onClick={onAbrir}>
        {props.rotuloAbrir}
      </a>
    )
  }
  return <p>Este material ainda não está disponível.</p>
}

// ---------------------------------------------------------------------------
// Questionário (POP §6): 11 perguntas pontuadas + "quem vai pingar" (não pontua)
// ---------------------------------------------------------------------------

function Questionario(props: {
  perguntas: Pergunta[]
  enviando: boolean
  erroEnvio: string | null
  onEnviar: (respostas: Record<number, string>, quemInstila: QuemInstila | undefined) => void
}) {
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [quem, setQuem] = useState<'' | 'eu' | 'outra'>('')
  const [nome, setNome] = useState('')
  const [faltam, setFaltam] = useState<number[]>([])
  const [faltaNome, setFaltaNome] = useState(false)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const pendentes: number[] = []
    let semNome = false
    for (const p of props.perguntas) {
      if (p.tipo === 'quem_instila') {
        if (!quem) pendentes.push(p.numero)
        else if (quem === 'outra' && !nome.trim()) semNome = true
      } else if (!respostas[p.numero]) {
        pendentes.push(p.numero)
      }
    }
    setFaltam(pendentes)
    setFaltaNome(semNome)
    if (pendentes.length > 0) {
      const primeiro = document.querySelector<HTMLInputElement>(`#pergunta-${pendentes[0]} input`)
      primeiro?.focus()
      return
    }
    if (semNome) {
      document.getElementById('quem-instila-nome')?.focus()
      return
    }
    const temQuem = props.perguntas.some(p => p.tipo === 'quem_instila')
    const quemInstila: QuemInstila | undefined = temQuem ? (quem === 'eu' ? { eu: true } : { eu: false, nome: nome.trim() }) : undefined
    const somenteOpcoes: Record<number, string> = {}
    for (const p of props.perguntas) if (p.tipo === 'opcao' && respostas[p.numero]) somenteOpcoes[p.numero] = respostas[p.numero]
    props.onEnviar(somenteOpcoes, quemInstila)
  }

  return (
    <form onSubmit={enviar} noValidate className="pac-quiz">
      {(faltam.length > 0 || faltaNome) && (
        <div className="pac-aviso atencao" role="alert">
          {faltam.length > 0 && (
            <p>
              {faltam.length === 1 ? `Falta responder a pergunta ${faltam[0]}.` : `Falta responder as perguntas ${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}.`}
            </p>
          )}
          {faltaNome && <p>Escreva o nome de quem vai pingar os colírios.</p>}
        </div>
      )}
      {props.perguntas.map(p => {
        const marcada = p.tipo === 'quem_instila' ? quem : respostas[p.numero] ?? ''
        const semResposta = faltam.includes(p.numero)
        return (
          <fieldset key={p.numero} id={`pergunta-${p.numero}`} className={`pac-pergunta${semResposta ? ' sem-resposta' : ''}`} aria-invalid={semResposta || undefined}>
            <legend>
              <span className="pac-numero">Pergunta {p.numero}.</span> {p.texto}
            </legend>
            {semResposta && <p className="pac-erro">Escolha uma resposta.</p>}
            {p.tipo === 'quem_instila' ? (
              <>
                {(
                  [
                    { valor: 'eu', rotulo: 'Eu' },
                    { valor: 'outra', rotulo: 'Outra pessoa' },
                  ] as const
                ).map(o => (
                  <label key={o.valor} className="pac-opcao">
                    <input type="radio" name={`p${p.numero}`} value={o.valor} checked={marcada === o.valor} onChange={() => setQuem(o.valor)} />
                    <span>{o.rotulo}</span>
                  </label>
                ))}
                {quem === 'outra' && (
                  <div className="pac-campo">
                    <label htmlFor="quem-instila-nome">Nome de quem vai pingar os colírios</label>
                    <input
                      id="quem-instila-nome"
                      type="text"
                      autoComplete="off"
                      value={nome}
                      aria-invalid={faltaNome || undefined}
                      aria-describedby="quem-instila-ajuda"
                      onChange={e => setNome(e.target.value)}
                    />
                    <p id="quem-instila-ajuda" className="pac-ajuda">
                      Essa pessoa também precisa assistir ao vídeo e responder ao questionário.
                    </p>
                    {faltaNome && <p className="pac-erro">Escreva o nome.</p>}
                  </div>
                )}
              </>
            ) : (
              p.opcoes.map(o => (
                <label key={o.valor} className="pac-opcao">
                  <input
                    type="radio"
                    name={`p${p.numero}`}
                    value={o.valor}
                    checked={marcada === o.valor}
                    onChange={() => setRespostas(r => ({ ...r, [p.numero]: o.valor }))}
                  />
                  <span>{o.rotulo}</span>
                </label>
              ))
            )}
          </fieldset>
        )
      })}
      {props.erroEnvio && (
        <div className="pac-aviso perigo" role="alert">
          <p>{props.erroEnvio}</p>
        </div>
      )}
      <button type="submit" className="pac-botao" disabled={props.enviando}>
        {props.enviando ? 'Enviando…' : 'Enviar respostas'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Telefones (configurados pela gestora; nenhum número fixado no código)
// ---------------------------------------------------------------------------

function Telefones(props: { telefones: Pagina['telefones'] | undefined }) {
  const t = props.telefones ?? {}
  const itens = [
    { rotulo: 'Hospital OFTA VITTA', numero: t.hospital },
    { rotulo: 'WhatsApp da concierge', numero: t.whatsappConcierge },
    { rotulo: 'Enfermagem, fora do horário comercial', numero: t.enfermagemForaHorario },
  ].filter((x): x is { rotulo: string; numero: string } => typeof x.numero === 'string' && x.numero.trim() !== '')
  if (itens.length === 0) return null
  return (
    <section className="pac-secao" aria-labelledby="secao-telefones">
      <h2 id="secao-telefones">Telefones</h2>
      <ul className="pac-telefones">
        {itens.map(i => (
          <li key={i.rotulo}>
            <span>{i.rotulo}</span>
            <a href={hrefTelefone(i.numero)}>{i.numero}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function PaginaPaciente() {
  const { token = '' } = useParams()
  const [carga, setCarga] = useState<Carga>({ tipo: 'carregando' })
  const [rodada, setRodada] = useState(0)
  const [situacao, setSituacao] = useState<Situacao>('responder')
  const [chaveFormulario, setChaveFormulario] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const vistos = useRef(new Set<string>())
  const resultadoRef = useRef<HTMLDivElement>(null)
  const [focarResultado, setFocarResultado] = useState(false)

  useEffect(() => {
    const anterior = document.title
    document.title = TITULO_ABA
    return () => {
      document.title = anterior
    }
  }, [])

  useEffect(() => {
    let vivo = true
    setCarga({ tipo: 'carregando' })
    if (!token) {
      setCarga({ tipo: 'link_indisponivel' })
      return
    }
    chamarPaciente('pagina.obter', token, {}).then(
      pagina => {
        if (!vivo) return
        setCarga({ tipo: 'ok', pagina })
        setSituacao(situacaoInicial(pagina))
      },
      e => {
        if (!vivo) return
        const c = codigoErro(e)
        setCarga({ tipo: c === 'indisponivel' || c === 'limite_taxa' || c === null ? 'sem_conexao' : 'link_indisponivel' })
      },
    )
    return () => {
      vivo = false
    }
  }, [token, rodada])

  useEffect(() => {
    if (focarResultado) {
      resultadoRef.current?.focus()
      setFocarResultado(false)
    }
  }, [focarResultado])

  const registrarAbertura = useCallback(
    (materialId: string) => {
      if (vistos.current.has(materialId)) return
      vistos.current.add(materialId)
      chamarPaciente('material.visualizado', token, { materialId }).catch(() => {
        // Registro de abertura não bloqueia o paciente; permite tentar de novo numa próxima abertura.
        vistos.current.delete(materialId)
      })
    },
    [token],
  )

  const enviarQuiz = async (respostas: Record<number, string>, quemInstila: QuemInstila | undefined) => {
    setEnviando(true)
    setErroEnvio(null)
    try {
      const r = await chamarPaciente('quiz.responder', token, quemInstila ? { respostas, quemInstila } : { respostas })
      setSituacao(situacaoDaResposta(r.proximaAcao))
      setFocarResultado(true)
    } catch {
      setErroEnvio('Não foi possível enviar as respostas agora. Verifique a conexão e tente de novo em alguns minutos.')
    } finally {
      setEnviando(false)
    }
  }

  if (carga.tipo === 'carregando') {
    return (
      <main className="pac">
        <Marca />
        <p role="status">Carregando…</p>
      </main>
    )
  }

  if (carga.tipo === 'link_indisponivel') {
    return (
      <main className="pac">
        <Marca />
        <h1>Este link não está disponível.</h1>
        <p>Se precisar de ajuda, fale com a equipe do OFTA VITTA.</p>
      </main>
    )
  }

  if (carga.tipo === 'sem_conexao') {
    return (
      <main className="pac">
        <Marca />
        <h1>Não foi possível abrir a página agora.</h1>
        <p>Verifique a conexão com a internet e tente de novo em alguns minutos.</p>
        <button type="button" className="pac-botao" onClick={() => setRodada(r => r + 1)}>
          Tentar de novo
        </button>
      </main>
    )
  }

  const p = carga.pagina
  const materiais = Array.isArray(p.materiais) ? p.materiais : []
  const videosPreparo = materiais.filter(m => m.tipo === 'video')
  const textos = materiais.filter(m => m.tipo === 'texto')
  const videosTcle = materiais.filter(m => m.tipo === 'video_tcle')
  const linksTcleMateriais = materiais.filter(m => m.tipo === 'link_tcle' && m.url)
  const outros = materiais.filter(m => m.tipo === 'outro')
  const linkTcleAvulso = p.tcleLink && !linksTcleMateriais.some(m => m.url === p.tcleLink) ? p.tcleLink : null
  const temTcle = videosTcle.length > 0 || linksTcleMateriais.length > 0 || Boolean(linkTcleAvulso)
  const perguntas = Array.isArray(p.quiz) ? p.quiz : []

  let numeroSecao = 0
  const proximo = () => ++numeroSecao

  return (
    <main className="pac">
      <Marca />
      <h1>Preparo para a cirurgia</h1>
      <p className="pac-saudacao">Olá, {p.primeiroNome}.</p>
      <p>
        Esta página reúne o vídeo, as orientações por escrito e um questionário curto sobre o preparo. Se o senhor ou a senhora tiver qualquer dúvida,
        fale com a equipe do OFTA VITTA.
      </p>

      {videosPreparo.length > 0 && (
        <section className="pac-secao" aria-labelledby="secao-video">
          <h2 id="secao-video" tabIndex={-1}>
            {proximo()}. {videosPreparo.length > 1 ? 'Assista aos vídeos' : 'Assista ao vídeo'}
          </h2>
          <p>Se outra pessoa vai pingar os seus colírios, ela também deve assistir.</p>
          {videosPreparo.map(m => (
            <div key={m.id} className="pac-material">
              <h3>{m.titulo}</h3>
              <MaterialVideo material={m} onAbrir={() => registrarAbertura(m.id)} />
            </div>
          ))}
        </section>
      )}

      {textos.length > 0 && (
        <section className="pac-secao" aria-labelledby="secao-orientacoes">
          <h2 id="secao-orientacoes">{proximo()}. Leia as orientações</h2>
          {textos.map(m => (
            <div key={m.id} className="pac-material">
              <h3>{m.titulo}</h3>
              <MaterialTexto material={m} rotuloAbrir="Ler as orientações" onAbrir={() => registrarAbertura(m.id)} />
            </div>
          ))}
        </section>
      )}

      <section className="pac-secao" aria-labelledby="secao-questionario">
        <h2 id="secao-questionario">{proximo()}. Responda ao questionário</h2>
        <div ref={resultadoRef} tabIndex={-1} className="pac-resultado">
          {situacao === 'aprovado' && (
            <div className="pac-aviso ok" role="status">
              <p>
                <strong>Questionário concluído. Obrigado.</strong>
              </p>
              <p>Se ainda tiver alguma dúvida, fale com a equipe do OFTA VITTA.</p>
            </div>
          )}
          {situacao === 'contato' && (
            <div className="pac-aviso info" role="status">
              <p>
                <strong>Obrigado por responder.</strong>
              </p>
              <p>A equipe do OFTA VITTA vai entrar em contato com o senhor ou a senhora para conversar sobre as orientações.</p>
            </div>
          )}
          {situacao === 'rever' && (
            <div className="pac-aviso atencao" role="status">
              <p>
                <strong>Algumas respostas precisam de atenção.</strong>
              </p>
              <p>Por favor, assista de novo ao vídeo e responda outra vez.</p>
              <div className="pac-acoes">
                {videosPreparo.length > 0 && (
                  <button type="button" className="pac-botao secundario" onClick={() => focar('secao-video')}>
                    Assistir ao vídeo de novo
                  </button>
                )}
                <button
                  type="button"
                  className="pac-botao"
                  onClick={() => {
                    setChaveFormulario(k => k + 1)
                    setSituacao('responder_de_novo')
                  }}
                >
                  Responder outra vez
                </button>
              </div>
            </div>
          )}
          {situacao === 'indisponivel' && <p>O questionário não está disponível agora.</p>}
        </div>
        {(situacao === 'responder' || situacao === 'responder_de_novo') && perguntas.length > 0 && (
          <>
            {situacao === 'responder_de_novo' ? (
              <div className="pac-aviso atencao">
                <p>Assista de novo ao vídeo e responda outra vez.</p>
              </div>
            ) : (
              <p>
                São {perguntas.length} perguntas sobre o preparo. Marque uma resposta em cada uma. As respostas ajudam a equipe a saber se alguma orientação
                precisa ser explicada de novo.
              </p>
            )}
            <Questionario key={chaveFormulario} perguntas={perguntas} enviando={enviando} erroEnvio={erroEnvio} onEnviar={enviarQuiz} />
          </>
        )}
      </section>

      {temTcle && (
        <section className="pac-secao" aria-labelledby="secao-tcle">
          <h2 id="secao-tcle">{proximo()}. Termo de consentimento</h2>
          {situacao === 'contato' ? (
            <div className="pac-aviso info">
              <p>Antes de assinar o termo, aguarde o contato da equipe.</p>
            </div>
          ) : null}
          <p>Leia o termo com calma. Se tiver qualquer dúvida sobre a cirurgia, não assine ainda e avise a equipe: o médico esclarece antes.</p>
          {videosTcle.map(m => (
            <div key={m.id} className="pac-material">
              <h3>{m.titulo}</h3>
              <MaterialVideo material={m} onAbrir={() => registrarAbertura(m.id)} />
            </div>
          ))}
          {linksTcleMateriais.map(m => (
            <p key={m.id}>
              <a className="pac-botao" href={m.url ?? undefined} target="_blank" rel="noopener noreferrer" onClick={() => registrarAbertura(m.id)}>
                {linksTcleMateriais.length > 1 ? m.titulo : 'Abrir o termo de consentimento'}
              </a>
            </p>
          ))}
          {linkTcleAvulso && (
            <p>
              <a className="pac-botao" href={linkTcleAvulso} target="_blank" rel="noopener noreferrer">
                Abrir o termo de consentimento
              </a>
            </p>
          )}
        </section>
      )}

      {outros.length > 0 && (
        <section className="pac-secao" aria-labelledby="secao-outros">
          <h2 id="secao-outros">Outros materiais</h2>
          {outros.map(m => (
            <div key={m.id} className="pac-material">
              <h3>{m.titulo}</h3>
              <MaterialTexto material={m} rotuloAbrir="Abrir" onAbrir={() => registrarAbertura(m.id)} />
            </div>
          ))}
        </section>
      )}

      <Telefones telefones={p.telefones} />

      <footer className="pac-rodape">
        <p>Este link é pessoal. Não compartilhe.</p>
        <p>OFTA VITTA</p>
      </footer>
    </main>
  )
}

function Marca() {
  return (
    <header className="pac-marca">
      <span>OFTA VITTA</span>
    </header>
  )
}
