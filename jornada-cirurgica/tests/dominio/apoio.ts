// Apoio aos testes do domínio: simulador que faz o papel da API (grava eventos com seq, registros de lente
// e mensagens; monta o estado completo ou só o visível a um papel). Somente dados fictícios.

import {
  abrirEpisodio,
  ADM,
  ALTA,
  AN,
  configPadrao,
  D2,
  D7,
  decidir,
  ErroDominio,
  mascararTelefone,
  modelosPadrao,
  montarEstado,
  PAPEIS_LEITURA,
  projetarVisao,
  SI,
  SO,
  TO,
  versoesDosModelos,
} from '../../supabase/functions/_shared/dominio/index.ts'
import type {
  Ator,
  Comando,
  ConfigJornada,
  ContextoDecisao,
  EntradaEstado,
  EpisodioVisao,
  Estado,
  EstadoEpisodio,
  Evento,
  ItemModelo,
  MensagemSaida,
  ModeloId,
  Olho,
  Paciente,
  Papel,
  RegistroLente,
  ResultadoDecisao,
  ValorResposta,
} from '../../supabase/functions/_shared/dominio/index.ts'

export const MEMBROS = {
  concierge: { id: '00000000-0000-4000-8000-0000000000a1', nome: 'Concierge Teste Um', papeis: ['concierge'] as Papel[] },
  concierge2: { id: '00000000-0000-4000-8000-0000000000a2', nome: 'Concierge Teste Dois', papeis: ['concierge'] as Papel[] },
  conferente: { id: '00000000-0000-4000-8000-0000000000b1', nome: 'Conferente Teste Um', papeis: ['conferente'] as Papel[] },
  conferente2: { id: '00000000-0000-4000-8000-0000000000b2', nome: 'Conferente Teste Dois', papeis: ['conferente'] as Papel[] },
  enfermagem: { id: '00000000-0000-4000-8000-0000000000c1', nome: 'Enfermeira Teste Um', papeis: ['enfermagem'] as Papel[] },
  circulante: { id: '00000000-0000-4000-8000-0000000000d1', nome: 'Circulante Teste Um', papeis: ['circulante'] as Papel[] },
  anestesista: { id: '00000000-0000-4000-8000-0000000000e1', nome: 'Anestesista Teste Um', papeis: ['anestesista'] as Papel[] },
  cirurgiao: { id: '00000000-0000-4000-8000-0000000000f1', nome: 'Cirurgião Teste Um', papeis: ['cirurgiao'] as Papel[] },
  cirurgiao2: { id: '00000000-0000-4000-8000-0000000000f2', nome: 'Cirurgião Teste Dois', papeis: ['cirurgiao'] as Papel[] },
  gestora: { id: '00000000-0000-4000-8000-0000000000a9', nome: 'Gestora Teste Um', papeis: ['gestora'] as Papel[] },
  /** Papel duplo (concierge + conferente): testa a conferência cega por autoria. */
  dupla: { id: '00000000-0000-4000-8000-0000000000ab', nome: 'Dupla Teste Um', papeis: ['concierge', 'conferente'] as Papel[] },
} as const

export type ChaveMembro = keyof typeof MEMBROS

export const DATA_CIRURGIA = '2026-10-20' // terça-feira
export const D7_INSTANTE = '2026-10-13T13:00:00.000Z' // 10:00 em São Paulo
export const D2_INSTANTE = '2026-10-18T13:00:00.000Z'
export const D0_INSTANTE = '2026-10-20T10:00:00.000Z' // 07:00 em São Paulo

export const PLANO = { olho: 'OD' as Olho, modelo: 'Lente Teste ZX-100', dioptria: 21.5, torica: false, cilindro: null, eixo: null, reserva: { modelo: 'Lente Sulco Teste S3', dioptria: 20.5 } }
export const CHEGADA = { dataChegada: '2026-10-15', lote: 'LOTE-TESTE-001', validade: '2027-12' }

