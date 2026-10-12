// Novo episódio (D-7, concierge): CPF → Datasigh → conferência com documento com foto → cadastro → abertura.
// Mostra só os campos que a API devolveu. Sem Datasigh: cadastro manual marcado "NÃO CONFERIDO NO DATASIGH".
// Um episódio = um paciente, um olho, uma cirurgia. O 2º olho é outro episódio; nada da lente do 1º é copiado.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ResultadoBuscaCpf } from '@contrato'
import type { Olho, Papel } from '@dominio/tipos.ts'
import { OLHO_EXTENSO, ROTULO_ESTADO } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { useTratarErro } from '../../app/erros.tsx'
import { useSessao } from '../../app/sessao.tsx'
import { Aviso, Botao, Campo, Cartao, EscolhaUnica, Selo } from '../../componentes/base/index.tsx'
import { cpfValido, dataValida, digitos, formatarData, hojeLocal, mascararCpfDigitado } from '../../componentes/formato.ts'
import { temAlgumPapel } from '../../componentes/permissoes.ts'
import { ROTAS } from '../../rotas.ts'

interface PacienteEscolhido {
  id: string
  nomeCompleto: string
  dataNascimento: string
  conferidoDatasigh: boolean
  episodios: NonNullable<ResultadoBuscaCpf['pacienteExistente']>['episodios']
}

const MENSAGEM_DATASIGH: Record<Exclude<ResultadoBuscaCpf['datasigh']['status'], 'encontrado'>, string> = {
  nao_encontrado: 'O Datasigh não encontrou este CPF.',
  indisponivel: 'O Datasigh não respondeu agora.',
  nao_configurado: 'A consulta ao Datasigh ainda não está configurada neste ambiente.',
}

