// Lista do dia, resumo da véspera para o cirurgião e visão de leitura do dia (briefing §6.5, §6.6, §10).

import type { Ator, Estado } from './contrato.ts'
import { ErroDominio } from './contrato.ts'
import type { EpisodioResumoDia, EstadoEpisodio, StatusTcle } from './tipos.ts'
import { OLHO_EXTENSO, ROTULO_ESTADO } from './tipos.ts'
import { interno } from './estado/montar.ts'
import { cicloAtual, dadosPlano, etapaLente, nomeMembro } from './estado/consultas.ts'
import type { EstadoInterno } from './estado/tipos.ts'
import { alertasDoEstado } from './regras/alertas.ts'
import { calcularDots, textoDot } from './regras/dots.ts'
import { hardStopsAbertos } from './regras/hardstops.ts'
import { calcularIdentificacao } from './regras/identificacao.ts'
import { formatarDioptria } from './regras/lente.ts'
import { pendenciasDoEstado } from './regras/pendencias.ts'
import { motivoSuspensaoAvisos } from './mensagens.ts'

const ROTULO_ETAPA_LENTE: Record<string, string> = {
  sem_plano: 'Sem plano',
  plano_registrado: 'Plano registrado',
  chegada_conferida: 'Checkpoint 1 concluído',
  cp2_confere: 'Checkpoint 2 concluído',
  quarentena: 'Quarentena',
  time_out_confere: 'Conferida no Time Out',
}

/** Linha da lista do dia (sem valores de lente). Também serve de `episodios.resumo`. */
export function resumoDia(estado: Estado, agora: string): EpisodioResumoDia {
  const est = interno(estado)
  const ent = est.entrada
  const ident = calcularIdentificacao(est)
  const alertas = alertasDoEstado(est)
  return {
    episodioId: ent.episodio.id,
    ordem: est.agenda.ordem,
    horario: est.agenda.horario,
    pacienteNome: ent.paciente.nomeCompleto,
    dataNascimento: ent.paciente.dataNascimento,
    olho: ent.episodio.olho,
    olhoExtenso: OLHO_EXTENSO[ent.episodio.olho],
    cirurgiaoNome: nomeMembro(est, ent.episodio.cirurgiaoId),
    estado: est.estado,
    dots: calcularDots(est),
    alertasExtenso: ident.alertasExtenso,
    hardStopsAbertos: hardStopsAbertos(est).length,
    pendencias: pendenciasDoEstado(est, agora).length,
    alertasSemConduta: alertas.filter((a) => a.nivel === 'alerta' && !a.conduta).length,
    homonimoOuParecido: ident.homonimoNoDia || ident.nomesParecidos.length > 0,
    etapaLente: etapaLente(est),
    avisosSuspensos: !!motivoSuspensaoAvisos(est),
  }
}

function ordenarDoDia(lista: EstadoInterno[]): EstadoInterno[] {
  return [...lista].sort(
    (a, b) =>
      (a.agenda.ordem ?? Number.MAX_SAFE_INTEGER) - (b.agenda.ordem ?? Number.MAX_SAFE_INTEGER) ||
      (a.agenda.horario ?? '99:99').localeCompare(b.agenda.horario ?? '99:99') ||
      a.entrada.paciente.nomeCompleto.localeCompare(b.entrada.paciente.nomeCompleto),
  )
}

/** Resumo da véspera para o cirurgião: episódios do dia, alertas sem conduta, lentes não conferidas, termos não assinados. */
export function resumoVespera(
  estados: Estado[],
  data: string,
  agora: string,
): {
  data: string
  episodios: EpisodioResumoDia[]
  alertasSemConduta: { episodioId: string; paciente: string; alerta: string }[]
  lentesNaoConferidas: { episodioId: string; paciente: string; etapa: string }[]
  termosNaoAssinados: { episodioId: string; paciente: string; status: StatusTcle }[]
} {
  const doDia = ordenarDoDia(estados.map(interno).filter((e) => e.agenda.dataCirurgia === data && e.estado !== 'cancelado'))
  const r = { data, episodios: [] as EpisodioResumoDia[], alertasSemConduta: [] as { episodioId: string; paciente: string; alerta: string }[], lentesNaoConferidas: [] as { episodioId: string; paciente: string; etapa: string }[], termosNaoAssinados: [] as { episodioId: string; paciente: string; status: StatusTcle }[] }
  for (const est of doDia) {
    const id = est.entrada.episodio.id
    const paciente = est.entrada.paciente.nomeCompleto
    r.episodios.push(resumoDia(est, agora))
    for (const a of alertasDoEstado(est)) if (a.nivel === 'alerta' && !a.conduta) r.alertasSemConduta.push({ episodioId: id, paciente, alerta: a.titulo })
    const etapa = etapaLente(est)
    if (etapa !== 'cp2_confere' && etapa !== 'time_out_confere') r.lentesNaoConferidas.push({ episodioId: id, paciente, etapa: ROTULO_ETAPA_LENTE[etapa] ?? etapa })
    if (est.tcle.status !== 'assinado' && est.tcle.status !== 'olho_conferido') r.termosNaoAssinados.push({ episodioId: id, paciente, status: est.tcle.status })
  }
  return r
}

/** Visão de leitura do dia (paciente, olho, lente, ordem, alertas). Só cirurgião e gestora. Exige o estado completo para a lente. */
export function visaoLeituraDia(
  estados: Estado[],
  ator: Ator,
  data: string,
): {
  data: string
  episodios: {
    ordem: number | null
    horario: string | null
    paciente: string
    nascimento: string
    olho: string
    lente: { modelo: string; dioptria: string; cilindro: string | null; eixo: number | null; etapa: string } | null
    alertas: string[]
    dots: string[]
    estado: EstadoEpisodio
  }[]
} {
  if (!ator.papeis.includes('cirurgiao') && !ator.papeis.includes('gestora')) {
    throw new ErroDominio('SEM_PERMISSAO', 'Visão de leitura do dia: só cirurgião e gestora.')
  }
  const doDia = ordenarDoDia(estados.map(interno).filter((e) => e.agenda.dataCirurgia === data && e.estado !== 'cancelado'))
  return {
    data,
    episodios: doDia.map((est) => {
      const p = dadosPlano(est)
      const etapa = etapaLente(est)
      const alertas = [
        ...calcularIdentificacao(est).alertasExtenso,
        ...alertasDoEstado(est).map((a) => `${a.titulo}${a.conduta ? ` — conduta: ${a.conduta.texto}` : a.nivel === 'alerta' ? ' — SEM CONDUTA' : ''}`),
      ]
      return {
        ordem: est.agenda.ordem,
        horario: est.agenda.horario,
        paciente: est.entrada.paciente.nomeCompleto,
        nascimento: est.entrada.paciente.dataNascimento,
        olho: OLHO_EXTENSO[est.entrada.episodio.olho],
        lente: p
          ? {
              modelo: p.modelo,
              dioptria: formatarDioptria(p.dioptria),
              cilindro: p.torica && p.cilindro != null ? formatarDioptria(p.cilindro) : null,
              eixo: p.torica ? p.eixo : null,
              etapa: `${ROTULO_ETAPA_LENTE[etapa] ?? etapa} (ciclo ${cicloAtual(est).numero})`,
            }
          : null,
        alertas,
        dots: calcularDots(est).map(textoDot),
        estado: est.estado,
      }
    }),
  }
}

export { ROTULO_ESTADO, ROTULO_ETAPA_LENTE }