export interface OpcoesSimulador {
  olho?: Olho
  tipoLente?: string
  paciente?: Partial<Paciente>
  config?: Partial<ConfigJornada>
  mesmoDia?: EntradaEstado['contexto']['mesmoDia']
  anteriores?: EntradaEstado['contexto']['anterioresDoPaciente']
  envioHabilitado?: boolean
}

export class Simulador {
  entrada: EntradaEstado
  agora = D7_INSTANTE
  private seq = 0
  private contador = 0
  envioHabilitado: boolean
  atorViuConferencia1 = new Set<string>()

  constructor(op: OpcoesSimulador = {}) {
    const config = { ...configPadrao(), ...(op.config ?? {}) }
    const modelos = modelosPadrao(config)
    const paciente: Paciente = {
      id: '11111111-0000-4000-8000-000000000001',
      nomeCompleto: 'Paciente Teste Alfa da Silva',
      dataNascimento: '1950-03-04',
      nomeMae: null,
      prontuario: 'PT-0001',
      datasighId: null,
      conferidoDatasigh: false,
      ...(op.paciente ?? {}),
    }
    const membros: EntradaEstado['membros'] = {}
    for (const m of Object.values(MEMBROS)) membros[m.id] = { id: m.id, nome: m.nome, papeis: [...m.papeis] }
    this.envioHabilitado = op.envioHabilitado ?? false
    this.entrada = {
      episodio: {
        id: '22222222-0000-4000-8000-000000000001',
        pacienteId: paciente.id,
        olho: op.olho ?? 'OD',
        cirurgiaoId: MEMBROS.cirurgiao.id,
        tipoCirurgia: 'Facoemulsificação com implante de LIO',
        tipoLente: op.tipoLente ?? 'monofocal',
        dataSugerida: DATA_CIRURGIA,
        dataCirurgia: null,
        horario: null,
        ordem: null,
        versao: 0,
        abertoEm: D7_INSTANTE,
        versoesModelos: versoesDosModelos(modelos),
      },
      paciente,
      eventos: [],
      lente: [],
      modelos,
      membros,
      mensagens: [],
      contexto: { mesmoDia: op.mesmoDia ?? [], anterioresDoPaciente: op.anteriores ?? [] },
      config,
    }
    const { evento } = abrirEpisodio(
      {
        episodioId: this.entrada.episodio.id,
        paciente,
        olho: this.entrada.episodio.olho,
        cirurgiaoId: MEMBROS.cirurgiao.id,
        tipoCirurgia: this.entrada.episodio.tipoCirurgia,
        tipoLente: this.entrada.episodio.tipoLente,
        dataSugerida: DATA_CIRURGIA,
        versoesModelos: this.entrada.episodio.versoesModelos,
        anterioresDoPaciente: op.anteriores ?? [],
      },
      this.ctx('concierge'),
    )
    this.gravar({ eventos: [evento], lente: [], mensagens: [] })
  }

  gerarId = (): string => `id-teste-${++this.contador}`

  ator(chave: ChaveMembro): Ator {
    const m = MEMBROS[chave]
    return { id: m.id, nome: m.nome, papeis: [...m.papeis], sessaoUsuarioId: m.id, aparelhoId: 'aparelho-teste' }
  }

  ctx(chave: ChaveMembro): ContextoDecisao {
    return {
      ator: this.ator(chave),
      agora: this.agora,
      gerarId: this.gerarId,
      config: this.entrada.config,
      envioHabilitado: this.envioHabilitado,
      urlPaginaPaciente: 'https://pagina-teste.invalid/p/',
      atorViuConferencia1: this.atorViuConferencia1.has(MEMBROS[chave].id),
    }
  }

  estado(): Estado {
    return montarEstado(this.entrada)
  }

