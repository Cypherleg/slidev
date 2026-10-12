// Roteiro FICTÍCIO de um episódio pela API (semente do servidor local e testes de ponta a ponta).
// Cada passo é feito pelo papel competente, como na vida real; o domínio decide e bloqueia.

import type { AcaoEquipe, AcoesEquipe } from '../supabase/functions/_shared/api/contrato.ts'
import type { EpisodioVisao, ModeloId, Olho, ValorResposta } from '../supabase/functions/_shared/dominio/index.ts'
import { AN, D7, SI } from '../supabase/functions/_shared/dominio/modelos/ids.ts'
import { respostasDoModelo } from './preencher.ts'

export interface Pessoa {
  id: string
  email: string
  nome: string
  papeis: readonly string[]
}

export interface Equipe {
  concierge: Pessoa
  conferente: Pessoa
  enfermagem: Pessoa
  circulante: Pessoa
  anestesista: Pessoa
  cirurgiao: Pessoa
  gestora: Pessoa
}

export type Chamar = <A extends AcaoEquipe>(quem: Pessoa, acao: A, dados: AcoesEquipe[A]['E'], ator?: string | null) => Promise<AcoesEquipe[A]['S']>

export interface PacienteFicticio {
  nome: string
  nascimento: string
  cpf: string | null
  prontuario: string
  mae?: string | null
}

export const lenteFicticia = (olho: Olho, dioptria: number) => ({ olho, modelo: 'LIO Teste Monofocal XY', dioptria, torica: false, cilindro: null, eixo: null })

