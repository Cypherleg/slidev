// Implementação das ações da equipe (contrato.ts → AcoesEquipe).
// Toda regra do POP é do domínio; aqui: forma das entradas, carga/gravação, acesso por papel
// nas ações de gestão (que não têm regra no POP) e registro de acessos.

import {
  abrirEpisodio,
  alertasDoEpisodio,
  cadastrarPaciente,
  calcularIndicadores,
  configPadrao,
  dataLocal,
  gerarEtiquetas,
  montarEstado,
  normalizarCpf,
  normalizarNome,
  OLHO_EXTENSO,
  ORDEM_MODELOS,
  PAPEIS,
  papeisPermitidosParaEvento,
  pendenciasDoEpisodio,
  previaMateriais,
  resumoDia,
  resumoVespera,
  validarCpf,
  visaoLeituraDia,
  type Comando,
  type ConfigJornada,
  type Contato,
  type MaterialCatalogo,
  type ModeloChecklist,
  type ModeloId,
  type NovoEvento,
  type Papel,
  type TipoContato,
  type TipoEtiqueta,
  type CodigoHardStop,
  type ValorResposta,
} from '../dominio/index.ts'
import type { AcaoEquipe, AcoesEquipe } from './contrato.ts'
import { validarAnexo } from './armazenamento.ts'
import { hex, hmac } from './cripto.ts'
import { ErroMetodoProibido } from './datasigh.ts'
import type { Executor } from './db.ts'
import { erro } from './erros.ts'
import { gerarTokenLink, hashToken, protegerMensagens } from './link-paciente.ts'
import { emitirTokenAtor, formatoPinValido, gerarHashPin, pinAceitavel, verificarHashPin, verificarTokenAtor } from './pin.ts'
import {
  atualizarCampoPaciente,
  atualizarProjecao,
  atualizarResumo,
  buscarAnexo,
  buscarConvite,
  buscarMembro,
  buscarMembroPorEmail,
  buscarPaciente,
  buscarPacientePorChave,
  carregarEntrada,
  carregarEntradas,
  comoApi,
  comoSistema,
  contarAcessos,
  episodiosDoPaciente,
  idsEpisodios,
  inserirAnexo,
  inserirEpisodio,
  inserirEventos,
  inserirLinkPaciente,
  inserirMaterial,
  inserirPaciente,
  lerConfigJornada,
  listarModelos,
  materiaisCatalogo,
  membrosAtivos,
  mensagensDosEpisodios,
  mensagemPublica,
  modelosAtivos,
  pinHashDoMembro,
  registrarAcesso,
  registrarAparelho,
  S,
} from './repositorio.ts'
import {
  agoraIso,
  atorDb,
  contextoDecisao,
  executarComando,
  exigirGestora,
  lerVisao,
  registrarLeituraEpisodio,
  temPapel,
  entradaTemConferencia1,
  type ContextoReq,
} from './servico.ts'
import * as v from './validar.ts'

type Impl = { [A in AcaoEquipe]: (ctx: ContextoReq, dados: v.Obj) => Promise<AcoesEquipe[A]['S']> }

const TIPOS_CONTATO: readonly TipoContato[] = ['whatsapp_paciente', 'acompanhante_titular', 'acompanhante_reserva', 'familiar_avisos', 'emergencia', 'cuidador_colirios']
const VIAS = ['presencial', 'telefone', 'whatsapp', 'painel', 'outro'] as const
const CAUSAS = ['sem_acompanhante', 'colirio_nao_usado', 'medicacao_nao_ajustada', 'olho_vermelho_nao_avisado', 'tcle_ausente', 'lio_indisponivel', 'outra'] as const
const ETIQUETAS: readonly TipoEtiqueta[] = ['peito', 'pulseira', 'caixa_lente', 'alertas']

/** Primeiro papel do ator autorizado para o tipo de evento (matriz do domínio). */
function papelAutor(ctx: ContextoReq, tipo: NovoEvento['tipo'], modelo?: ModeloId | null): Papel {
  const permitidos = papeisPermitidosParaEvento(tipo, modelo ?? null)
  const p = ctx.ator.papeis.find(x => permitidos.includes(x))
  if (!p) throw erro('sem_permissao')
  return p
}

function eventoSemEpisodio(ctx: ContextoReq, tipo: NovoEvento['tipo'], dados: Record<string, unknown>, pacienteId: string | null = null): NovoEvento {
  return {
    episodioId: null,
    pacienteId,
    tipo,
    dados,
    visibilidade: 'geral',
    autorId: ctx.ator.id,
    autorPapel: papelAutor(ctx, tipo),
    sessaoUsuarioId: ctx.membro.id,
    aparelhoId: ctx.aparelhoId,
    foraDeHora: false,
  }
}

function telefoneOpcional(x: unknown, campo: string): string | undefined {
  const t = v.textoOpcional(x, campo, { max: 30 })
  if (t === null) return undefined
  const limpo = t.replace(/[\s().-]/g, '')
  if (!/^\+?\d{10,15}$/.test(limpo)) throw erro('validacao', `Campo inválido: ${campo}.`, { campo })
  return limpo
}

function numero(x: unknown, campo: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw erro('validacao', `Campo inválido: ${campo}.`, { campo })
  return x
}

function numeroOuNull(x: unknown, campo: string): number | null {
  if (x === undefined || x === null) return null
  return numero(x, campo)
}

function valoresLente(x: unknown, campo: string) {
  const o = v.objetoObrigatorio(x, campo)
  return {
    olho: v.olho(o.olho, `${campo}.olho`),
    modelo: v.texto(o.modelo, `${campo}.modelo`, { max: 120 }),
    dioptria: numero(o.dioptria, `${campo}.dioptria`),
    torica: v.booleano(o.torica, `${campo}.torica`),
    cilindro: numeroOuNull(o.cilindro, `${campo}.cilindro`),
    eixo: o.eixo === undefined || o.eixo === null ? null : v.inteiro(o.eixo, `${campo}.eixo`, 0, 180),
  }
}

function versao(d: v.Obj): number {
  return v.inteiro(d.versao, 'versao', 0, 10_000_000)
}

/** Leitura em lote de estados completos (como jornada_sistema) para listas sem dado de conferência. */
async function estadosCompletos(tx: Executor, ids: string[]) {
  const entradas = await carregarEntradas(tx, ids, { tipo: 'completo' })
  return ids.map(id => entradas.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e)).map(e => ({ entrada: e, estado: montarEstado(e) }))
}

async function registrarAcessoLista(tx: Executor, ctx: ContextoReq, recurso: 'dia' | 'pendencias' | 'indicadores' | 'mensagens', detalhe: Record<string, string | number | boolean | null>) {
  await comoApi(tx, atorDb(ctx))
  await registrarAcesso(tx, atorDb(ctx), recurso, { detalhe })
}

function hmacCpf(ctx: ContextoReq, cpf: string): Promise<string> {
  return hmac(ctx.deps.config.segredoCpf, 'cpf', cpf).then(hex)
}