  /** Estado montado só com o que o banco deixaria o papel ler (RLS por visibilidade e por etapa). */
  estadoVisivel(chave: ChaveMembro): Estado {
    const papeis = MEMBROS[chave].papeis
    const ve = (lista: Papel[]) => papeis.some((p) => lista.includes(p))
    const eventos = this.entrada.eventos.filter(
      (e) => e.visibilidade === 'geral' || (e.visibilidade === 'conferencia_1' && ve(PAPEIS_LEITURA.conferencia_1)) || (e.visibilidade === 'conferencia_2' && ve(PAPEIS_LEITURA.conferencia_2)),
    )
    const lente = this.entrada.lente.filter(
      (r) =>
        ((r.etapa === 'plano' || r.etapa === 'chegada') && ve(PAPEIS_LEITURA.conferencia_1)) ||
        (r.etapa === 'cp2' && ve(PAPEIS_LEITURA.conferencia_2)) ||
        (r.etapa === 'time_out' && ve(PAPEIS_LEITURA.time_out)),
    )
    return montarEstado({ ...this.entrada, eventos, lente })
  }

  visao(chave: ChaveMembro, completo = false): EpisodioVisao {
    return projetarVisao(completo ? this.estado() : this.estadoVisivel(chave), this.ator(chave), this.agora)
  }

  executar(chave: ChaveMembro, comando: Comando): ResultadoDecisao {
    const r = decidir(this.estado(), comando, this.ctx(chave))
    this.gravar(r)
    return r
  }

  /** Executa e devolve o erro de domínio (falha o teste se não houver erro). */
  falha(chave: ChaveMembro, comando: Comando): ErroDominio {
    try {
      this.executar(chave, comando)
    } catch (e) {
      if (e instanceof ErroDominio) return e
      throw e
    }
    throw new Error(`Esperava erro de domínio para ${comando.tipo}`)
  }

  gravar(r: ResultadoDecisao) {
    for (const ev of r.eventos) {
      const evento: Evento = { ...ev, id: `ev-${this.seq + 1}`, seq: ++this.seq, registradoEm: this.agora }
      this.entrada.eventos.push(evento)
      if (ev.tipo === 'episodio.agendado') {
        const d = ev.dados as { dataCirurgia: string | null; horario?: string | null; ordem?: number | null }
        this.entrada.episodio = {
          ...this.entrada.episodio,
          dataCirurgia: d.dataCirurgia,
          ...(d.horario !== undefined ? { horario: d.horario } : {}),
          ...(d.ordem !== undefined ? { ordem: d.ordem } : {}),
        }
      }
    }
    for (const reg of r.lente) this.entrada.lente.push({ ...reg, registradoEm: this.agora } as RegistroLente)
    for (const m of r.mensagens) {
      const msg: MensagemSaida = {
        id: m.id,
        episodioId: this.entrada.episodio.id,
        gatilho: m.gatilho,
        contatoId: m.contatoId,
        destinoMascarado: mascararTelefone(m.telefone),
        texto: m.texto,
        modeloMeta: m.modeloMeta,
        estado: m.estadoInicial,
        criadoEm: this.agora,
        atualizadoEm: this.agora,
      }
      this.entrada.mensagens.push(msg)
    }
    this.entrada.episodio = { ...this.entrada.episodio, versao: this.seq }
  }

  get estadoEpisodio(): EstadoEpisodio {
    return this.estado().estado
  }
}

// ---------------------------------------------------------------------------
// Respostas padrão (paciente sem alertas) e preenchimento de blocos
// ---------------------------------------------------------------------------

const PESSOA = { nome: 'Acompanhante Teste Beta', parentesco: 'filha', telefone: '(44) 99999-0001' }

