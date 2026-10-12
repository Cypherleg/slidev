// Cliente HTTP tipado da Edge Function `jornada-cirurgica` e da página do paciente.
// Nenhuma chave de serviço no navegador: só o JWT da sessão do usuário.

import type { AcaoEquipe, AcaoPaciente, AcoesEquipe, AcoesPaciente, ErroApi, RespostaApi } from '@contrato'
import { obterIdAparelho } from './aparelho.ts'
import { tokenAtorAtual } from './ator.ts'
import { autenticacao } from './auth.ts'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '/functions/v1'

export class ErroChamada extends Error {
  constructor(public readonly erro: ErroApi, public readonly status: number) {
    super(erro.mensagem)
    this.name = 'ErroChamada'
  }
  get codigo() {
    return this.erro.codigo
  }
}

async function postar<T>(caminho: string, corpo: unknown, cabecalhos: Record<string, string>): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${BASE}/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new ErroChamada({ codigo: 'indisponivel', mensagem: 'Sem conexão com o servidor. Siga o checklist em papel se necessário.' }, 0)
  }
  let json: RespostaApi<T>
  try {
    json = (await resposta.json()) as RespostaApi<T>
  } catch {
    throw new ErroChamada({ codigo: 'indisponivel', mensagem: 'Resposta inválida do servidor.' }, resposta.status)
  }
  if (!json.ok) throw new ErroChamada(json.erro, resposta.status)
  return json.dados
}

/** Chama uma ação da equipe. Lança ErroChamada. */
export async function chamar<A extends AcaoEquipe>(acao: A, dados: AcoesEquipe[A]['E'], opcoes?: { semAtor?: boolean }): Promise<AcoesEquipe[A]['S']> {
  const token = await autenticacao.tokenAtual()
  if (!token) throw new ErroChamada({ codigo: 'nao_autenticado', mensagem: 'Sessão expirada. Entre novamente.' }, 401)
  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'x-jornada-aparelho': obterIdAparelho(),
  }
  const ator = opcoes?.semAtor ? null : tokenAtorAtual()
  if (ator) cabecalhos['x-jornada-ator'] = ator
  return postar<AcoesEquipe[A]['S']>('jornada-cirurgica', { acao, dados }, cabecalhos)
}

/** Chama uma ação da página do paciente (sem login; token do link). */
export async function chamarPaciente<A extends AcaoPaciente>(acao: A, token: string, dados: AcoesPaciente[A]['E']): Promise<AcoesPaciente[A]['S']> {
  return postar<AcoesPaciente[A]['S']>('jornada-paciente', { acao, token, dados }, {})
}
