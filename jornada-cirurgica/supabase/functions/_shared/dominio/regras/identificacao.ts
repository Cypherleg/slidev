// Identificação (briefing §8 regra 1; POP §0, §2, §3, §11): homônimo e nome parecido no mesmo dia,
// 2º olho e alertas por extenso.

import { D7 } from '../modelos/ids.ts'
import type { IdentificacaoVisao, ValorPessoa } from '../tipos.ts'
import { formatarData } from '../util/datas.ts'
import { normalizarNome, similaridadeNomes } from '../util/texto.ts'
import { ehSim, valor, valorAplicavel } from '../estado/consultas.ts'
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

/**
 * Olho único (POP §11): "olho único ou ambliopia" = sim e "qual" = olho único. Enquanto "qual" não foi respondido,
 * conservador: trata como olho único.
 */
export function ehOlhoUnico(est: EstadoInterno): boolean {
  if (!ehSim(est, 'd7', D7.olhoUnico)) return false
  return valorAplicavel(est, 'd7', D7.olhoUnicoQual) !== 'ambliopia'
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
  if (ehOlhoUnico(est)) extenso.push(TEXTO_OLHO_UNICO)
  if (homonimo) extenso.push(TEXTO_HOMONIMO)
  else if (parecidos.length) extenso.push(TEXTO_NOME_PARECIDO)
  if (ehSim(est, 'd7', D7.demencia)) {
    const rep = valor(est, 'd7', D7.representante) as ValorPessoa | undefined
    extenso.push(textoDeficitCognitivo(rep && typeof rep === 'object' ? rep.nome : null))
  }
  // 2º olho: pelo registro do painel ou pela resposta do D-7 (com a data informada do 1º olho).
  const respostaSegundo = valor(est, 'd7', D7.primeiroSegundo) === 'segundo'
  const dataDita = valorAplicavel(est, 'd7', D7.dataPrimeiroOlho)
  if (segundoOlho) extenso.push(textoSegundoOlho(segundoOlho.dataPrimeiro ?? (typeof dataDita === 'string' ? dataDita : null)))
  else if (respostaSegundo) extenso.push(textoSegundoOlho(typeof dataDita === 'string' ? dataDita : null))
  return {
    homonimoNoDia: homonimo,
    nomesParecidos: parecidos,
    exigeNomeMae: homonimo || parecidos.length > 0,
    segundoOlho,
    alertasExtenso: extenso,
  }
}