export function valorPadrao(sim: Simulador, modelo: ModeloId, item: ItemModelo): ValorResposta {
  const ep = sim.entrada.episodio
  const especiais: Record<string, ValorResposta> = {
    [`d7:${D7.olhoPaciente}`]: ep.olho,
    [`d7:${D7.primeiroSegundo}`]: 'primeiro',
    [`d7:${D7.mobilidade}`]: ['sem_limitacao'],
    [`d7:${D7.quemInstila}`]: 'paciente',
    [`d7:${D7.semOculos}`]: 'nao',
    [`d7:${D7.deitar}`]: 'sim',
    [`d7:${D7.compreende}`]: 'sim',
    [`d7:${D7.nenhumaAlergia}`]: 'sim',
    [`d7:${D7.materiais}`]: 'presencial',
    [`d2:${D2.olhoVermelho}`]: 'nao',
    [`d2:${D2.mudancaMedicacao}`]: 'nao',
    [`d2:${D2.tcle}`]: 'sim',
    [`admissao:${ADM.mudouRemedio}`]: 'nao',
    [`admissao:${ADM.olhoVermelho}`]: 'nao',
    [`admissao:${ADM.pulseiraBraco}`]: 'lado_do_olho',
    [`sign_in:${SI.condutaAlertas}`]: 'nao_se_aplica',
    [`sign_out:${SO.intercorrencias}`]: 'sem_intercorrencia',
    [`sign_out:${SO.lioSulco}`]: 'nao_houve',
    [`sign_out:${SO.equipamento}`]: 'nenhum',
    [`alta:${ALTA.quemInstila}`]: 'paciente',
    [`alta:${ALTA.docAtestado}`]: 'nao_solicitado',
    [`alta:${ALTA.d1Data}`]: '2026-10-21',
    [`alta:${ALTA.d15Data}`]: '2026-11-04',
  }
  const k = `${modelo}:${item.id}`
  if (k in especiais) return especiais[k]
  switch (item.tipo) {
    case 'confirmacao':
      return true
    case 'sim_nao':
      return modelo === 'd7' ? 'nao' : 'sim'
    case 'opcao':
      return item.opcoes![0].valor
    case 'multipla':
      return [item.opcoes![0].valor]
    case 'texto':
      return 'Registro de teste'
    case 'data':
      return DATA_CIRURGIA
    case 'hora':
      return '08:00'
    case 'numero':
      return 1
    case 'olho':
      return ep.olho
    case 'medicamento':
      return { uso: 'nao' }
    case 'alergia':
      return { tem: false }
    case 'pessoa':
      return { ...PESSOA }
  }
}

/** Itens tratados à parte pelos testes (dependem de outro comando antes). */
export const ITENS_ESPECIAIS = new Set([`d7:${D7.alertasComunicados}`, `time_out:${TO.readBack}`, `anestesia:${AN.liberacao}`])

const PREFERENCIA: ChaveMembro[] = ['concierge', 'conferente', 'enfermagem', 'circulante', 'anestesista', 'cirurgiao']

function chaveParaItem(item: ItemModelo, preferida?: ChaveMembro): ChaveMembro {
  if (preferida && MEMBROS[preferida].papeis.some((p) => item.papeis.includes(p))) return preferida
  return PREFERENCIA.find((k) => MEMBROS[k].papeis.some((p) => item.papeis.includes(p)))!
}

/**
 * Responde todos os itens exigidos (e os opcionais sem condição) do bloco com os valores padrão,
 * agrupando por ator e respeitando `depoisDe` (itens com ordem vão em envios separados, na ordem).
 */
