// Membros da equipe: convite por e-mail (com nome e papéis), alteração de papéis, ativação e reset de PIN.

import { useState, type FormEvent } from 'react'
import type { AcoesEquipe } from '@contrato'
import type { Papel } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Botao, Campo, Carregando, Cartao } from '../../componentes/base/index.tsx'
import { mensagemErro, useCarga } from './comum/carga.ts'
import { BotaoConfirmar, ErroCarga, EscolhaPapeis, Retorno, Selo } from './comum/componentes.tsx'
import { rotulosPapeis } from './comum/rotulos.ts'

type Membro = AcoesEquipe['membros.listar']['S'][number]
type RetornoAcao = { tipo: 'ok' | 'perigo'; texto: string } | null

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function FormConvite(props: { onConvidar: (dados: { email: string; nome: string; papeis: Papel[] }) => Promise<boolean> }) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [papeis, setPapeis] = useState<Papel[]>([])
  const [erros, setErros] = useState<{ email?: string; nome?: string; papeis?: string }>({})
  const [ocupado, setOcupado] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const novos: typeof erros = {}
    if (!RE_EMAIL.test(email.trim())) novos.email = 'Informe um e-mail válido.'
    if (!nome.trim()) novos.nome = 'Informe o nome.'
    if (papeis.length === 0) novos.papeis = 'Escolha pelo menos um papel.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setOcupado(true)
    const ok = await props.onConvidar({ email: email.trim().toLowerCase(), nome: nome.trim(), papeis })
    setOcupado(false)
    if (ok) {
      setEmail('')
      setNome('')
      setPapeis([])
    }
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label="Convidar membro">
      <div className="linha-campos">
        <Campo rotulo="Nome" id="convite-nome" erro={erros.nome}>
          <input id="convite-nome" value={nome} onChange={e => setNome(e.target.value)} autoComplete="off" aria-invalid={Boolean(erros.nome) || undefined} />
        </Campo>
        <Campo rotulo="E-mail" id="convite-email" erro={erros.email} ajuda="O mesmo e-mail que a pessoa usa para entrar.">
          <input
            id="convite-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="off"
            aria-invalid={Boolean(erros.email) || undefined}
          />
        </Campo>
      </div>
      <EscolhaPapeis legenda="Papéis" valor={papeis} onChange={setPapeis} erro={erros.papeis} />
      <div>
        <Botao submit desabilitado={ocupado}>
          {ocupado ? 'Convidando…' : 'Convidar'}
        </Botao>
      </div>
    </form>
  )
}

