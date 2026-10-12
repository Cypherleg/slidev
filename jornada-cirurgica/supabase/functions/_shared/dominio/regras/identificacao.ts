// Identificação (briefing §8 regra 1; POP §0, §2, §3, §11): homônimo e nome parecido no mesmo dia,
// 2º olho e alertas por extenso.

import { D7 } from '../modelos/ids.ts'
import type { IdentificacaoVisao, ValorPessoa } from '../tipos.ts'
import { formatarData } from '../util/datas.ts'
import { normalizarNome, similaridadeNomes } from '../util/texto.ts'
import { ehSim, valor } from '../estado/consultas.ts'
import type { EstadoInterno } from '../estado/tipos.ts'

export const TEXTO_OLHO_UNICO = 'OLHO ÚNICO'
export const TEXTO_HOMONIMO = 'HOMÔNIMO NO DIA'
/** [S] interpretação: o POP pede alerta para "nome parecido" mas só dá o texto de homônimo. */
export const TEXTO_NOME_PARECIDO = 'NOME PARECIDO NO DIA'

export function textoDeficitCognitivo(nomeRepresentante: string | null): string {
  return `DÉFICIT COGNITIVO — REPRESENTANTE: ${nomeRepresentante && nomeRepresentante.trim() ? nomeRepresentante.trim() : 'não registrado'}`
}

export function textoSegundoOlho(dataPrimeiro: string | null): string {
  return dataPrimeiro ? `2º OLHO — 1º operado em ${formatarData(dataPrimeiro)}` : '2º OLHO — 1º olho sem data de cirurgia registrada'
}

/** Episódio anterior do OUTRO olho (não cancelado nem suspenso), o mais recente. */
export function detectarSegundoOlho(
  olho: 'OD' | 'OE',
  anteriores: { episodioId: string; olho: 'OD' | 'OE'; dataCirurgia: string | null; estado: string }[],
): { primeiroEpisodioId: string; dataPrimeiro: string | null } | null {
  const candidatos = anteriores.filter((a) => a.olho !== olho && a.estado !== 'cancelado' && a.estado !== 'suspenso')
  if (!candidatos.length) return null
  candidatos.sort((x, y) => (x.dataCirurgia ?? '').localeCompare(y.dataCirurgia ?? ''))
  const c = candidatos[candidatos.length - 1]
  return { primeiroEpisodioId: c.episodioId, dataPrimeiro: c.dataCirurgia }
}

export function calcularIdentificacao(est: EstadoInterno): IdentificacaoVisao {
  const ent = est.entrada
  const nome = ent.paciente.nomeCompleto
  const norm = normalizarNome(nome)
  const limiar = ent.config.limiarNomeParecido
  let homonimo = false
  const parecidos: { episodioId: string; nomeCompleto: string }[] = []
  if (est.agenda.dataCirurgia) {
    for (const outro of ent.contexto.mesmoDia) {
      if (outro.episodioId === ent.episodio.id || outro.pacienteId === ent.paciente.id) continue
      const igual = normalizarNome(outro.nomeCompleto) === norm
      if (igual) homonimo = true
      if (igual || similaridadeNomes(nome, outro.nomeCompleto) >= limiar) {
        parecidos.push({ episodioId: outro.episodioId, nomeCompleto: outro.nomeCompleto })
      }
    }
  }
  const segundoOlho = detectarSegundoOlho(ent.episodio.olho, ent.contexto.anterioresDoPaciente)
  const extenso: string[] = []
  if (ehSim(est, 'd7', D7.olhoUnico)) extenso.push(TEXTO_OLHO_UNICO)
  if (homonimo) extenso.push(TEXTO_HOMONIMO)
  else if (parecidos.length) extenso.push(TEXTO_NOME_PARECIDO)
  if (ehSim(est, 'd7', D7.demencia)) {
    const rep = valor(est, 'd7', D7.representante) as ValorPessoa | undefined
    extenso.push(textoDeficitCognitivo(rep && typeof rep === 'object' ? rep.nome : null))
  }
  if (segundoOlho) extenso.push(textoSegundoOlho(segundoOlho.dataPrimeiro))
  return {
    homonimoNoDia: homonimo,
    nomesParecidos: parecidos,
    exigeNomeMae: homonimo || parecidos.length > 0,
    segundoOlho,
    alertasExtenso: extenso,
  }
}