export function preencherBloco(
  sim: Simulador,
  modelo: ModeloId,
  opcoes: { valores?: Record<string, ValorResposta>; pular?: string[]; preferida?: ChaveMembro; incluirOpcionais?: boolean } = {},
) {
  const m = sim.entrada.modelos[modelo]
  const todos = m.secoes.flatMap((s) => s.itens)
  const valorDe = (i: ItemModelo) => (opcoes.valores && i.id in opcoes.valores ? opcoes.valores[i.id] : valorPadrao(sim, modelo, i))
  const itens = todos.filter((i) => {
    if (ITENS_ESPECIAIS.has(`${modelo}:${i.id}`) || opcoes.pular?.includes(i.id)) return false
    if (opcoes.valores && i.id in opcoes.valores) return true
    if (i.pendente && !i.obrigatorio) return false
    if (i.obrigatorio) return true
    if (i.exigidoQuando) {
      // Condição por outro item: incluir se o valor que será respondido a satisfaz. Contexto: o teste decide.
      const c = i.exigidoQuando
      if ('itemId' in c) {
        const ref = todos.find((x) => x.id === c.itemId)
        const v = ref ? valorDe(ref) : undefined
        return typeof v === 'string' && c.valores.includes(v)
      }
      return false
    }
    return !!opcoes.incluirOpcionais
  })
  const semOrdem = itens.filter((i) => !i.depoisDe?.length)
  const comOrdem = itens.filter((i) => i.depoisDe?.length)
  const grupos = new Map<ChaveMembro, ItemModelo[]>()
  for (const i of semOrdem) {
    const k = chaveParaItem(i, opcoes.preferida)
    grupos.set(k, [...(grupos.get(k) ?? []), i])
  }
  for (const [k, lista] of grupos) {
    sim.executar(k, { tipo: 'checklist.responder', modelo, respostas: lista.map((i) => ({ itemId: i.id, valor: valorDe(i) })) })
  }
  // Itens com ordem: um envio por item, pré-requisitos primeiro.
  const pendentes = [...comOrdem]
  const feitos = new Set(semOrdem.map((i) => i.id))
  while (pendentes.length) {
    const idx = pendentes.findIndex((i) => i.depoisDe!.every((d) => feitos.has(d)))
    const i = pendentes.splice(idx === -1 ? 0 : idx, 1)[0]
    sim.executar(chaveParaItem(i, opcoes.preferida), { tipo: 'checklist.responder', modelo, respostas: [{ itemId: i.id, valor: valorDe(i) }] })
    feitos.add(i.id)
  }
}

// ---------------------------------------------------------------------------
// Roteiros
// ---------------------------------------------------------------------------

/** Agenda, contatos confirmados e WhatsApp do paciente. */
export function prepararContatos(sim: Simulador) {
  sim.executar('concierge', { tipo: 'episodio.agendar', dataCirurgia: DATA_CIRURGIA, horario: '07:30', ordem: 1 })
  sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'contato-whats', tipo: 'whatsapp_paciente', nome: 'Paciente Teste Alfa', telefone: '(44) 99999-1262', anuenciaPaciente: true, operaCelular: 'O próprio paciente' } })
  sim.executar('concierge', { tipo: 'contato.salvar', contato: { id: 'contato-familia', tipo: 'familiar_avisos', nome: 'Familiar Teste Gama', parentesco: 'filho', telefone: '(44) 98888-3344', anuenciaPaciente: true } })
  sim.executar('concierge', { tipo: 'contato.confirmar', contatoId: 'contato-whats' })
  sim.executar('concierge', { tipo: 'contato.confirmar', contatoId: 'contato-familia' })
}

/** Plano, chegada e checkpoint 1 (concierge). */
export function fazerCp1(sim: Simulador, plano = PLANO, chave: ChaveMembro = 'concierge') {
  sim.executar(chave, { tipo: 'lente.plano', dados: { ...plano } })
  sim.executar(chave, { tipo: 'lente.chegada', dados: { ...CHEGADA } })
  preencherBloco(sim, 'cp1', { preferida: chave })
  sim.executar(chave, { tipo: 'bloco.concluir', modelo: 'cp1' })
}

/** Checkpoint 2 cego (conferente) com os valores informados. */
export function fazerCp2(sim: Simulador, valores: { olho: Olho; modelo: string; dioptria: number; torica: boolean; cilindro: number | null; eixo: number | null } = PLANO, chave: ChaveMembro = 'conferente') {
  preencherBloco(sim, 'cp2', { preferida: chave })
  sim.executar(chave, { tipo: 'lente.cp2', valores: { olho: valores.olho, modelo: valores.modelo, dioptria: valores.dioptria, torica: valores.torica, cilindro: valores.cilindro, eixo: valores.eixo } })
}

/** D-7 completo de um paciente sem alertas (orientações presenciais). */
export function fazerD7(sim: Simulador, valores: Record<string, ValorResposta> = {}) {
  sim.agora = D7_INSTANTE
  prepararContatos(sim)
  preencherBloco(sim, 'd7', { valores })
  sim.executar('concierge', { tipo: 'orientacoes.teach_back', resultado: 'adequado_primeira' })
}

