// Cadastro de paciente e abertura de episódio (D-7, concierge). Eventos sem seq (a API define).

import type { ContextoDecisao } from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import type { EstadoEpisodio, ModeloId, NovoEvento, Olho, Paciente } from './tipos.ts'
import { ORDEM_MODELOS } from './tipos.ts'
import { papeisPermitidosParaEvento, papelUsado } from './permissoes.ts'
import { detectarSegundoOlho, textoSegundoOlho } from './regras/identificacao.ts'
import { dataLocal, validarData } from './util/datas.ts'
import { normalizarNome, temTexto } from './util/texto.ts'

const erro = (msg: string, detalhes?: Record<string, unknown>): never => {
  throw new ErroDominio('VALIDACAO', msg, detalhes)
}

function papel(ctx: ContextoDecisao, tipo: 'paciente.cadastrado' | 'episodio.aberto') {
  const p = papelUsado(ctx.ator.papeis, papeisPermitidosParaEvento(tipo))
  if (!p) throw new ErroDominio('SEM_PERMISSAO', tipo === 'paciente.cadastrado' ? 'Papel sem permissão para cadastrar paciente.' : 'Papel sem permissão para abrir episódio.')
  return p
}

function base(ctx: ContextoDecisao, p: NovoEvento['autorPapel']): Pick<NovoEvento, 'visibilidade' | 'autorId' | 'autorPapel' | 'sessaoUsuarioId' | 'aparelhoId' | 'foraDeHora' | 'motivoForaDeHora' | 'versaoModelo'> {
  return {
    visibilidade: 'geral',
    autorId: ctx.ator.id,
    autorPapel: p,
    sessaoUsuarioId: ctx.ator.sessaoUsuarioId ?? null,
    aparelhoId: ctx.ator.aparelhoId ?? null,
    foraDeHora: false,
    motivoForaDeHora: null,
    versaoModelo: null,
  }
}

/** Evento de cadastro de paciente (dados conferidos com documento com foto). */
export function cadastrarPaciente(
  entrada: {
    pacienteId: string
    nomeCompleto: string
    dataNascimento: string
    nomeMae: string | null
    prontuario: string | null
    datasighId: string | null
    conferidoDatasigh: boolean
    documentoConferido: boolean
  },
  ctx: ContextoDecisao,
): NovoEvento {
  const p = papel(ctx, 'paciente.cadastrado')
  if (!temTexto(entrada.pacienteId)) erro('Paciente sem identificador.', { campo: 'pacienteId' })
  if (!temTexto(entrada.nomeCompleto) || entrada.nomeCompleto.trim().split(/\s+/).length < 2) erro('Nome completo (conforme documento com foto).', { campo: 'nomeCompleto' })
  if (!validarData(entrada.dataNascimento) || entrada.dataNascimento > dataLocal(ctx.agora)) erro('Data de nascimento inválida.', { campo: 'dataNascimento' })
  if (entrada.documentoConferido !== true) erro('Confira nome e data de nascimento com o documento com foto.', { campo: 'documentoConferido' })
  if (typeof entrada.conferidoDatasigh !== 'boolean') erro('Informe se os dados foram conferidos no Datasigh.', { campo: 'conferidoDatasigh' })
  const nome = entrada.nomeCompleto.trim().replace(/\s+/g, ' ')
  return {
    episodioId: null,
    pacienteId: entrada.pacienteId,
    tipo: 'paciente.cadastrado',
    dados: {
      nomeCompleto: nome,
      nomeNormalizado: normalizarNome(nome),
      dataNascimento: entrada.dataNascimento,
      nomeMae: temTexto(entrada.nomeMae) ? entrada.nomeMae.trim() : null,
      prontuario: temTexto(entrada.prontuario) ? entrada.prontuario.trim() : null,
      datasighId: temTexto(entrada.datasighId) ? entrada.datasighId.trim() : null,
      conferidoDatasigh: entrada.conferidoDatasigh,
      documentoConferido: true,
    },
    ...base(ctx, p),
  }
}

/** Evento de abertura de episódio (D-7). Valida campos; calcula 2º olho (nada da lente do 1º olho é copiado). */
export function abrirEpisodio(
  entrada: {
    episodioId: string
    paciente: Paciente
    olho: Olho
    cirurgiaoId: string
    tipoCirurgia: string
    tipoLente: string
    dataSugerida: string | null
    versoesModelos: Record<ModeloId, string>
    anterioresDoPaciente: { episodioId: string; olho: Olho; dataCirurgia: string | null; estado: EstadoEpisodio }[]
  },
  ctx: ContextoDecisao,
): { evento: NovoEvento; avisos: string[] } {
  const p = papel(ctx, 'episodio.aberto')
  if (!temTexto(entrada.episodioId)) erro('Episódio sem identificador.', { campo: 'episodioId' })
  if (!entrada.paciente?.id) erro('Paciente não informado.', { campo: 'paciente' })
  if (entrada.olho !== 'OD' && entrada.olho !== 'OE') erro('Olho: OD (OLHO DIREITO) ou OE (OLHO ESQUERDO).', { campo: 'olho' })
  if (!temTexto(entrada.cirurgiaoId)) erro('Cirurgião obrigatório.', { campo: 'cirurgiaoId' })
  if (!temTexto(entrada.tipoCirurgia)) erro('Tipo de cirurgia obrigatório.', { campo: 'tipoCirurgia' })
  if (!temTexto(entrada.tipoLente)) erro('Tipo de lente obrigatório.', { campo: 'tipoLente' })
  if (entrada.dataSugerida !== null && !validarData(entrada.dataSugerida)) erro('Data sugerida inválida (aaaa-mm-dd).', { campo: 'dataSugerida' })
  for (const m of ORDEM_MODELOS) if (!temTexto(entrada.versoesModelos?.[m])) erro('Versões dos modelos incompletas.', { campo: 'versoesModelos', modelo: m })
  const ativos = (entrada.anterioresDoPaciente ?? []).filter((a) => a.olho === entrada.olho && !['alta', 'cancelado', 'suspenso'].includes(a.estado))
  if (ativos.length) erro('Já existe episódio em andamento para este olho.', { campo: 'olho', episodioId: ativos[0].episodioId })
  const segundoOlho = detectarSegundoOlho(entrada.olho, entrada.anterioresDoPaciente ?? [])
  const avisos = segundoOlho ? [textoSegundoOlho(segundoOlho.dataPrimeiro)] : []
  return {
    evento: {
      episodioId: entrada.episodioId,
      pacienteId: entrada.paciente.id,
      tipo: 'episodio.aberto',
      dados: {
        olho: entrada.olho,
        cirurgiaoId: entrada.cirurgiaoId,
        tipoCirurgia: entrada.tipoCirurgia.trim(),
        tipoLente: entrada.tipoLente.trim(),
        dataSugerida: entrada.dataSugerida,
        versoesModelos: { ...entrada.versoesModelos },
        segundoOlho,
      },
      ...base(ctx, p),
    },
    avisos,
  }
}