function cpfValidado(x: unknown): string {
  const bruto = v.texto(x, 'cpf', { max: 20 })
  const cpf = normalizarCpf(bruto)
  if (!validarCpf(cpf)) throw erro('validacao', 'CPF inválido.', { campo: 'cpf' })
  return cpf
}

function validarModelo(x: unknown): ModeloChecklist {
  const m = v.objetoObrigatorio(x, 'modelo') as unknown as ModeloChecklist
  v.umDe(m.id, 'modelo.id', ORDEM_MODELOS)
  v.texto(m.titulo, 'modelo.titulo', { max: 200 })
  v.texto(m.fonte, 'modelo.fonte', { max: 200 })
  v.papeis(m.papeisConclusao, 'modelo.papeisConclusao')
  if (!Array.isArray(m.secoes) || m.secoes.length === 0 || m.secoes.length > 50) throw erro('validacao', 'Campo inválido: modelo.secoes.')
  const ids = new Set<string>()
  for (const s of m.secoes) {
    v.texto(s.id, 'secao.id', { max: 40 })
    v.texto(s.titulo, 'secao.titulo', { max: 200 })
    if (!Array.isArray(s.itens) || s.itens.length > 200) throw erro('validacao', 'Campo inválido: secao.itens.')
    for (const i of s.itens) {
      const id = v.texto(i.id, 'item.id', { max: 100 })
      if (ids.has(id)) throw erro('validacao', 'Itens com identificador repetido.')
      ids.add(id)
      v.texto(i.texto, 'item.texto', { max: 2000 })
      v.texto(i.tipo, 'item.tipo', { max: 40 })
      v.booleano(i.obrigatorio, 'item.obrigatorio')
      v.papeis(i.papeis, 'item.papeis')
      v.texto(i.fonte, 'item.fonte', { max: 200 })
    }
  }
  v.json(m, 'modelo', 10)
  return m
}

function proximaVersao(existentes: string[]): string {
  if (!existentes.length) return 'v1'
  const ultima = existentes[existentes.length - 1]
  const m = /^(.*?)(\d+)$/.exec(ultima)
  let candidata = m ? `${m[1]}${Number(m[2]) + 1}` : `${ultima}/2`
  while (existentes.includes(candidata)) candidata = `${candidata}.1`
  return candidata
}

function validarConfigParcial(x: unknown): Partial<ConfigJornada> {
  const c = v.objetoObrigatorio(x, 'config')
  const padrao = configPadrao() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, valor] of Object.entries(c)) {
    if (!(k in padrao)) throw erro('validacao', `Configuração desconhecida: ${k.slice(0, 40)}.`)
    v.json(valor, `config.${k}`)
    switch (k) {
      case 'limiarNomeParecido':
        if (typeof valor !== 'number' || valor < 0 || valor > 1) throw erro('validacao', 'Campo inválido: limiarNomeParecido.')
        break
      case 'exigirCp2AntesDoTimeOut':
        v.booleano(valor, k)
        break
      case 'feriados':
        if (!Array.isArray(valor)) throw erro('validacao', 'Campo inválido: feriados.')
        valor.forEach(d => v.data(d, 'feriados'))
        break
      case 'temposEtapa':
        for (const [kk, n] of Object.entries(v.objetoObrigatorio(valor, k))) {
          v.umDe(kk, 'temposEtapa', ['admissao_ate_inicio', 'duracao_cirurgia', 'recuperacao_ate_alta'] as const)
          v.inteiro(n, `temposEtapa.${kk}`, 0, 24 * 60)
        }
        break
      case 'modelosEtiqueta':
      case 'telefones':
        for (const [kk, t] of Object.entries(v.objetoObrigatorio(valor, k))) if (t !== null) v.texto(t, `${k}.${kk.slice(0, 30)}`, { max: 4000 })
        break
      case 'itensAnestesiaExtras':
        if (!Array.isArray(valor)) throw erro('validacao', 'Campo inválido: itensAnestesiaExtras.')
        for (const i of valor) {
          const o = v.objetoObrigatorio(i, k)
          v.texto(o.id, 'itensAnestesiaExtras.id', { max: 60 })
          v.texto(o.texto, 'itensAnestesiaExtras.texto', { max: 500 })
        }
        break
      case 'assinaturaConcierge':
        v.textoOpcional(valor, k, { max: 120 })
        break
    }
    out[k] = valor
  }
  return out as Partial<ConfigJornada>
}