export function dataLocal(deslocDias = 0, base = new Date()): string {
  const d = new Date(base.getTime() + deslocDias * 86400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/**
 * `pin(sessao, alvo)`: token de ator do alvo, obtido na sessão de `sessao` (confirmação em voz alta).
 */
export function roteiro(chamar: Chamar, eq: Equipe, pin: (sessao: Pessoa, alvo: Pessoa) => Promise<string>) {
  const obter = (id: string, quem: Pessoa = eq.concierge): Promise<EpisodioVisao> => chamar(quem, 'episodio.obter', { episodioId: id })

  const com = async <A extends AcaoEquipe>(id: string, quem: Pessoa, acao: A, dados: Omit<AcoesEquipe[A]['E'], 'episodioId' | 'versao'>): Promise<AcoesEquipe[A]['S']> => {
    const v = await obter(id, quem)
    return chamar(quem, acao, { episodioId: id, versao: v.episodio.versao, ...dados } as AcoesEquipe[A]['E'])
  }

  const responder = async (
    id: string,
    modelo: ModeloId,
    quem: Pessoa,
    sobrepor: Record<string, ValorResposta | null> = {},
    filtro?: (itemId: string, secaoId: string) => boolean,
  ): Promise<EpisodioVisao> => {
    const v = await obter(id, quem)
    // Cada item é respondido uma vez (por quem chega primeiro); correção só quando pedida em `sobrepor`.
    const jaRespondidos = new Set(Object.keys(v.respostas[modelo] ?? {}))
    const filtroFinal = (itemId: string, secaoId: string) => (itemId in sobrepor || !jaRespondidos.has(itemId)) && (!filtro || filtro(itemId, secaoId))
    const anteriores = v.identificacao.segundoOlho !== null
    const semAlertas = !v.alertas.some(a => a.origem.modelo === 'd7' && !a.inativo)
    const respostas = respostasDoModelo(v.modelos[modelo], quem.papeis, { olho: v.episodio.olho, hoje: dataLocal(0), dataCirurgia: v.episodio.dataCirurgia, segundoOlho: anteriores, semAlertasD7: semAlertas }, sobrepor, filtroFinal)
    if (!respostas.length) return v
    return chamar(quem, 'checklist.responder', { episodioId: id, versao: v.episodio.versao, modelo, respostas })
  }

  const concluir = async (id: string, modelo: ModeloId, quem: Pessoa, extra: { leitorId?: string | null; confirmadorToken?: string | null } = {}) => {
    const v = await obter(id, quem)
    return chamar(quem, 'bloco.concluir', { episodioId: id, versao: v.episodio.versao, modelo, ...extra })
  }

  const cadastrar = async (p: PacienteFicticio) =>
    (
      await chamar(eq.concierge, 'paciente.cadastrar', {
        cpf: p.cpf,
        datasighId: null,
        nomeCompleto: p.nome,
        dataNascimento: p.nascimento,
        nomeMae: p.mae ?? null,
        prontuario: p.prontuario,
        conferidoDatasigh: false,
        documentoConferido: true,
      })
    ).pacienteId

  const abrir = async (pacienteId: string, olho: Olho, dataSugerida: string | null, cirurgiao: Pessoa = eq.cirurgiao) =>
    (await chamar(eq.concierge, 'episodio.abrir', { pacienteId, olho, cirurgiaoId: cirurgiao.id, tipoCirurgia: 'Facectomia com implante de LIO', tipoLente: 'Monofocal', dataSugerida })).episodioId

  /** Contatos com anuência e confirmados (avisos só para números confirmados). */
  const contatos = async (id: string) => {
    const lista: AcoesEquipe['contato.salvar']['E']['contato'][] = [
      { tipo: 'whatsapp_paciente', nome: 'Paciente (o proprio)', telefone: '00900000010', operaCelular: 'o proprio paciente', anuenciaPaciente: true },
      { tipo: 'acompanhante_titular', nome: 'Acompanhante Teste Titular', parentesco: 'filha', telefone: '00900000011', anuenciaPaciente: true },
      { tipo: 'acompanhante_reserva', nome: 'Acompanhante Teste Reserva', parentesco: 'filho', telefone: '00900000012', anuenciaPaciente: true },
      { tipo: 'familiar_avisos', nome: 'Familiar Teste Avisos', parentesco: 'filha', telefone: '00900000013', anuenciaPaciente: true },
    ]
    for (const contato of lista) await com(id, eq.concierge, 'contato.salvar', { contato })
    const v = await obter(id)
    for (const c of v.contatos) if (!c.confirmadoEm) await com(id, eq.concierge, 'contato.confirmar', { contatoId: c.id })
  }

  /** D-7 completo pela concierge. */
  const d7 = async (id: string, o: { dataCirurgia: string; ordem?: number; horario?: string; dioptria: number; sobrepor?: Record<string, ValorResposta | null>; materiais?: boolean }) => {
    const v0 = await obter(id)
    await com(id, eq.concierge, 'episodio.agendar', { dataCirurgia: o.dataCirurgia, horario: o.horario ?? '07:00', ordem: o.ordem ?? 1 })
    await contatos(id)
    await com(id, eq.concierge, 'orientacoes.teach_back', { resultado: 'adequado_primeira', observacao: null })
    await com(id, eq.concierge, 'lente.plano', {
      dados: { ...lenteFicticia(v0.episodio.olho, o.dioptria), reserva: { modelo: 'LIO Teste Monofocal XY', dioptria: o.dioptria + 0.5 }, alvoRefrativo: -0.25, dataPedido: dataLocal(-3) },
    })
    await com(id, eq.concierge, 'tcle.status', { status: 'enviado', link: 'https://exemplo.invalid/tcle/assinatura' })
    // Fechamento (POP §1.G): materiais enviados pelo painel antes de marcar o item.
    if (o.materiais !== false) await com(id, eq.concierge, 'materiais.enviar', {})
    await responder(id, 'd7', eq.concierge, { [D7.materiais]: o.materiais === false ? 'presencial' : 'enviados', ...(o.sobrepor ?? {}) })
    await concluir(id, 'd7', eq.concierge)
  }

  /** Checkpoint 1 (chegada da lente) pela concierge. */
  const cp1 = async (id: string) => {
    await com(id, eq.concierge, 'lente.chegada', { dados: { dataChegada: dataLocal(-1), lote: 'LOTE-TESTE-001', validade: '2030-12' } })
    await responder(id, 'cp1', eq.concierge)
    await concluir(id, 'cp1', eq.concierge)
  }

  /** Checkpoint 2 (cego) pela segunda conferente. Devolve a visão (pode estar em quarentena). */
  const cp2 = async (id: string, dioptriaDigitada: number, quem: Pessoa = eq.conferente) => {
    const v = await obter(id, quem)
    const r = await com(id, quem, 'lente.cp2', { valores: lenteFicticia(v.episodio.olho, dioptriaDigitada) })
    if (r.lente.etapa === 'quarentena') return r
    await responder(id, 'cp2', quem)
    return concluir(id, 'cp2', quem)
  }

  /** Confirmações do D-2, TCLE assinado e do olho certo. */
  const d2 = async (id: string) => {
    await com(id, eq.conferente, 'tcle.status', { status: 'assinado', link: null })
    await com(id, eq.conferente, 'tcle.status', { status: 'olho_conferido', link: null })
    await responder(id, 'd2', eq.conferente)
    return concluir(id, 'd2', eq.conferente)
  }

  const admissao = async (id: string) => {
    await responder(id, 'admissao', eq.enfermagem)
    return concluir(id, 'admissao', eq.enfermagem)
  }

  /** Sign In: a circulante lê em voz alta; a enfermagem confirma com o PIN. */
  const signIn = async (id: string) => {
    // Ordem (regra 4): identificação e consentimento, marcação do sítio pelo cirurgião, só então o midriático.
    await responder(id, 'sign_in', eq.circulante, {}, item => item !== SI.midriatico)
    await responder(id, 'sign_in', eq.cirurgiao)
    await responder(id, 'sign_in', eq.circulante)
    await responder(id, 'sign_in', eq.enfermagem)
    const confirmador = await pin(eq.circulante, eq.enfermagem)
    return concluir(id, 'sign_in', eq.circulante, { leitorId: eq.circulante.id, confirmadorToken: confirmador })
  }

  /** Anestesia antes da incisão: jejum/medicações e monitorização (a liberação vem depois do Sign Out). */
  const anestesia = async (id: string) => responder(id, 'anestesia', eq.anestesista, {}, item => item !== AN.liberacao)

  /** Liberação da recuperação (depois do Sign Out) e conclusão do bloco de anestesia. */
  const liberacaoAnestesia = async (id: string) => {
    await responder(id, 'anestesia', eq.anestesista)
    return concluir(id, 'anestesia', eq.anestesista)
  }

  /** Time Out: leitura da LIO da caixa pela circulante; o cirurgião confirma com o PIN. */
  const timeOut = async (id: string, leituraDioptria?: number) => {
    const v = await obter(id, eq.cirurgiao)
    const plano = v.lente.plano
    await com(id, eq.circulante, 'lente.time_out', { leitura: { modelo: plano?.modelo ?? 'LIO Teste Monofocal XY', dioptria: leituraDioptria ?? plano?.dioptria ?? 0, cilindro: null, eixo: null } })
    await responder(id, 'time_out', eq.circulante)
    await responder(id, 'time_out', eq.cirurgiao)
    const confirmador = await pin(eq.circulante, eq.cirurgiao)
    return concluir(id, 'time_out', eq.circulante, { leitorId: eq.circulante.id, confirmadorToken: confirmador })
  }

  const signOut = async (id: string, sobrepor: Record<string, ValorResposta | null> = {}) => {
    await responder(id, 'sign_out', eq.circulante, sobrepor)
    await responder(id, 'sign_out', eq.cirurgiao)
    await responder(id, 'sign_out', eq.anestesista)
    return concluir(id, 'sign_out', eq.circulante)
  }

  const alta = async (id: string) => {
    await responder(id, 'alta', eq.enfermagem)
    await responder(id, 'alta', eq.cirurgiao)
    return concluir(id, 'alta', eq.enfermagem)
  }

  return { obter, com, responder, concluir, cadastrar, abrir, contatos, d7, cp1, cp2, d2, admissao, signIn, anestesia, timeOut, signOut, liberacaoAnestesia, alta }
}