export function concluirD7(sim: Simulador) {
  sim.executar('concierge', { tipo: 'checklist.responder', modelo: 'd7', respostas: [{ itemId: D7.alertasComunicados, valor: true }] })
  sim.executar('concierge', { tipo: 'bloco.concluir', modelo: 'd7' })
}

/** Do D-7 ao D-2 concluído (sem alertas). */
export function ateD2(sim: Simulador) {
  fazerD7(sim)
  concluirD7(sim)
  fazerCp1(sim)
  sim.agora = D2_INSTANTE
  fazerCp2(sim)
  sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'cp2' })
  sim.executar('concierge', { tipo: 'tcle.status', status: 'assinado', link: 'https://assinatura-teste.invalid/tcle' })
  preencherBloco(sim, 'd2', { preferida: 'conferente' })
  sim.executar('conferente', { tipo: 'bloco.concluir', modelo: 'd2' })
}

/** Admissão concluída no D0. */
export function admitir(sim: Simulador) {
  sim.agora = D0_INSTANTE
  preencherBloco(sim, 'admissao')
  sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'admissao' })
}

export function signIn(sim: Simulador) {
  preencherBloco(sim, 'sign_in', { preferida: 'enfermagem' })
  sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'sign_in', leitorId: MEMBROS.enfermagem.id, confirmadorId: MEMBROS.circulante.id })
}

export function timeOut(sim: Simulador, leitura = { modelo: PLANO.modelo, dioptria: PLANO.dioptria, cilindro: null as number | null, eixo: null as number | null }) {
  preencherBloco(sim, 'anestesia', { preferida: 'anestesista' })
  sim.executar('circulante', { tipo: 'lente.time_out', leitura })
  preencherBloco(sim, 'time_out', { preferida: 'circulante' })
  sim.executar('cirurgiao', { tipo: 'checklist.responder', modelo: 'time_out', respostas: [{ itemId: TO.readBack, valor: true }] })
  sim.executar('circulante', { tipo: 'bloco.concluir', modelo: 'time_out', leitorId: MEMBROS.circulante.id, confirmadorId: MEMBROS.cirurgiao.id })
}

export function signOutEAlta(sim: Simulador, valoresSignOut: Record<string, ValorResposta> = {}) {
  preencherBloco(sim, 'sign_out', { preferida: 'circulante', valores: valoresSignOut })
  sim.executar('circulante', { tipo: 'bloco.concluir', modelo: 'sign_out' })
  sim.executar('anestesista', { tipo: 'checklist.responder', modelo: 'anestesia', respostas: [{ itemId: AN.liberacao, valor: true }] })
  sim.executar('anestesista', { tipo: 'bloco.concluir', modelo: 'anestesia' })
  preencherBloco(sim, 'alta', { preferida: 'enfermagem' })
  sim.executar('enfermagem', { tipo: 'bloco.concluir', modelo: 'alta' })
}

/** Episódio fictício completo, do D-7 à alta. */
export function jornadaCompleta(sim: Simulador) {
  ateD2(sim)
  admitir(sim)
  signIn(sim)
  timeOut(sim)
  signOutEAlta(sim)
}

/** Chaves proibidas em eventos 'geral' (CHECK do banco). */
export function chavesDeLenteEmEventosGerais(eventos: { visibilidade: string; dados: unknown }[]): string[] {
  const proibidas = new Set(['dioptria', 'cilindro', 'eixo'])
  const achadas: string[] = []
  const varrer = (v: unknown, caminho: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => varrer(x, `${caminho}[${i}]`))
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (proibidas.has(k)) achadas.push(`${caminho}.${k}`)
        varrer(x, `${caminho}.${k}`)
      }
    }
  }
  for (const e of eventos) if (e.visibilidade === 'geral') varrer(e.dados, 'dados')
  return achadas
}
