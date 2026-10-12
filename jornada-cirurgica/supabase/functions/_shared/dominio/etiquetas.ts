// Etiquetas (briefing §6.4): o painel gera o texto de cada etiqueta a partir de modelos configuráveis.
// Programa e formato da impressora ainda não informados (pendência).

import type { Estado, Etiqueta, TipoEtiqueta } from './contrato.ts'
import type { ConfigJornada } from './tipos.ts'
import { OLHO_EXTENSO } from './tipos.ts'
import { MODELOS_ETIQUETA_PADRAO } from './config.ts'
import { interno } from './estado/montar.ts'
import { nomeMae } from './estado/consultas.ts'
import { calcularDots, textoDot } from './regras/dots.ts'
import { calcularIdentificacao } from './regras/identificacao.ts'
import { formatarData } from './util/datas.ts'

const TITULOS: Record<TipoEtiqueta, string> = {
  peito: 'Etiqueta do peito',
  pulseira: 'Pulseira',
  caixa_lente: 'Etiqueta da caixa da LIO',
  alertas: 'Alertas por extenso',
}

/** Substitui marcadores; linha cujos marcadores ficaram todos vazios é omitida. */
export function preencherModelo(modelo: string, valores: Record<string, string>): string {
  return modelo
    .split('\n')
    .map((linha) => {
      const marcadores = linha.match(/\{[A-Z_]+\}/g) ?? []
      if (marcadores.length && marcadores.every((m) => !(valores[m.slice(1, -1)] ?? '').trim())) return null
      return linha.replace(/\{([A-Z_]+)\}/g, (_, k: string) => valores[k] ?? '')
    })
    .filter((l): l is string => l !== null)
    .join('\n')
    .trim()
}

/** Etiquetas (texto) a partir dos modelos configuráveis. */
export function gerarEtiquetas(estado: Estado, config: ConfigJornada): Etiqueta[] {
  const est = interno(estado)
  const ent = est.entrada
  const ident = calcularIdentificacao(est)
  const valores: Record<string, string> = {
    NOME_COMPLETO: ent.paciente.nomeCompleto.toLocaleUpperCase('pt-BR'),
    NASCIMENTO: formatarData(ent.paciente.dataNascimento),
    PRONTUARIO: ent.paciente.prontuario && ent.paciente.prontuario.trim() ? ent.paciente.prontuario.trim() : 'PRONTUÁRIO NÃO REGISTRADO',
    OLHO_EXTENSO: OLHO_EXTENSO[ent.episodio.olho],
    CIRURGIA: ent.episodio.tipoCirurgia,
    DOTS: calcularDots(est).map(textoDot).join(' | '),
    ALERTAS_EXTENSO: ident.alertasExtenso.join(' | '),
    NOME_MAE: ident.exigeNomeMae ? (nomeMae(est) ?? '') : '',
  }
  const modelos = { ...MODELOS_ETIQUETA_PADRAO, ...(config?.modelosEtiqueta ?? {}) }
  return (['peito', 'pulseira', 'caixa_lente', 'alertas'] as TipoEtiqueta[]).map((tipo) => ({
    tipo,
    titulo: TITULOS[tipo],
    texto: preencherModelo(modelos[tipo], valores),
  }))
}