export const acoesEquipe: Impl = {
  // -------------------------------------------------------------------------
  // Sessão, ator, PIN
  // -------------------------------------------------------------------------
  async sessao(ctx) {
    await ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      await registrarAparelho(tx, ctx.aparelhoId)
    })
    const cfg = ctx.deps.config
    return {
      membro: { id: ctx.membro.id, nome: ctx.membro.nome, papeis: ctx.membro.papeis, temPin: ctx.membro.temPin },
      ator: ctx.atorViaPin ? { id: ctx.ator.id, nome: ctx.ator.nome, papeis: ctx.ator.papeis, expiraEm: ctx.atorViaPin.expiraEm } : null,
      modoEnvio: cfg.envioHabilitado ? 'real' : 'ensaio',
      ambiente: cfg.ambiente,
      mfaExigidoPara: cfg.exigirMfa ? (['cirurgiao', 'gestora'] as Papel[]) : [],
      aal: ctx.usuario.aal,
    }
  },

  async 'ator.pin'(ctx, d) {
    const membroId = v.uuid(d.membroId, 'membroId')
    const pin = d.pin
    if (!formatoPinValido(pin)) throw erro('validacao', 'O PIN tem 6 dígitos.', { campo: 'pin' })
    const cfg = ctx.deps.config
    const agoraMs = ctx.agora.getTime()
    const desde = new Date(agoraMs - cfg.janelaPinMin * 60_000).toISOString()
    const resultado = await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const falhasAlvo = await contarAcessos(tx, { recurso: 'pin_falha', desde, alvo: membroId })
      const falhasSessao = await contarAcessos(tx, { recurso: 'pin_falha', desde, sessaoUsuarioId: ctx.membro.id })
      if (falhasAlvo >= cfg.falhasPinPorAlvo || falhasSessao >= cfg.falhasPinPorSessao) return { tipo: 'bloqueado' as const }
      const alvo = await buscarMembro(tx, membroId)
      const hash = alvo && alvo.ativo ? await pinHashDoMembro(tx, alvo.id) : null
      const ok = Boolean(alvo && alvo.ativo) && (await verificarHashPin(cfg.segredoAtor, pin, hash))
      const quem = { atorId: ctx.membro.id, sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId }
      await comoApi(tx, quem)
      if (!ok || !alvo) {
        await registrarAcesso(tx, quem, 'pin_falha', { detalhe: { alvo: membroId } })
        return { tipo: 'falha' as const }
      }
      await registrarAcesso(tx, quem, 'ator_pin', { detalhe: { alvo: membroId } })
      return { tipo: 'ok' as const, alvo }
    })
    if (resultado.tipo === 'bloqueado') throw erro('limite_taxa', 'Muitas tentativas de PIN. Aguarde alguns minutos.')
    if (resultado.tipo === 'falha') throw erro('sem_permissao', 'PIN não confere.', { motivo: 'pin' })
    const { token, expiraEm } = await emitirTokenAtor(cfg.segredoAtor, { membroId: resultado.alvo.id, sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId }, cfg.atorTtlMin, agoraMs)
    return { token, expiraEm, ator: { id: resultado.alvo.id, nome: resultado.alvo.nome, papeis: resultado.alvo.papeis } }
  },

  async 'ator.encerrar'(ctx) {
    if (ctx.atorViaPin) {
      const jti = ctx.atorViaPin.jti
      await ctx.deps.db.transacao(async tx => {
        const quem = { atorId: ctx.membro.id, sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId }
        await comoApi(tx, quem)
        await registrarAcesso(tx, quem, 'ator_encerrado', { detalhe: { jti } })
      })
    }
    return { ok: true }
  },

  async 'membro.definir_pin'(ctx, d) {
    // Sempre o membro do login (não o ator por PIN).
    const cfg = ctx.deps.config
    if (!pinAceitavel(d.pinNovo)) throw erro('validacao', 'PIN inválido: use 6 dígitos, sem sequência nem repetição.', { campo: 'pinNovo' })
    const pinNovo = d.pinNovo
    const pinAtual = d.pinAtual === undefined || d.pinAtual === null ? null : d.pinAtual
    const desde = new Date(ctx.agora.getTime() - cfg.janelaPinMin * 60_000).toISOString()
    const quem = { atorId: ctx.membro.id, sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId }
    const r = await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const eu = await buscarMembro(tx, ctx.membro.id)
      if (!eu || !eu.ativo) return 'sem_permissao' as const
      const hashAtual = await pinHashDoMembro(tx, eu.id)
      if (hashAtual) {
        const falhas = await contarAcessos(tx, { recurso: 'pin_falha', desde, alvo: eu.id })
        if (falhas >= cfg.falhasPinPorAlvo) return 'bloqueado' as const
        if (!formatoPinValido(pinAtual) || !(await verificarHashPin(cfg.segredoAtor, pinAtual, hashAtual))) {
          await comoApi(tx, quem)
          await registrarAcesso(tx, quem, 'pin_falha', { detalhe: { alvo: eu.id } })
          return 'falha' as const
        }
      }
      const hash = await gerarHashPin(cfg.segredoAtor, pinNovo, cfg.iteracoesPin)
      await comoApi(tx, quem)
      const u = await tx.consulta(`update ${S}.membros set pin_hash = $2, pin_atualizado_em = now(), atualizado_em = now() where user_id = $1::uuid returning user_id`, [eu.id, hash])
      if (!u.length) throw erro('sem_permissao')
      return 'ok' as const
    })
    if (r === 'bloqueado') throw erro('limite_taxa', 'Muitas tentativas de PIN. Aguarde alguns minutos.')
    if (r === 'falha') throw erro('sem_permissao', 'PIN atual não confere.', { motivo: 'pin' })
    if (r === 'sem_permissao') throw erro('sem_permissao')
    return { ok: true }
  },

  async 'membros.ativos'(ctx, d) {
    const papel = d.papel === undefined || d.papel === null ? null : v.papel(d.papel)
    const lista = await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      return membrosAtivos(tx)
    })
    return papel ? lista.filter(m => m.papeis.includes(papel)) : lista
  },

  // -------------------------------------------------------------------------
  // Paciente
  // -------------------------------------------------------------------------
  async 'paciente.buscar_cpf'(ctx, d) {
    papelAutor(ctx, 'paciente.cadastrado')
    const cpf = cpfValidado(d.cpf)
    const cfg = ctx.deps.config
    const desde = new Date(ctx.agora.getTime() - 3600_000).toISOString()
    await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const n = await contarAcessos(tx, { recurso: 'cpf_consulta', desde, sessaoUsuarioId: ctx.membro.id })
      if (n >= cfg.cpfConsultasHora) throw erro('limite_taxa', 'Limite de consultas de CPF por hora atingido.')
      await comoApi(tx, atorDb(ctx))
      await registrarAcesso(tx, atorDb(ctx), 'cpf_consulta', { detalhe: {} })
    })
    const cpfHmac = await hmacCpf(ctx, cpf)
    let datasigh: AcoesEquipe['paciente.buscar_cpf']['S']['datasigh']
    try {
      datasigh = await ctx.deps.datasigh.buscarPorCpf(cpf)
    } catch (e) {
      if (e instanceof ErroMetodoProibido) throw e
      datasigh = { status: 'indisponivel' }
    }
    const pacienteExistente = await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const p = await buscarPacientePorChave(tx, { cpfHmac, datasighId: datasigh.campos?.datasighId ?? null })
      if (!p) return null
      const episodios = await episodiosDoPaciente(tx, p.id)
      await comoApi(tx, atorDb(ctx))
      await registrarAcesso(tx, atorDb(ctx), 'paciente', { pacienteId: p.id })
      return { id: p.id, nomeCompleto: p.nomeCompleto, dataNascimento: p.dataNascimento, episodios }
    })
    return { datasigh, pacienteExistente }
  },

  async 'paciente.cadastrar'(ctx, d) {
    const cpf = d.cpf === null || d.cpf === undefined || d.cpf === '' ? null : cpfValidado(d.cpf)
    const cpfHmac = cpf ? await hmacCpf(ctx, cpf) : null
    const entrada = {
      pacienteId: ctx.deps.gerarId(),
      nomeCompleto: v.texto(d.nomeCompleto, 'nomeCompleto', { max: 200 }),
      dataNascimento: v.data(d.dataNascimento, 'dataNascimento'),
      nomeMae: v.textoOpcional(d.nomeMae, 'nomeMae', { max: 200 }),
      prontuario: v.textoOpcional(d.prontuario, 'prontuario', { max: 60 }),
      datasighId: v.textoOpcional(d.datasighId, 'datasighId', { max: 120 }),
      conferidoDatasigh: v.booleano(d.conferidoDatasigh, 'conferidoDatasigh'),
      documentoConferido: v.booleano(d.documentoConferido, 'documentoConferido'),
    }
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const existente = await buscarPacientePorChave(tx, { cpfHmac, datasighId: entrada.datasighId })
      if (existente) throw erro('validacao', 'Paciente já cadastrado neste painel.', { pacienteId: existente.id })
      const config = await lerConfigJornada(tx)
      const evento = cadastrarPaciente(entrada, contextoDecisao(ctx, config))
      await comoApi(tx, atorDb(ctx))
      await registrarAparelho(tx, ctx.aparelhoId)
      await inserirPaciente(tx, {
        id: entrada.pacienteId,
        nomeCompleto: entrada.nomeCompleto,
        dataNascimento: entrada.dataNascimento,
        nomeMae: entrada.nomeMae,
        prontuario: entrada.prontuario,
        datasighId: entrada.datasighId,
        conferidoDatasigh: entrada.conferidoDatasigh,
        cpfHmac,
        nomeNormalizado: normalizarNome(entrada.nomeCompleto),
        criadoPor: ctx.ator.id,
      })
      await inserirEventos(tx, [{ ...evento, pacienteId: entrada.pacienteId, episodioId: null }], null)
      return { pacienteId: entrada.pacienteId }
    })
  },

  async 'paciente.corrigir'(ctx, d) {
    const autorPapel = papelAutor(ctx, 'paciente.corrigido')
    const pacienteId = v.uuid(d.pacienteId, 'pacienteId')
    const campo = v.umDe(d.campo, 'campo', ['nomeCompleto', 'dataNascimento', 'nomeMae', 'prontuario'] as const)
    const motivo = v.texto(d.motivo, 'motivo', { max: 1000 })
    let valor: string | null
    if (campo === 'nomeCompleto') valor = v.texto(d.valor, 'valor', { max: 200 })
    else if (campo === 'dataNascimento') valor = v.data(d.valor, 'valor')
    else valor = v.textoOpcional(d.valor, 'valor', { max: campo === 'nomeMae' ? 200 : 60 })
    await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const p = await buscarPaciente(tx, pacienteId)
      if (!p) throw erro('nao_encontrado')
      const anterior = p[campo]
      const episodios = await episodiosDoPaciente(tx, pacienteId)
      await comoApi(tx, atorDb(ctx))
      await registrarAparelho(tx, ctx.aparelhoId)
      await atualizarCampoPaciente(tx, pacienteId, campo, valor, campo === 'nomeCompleto' && valor ? normalizarNome(valor) : null)
      await inserirEventos(tx, [{ ...eventoSemEpisodio(ctx, 'paciente.corrigido', { campo, valorAnterior: anterior, valor, motivo }, pacienteId), autorPapel }], null)
      // Projeção: o resumo dos episódios do paciente traz o nome.
      for (const ep of episodios) {
        const e = await carregarEntrada(tx, ep.id, { tipo: 'completo' })
        if (!e) continue
        const resumo = resumoDia(montarEstado(e), agoraIso(ctx))
        await comoApi(tx, atorDb(ctx))
        await atualizarResumo(tx, ep.id, resumo)
      }
    })
    return { ok: true }
  },

  // -------------------------------------------------------------------------
  // Episódio
  // -------------------------------------------------------------------------
  async 'episodio.abrir'(ctx, d) {
    const pacienteId = v.uuid(d.pacienteId, 'pacienteId')
    const olho = v.olho(d.olho)
    const cirurgiaoId = v.uuid(d.cirurgiaoId, 'cirurgiaoId')
    const tipoCirurgia = v.texto(d.tipoCirurgia, 'tipoCirurgia', { max: 200 })
    const tipoLente = v.texto(d.tipoLente, 'tipoLente', { max: 200 })
    const dataSugerida = v.dataOpcional(d.dataSugerida, 'dataSugerida')
    return ctx.deps.db.transacao(async tx => {
      const modelos = await modelosAtivos(tx) // deixa em jornada_sistema
      const versoesModelos = Object.fromEntries(Object.values(modelos).map(m => [m.id, m.versao])) as Record<ModeloId, string>
      const config = await lerConfigJornada(tx)
      const paciente = await buscarPaciente(tx, pacienteId)
      if (!paciente) throw erro('nao_encontrado')
      const cirurgiao = await buscarMembro(tx, cirurgiaoId)
      if (!cirurgiao || !cirurgiao.ativo || !cirurgiao.papeis.includes('cirurgiao')) throw erro('validacao', 'Cirurgião inválido.', { campo: 'cirurgiaoId' })
      const anteriores = (await episodiosDoPaciente(tx, pacienteId)).map(e => ({ episodioId: e.id, olho: e.olho, dataCirurgia: e.dataCirurgia, estado: e.estado as never }))
      const episodioId = ctx.deps.gerarId()
      const { evento, avisos } = abrirEpisodio(
        { episodioId, paciente, olho, cirurgiaoId, tipoCirurgia, tipoLente, dataSugerida, versoesModelos, anterioresDoPaciente: anteriores },
        contextoDecisao(ctx, config),
      )
      await comoApi(tx, atorDb(ctx))
      await registrarAparelho(tx, ctx.aparelhoId)
      await inserirEpisodio(tx, { id: episodioId, pacienteId, olho, cirurgiaoId, tipoCirurgia, tipoLente, dataSugerida, versoesModelos, abertoPor: ctx.ator.id, estado: 'd7_em_andamento' })
      const eventos = await inserirEventos(tx, [{ ...evento, episodioId, pacienteId: evento.pacienteId ?? pacienteId }], 1)
      const entrada = await carregarEntrada(tx, episodioId, { tipo: 'completo' })
      if (!entrada) throw erro('indisponivel')
      const estado = montarEstado(entrada)
      await comoApi(tx, atorDb(ctx))
      await atualizarProjecao(tx, episodioId, 0, { versao: eventos.length, estado: estado.estado, resumo: resumoDia(estado, agoraIso(ctx)) })
      return { episodioId, avisos }
    })
  },

  async 'episodio.obter'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    return ctx.deps.db.transacao(tx => lerVisao(tx, ctx, episodioId))
  },

  async 'episodio.agendar'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    const dataCirurgia = v.dataOpcional(d.dataCirurgia, 'dataCirurgia')
    const horario = v.horaOpcional(d.horario, 'horario')
    const ordem = v.inteiroOpcional(d.ordem, 'ordem', 0, 1000)
    const cmd: Comando = { tipo: 'episodio.agendar', dataCirurgia, ...(horario !== undefined ? { horario } : {}), ...(ordem !== undefined ? { ordem } : {}) }
    return executarComando(ctx, episodioId, versao(d), () => cmd, {
      agenda: e => ({ dataCirurgia, horario: horario === undefined ? e.episodio.horario : horario, ordem: ordem === undefined ? e.episodio.ordem : ordem }),
    })
  },

  async 'checklist.responder'(ctx, d) {
    const modelo = v.umDe(d.modelo, 'modelo', ORDEM_MODELOS)
    if (!Array.isArray(d.respostas) || d.respostas.length === 0 || d.respostas.length > 200) throw erro('validacao', 'Campo inválido: respostas.')
    const respostas = d.respostas.map((r, i) => {
      const o = v.objetoObrigatorio(r, `respostas[${i}]`)
      return {
        itemId: v.texto(o.itemId, 'itemId', { max: 120 }),
        valor: v.json(o.valor, 'valor') as ValorResposta,
        ...(o.observacao !== undefined ? { observacao: v.textoOpcional(o.observacao, 'observacao', { max: 2000 }) } : {}),
      }
    })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'checklist.responder', modelo, respostas }))
  },

  async 'bloco.concluir'(ctx, d) {
    const modelo = v.umDe(d.modelo, 'modelo', ORDEM_MODELOS)
    const leitorId = v.uuidOpcional(d.leitorId, 'leitorId')
    let confirmadorId: string | null = null
    if (d.confirmadorToken !== undefined && d.confirmadorToken !== null && d.confirmadorToken !== '') {
      if (typeof d.confirmadorToken !== 'string') throw erro('validacao', 'Campo inválido: confirmadorToken.')
      const t = await verificarTokenAtor(ctx.deps.config.segredoAtor, d.confirmadorToken, { sessaoUsuarioId: ctx.membro.id, aparelhoId: ctx.aparelhoId }, ctx.agora.getTime())
      if (!t) throw erro('validacao', 'Confirmação por PIN inválida ou expirada.', { campo: 'confirmadorToken' })
      confirmadorId = t.membroId
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'bloco.concluir', modelo, leitorId, confirmadorId }))
  },

  async 'alerta.comunicar'(ctx, d) {
    const cmd: Comando = {
      tipo: 'alerta.comunicar',
      alertaId: v.texto(d.alertaId, 'alertaId', { max: 200 }),
      via: v.umDe(d.via, 'via', VIAS),
      cirurgiaoId: v.uuid(d.cirurgiaoId, 'cirurgiaoId'),
      observacao: v.textoOpcional(d.observacao, 'observacao', { max: 2000 }),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'alerta.conduta'(ctx, d) {
    const cmd: Comando = { tipo: 'alerta.conduta', alertaId: v.texto(d.alertaId, 'alertaId', { max: 200 }), conduta: v.texto(d.conduta, 'conduta', { max: 4000 }) }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'contato.salvar'(ctx, d) {
    const c = v.objetoObrigatorio(d.contato, 'contato')
    const contato: Omit<Contato, 'confirmadoEm' | 'confirmadoPor'> = {
      id: c.id === undefined || c.id === null || c.id === '' ? ctx.deps.gerarId() : v.texto(c.id, 'contato.id', { max: 100 }),
      tipo: v.umDe(c.tipo, 'contato.tipo', TIPOS_CONTATO),
      nome: v.texto(c.nome, 'contato.nome', { max: 200 }),
      anuenciaPaciente: v.booleano(c.anuenciaPaciente, 'contato.anuenciaPaciente'),
    }
    const parentesco = v.textoOpcional(c.parentesco, 'contato.parentesco', { max: 80 })
    if (parentesco) contato.parentesco = parentesco
    const telefone = telefoneOpcional(c.telefone, 'contato.telefone')
    if (telefone) contato.telefone = telefone
    const opera = v.textoOpcional(c.operaCelular, 'contato.operaCelular', { max: 200 })
    if (opera) contato.operaCelular = opera
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'contato.salvar', contato }))
  },

  async 'contato.remover'(ctx, d) {
    const contatoId = v.texto(d.contatoId, 'contatoId', { max: 100 })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'contato.remover', contatoId }))
  },

  async 'contato.confirmar'(ctx, d) {
    const contatoId = v.texto(d.contatoId, 'contatoId', { max: 100 })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'contato.confirmar', contatoId }))
  },

  async 'orientacoes.teach_back'(ctx, d) {
    const cmd: Comando = {
      tipo: 'orientacoes.teach_back',
      resultado: v.umDe(d.resultado, 'resultado', ['adequado_primeira', 'apos_reorientacao', 'inadequado'] as const),
      observacao: v.textoOpcional(d.observacao, 'observacao', { max: 2000 }),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  // -------------------------------------------------------------------------
  // Lente
  // -------------------------------------------------------------------------
  async 'lente.plano'(ctx, d) {
    const o = v.objetoObrigatorio(d.dados, 'dados')
    const base = valoresLente(o, 'dados')
    const reserva =
      o.reserva === undefined || o.reserva === null
        ? null
        : (() => {
            const r = v.objetoObrigatorio(o.reserva, 'dados.reserva')
            return { modelo: v.texto(r.modelo, 'dados.reserva.modelo', { max: 120 }), dioptria: numero(r.dioptria, 'dados.reserva.dioptria') }
          })()
    const dados = { ...base, reserva, alvoRefrativo: numeroOuNull(o.alvoRefrativo, 'dados.alvoRefrativo'), dataPedido: v.dataOpcional(o.dataPedido, 'dados.dataPedido') }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'lente.plano', dados }))
  },

  async 'lente.chegada'(ctx, d) {
    const o = v.objetoObrigatorio(d.dados, 'dados')
    const validade = v.texto(o.validade, 'dados.validade', { max: 10 })
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(validade)) throw erro('validacao', 'Campo inválido: dados.validade.')
    const dados = { dataChegada: v.data(o.dataChegada, 'dados.dataChegada'), lote: v.texto(o.lote, 'dados.lote', { max: 80 }), validade }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'lente.chegada', dados }))
  },

  async 'lente.cp2'(ctx, d) {
    const valores = valoresLente(d.valores, 'valores')
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'lente.cp2', valores }))
  },

  async 'lente.time_out'(ctx, d) {
    const o = v.objetoObrigatorio(d.leitura, 'leitura')
    const leitura = {
      modelo: v.texto(o.modelo, 'leitura.modelo', { max: 120 }),
      dioptria: numero(o.dioptria, 'leitura.dioptria'),
      cilindro: numeroOuNull(o.cilindro, 'leitura.cilindro'),
      eixo: o.eixo === undefined || o.eixo === null ? null : v.inteiro(o.eixo, 'leitura.eixo', 0, 180),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'lente.time_out', leitura }))
  },

  async 'lente.resolver_quarentena'(ctx, d) {
    const cmd: Comando = {
      tipo: 'lente.resolver_quarentena',
      resolucao: v.texto(d.resolucao, 'resolucao', { max: 4000 }),
      acao: v.umDe(d.acao, 'acao', ['manter_plano', 'novo_plano'] as const),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'lente.troca_d0'(ctx, d) {
    const motivo = v.texto(d.motivo, 'motivo', { max: 4000 })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'lente.troca_d0', motivo }))
  },

  // -------------------------------------------------------------------------
  // Anexos
  // -------------------------------------------------------------------------
  async 'anexo.enviar'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    v.umDe(d.tipo, 'tipo', ['foto_plano'] as const)
    const anexo = await validarAnexo(d.base64, d.contentType)
    const anexoId = ctx.deps.gerarId()
    const caminho = `episodios/${episodioId}/${anexoId}.${anexo.extensao}`
    return executarComando(ctx, episodioId, versao(d), () => ({ tipo: 'anexo.adicionar', anexoId, tipoAnexo: 'foto_plano', sha256: anexo.sha256 }), {
      antesDeGravar: async tx => {
        await ctx.deps.armazenamento.salvar(caminho, anexo.bytes, anexo.contentType)
        await inserirAnexo(tx, { id: anexoId, episodioId, tipo: 'foto_plano', storagePath: caminho, sha256: anexo.sha256, contentType: anexo.contentType, tamanho: anexo.tamanho, autorId: ctx.ator.id })
      },
    })
  },

  async 'anexo.url'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    const anexoId = v.uuid(d.anexoId, 'anexoId')
    const segundos = 120
    return ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      const a = await buscarAnexo(tx, episodioId, anexoId) // RLS: concierge, cirurgião, gestora
      if (!a) throw erro('nao_encontrado')
      const url = await ctx.deps.armazenamento.urlAssinada(a.storagePath, segundos)
      await registrarAcesso(tx, atorDb(ctx), 'anexo', { episodioId, detalhe: { anexoId } })
      // A foto do plano mostra os valores do checkpoint 1.
      if (a.tipo === 'foto_plano') await registrarAcesso(tx, atorDb(ctx), 'lente_conferencia_1', { episodioId })
      return { url, expiraEm: new Date(ctx.agora.getTime() + segundos * 1000).toISOString() }
    })
  },

  // -------------------------------------------------------------------------
  // TCLE, materiais
  // -------------------------------------------------------------------------
  async 'tcle.status'(ctx, d) {
    const status = v.umDe(d.status, 'status', ['enviado', 'assinado', 'olho_conferido'] as const)
    const link = v.textoOpcional(d.link, 'link', { max: 2000 })
    if (link && !/^https:\/\/[^\s]+$/i.test(link)) throw erro('validacao', 'O link do TCLE precisa começar com https://.', { campo: 'link' })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'tcle.status', status, ...(d.link !== undefined ? { link } : {}) }))
  },

  async 'materiais.previa'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    const cfg = ctx.deps.config
    return ctx.deps.db.transacao(async tx => {
      const entrada = await carregarEntrada(tx, episodioId, { tipo: 'completo' })
      if (!entrada) throw erro('nao_encontrado')
      const materiais = await materiaisCatalogo(tx, true)
      // O domínio monta a prévia (textos e destinatários mascarados) sem gravar nada.
      const previa = previaMateriais(montarEstado(entrada), materiais, {
        config: entrada.config,
        envioHabilitado: cfg.envioHabilitado,
        ...(cfg.urlPaginaPaciente ? { urlPaginaPaciente: cfg.urlPaginaPaciente } : {}),
        ator: ctx.ator,
      })
      await comoApi(tx, atorDb(ctx))
      await registrarAcesso(tx, atorDb(ctx), 'materiais_previa', { episodioId, pacienteId: entrada.paciente.id })
      return previa
    })
  },

  async 'materiais.enviar'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    const cfg = ctx.deps.config
    const token = gerarTokenLink()
    const tokenHash = await hashToken(token)
    const expiraEm = new Date(ctx.agora.getTime() + cfg.linkValidadeDias * 86400_000).toISOString()
    let materiais: MaterialCatalogo[] = []
    await ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      materiais = await materiaisCatalogo(tx, true)
    })
    return executarComando(ctx, episodioId, versao(d), () => ({ tipo: 'materiais.enviar', tokenLink: token, expiraEm, materiais }), {
      antesDeGravar: async (tx, r) => {
        await inserirLinkPaciente(tx, { id: ctx.deps.gerarId(), episodioId, tokenHash, expiraEm, criadoPor: ctx.ator.id })
        r.mensagens = await protegerMensagens(r.mensagens, token, cfg.segredoAtor)
        // O token nunca é gravado em texto claro: nem nos eventos.
        r.eventos = r.eventos.map(e => (JSON.stringify(e.dados).includes(token) ? { ...e, dados: JSON.parse(JSON.stringify(e.dados).split(token).join('[token]')) } : e))
      },
    })
  },

  // -------------------------------------------------------------------------
  // Hard stops, intercorrência, suspensão, avisos, quase evento
  // -------------------------------------------------------------------------
  async 'hardstop.resolver'(ctx, d) {
    const cmd: Comando = { tipo: 'hardstop.resolver', codigo: v.texto(d.codigo, 'codigo', { max: 60 }) as CodigoHardStop, resolucao: v.texto(d.resolucao, 'resolucao', { max: 4000 }) }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'intercorrencia.registrar'(ctx, d) {
    const descricao = v.texto(d.descricao, 'descricao', { max: 4000 })
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'intercorrencia.registrar', descricao }))
  },

  async 'episodio.suspender'(ctx, d) {
    const cmd: Comando = {
      tipo: 'episodio.suspender',
      motivo: v.texto(d.motivo, 'motivo', { max: 4000 }),
      causa: d.causa === null || d.causa === undefined ? null : v.umDe(d.causa, 'causa', CAUSAS),
      evitavel: v.booleanoOuNull(d.evitavel, 'evitavel'),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'episodio.cancelar'(ctx, d) {
    const cmd: Comando = {
      tipo: 'episodio.cancelar',
      motivo: v.texto(d.motivo, 'motivo', { max: 4000 }),
      causa: d.causa === null || d.causa === undefined ? null : v.umDe(d.causa, 'causa', CAUSAS),
      evitavel: v.booleanoOuNull(d.evitavel, 'evitavel'),
    }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  async 'avisos.atraso'(ctx, d) {
    const minutos = d.minutos === null || d.minutos === undefined ? null : v.inteiro(d.minutos, 'minutos', 1, 24 * 60)
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'avisos.atraso', minutos }))
  },

  async 'quase_evento.registrar'(ctx, d) {
    const cmd: Comando = { tipo: 'quase_evento.registrar', etapa: v.umDe(d.etapa, 'etapa', ['chegada', 'd2', 'd0'] as const), descricao: v.texto(d.descricao, 'descricao', { max: 4000 }) }
    return executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => cmd)
  },

  // -------------------------------------------------------------------------
  // Etiquetas
  // -------------------------------------------------------------------------
  async 'etiquetas.gerar'(ctx, d) {
    const episodioId = v.uuid(d.episodioId, 'episodioId')
    return ctx.deps.db.transacao(async tx => {
      const entrada = await carregarEntrada(tx, episodioId, { tipo: 'ator', ator: atorDb(ctx) })
      if (!entrada) throw erro('nao_encontrado')
      const etiquetas = gerarEtiquetas(montarEstado(entrada), entrada.config)
      await registrarLeituraEpisodio(tx, ctx, entrada, 'etiquetas')
      return etiquetas
    })
  },

  async 'etiqueta.copiada'(ctx, d) {
    const etiqueta = v.umDe(d.etiqueta, 'etiqueta', ETIQUETAS)
    await executarComando(ctx, v.uuid(d.episodioId, 'episodioId'), versao(d), () => ({ tipo: 'etiqueta.copiada', etiqueta }))
    return { ok: true }
  },

  // -------------------------------------------------------------------------
  // Listas (estado completo; o domínio não põe valores de lente nessas saídas)
  // -------------------------------------------------------------------------
  async 'dia.lista'(ctx, d) {
    const data = v.data(d.data, 'data')
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { data })
      const estados = await estadosCompletos(tx, ids)
      const lista = estados.map(e => resumoDia(e.estado, agoraIso(ctx)))
      await registrarAcessoLista(tx, ctx, 'dia', { data, quantidade: lista.length })
      return lista
    })
  },

  async 'dia.visao_leitura'(ctx, d) {
    const data = v.data(d.data, 'data')
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { data })
      const entradas = await carregarEntradas(tx, ids, { tipo: 'ator', ator: atorDb(ctx) })
      const lista = ids.map(id => entradas.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e))
      const visao = visaoLeituraDia(lista.map(e => montarEstado(e)), ctx.ator, data)
      await registrarAcessoLista(tx, ctx, 'dia', { data, quantidade: lista.length })
      for (const e of lista) if (entradaTemConferencia1(e)) await registrarAcesso(tx, atorDb(ctx), 'lente_conferencia_1', { episodioId: e.episodio.id })
      return visao
    })
  },

  async 'episodios.buscar'(ctx, d) {
    const termo = v.textoOpcional(d.termo, 'termo', { max: 120 })
    const estado = v.textoOpcional(d.estado, 'estado', { max: 40 })
    const de = v.dataOpcional(d.de, 'de')
    const ate = v.dataOpcional(d.ate, 'ate')
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { termoNormalizado: termo ? normalizarNome(termo) : null, estado, de, ate, limite: 100 })
      const estados = await estadosCompletos(tx, ids)
      const lista = estados.map(e => resumoDia(e.estado, agoraIso(ctx)))
      await registrarAcessoLista(tx, ctx, 'dia', { quantidade: lista.length, resultado: 'busca' })
      return lista
    })
  },

  async 'pendencias.listar'(ctx, d) {
    const data = v.dataOpcional(d.data, 'data')
    const papel = d.papel === undefined || d.papel === null ? null : v.papel(d.papel)
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, data ? { data } : { abertos: true, limite: 500 })
      const estados = await estadosCompletos(tx, ids)
      const out: AcoesEquipe['pendencias.listar']['S'] = []
      for (const { entrada, estado } of estados) {
        for (const p of pendenciasDoEpisodio(estado, agoraIso(ctx))) {
          if (papel && !p.responsavel.includes(papel)) continue
          out.push({ ...p, pacienteNome: entrada.paciente.nomeCompleto, olhoExtenso: OLHO_EXTENSO[entrada.episodio.olho] })
        }
      }
      await registrarAcessoLista(tx, ctx, 'pendencias', { data, quantidade: out.length })
      return out
    })
  },

  async 'resumo.vespera'(ctx, d) {
    const data = v.data(d.data, 'data')
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { data })
      const estados = await estadosCompletos(tx, ids)
      const r = resumoVespera(
        estados.map(e => e.estado),
        data,
        agoraIso(ctx),
      )
      await registrarAcessoLista(tx, ctx, 'dia', { data, quantidade: estados.length, resultado: 'vespera' })
      return r
    })
  },

  async 'indicadores.calcular'(ctx, d) {
    if (!temPapel(ctx.ator, 'gestora', 'cirurgiao')) throw erro('sem_permissao')
    const de = v.data(d.de, 'de')
    const ate = v.data(d.ate, 'ate')
    if (de > ate) throw erro('validacao', 'Período inválido.')
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { de, ate, limite: 5000 })
      const estados = await estadosCompletos(tx, ids)
      const r = calcularIndicadores(
        estados.map(e => e.estado),
        de,
        ate,
      )
      await registrarAcessoLista(tx, ctx, 'indicadores', { quantidade: estados.length })
      return r
    })
  },

  async 'mensagens.listar'(ctx, d) {
    const episodioId = v.uuidOpcional(d.episodioId, 'episodioId')
    const data = v.dataOpcional(d.data, 'data') ?? (episodioId ? null : dataLocal(agoraIso(ctx)))
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = episodioId ? [episodioId] : await idsEpisodios(tx, { data })
      const lista = (await mensagensDosEpisodios(tx, ids)).map(mensagemPublica)
      await registrarAcessoLista(tx, ctx, 'mensagens', { data, quantidade: lista.length })
      return lista
    })
  },

  async 'alertas.abertos'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      const ids = await idsEpisodios(tx, { abertos: true, limite: 500 })
      const estados = await estadosCompletos(tx, ids)
      const out: AcoesEquipe['alertas.abertos']['S'] = []
      for (const { entrada, estado } of estados) {
        for (const a of alertasDoEpisodio(estado)) {
          if (a.conduta || a.inativo) continue
          out.push({ ...a, episodioId: entrada.episodio.id, pacienteNome: entrada.paciente.nomeCompleto })
        }
      }
      await registrarAcessoLista(tx, ctx, 'pendencias', { quantidade: out.length, resultado: 'alertas' })
      return out
    })
  },

  // -------------------------------------------------------------------------
  // Gestão
  // -------------------------------------------------------------------------
  async 'membros.listar'(ctx) {
    exigirGestora(ctx)
    return ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      const r = await tx.consulta(
        `select coalesce(c.email, m.email) as email, coalesce(m.nome, c.nome) as nome, coalesce(m.papeis, c.papeis) as papeis,
                coalesce(m.ativo, false) and coalesce(c.ativo, true) as ativo_membro, c.ativo as ativo_convite,
                m.user_id, coalesce(m.tem_pin, false) as tem_pin, (m.user_id is not null) as vinculado
         from ${S}.convites c full outer join ${S}.membros m on m.email = c.email
         order by 2`,
      )
      return r.map(l => ({
        id: l.user_id ? String(l.user_id) : null,
        email: String(l.email),
        nome: String(l.nome),
        papeis: l.papeis as Papel[],
        ativo: l.user_id ? Boolean(l.ativo_membro) : Boolean(l.ativo_convite),
        vinculado: Boolean(l.vinculado),
        temPin: Boolean(l.tem_pin),
      }))
    })
  },

  async 'membros.convidar'(ctx, d) {
    exigirGestora(ctx)
    const email = v.email(d.email)
    const nome = v.texto(d.nome, 'nome', { max: 200 })
    const papeis = v.papeis(d.papeis)
    await ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      const existe = await buscarConvite(tx, email)
      if (existe) throw erro('validacao', 'E-mail já convidado.', { campo: 'email' })
      await tx.consulta(`insert into ${S}.convites (email, nome, papeis, ativo, criado_por) values ($1, $2, $3::text[], true, $4::uuid)`, [email, nome, papeis, ctx.ator.id])
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'membro.alterado', { alteracao: 'convite', papeis })], null)
    })
    return { ok: true }
  },

  async 'membros.atualizar'(ctx, d) {
    exigirGestora(ctx)
    const email = v.email(d.email)
    const nome = d.nome === undefined ? undefined : v.texto(d.nome, 'nome', { max: 200 })
    const papeis = d.papeis === undefined ? undefined : v.papeis(d.papeis)
    const ativo = d.ativo === undefined ? undefined : v.booleano(d.ativo, 'ativo')
    if (nome === undefined && papeis === undefined && ativo === undefined) throw erro('validacao', 'Nada a alterar.')
    await ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      const convite = await buscarConvite(tx, email)
      const membro = await buscarMembroPorEmail(tx, email)
      if (!convite && !membro) throw erro('nao_encontrado')
      if (membro && membro.id === ctx.membro.id && (ativo === false || (papeis && !papeis.includes('gestora'))))
        throw erro('validacao', 'A gestora não pode remover o próprio acesso de gestão.')
      if (convite)
        await tx.consulta(`update ${S}.convites set nome = coalesce($2, nome), papeis = coalesce($3::text[], papeis), ativo = coalesce($4, ativo) where email = $1`, [email, nome ?? null, papeis ?? null, ativo ?? null])
      if (membro)
        await tx.consulta(
          `update ${S}.membros set nome = coalesce($2, nome), papeis = coalesce($3::text[], papeis), ativo = coalesce($4, ativo), atualizado_em = now() where user_id = $1::uuid`,
          [membro.id, nome ?? null, papeis ?? null, ativo ?? null],
        )
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'membro.alterado', { alteracao: 'atualizacao', membroId: membro?.id ?? null, ...(papeis ? { papeis } : {}), ...(ativo !== undefined ? { ativo } : {}) })], null)
    })
    return { ok: true }
  },

  async 'membros.resetar_pin'(ctx, d) {
    exigirGestora(ctx)
    const membroId = v.uuid(d.membroId, 'membroId')
    await ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      const r = await tx.consulta(`update ${S}.membros set pin_hash = null, pin_atualizado_em = now(), atualizado_em = now() where user_id = $1::uuid returning user_id`, [membroId])
      if (!r.length) throw erro('nao_encontrado')
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'membro.alterado', { alteracao: 'pin_resetado', membroId })], null)
    })
    return { ok: true }
  },

  async 'modelos.listar'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      const ativos = await modelosAtivos(tx)
      const todos = await listarModelos(tx)
      return todos.map(m => ({ id: m.id, versao: m.versao, publicadoEm: m.publicadoEm, ativo: ativos[m.id]?.versao === m.versao }))
    })
  },

  async 'modelos.obter'(ctx, d) {
    const id = v.umDe(d.id, 'id', ORDEM_MODELOS)
    const versaoPedida = v.textoOpcional(d.versao, 'versao', { max: 60 })
    return ctx.deps.db.transacao(async tx => {
      const ativos = await modelosAtivos(tx)
      if (!versaoPedida) {
        const m = ativos[id]
        if (!m) throw erro('nao_encontrado')
        return m.conteudo
      }
      const m = (await listarModelos(tx)).find(x => x.id === id && x.versao === versaoPedida)
      if (!m) throw erro('nao_encontrado')
      return m.conteudo
    })
  },

  async 'modelos.publicar'(ctx, d) {
    exigirGestora(ctx)
    const modelo = validarModelo(d.modelo)
    return ctx.deps.db.transacao(async tx => {
      await modelosAtivos(tx)
      const existentes = (await listarModelos(tx)).filter(m => m.id === modelo.id).map(m => m.versao)
      const nova = proximaVersao(existentes)
      await comoApi(tx, atorDb(ctx))
      await tx.consulta(`insert into ${S}.modelos_checklist (id, versao, conteudo, publicado_por) values ($1, $2, $3::jsonb, $4::uuid)`, [modelo.id, nova, { ...modelo, versao: nova }, ctx.ator.id])
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'modelo.publicado', { modelo: modelo.id, versao: nova })], null)
      return { ok: true as const, versao: nova }
    })
  },

  async 'materiais.listar'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      return materiaisCatalogo(tx)
    })
  },

  async 'materiais.salvar'(ctx, d) {
    exigirGestora(ctx)
    const m = v.objetoObrigatorio(d.material, 'material')
    const tipo = v.umDe(m.tipo, 'material.tipo', ['video', 'texto', 'video_tcle', 'link_tcle', 'outro'] as const)
    const url = v.textoOpcional(m.url, 'material.url', { max: 2000 })
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw erro('validacao', 'O endereço do material precisa começar com https://.', { campo: 'material.url' })
    const dados: Omit<MaterialCatalogo, 'id' | 'versao'> = {
      codigo: v.texto(m.codigo, 'material.codigo', { max: 80 }),
      titulo: v.texto(m.titulo, 'material.titulo', { max: 200 }),
      tipo,
      url,
      conteudo: v.textoOpcional(m.conteudo, 'material.conteudo', { max: 20000 }),
      momento: v.umDe(m.momento, 'material.momento', ['d7', 'd3', 'd2', 'd1', 'd0', 'alta'] as const),
      publico: v.umDe(m.publico, 'material.publico', ['paciente', 'cuidador', 'familiar'] as const),
      ativo: v.booleano(m.ativo, 'material.ativo'),
    }
    const idAnterior = v.uuidOpcional(m.id, 'material.id')
    return ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      if (idAnterior) {
        const r = await tx.consulta(`select codigo from ${S}.materiais where id = $1::uuid`, [idAnterior])
        if (!r.length) throw erro('nao_encontrado')
        if (String(r[0].codigo) !== dados.codigo) throw erro('validacao', 'O código do material não pode mudar.')
      }
      const salvo = await inserirMaterial(tx, dados, ctx.deps.gerarId(), ctx.ator.id)
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'material.catalogo_alterado', { materialId: salvo.id, codigo: salvo.codigo, versao: salvo.versao })], null)
      return salvo
    })
  },

  async 'config.obter'(ctx) {
    return ctx.deps.db.transacao(async tx => {
      await comoSistema(tx)
      return lerConfigJornada(tx)
    })
  },

  async 'config.salvar'(ctx, d) {
    exigirGestora(ctx)
    const parcial = validarConfigParcial(d.config)
    return ctx.deps.db.transacao(async tx => {
      await comoApi(tx, atorDb(ctx))
      for (const [chave, valor] of Object.entries(parcial)) {
        await tx.consulta(
          `insert into ${S}.config (chave, valor, atualizado_em, atualizado_por) values ($1, coalesce($2::jsonb, 'null'::jsonb), now(), $3::uuid)
           on conflict (chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
          [chave, valor, ctx.ator.id],
        )
      }
      await inserirEventos(tx, [eventoSemEpisodio(ctx, 'config.alterada', { chaves: Object.keys(parcial) })], null)
      await comoSistema(tx)
      return lerConfigJornada(tx)
    })
  },
}

export const ACOES_EQUIPE = Object.keys(acoesEquipe) as AcaoEquipe[]
export { PAPEIS }
