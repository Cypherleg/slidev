// Semente FICTÍCIA do servidor local. Passa pela própria API (handler), como cada papel faria,
// para que o domínio aplique as regras. Só dados fictícios (nomes "Paciente Teste ...",
// CPFs de teste com prefixo 900, telefones com DDD 00, URLs exemplo.invalid).
// Idempotente por etapa: membros (se não houver), modelos/config/materiais (se faltarem) e
// cenários (se não houver episódio).

import type postgres from 'postgres'
import type { AcaoEquipe, AcoesEquipe } from '../supabase/functions/_shared/api/contrato.ts'
import { gerarHashPin, type ConfigApi } from '../supabase/functions/_shared/api/index.ts'
import { D7 } from '../supabase/functions/_shared/dominio/modelos/ids.ts'
import { roteiro, type Chamar, type PacienteFicticio, type Pessoa } from './roteiro.ts'
import { cpfFicticio } from './datasigh-ficticio.ts'
import { LISTA_USUARIOS, PIN_DEV, USUARIOS_FICTICIOS as US, type UsuarioFicticio } from './usuarios.ts'

type Sql = ReturnType<typeof postgres>

export interface DepsSemente {
  sql: Sql
  handler: (req: Request) => Promise<Response>
  config: ConfigApi
  tokenDe: (userId: string) => Promise<string> | null
}

const APARELHO = 'aparelho-semente-dev'

