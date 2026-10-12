// Entrada da equipe.
// - Desenvolvimento: usuários fictícios do servidor de demonstração.
// - Supabase: e-mail e senha; segundo fator (TOTP) quando pedido (cirurgião e gestora).
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import type { UsuarioFicticio } from '../api/auth.ts'
import { autenticacao } from '../api/auth.ts'
import { Aviso, Botao, Campo, Carregando } from '../componentes/base/index.tsx'
import { rotuloPapeis } from '../componentes/rotulos.ts'
import { ROTAS } from '../rotas.ts'
import { useSessao } from './sessao.tsx'

export default function Entrar() {
  const sessao = useSessao()
  const local = useLocation()
  const navegar = useNavigate()
  const estadoNav = (local.state ?? {}) as { de?: string; mfa?: boolean }
  const destino = estadoNav.de && estadoNav.de !== ROTAS.entrar ? estadoNav.de : ROTAS.inicio
  const [etapaMfa, setEtapaMfa] = useState<{ fatorId: string | null } | null>(null)

  useEffect(() => {
    if (sessao.estado === 'mfa' || estadoNav.mfa) {
      void autenticacao.fatoresPendentes().then(f => {
        if (f.precisa) setEtapaMfa({ fatorId: f.fatorId })
      })
    }
  }, [sessao.estado, estadoNav.mfa])

  if (sessao.estado === 'logado' && !etapaMfa) return <Navigate to={destino} replace />

  const concluir = async () => {
    const f = await autenticacao.fatoresPendentes()
    if (f.precisa) {
      setEtapaMfa({ fatorId: f.fatorId })
      return
    }
    await sessao.recarregar()
    navegar(destino, { replace: true })
  }

  return (
    <main className="pagina pilha" style={{ maxWidth: 720 }}>
      <h1>OFTA VITTA · Jornada Cirúrgica</h1>
      <p className="suave">Painel da equipe. Paciente certo, olho certo, lente certa, paciente preparado e família informada.</p>
      {sessao.estado === 'indisponivel' && <Aviso tipo="perigo" titulo="Servidor indisponível">Siga o checklist em papel. Tente entrar de novo em instantes.</Aviso>}
      {etapaMfa ? (
        <SegundoFator
          fatorId={etapaMfa.fatorId}
          aoConcluir={async () => {
            setEtapaMfa(null)
            await sessao.recarregar()
            navegar(destino, { replace: true })
          }}
        />
      ) : autenticacao.modo === 'dev' ? (
        <EntrarFicticio aoConcluir={concluir} />
      ) : (
        <EntrarSenha aoConcluir={concluir} />
      )}
    </main>
  )
}

function EntrarFicticio(props: { aoConcluir: () => Promise<void> }) {
  const [usuarios, setUsuarios] = useState<UsuarioFicticio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState<string | null>(null)
  useEffect(() => {
    autenticacao
      .usuariosFicticios()
      .then(setUsuarios)
      .catch(() => setErro('Servidor de demonstração indisponível. Inicie com "npm run dev:api".'))
  }, [])
  return (
    <section className="cartao pilha" aria-labelledby="titulo-ficticio">
      <h2 id="titulo-ficticio">Ambiente de demonstração</h2>
      <Aviso tipo="info">Somente usuários e pacientes fictícios. Escolha com quem entrar.</Aviso>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!usuarios && !erro && <Carregando texto="Carregando usuários fictícios…" />}
      {usuarios && (
        <div className="opcoes-toque">
          {usuarios.map(u => (
            <button
              key={u.id}
              type="button"
              className="opcao-toque"
              style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '8px 16px' }}
              disabled={entrando !== null}
              onClick={async () => {
                setEntrando(u.id)
                setErro(null)
                try {
                  await autenticacao.entrarFicticio(u.id)
                  await props.aoConcluir()
                } catch {
                  setErro('Não foi possível entrar.')
                } finally {
                  setEntrando(null)
                }
              }}
            >
              <span>{entrando === u.id ? 'Entrando…' : u.nome}</span>
              <span className="suave" style={{ fontWeight: 400, fontSize: '.85rem' }}>
                {rotuloPapeis(u.papeis)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function EntrarSenha(props: { aoConcluir: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  return (
    <form
      className="cartao pilha"
      onSubmit={async e => {
        e.preventDefault()
        setErro(null)
        setEntrando(true)
        try {
          await autenticacao.entrarComSenha(email.trim(), senha)
          setSenha('')
          await props.aoConcluir()
        } catch (er) {
          setErro(er instanceof Error ? er.message : 'Não foi possível entrar.')
        } finally {
          setEntrando(false)
        }
      }}
    >
      <h2>Entrar</h2>
      <Campo rotulo="E-mail" id="email">
        <input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
      </Campo>
      <Campo rotulo="Senha" id="senha">
        <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required />
      </Campo>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div>
        <Botao submit desabilitado={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </div>
      <p className="suave" style={{ margin: 0 }}>
        Aparelho compartilhado: a sessão é curta e bloqueia após inatividade. Para marcar em seu nome sem sair do login de outra pessoa, use o seu PIN.
      </p>
    </form>
  )
}

function SegundoFator(props: { fatorId: string | null; aoConcluir: () => Promise<void> }) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (!props.fatorId) {
    return (
      <Aviso tipo="atencao" titulo="Segundo fator ainda não cadastrado">
        Cirurgião e gestora entram com e-mail, senha e código de um aplicativo autenticador. Peça à gestora o cadastro do segundo fator.
      </Aviso>
    )
  }
  return (
    <form
      className="cartao pilha"
      autoComplete="off"
      onSubmit={async e => {
        e.preventDefault()
        setErro(null)
        setEnviando(true)
        try {
          await autenticacao.verificarCodigo(props.fatorId as string, codigo)
          await props.aoConcluir()
        } catch (er) {
          setErro(er instanceof Error ? er.message : 'Código inválido.')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <h2>Segundo fator</h2>
      <Campo rotulo="Código do aplicativo autenticador (6 dígitos)" id="codigo-mfa">
        <input id="codigo-mfa" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ maxWidth: 220 }} />
      </Campo>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div>
        <Botao submit desabilitado={enviando || codigo.length !== 6}>
          {enviando ? 'Verificando…' : 'Confirmar'}
        </Botao>
      </div>
    </form>
  )
}
