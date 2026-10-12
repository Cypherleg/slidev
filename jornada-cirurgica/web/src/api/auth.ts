// Autenticação da equipe.
// - Produção/homologação: Supabase Auth (mesmos usuários do painel de pré-consulta), e-mail e senha;
//   segundo fator (TOTP) para cirurgião e gestora quando o servidor exigir.
// - Desenvolvimento local: usuários fictícios do servidor de demonstração (VITE_MODO_AUTH=dev).
// Sessão curta em aparelho compartilhado: a interface encerra a sessão após inatividade.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface UsuarioFicticio {
  id: string
  nome: string
  email: string
  papeis: string[]
}

export interface Autenticacao {
  modo: 'supabase' | 'dev'
  tokenAtual(): Promise<string | null>
  entrarComSenha(email: string, senha: string): Promise<void>
  /** Só no modo dev: lista e entra como usuário fictício. */
  usuariosFicticios(): Promise<UsuarioFicticio[]>
  entrarFicticio(userId: string): Promise<void>
  /** Segundo fator (TOTP), quando exigido. */
  fatoresPendentes(): Promise<{ precisa: boolean; fatorId: string | null }>
  verificarCodigo(fatorId: string, codigo: string): Promise<void>
  sair(): Promise<void>
  ouvir(f: (logado: boolean) => void): () => void
}

const modo = ((import.meta.env.VITE_MODO_AUTH as string | undefined) ?? 'dev') === 'supabase' ? 'supabase' : 'dev'

function criarSupabase(): Autenticacao {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const chavePublica = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const cliente: SupabaseClient = createClient(url, chavePublica, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jornada-cirurgica.sessao' },
  })
  return {
    modo: 'supabase',
    async tokenAtual() {
      const { data } = await cliente.auth.getSession()
      return data.session?.access_token ?? null
    },
    async entrarComSenha(email, senha) {
      const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
      if (error) throw new Error('E-mail ou senha não conferem.')
    },
    async usuariosFicticios() {
      return []
    },
    async entrarFicticio() {
      throw new Error('Indisponível fora do ambiente de desenvolvimento.')
    },
    async fatoresPendentes() {
      const { data } = await cliente.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!data || data.currentLevel === data.nextLevel) return { precisa: false, fatorId: null }
      const fatores = await cliente.auth.mfa.listFactors()
      const totp = fatores.data?.totp?.[0]
      return { precisa: true, fatorId: totp?.id ?? null }
    },
    async verificarCodigo(fatorId, codigo) {
      const desafio = await cliente.auth.mfa.challenge({ factorId: fatorId })
      if (desafio.error) throw new Error('Não foi possível iniciar a verificação.')
      const { error } = await cliente.auth.mfa.verify({ factorId: fatorId, challengeId: desafio.data.id, code: codigo })
      if (error) throw new Error('Código inválido.')
    },
    async sair() {
      await cliente.auth.signOut()
    },
    ouvir(f) {
      const { data } = cliente.auth.onAuthStateChange((_evento, sessao) => f(Boolean(sessao)))
      return () => data.subscription.unsubscribe()
    },
  }
}

function criarDev(): Autenticacao {
  const CHAVE = 'jornada.dev.token'
  const ouvintes = new Set<(logado: boolean) => void>()
  let token: string | null = null
  try {
    token = sessionStorage.getItem(CHAVE)
  } catch {
    token = null
  }
  const avisar = () => {
    for (const f of ouvintes) f(Boolean(token))
  }
  return {
    modo: 'dev',
    async tokenAtual() {
      return token
    },
    async entrarComSenha() {
      throw new Error('No ambiente de desenvolvimento, escolha um usuário fictício.')
    },
    async usuariosFicticios() {
      const r = await fetch('/dev/usuarios')
      if (!r.ok) throw new Error('Servidor de demonstração indisponível.')
      return (await r.json()) as UsuarioFicticio[]
    },
    async entrarFicticio(userId) {
      const r = await fetch('/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      if (!r.ok) throw new Error('Não foi possível entrar.')
      token = ((await r.json()) as { token: string }).token
      try {
        sessionStorage.setItem(CHAVE, token)
      } catch {
        /* sessão só em memória */
      }
      avisar()
    },
    async fatoresPendentes() {
      return { precisa: false, fatorId: null }
    },
    async verificarCodigo() {},
    async sair() {
      token = null
      try {
        sessionStorage.removeItem(CHAVE)
      } catch {
        /* nada */
      }
      avisar()
    },
    ouvir(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
  }
}

export const autenticacao: Autenticacao = modo === 'supabase' ? criarSupabase() : criarDev()