export function dataLocalDev(deslocDias = 0, base = new Date()): string {
  const d = new Date(base.getTime() + deslocDias * 86400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export class ErroSemente extends Error {}

/** Cliente da API para a semente (e para o roteiro de demonstração). */
export function clienteApi(deps: Pick<DepsSemente, 'handler' | 'tokenDe'>) {
  async function chamar<A extends AcaoEquipe>(usuario: UsuarioFicticio, acao: A, dados: AcoesEquipe[A]['E'], ator?: string | null): Promise<AcoesEquipe[A]['S']> {
    const token = await deps.tokenDe(usuario.id)
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-jornada-aparelho': APARELHO }
    if (ator) headers['x-jornada-ator'] = ator
    const r = await deps.handler(new Request('http://127.0.0.1/functions/v1/jornada-cirurgica', { method: 'POST', headers, body: JSON.stringify({ acao, dados }) }))
    const corpo = (await r.json()) as { ok: boolean; dados?: unknown; erro?: { codigo: string; mensagem: string; detalhes?: unknown } }
    if (!corpo.ok) throw new ErroSemente(`${acao}: ${corpo.erro?.codigo} — ${corpo.erro?.mensagem}${corpo.erro?.detalhes ? ` ${JSON.stringify(corpo.erro.detalhes)}` : ''}`)
    return corpo.dados as AcoesEquipe[A]['S']
  }
  return { chamar }
}

// ---------------------------------------------------------------------------
// Semente
// ---------------------------------------------------------------------------

export async function semear(deps: DepsSemente): Promise<void> {
  const { sql, config } = deps
  const api = clienteApi(deps)
  const passo = async (nome: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      console.log(`[dev] semente: ${nome} ok`)
      return true
    } catch (e) {
      console.log(`[dev] semente: ${nome} FALHOU (${e instanceof Error ? e.message : 'erro'})`)
      return false
    }
  }

  // 1) Membros fictícios (dado de partida, gravado como dono do banco).
  const [{ n: nMembros }] = await sql`select count(*)::int as n from jornada_cirurgica.membros`
  if (nMembros === 0) {
    await passo('membros', async () => {
      const hash = await gerarHashPin(config.segredoAtor, PIN_DEV, config.iteracoesPin)
      for (const m of LISTA_USUARIOS) {
        await sql`insert into jornada_cirurgica.convites (email, nome, papeis, ativo, vinculado_user_id) values (${m.email}, ${m.nome}, ${m.papeis}, true, ${m.id})`
        await sql`insert into jornada_cirurgica.membros (user_id, email, nome, papeis, ativo, pin_hash, pin_atualizado_em) values (${m.id}, ${m.email}, ${m.nome}, ${m.papeis}, true, ${hash}, now())`
      }
    })
  }

  // 2) Modelos v1 (a API grava modelosPadrao() como jornada_sistema na primeira leitura).
  await passo('modelos v1', () => api.chamar(US.gestora, 'modelos.listar', {}))

  // 3) Configuração (sobre o padrão): só telefones fictícios.
  const [{ n: nConfig }] = await sql`select count(*)::int as n from jornada_cirurgica.config`
  if (nConfig === 0) {
    await passo('config', () =>
      api.chamar(US.gestora, 'config.salvar', {
        config: { telefones: { hospital: '(00) 0000-0000 (fictício)', whatsappConcierge: '(00) 90000-0000 (fictício)', enfermagemForaHorario: '(00) 90000-0001 (fictício)' }, assinaturaConcierge: null },
      }),
    )
  }

  // 4) Materiais de exemplo (vídeos ainda não gravados: endereços de exemplo).
  const [{ n: nMateriais }] = await sql`select count(*)::int as n from jornada_cirurgica.materiais`
  if (nMateriais === 0) {
    await passo('materiais', async () => {
      const lista: AcoesEquipe['materiais.salvar']['E']['material'][] = [
        { codigo: 'video_preparo', titulo: 'Vídeo de preparo para a cirurgia (exemplo)', tipo: 'video', url: 'https://exemplo.invalid/video-preparo', conteudo: null, momento: 'd7', publico: 'paciente', ativo: true },
        { codigo: 'orientacao_escrita', titulo: 'Orientações escritas de preparo (exemplo)', tipo: 'texto', url: null, conteudo: 'Texto de exemplo das orientações de preparo. Conteúdo definitivo a validar com o Dr. Augusto.', momento: 'd7', publico: 'paciente', ativo: true },
        { codigo: 'video_tcle', titulo: 'Vídeo do termo de consentimento (exemplo)', tipo: 'video_tcle', url: 'https://exemplo.invalid/video-tcle', conteudo: null, momento: 'd7', publico: 'paciente', ativo: true },
        { codigo: 'link_tcle', titulo: 'Assinatura do termo de consentimento (exemplo)', tipo: 'link_tcle', url: 'https://exemplo.invalid/assinar-tcle', conteudo: null, momento: 'd7', publico: 'paciente', ativo: true },
      ]
      for (const material of lista) await api.chamar(US.gestora, 'materiais.salvar', { material })
    })
  }

  // 5) Cenários (episódios em estágios variados, hoje e amanhã).
  const [{ n: nEpisodios }] = await sql`select count(*)::int as n from jornada_cirurgica.episodios`
  if (nEpisodios === 0) await semearCenarios(deps, passo)
}

// ---------------------------------------------------------------------------
// Cenários (hoje e amanhã, estágios variados)
// ---------------------------------------------------------------------------

async function semearCenarios(deps: DepsSemente, passo: (nome: string, fn: () => Promise<unknown>) => Promise<boolean>): Promise<void> {
  const { chamar } = clienteApi(deps)
  const pin = async (sessao: Pessoa, alvo: Pessoa) => (await chamar(sessao as UsuarioFicticio, 'ator.pin', { membroId: alvo.id, pin: PIN_DEV })).token
  const r = roteiro(chamar as Chamar, US, pin)
  const hoje = dataLocalDev(0)
  const amanha = dataLocalDev(1)
  const em7 = dataLocalDev(7)
  const pac = (n: number, nome: string, nascimento: string, mae: string | null = null): PacienteFicticio => ({ nome, nascimento, cpf: cpfFicticio(n), prontuario: `FIC-${String(n).padStart(4, '0')}`, mae })

  // HOJE: pronto para o dia (D-2 concluído).
  await passo('cenário hoje: pronto para o dia', async () => {
    const e = await r.abrir(await r.cadastrar(pac(4, 'Paciente Teste Charlie Lima', '1955-12-01')), 'OD', hoje)
    await r.d7(e, { dataCirurgia: hoje, ordem: 1, horario: '07:00', dioptria: 21.5 })
    await r.cp1(e)
    await r.cp2(e, 21.5)
    await r.d2(e)
  })

  // HOJE: par de nomes parecidos no mesmo dia (3º identificador exigido).
  await passo('cenário hoje: nomes parecidos', async () => {
    const e1 = await r.abrir(await r.cadastrar(pac(2, 'Paciente Teste Bravo Souza', '1947-06-30', 'Mae Teste Bravo Um')), 'OE', hoje)
    const e2 = await r.abrir(await r.cadastrar(pac(3, 'Paciente Teste Bravo Sousa', '1949-09-08', 'Mae Teste Bravo Dois')), 'OD', hoje)
    await r.d7(e1, { dataCirurgia: hoje, ordem: 2, horario: '08:00', dioptria: 20.0, sobrepor: { [D7.nomeMae]: 'Mae Teste Bravo Um' } })
    await r.d7(e2, { dataCirurgia: hoje, ordem: 3, horario: '08:30', dioptria: 22.0, sobrepor: { [D7.nomeMae]: 'Mae Teste Bravo Dois' } })
  })

  // HOJE: 2º olho (o OD do mesmo paciente foi agendado 30 dias atrás).
  await passo('cenário hoje: segundo olho', async () => {
    const p = await r.cadastrar(pac(1, 'Paciente Teste Alfa da Silva', '1950-02-14'))
    const primeiro = await r.abrir(p, 'OD', dataLocalDev(-37), US.cirurgiao2)
    await r.com(primeiro, US.concierge, 'episodio.agendar', { dataCirurgia: dataLocalDev(-30), horario: '07:30', ordem: 1 })
    const segundo = await r.abrir(p, 'OE', hoje, US.cirurgiao2)
    await r.d7(segundo, { dataCirurgia: hoje, ordem: 4, horario: '09:00', dioptria: 21.0 })
    await r.cp1(segundo)
  })

  // AMANHÃ: aguardando D-2 (D-7 e checkpoint 1 concluídos).
  await passo('cenário amanhã: aguardando D-2', async () => {
    const e = await r.abrir(await r.cadastrar(pac(5, 'Paciente Teste Delta Rocha', '1946-03-22')), 'OE', amanha)
    await r.d7(e, { dataCirurgia: amanha, ordem: 1, horario: '07:00', dioptria: 19.5 })
    await r.cp1(e)
  })

  // AMANHÃ: lente em quarentena (divergência plantada no checkpoint 2).
  await passo('cenário amanhã: quarentena', async () => {
    const e = await r.abrir(await r.cadastrar(pac(6, 'Paciente Teste Eco Martins', '1958-08-17')), 'OD', amanha)
    await r.d7(e, { dataCirurgia: amanha, ordem: 2, horario: '07:30', dioptria: 23.0 })
    await r.cp1(e)
    await r.cp2(e, 23.5)
  })

  // AMANHÃ: D-7 em andamento (só a identificação respondida).
  await passo('cenário amanhã: D-7 em andamento', async () => {
    const e = await r.abrir(await r.cadastrar(pac(7, 'Paciente Teste Foxtrot Nunes', '1952-05-05')), 'OD', em7, US.cirurgiao2)
    await r.com(e, US.concierge, 'episodio.agendar', { dataCirurgia: amanha, horario: '08:30', ordem: 3 })
    await r.responder(e, 'd7', US.concierge, {}, (_item, secao) => secao === 'A')
  })
}