function FormEdicao(props: { membro: Membro; onSalvar: (dados: { nome: string; papeis: Papel[] }) => Promise<boolean>; onCancelar: () => void }) {
  const [nome, setNome] = useState(props.membro.nome)
  const [papeis, setPapeis] = useState<Papel[]>(props.membro.papeis)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const idBase = `editar-${props.membro.email.replace(/[^a-z0-9]/gi, '-')}`
  return (
    <form
      className="formulario"
      aria-label={`Editar ${props.membro.nome}`}
      noValidate
      onSubmit={async e => {
        e.preventDefault()
        if (!nome.trim()) return setErro('Informe o nome.')
        if (papeis.length === 0) return setErro('Escolha pelo menos um papel.')
        setErro(null)
        setOcupado(true)
        const ok = await props.onSalvar({ nome: nome.trim(), papeis })
        setOcupado(false)
        if (ok) props.onCancelar()
      }}
    >
      <Campo rotulo="Nome" id={`${idBase}-nome`}>
        <input id={`${idBase}-nome`} value={nome} onChange={e => setNome(e.target.value)} />
      </Campo>
      <EscolhaPapeis legenda="Papéis" valor={papeis} onChange={setPapeis} />
      {erro && <p className="erro-campo" role="alert">{erro}</p>}
      <div className="linha">
        <Botao submit desabilitado={ocupado}>
          Salvar
        </Botao>
        <Botao tipo="secundario" onClick={props.onCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}

export default function Membros() {
  const carga = useCarga(() => chamar('membros.listar', {}), [])
  const [retorno, setRetorno] = useState<RetornoAcao>(null)
  const [editando, setEditando] = useState<string | null>(null)

  const executar = async (acao: () => Promise<unknown>, textoOk: string): Promise<boolean> => {
    try {
      await acao()
      setRetorno({ tipo: 'ok', texto: textoOk })
      carga.recarregar()
      return true
    } catch (e) {
      setRetorno({ tipo: 'perigo', texto: mensagemErro(e) })
      return false
    }
  }

  const membros = [...(carga.dados ?? [])].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="pilha">
      <Retorno retorno={retorno} />
      <Cartao titulo="Convidar">
        <p className="suave" style={{ margin: 0 }}>
          O convite autoriza o e-mail. No primeiro acesso com esse e-mail, a pessoa entra com os papéis definidos aqui. Cada marcação guarda quem marcou e quando.
        </p>
        <FormConvite onConvidar={d => executar(() => chamar('membros.convidar', d), `Convite registrado para ${d.nome}.`)} />
      </Cartao>

      <Cartao titulo="Membros e convites">
        <p className="suave" style={{ margin: 0 }}>
          Desativar não apaga o histórico: as marcações já feitas continuam com o nome de quem marcou. Resetar o PIN obriga a pessoa a definir um novo em "Meu PIN".
        </p>
        {carga.erro ? (
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        ) : !carga.dados ? (
          <Carregando />
        ) : membros.length === 0 ? (
          <p>Nenhum membro cadastrado.</p>
        ) : (
          <div className="rolagem-tabela">
            <table className="tabela">
              <caption className="sr-only">Membros da equipe</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Papéis</th>
                  <th scope="col">Situação</th>
                  <th scope="col">PIN</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {membros.map(m => [
                  <tr key={m.email} className={m.ativo ? undefined : 'inativo'}>
                    <td>{m.nome}</td>
                    <td>{m.email}</td>
                    <td>{rotulosPapeis(m.papeis)}</td>
                    <td>
                      {m.ativo ? <Selo tipo="ok">Ativo</Selo> : <Selo tipo="perigo">Inativo</Selo>}
                      {!m.vinculado && (
                        <>
                          <br />
                          <span className="suave">Convite: aguardando o primeiro acesso</span>
                        </>
                      )}
                    </td>
                    <td>{m.temPin ? 'Definido' : 'Não definido'}</td>
                    <td>
                      <div className="acoes">
                        <Botao tipo="secundario" pequeno onClick={() => setEditando(editando === m.email ? null : m.email)}>
                          {editando === m.email ? 'Fechar edição' : 'Editar'}
                        </Botao>
                        {m.ativo ? (
                          <BotaoConfirmar
                            rotulo="Desativar"
                            confirmacao={`Confirmar: desativar ${m.nome}`}
                            tipo="perigo"
                            onConfirmar={() => void executar(() => chamar('membros.atualizar', { email: m.email, ativo: false }), `${m.nome} foi desativado(a).`)}
                          />
                        ) : (
                          <Botao tipo="secundario" pequeno onClick={() => void executar(() => chamar('membros.atualizar', { email: m.email, ativo: true }), `${m.nome} foi ativado(a).`)}>
                            Ativar
                          </Botao>
                        )}
                        {m.id && m.temPin ? (
                          <BotaoConfirmar
                            rotulo="Resetar PIN"
                            confirmacao={`Confirmar: resetar o PIN de ${m.nome}`}
                            onConfirmar={() => void executar(() => chamar('membros.resetar_pin', { membroId: m.id as string }), `PIN de ${m.nome} resetado.`)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>,
                  editando === m.email ? (
                    <tr key={`${m.email}-edicao`}>
                      <td colSpan={6}>
                        <FormEdicao
                          membro={m}
                          onCancelar={() => setEditando(null)}
                          onSalvar={d => executar(() => chamar('membros.atualizar', { email: m.email, nome: d.nome, papeis: d.papeis }), `Dados de ${d.nome} atualizados.`)}
                        />
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  )
}