export default function NovoEpisodio() {
  const sessao = useSessao()
  const tratar = useTratarErro()
  const navegar = useNavigate()
  const [cpf, setCpf] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoBuscaCpf | null>(null)
  const [paciente, setPaciente] = useState<PacienteEscolhido | null>(null)
  const pode = temAlgumPapel(sessao.papeis, ['concierge', 'gestora'])

  const cpfOk = cpfValido(cpf)
  const buscar = async () => {
    if (!cpfOk) return
    setBuscando(true)
    setResultado(null)
    setPaciente(null)
    try {
      const r = await chamar('paciente.buscar_cpf', { cpf: digitos(cpf) })
      setResultado(r)
    } catch (e) {
      tratar(e)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <main className="pagina pilha" style={{ maxWidth: 960 }}>
      <h1>Novo episódio (D-7)</h1>
      {!pode && <Aviso tipo="atencao">Só a concierge ou a gestora abre episódio. Troque quem marca pelo PIN, se for o caso.</Aviso>}
      <Cartao titulo="1. CPF do paciente">
        <form
          className="linha"
          style={{ alignItems: 'flex-end' }}
          autoComplete="off"
          onSubmit={e => {
            e.preventDefault()
            void buscar()
          }}
        >
          <Campo rotulo="CPF" id="cpf" erro={digitos(cpf).length === 11 && !cpfOk ? 'CPF inválido: confira os dígitos.' : null}>
            <input
              id="cpf"
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              onChange={e => {
                setCpf(mascararCpfDigitado(e.target.value))
                setResultado(null)
                setPaciente(null)
              }}
              style={{ fontSize: '1.3rem', maxWidth: 260 }}
            />
          </Campo>
          <Botao submit desabilitado={!cpfOk || buscando || !pode}>
            {buscando ? 'Consultando…' : 'Consultar'}
          </Botao>
        </form>
        <p className="suave" style={{ margin: 0 }}>
          O CPF serve só para a consulta: o painel não grava o número. As consultas ficam registradas.
        </p>
      </Cartao>

      {resultado && !paciente && (
        <ConferenciaPaciente
          cpf={digitos(cpf)}
          resultado={resultado}
          aoEscolher={setPaciente}
          aoErro={e => tratar(e)}
        />
      )}

      {paciente && <AbrirEpisodio paciente={paciente} aoAberto={id => navegar(ROTAS.episodio(id, 'd7'))} aoTrocar={() => setPaciente(null)} />}
    </main>
  )
}

function ConferenciaPaciente(props: { cpf: string; resultado: ResultadoBuscaCpf; aoEscolher: (p: PacienteEscolhido) => void; aoErro: (e: unknown) => void }) {
  const { resultado } = props
  const existente = resultado.pacienteExistente
  const ds = resultado.datasigh
  const campos = ds.status === 'encontrado' ? (ds.campos ?? {}) : {}
  const [documento, setDocumento] = useState(false)
  const [nome, setNome] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [nomeMae, setNomeMae] = useState('')
  const [prontuario, setProntuario] = useState('')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (existente) {
    const olhosOperados = existente.episodios
    return (
      <Cartao titulo="2. Paciente já cadastrado neste painel">
        <dl className="valores-lente">
          <dt>Nome completo</dt>
          <dd>{existente.nomeCompleto}</dd>
          <dt>Nascimento</dt>
          <dd>{formatarData(existente.dataNascimento)}</dd>
        </dl>
        <p style={{ margin: 0 }}>Confira com o documento com foto. A identificação é por chave estável (CPF ou Datasigh), nunca por nome ou telefone.</p>
        {olhosOperados.length > 0 && (
          <div className="pilha">
            <h3 style={{ margin: 0 }}>Episódios anteriores</h3>
            <ul className="lista-simples">
              {olhosOperados.map(ep => (
                <li key={ep.id}>
                  <strong>{OLHO_EXTENSO[ep.olho]}</strong> · {ROTULO_ESTADO[ep.estado as keyof typeof ROTULO_ESTADO] ?? ep.estado}
                  {ep.dataCirurgia ? ` · cirurgia em ${formatarData(ep.dataCirurgia)}` : ''} · <Link to={ROTAS.episodio(ep.id)}>abrir</Link>
                </li>
              ))}
            </ul>
            <Aviso tipo="atencao" titulo="Se for o 2º olho">
              Abra um novo episódio: POP completo de novo (novo TCLE, novo checklist D-7, nova pulseira e etiqueta). Nada da lente do 1º olho é copiado. O episódio recebe o alerta "2º OLHO".
            </Aviso>
          </div>
        )}
        <ConfirmaDocumento valor={documento} aoMudar={setDocumento} />
        <div>
          <Botao
            desabilitado={!documento}
            onClick={() =>
              props.aoEscolher({ id: existente.id, nomeCompleto: existente.nomeCompleto, dataNascimento: existente.dataNascimento, conferidoDatasigh: true, episodios: existente.episodios })
            }
          >
            Continuar com este paciente
          </Botao>
        </div>
      </Cartao>
    )
  }

  const encontrado = ds.status === 'encontrado'
  // Campos que o Datasigh devolveu ficam fixos; os que faltarem são digitados e o cadastro sai como não conferido.
  const nomeFinal = campos.nomeCompleto ?? nome.trim()
  const nascimentoFinal = campos.dataNascimento ?? nascimento
  const prontuarioFinal = campos.prontuario ?? (prontuario.trim() || null)
  const conferido = encontrado && Boolean(campos.nomeCompleto) && Boolean(campos.dataNascimento)
  const erros: Record<string, string> = {}
  if (!nomeFinal || nomeFinal.split(/\s+/).length < 2) erros.nome = 'Nome completo, conforme o documento com foto.'
  if (!dataValida(nascimentoFinal) || nascimentoFinal > hojeLocal()) erros.nascimento = 'Data de nascimento inválida.'
  if (!documento) erros.documento = 'Confira o documento com foto.'

  const cadastrar = async () => {
    setTentou(true)
    if (Object.keys(erros).length) return
    setEnviando(true)
    try {
      const r = await chamar('paciente.cadastrar', {
        cpf: props.cpf,
        datasighId: campos.datasighId ?? null,
        nomeCompleto: nomeFinal,
        dataNascimento: nascimentoFinal,
        nomeMae: nomeMae.trim() || null,
        prontuario: prontuarioFinal,
        conferidoDatasigh: conferido,
        documentoConferido: documento,
      })
      props.aoEscolher({ id: r.pacienteId, nomeCompleto: nomeFinal, dataNascimento: nascimentoFinal, conferidoDatasigh: conferido, episodios: [] })
    } catch (e) {
      props.aoErro(e)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Cartao titulo="2. Conferir com o documento com foto">
      {encontrado ? (
        <Aviso tipo="info" titulo="Dados devolvidos pelo Datasigh">
          Confira cada campo com o documento com foto. Só aparecem os campos que a API devolveu.
        </Aviso>
      ) : (
        <Aviso tipo="atencao" titulo={MENSAGEM_DATASIGH[ds.status as keyof typeof MENSAGEM_DATASIGH]}>
          Cadastro manual a partir do documento com foto. Ficará marcado como <strong>NÃO CONFERIDO NO DATASIGH</strong>.
        </Aviso>
      )}
      {!conferido && (
        <p style={{ margin: 0 }}>
          <Selo tipo="atencao">NÃO CONFERIDO NO DATASIGH</Selo>
        </p>
      )}
      {encontrado && (
        <dl className="valores-lente">
          {campos.nomeCompleto && (
            <>
              <dt>Nome completo</dt>
              <dd>{campos.nomeCompleto}</dd>
            </>
          )}
          {campos.dataNascimento && (
            <>
              <dt>Nascimento</dt>
              <dd>{formatarData(campos.dataNascimento)}</dd>
            </>
          )}
          {campos.prontuario && (
            <>
              <dt>Prontuário</dt>
              <dd>{campos.prontuario}</dd>
            </>
          )}
          {campos.telefones && campos.telefones.length > 0 && (
            <>
              <dt>Telefones</dt>
              <dd>{campos.telefones.join(' · ')}</dd>
            </>
          )}
        </dl>
      )}
      <form
        className="pilha"
        autoComplete="off"
        onSubmit={e => {
          e.preventDefault()
          void cadastrar()
        }}
      >
        {!campos.nomeCompleto && (
          <Campo rotulo="Nome completo (conforme documento com foto)" id="pac-nome" obrigatorio erro={tentou ? erros.nome : null}>
            <input id="pac-nome" type="text" autoComplete="off" value={nome} onChange={e => setNome(e.target.value)} />
          </Campo>
        )}
        {!campos.dataNascimento && (
          <Campo rotulo="Data de nascimento" id="pac-nascimento" obrigatorio erro={tentou ? erros.nascimento : null}>
            <input id="pac-nascimento" type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} max={hojeLocal()} />
          </Campo>
        )}
        {!campos.prontuario && (
          <Campo rotulo="Prontuário nº" id="pac-prontuario">
            <input id="pac-prontuario" type="text" autoComplete="off" value={prontuario} onChange={e => setProntuario(e.target.value)} />
          </Campo>
        )}
        <Campo rotulo="Nome da mãe (3º identificador; obrigatório se houver homônimo no dia)" id="pac-mae">
          <input id="pac-mae" type="text" autoComplete="off" value={nomeMae} onChange={e => setNomeMae(e.target.value)} />
        </Campo>
        <ConfirmaDocumento valor={documento} aoMudar={setDocumento} erro={tentou ? erros.documento : null} />
        <div>
          <Botao submit desabilitado={enviando}>
            {enviando ? 'Cadastrando…' : 'Cadastrar paciente'}
          </Botao>
        </div>
      </form>
    </Cartao>
  )
}

function ConfirmaDocumento(props: { valor: boolean; aoMudar: (v: boolean) => void; erro?: string | null }) {
  return (
    <div className="pilha">
      <label className={`confirmacao-toque${props.valor ? ' marcada' : ''}`} style={{ alignSelf: 'flex-start' }}>
        <input type="checkbox" checked={props.valor} onChange={e => props.aoMudar(e.target.checked)} />
        <span>Documento com foto conferido (nome completo e data de nascimento)</span>
      </label>
      {props.erro && (
        <span className="erro" role="alert" style={{ color: 'var(--perigo)', fontWeight: 600 }}>
          {props.erro}
        </span>
      )}
    </div>
  )
}

function AbrirEpisodio(props: { paciente: PacienteEscolhido; aoAberto: (id: string) => void; aoTrocar: () => void }) {
  const { paciente } = props
  const tratar = useTratarErro()
  const [cirurgioes, setCirurgioes] = useState<{ id: string; nome: string; papeis: Papel[] }[] | null>(null)
  const [olho, setOlho] = useState<Olho | null>(null)
  const [cirurgiaoId, setCirurgiaoId] = useState('')
  const [tipoCirurgia, setTipoCirurgia] = useState('')
  const [tipoLente, setTipoLente] = useState<'monofocal' | 'torica' | 'outra' | null>(null)
  const [outraLente, setOutraLente] = useState('')
  const [dataSugerida, setDataSugerida] = useState('')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [avisos, setAvisos] = useState<{ id: string; lista: string[] } | null>(null)

  useEffect(() => {
    chamar('membros.ativos', { papel: 'cirurgiao' })
      .then(setCirurgioes)
      .catch(e => {
        setCirurgioes([])
        tratar(e)
      })
  }, [tratar])

  const mesmoOlho = olho ? paciente.episodios.filter(e => e.olho === olho && e.estado !== 'cancelado') : []
  const outroOlho = olho ? paciente.episodios.filter(e => e.olho !== olho) : []
  const lenteFinal = tipoLente === 'outra' ? outraLente.trim() : tipoLente
  const erros: Record<string, string> = {}
  if (!olho) erros.olho = 'Escolha o olho.'
  if (!cirurgiaoId) erros.cirurgiao = 'Escolha o cirurgião.'
  if (!tipoCirurgia.trim()) erros.tipoCirurgia = 'Informe a cirurgia proposta.'
  if (!lenteFinal) erros.tipoLente = 'Informe o tipo de LIO.'
  if (dataSugerida && !dataValida(dataSugerida)) erros.data = 'Data inválida.'

  if (avisos) {
    return (
      <Cartao titulo="Episódio aberto">
        <Aviso tipo="atencao" titulo="Avisos da abertura">
          <ul className="lista-simples">
            {avisos.lista.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
        <div>
          <Botao onClick={() => props.aoAberto(avisos.id)}>Ir para o D-7</Botao>
        </div>
      </Cartao>
    )
  }

  return (
    <Cartao titulo="3. Abrir o episódio">
      <p style={{ margin: 0 }}>
        Paciente: <strong>{paciente.nomeCompleto}</strong> · nascimento {formatarData(paciente.dataNascimento)}{' '}
        {!paciente.conferidoDatasigh && <Selo tipo="atencao">NÃO CONFERIDO NO DATASIGH</Selo>}{' '}
        <button type="button" className="botao secundario pequeno" onClick={props.aoTrocar}>
          Trocar
        </button>
      </p>
      <form
        className="pilha"
        autoComplete="off"
        onSubmit={async e => {
          e.preventDefault()
          setTentou(true)
          if (Object.keys(erros).length || !olho || !lenteFinal) return
          setEnviando(true)
          try {
            const r = await chamar('episodio.abrir', {
              pacienteId: paciente.id,
              olho,
              cirurgiaoId,
              tipoCirurgia: tipoCirurgia.trim(),
              tipoLente: lenteFinal,
              dataSugerida: dataSugerida || null,
            })
            if (r.avisos.length) setAvisos({ id: r.episodioId, lista: r.avisos })
            else props.aoAberto(r.episodioId)
          } catch (er) {
            tratar(er)
          } finally {
            setEnviando(false)
          }
        }}
      >
        <div className="campo">
          <span className="escolha-rotulo" id="olho-rotulo">
            Olho a operar (conforme o pedido médico)
          </span>
          <div className="opcoes-toque" role="group" aria-labelledby="olho-rotulo">
            {(['OD', 'OE'] as const).map(o => (
              <button key={o} type="button" className="botao-olho" aria-pressed={olho === o} onClick={() => setOlho(o)}>
                {OLHO_EXTENSO[o]}
              </button>
            ))}
          </div>
          {tentou && erros.olho && <span className="erro">{erros.olho}</span>}
        </div>
        {mesmoOlho.length > 0 && (
          <Aviso tipo="perigo" titulo="Já existe episódio deste paciente para este olho">
            Confira o pedido médico antes de abrir outro episódio para o {olho ? OLHO_EXTENSO[olho] : ''}.
          </Aviso>
        )}
        {outroOlho.length > 0 && (
          <Aviso tipo="atencao" titulo="2º OLHO">
            O outro olho já tem episódio. Este será o 2º olho: nada da lente do 1º é copiado.
          </Aviso>
        )}
        <Campo rotulo="Cirurgião" id="ep-cirurgiao" obrigatorio erro={tentou ? erros.cirurgiao : null}>
          <select id="ep-cirurgiao" value={cirurgiaoId} onChange={e => setCirurgiaoId(e.target.value)}>
            <option value="">{cirurgioes ? 'Escolha…' : 'Carregando…'}</option>
            {cirurgioes?.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Cirurgia proposta" id="ep-cirurgia" obrigatorio erro={tentou ? erros.tipoCirurgia : null}>
          <input id="ep-cirurgia" type="text" autoComplete="off" value={tipoCirurgia} onChange={e => setTipoCirurgia(e.target.value)} />
        </Campo>
        <EscolhaUnica
          rotulo="Tipo de LIO"
          nome="ep-tipo-lente"
          opcoes={[
            { valor: 'monofocal', rotulo: 'Monofocal' },
            { valor: 'torica', rotulo: 'Tórica' },
            { valor: 'outra', rotulo: 'Outra' },
          ]}
          valor={tipoLente}
          aoMudar={setTipoLente}
        />
        {tipoLente === 'outra' && (
          <Campo rotulo="Qual LIO" id="ep-outra-lente">
            <input id="ep-outra-lente" type="text" autoComplete="off" value={outraLente} onChange={e => setOutraLente(e.target.value)} />
          </Campo>
        )}
        {tentou && erros.tipoLente && <span className="erro">{erros.tipoLente}</span>}
        <Campo rotulo="Data sugerida da cirurgia" id="ep-data" erro={tentou ? erros.data : null}>
          <input id="ep-data" type="date" value={dataSugerida} min={hojeLocal()} onChange={e => setDataSugerida(e.target.value)} />
        </Campo>
        {olho && (
          <p className="aviso info" style={{ margin: 0 }}>
            <strong>Confira:</strong> {paciente.nomeCompleto} · <strong>{OLHO_EXTENSO[olho]}</strong> · {cirurgioes?.find(c => c.id === cirurgiaoId)?.nome ?? 'cirurgião não escolhido'}
          </p>
        )}
        <div>
          <Botao submit grande desabilitado={enviando}>
            {enviando ? 'Abrindo…' : 'Abrir episódio'}
          </Botao>
        </div>
      </form>
    </Cartao>
  )
}
