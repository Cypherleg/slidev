// Registro preenchido do episódio para imprimir e assinar (contingência em papel, briefing regra 12 e §9).
// Mostra o que o papel de quem imprime pode ver (a visão já vem filtrada pelo servidor; conferência cega).

import { useState } from 'react'
import { useParams } from 'react-router'
import type {
  Alerta,
  BlocoVisao,
  CampoLente,
  EpisodioVisao,
  ModeloChecklist,
  ModeloId,
  NivelAlerta,
  RespostaAtual,
} from '@dominio/tipos.ts'
import { ORDEM_MODELOS, ROTULO_ESTADO, ROTULO_PAPEL } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Carregando } from '../../componentes/base/index.tsx'
import { formatarData, formatarDataHora, formatarDioptria, formatarEixo } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { useCarga, useTitulo } from '../gestao/comum/carga.ts'
import { ErroCarga } from '../gestao/comum/componentes.tsx'
import {
  ROTULO_ETAPA_LENTE,
  ROTULO_ESTADO_MENSAGEM,
  ROTULO_SEVERIDADE,
  ROTULO_SITUACAO_BLOCO,
  ROTULO_STATUS_TCLE,
  ROTULO_TIPO_CONTATO,
  ROTULO_VIA,
  rotulosPapeis,
} from '../gestao/comum/rotulos.ts'
import { BarraImpressao, Caixa, Folha, Linha, LinhasAssinatura } from './componentes.tsx'
import { CampoEmBranco, NotasItem, tituloSecao } from './itens.tsx'
import { formatarResposta } from './resposta.ts'
import './impressao.css'

const CAMPO_LENTE: Record<CampoLente, string> = { olho: 'olho', modelo: 'modelo', dioptria: 'dioptria', cilindro: 'cilindro', eixo: 'eixo' }
const MOTIVO_CONTATO: Record<string, string> = {
  reprovacao_dupla: 'Reprovação dupla no quiz',
  erro_olho: 'Erro na pergunta do olho',
  link_nao_aberto_d3: 'Link não aberto até D-3',
  teach_back_inadequado: 'Teach-back inadequado',
}
const TEACH_BACK: Record<string, string> = {
  adequado_primeira: 'Adequado de primeira',
  apos_reorientacao: 'Adequado após reorientação',
  inadequado: 'Inadequado',
}
const NIVEL: Record<NivelAlerta, string> = { alerta: 'ALERTA', sinalizado: 'Sinalizado' }
const ORIGEM_CICLO: Record<string, string> = { inicial: 'inicial', novo_plano: 'novo plano após quarentena', manter_plano: 'plano mantido após quarentena', troca_d0: 'troca de LIO no D0' }
const FALTA_CICLO: Record<string, string> = { plano: 'plano', chegada: 'chegada', cp1: 'checkpoint 1', cp2: 'checkpoint 2', time_out: 'leitura no Time Out' }

const ASSINATURAS_EPISODIO = (['concierge', 'conferente', 'circulante', 'cirurgiao', 'anestesista'] as const).map(p => ROTULO_PAPEL[p])

function camposDivergentes(c: CampoLente[]): string {
  return c.length ? c.map(x => CAMPO_LENTE[x] ?? x).join(', ') : 'nenhum'
}

function SituacaoBloco(props: { bloco: BlocoVisao | undefined }) {
  const b = props.bloco
  if (!b) return <span className="imp-bloco-situacao">Situação não informada</span>
  if (b.situacao === 'concluido' && b.concluido) {
    const c = b.concluido
    return (
      <span className="imp-bloco-situacao">
        <strong>Concluído</strong> em {formatarDataHora(c.em)} por {c.porNome}
        {c.leitorNome ? ` · leu: ${c.leitorNome}` : ''}
        {c.confirmadorNome ? ` · confirmou: ${c.confirmadorNome}` : ''}
        {c.foraDeHora && <span className="imp-marcador">FORA DE HORA</span>}
      </span>
    )
  }
  return (
    <span className="imp-bloco-situacao">
      <strong>{ROTULO_SITUACAO_BLOCO[b.situacao] ?? b.situacao}</strong>
      {b.faltam.length > 0 ? ` · ${b.faltam.length} item(ns) obrigatório(s) sem resposta` : ''}
    </span>
  )
}

function BlocoImpresso(props: { modelo: ModeloChecklist; bloco: BlocoVisao | undefined; respostas: Record<string, RespostaAtual> | undefined }) {
  const { modelo, bloco, respostas } = props
  const conferencia = modelo.id === 'cp1' || modelo.id === 'cp2'
  return (
    <section className="imp-bloco" aria-label={modelo.titulo}>
      <div className="imp-bloco-cabeca">
        <h2>
          {modelo.titulo} <span className="imp-nota">(modelo {modelo.versao})</span>
        </h2>
        <SituacaoBloco bloco={bloco} />
      </div>
      {bloco && bloco.impedimentos.length > 0 && bloco.situacao !== 'concluido' && (
        <p className="imp-nota">Impedimentos: {bloco.impedimentos.join('; ')}</p>
      )}
      {conferencia && !respostas && (
        <p className="imp-nota">Respostas desta conferência não registradas ou não visíveis para o seu papel (conferência cega).</p>
      )}
      <table className="imp-tabela">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th className="col-resposta" scope="col">
              Resposta
            </th>
            <th className="col-autor" scope="col">
              Quem marcou
            </th>
            <th className="col-rubrica" scope="col">
              Quando
            </th>
          </tr>
        </thead>
        <tbody>
          {modelo.secoes.map(secao => [
            <tr key={`s-${secao.id}`} className="secao">
              <td colSpan={4}>{tituloSecao(secao)}</td>
            </tr>,
            ...secao.itens.map(item => {
              const r = respostas?.[item.id]
              return (
                <tr key={item.id} data-item={item.id}>
                  <td>
                    {item.texto} <NotasItem item={item} compacto />
                  </td>
                  <td>
                    {r ? (
                      <>
                        <strong>{formatarResposta(item, r.valor)}</strong>
                        {r.observacao && <span className="imp-nota"> · Obs.: {r.observacao}</span>}
                        {r.foraDeHora && <span className="imp-marcador">FORA DE HORA</span>}
                        {r.correcoes > 0 && <span className="imp-nota"> · corrigido {r.correcoes}x (registro mantém o histórico)</span>}
                      </>
                    ) : (
                      <CampoEmBranco item={item} />
                    )}
                  </td>
                  <td className="col-autor">{r ? r.autorNome : ''}</td>
                  <td className="col-rubrica">{r ? formatarDataHora(r.registradoEm) : ''}</td>
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
    </section>
  )
}

function AlertaImpresso(props: { alerta: Alerta }) {
  const a = props.alerta
  return (
    <li>
      <strong>{a.titulo}</strong> <span className="imp-marcador">{NIVEL[a.nivel] ?? a.nivel}</span>
      {a.inativo && <span className="imp-nota"> (inativo: a resposta que o gerou foi corrigida)</span>}
      <br />
      {a.descricao}
      <br />
      {a.comunicado ? (
        <span>
          Comunicado ao cirurgião por {a.comunicado.porNome} em {formatarDataHora(a.comunicado.em)}, via {ROTULO_VIA[a.comunicado.via] ?? a.comunicado.via}
          {a.comunicado.observacao ? ` (${a.comunicado.observacao})` : ''}.
        </span>
      ) : (
        <span className="imp-campos-branco">
          <Caixa /> Comunicado ao cirurgião: <Linha rotulo="por" largura="media" />
          <Linha rotulo="via" largura="curta" />
          <Linha rotulo="hora" largura="curta" />
        </span>
      )}
      <br />
      {a.conduta ? (
        <span>
          Conduta escrita por {a.conduta.cirurgiaoNome} em {formatarDataHora(a.conduta.em)}: <strong>{a.conduta.texto}</strong>
        </span>
      ) : a.nivel === 'alerta' ? (
        <span className="imp-campos-branco">
          <Linha rotulo="Conduta do cirurgião (por escrito)" largura="longa" />
        </span>
      ) : null}
    </li>
  )
}

function Lente(props: { lente: EpisodioVisao['lente'] }) {
  const l = props.lente
  return (
    <section aria-label="Lente">
      <h2>Lente intraocular (LIO)</h2>
      <p>
        Situação: <strong>{ROTULO_ETAPA_LENTE[l.etapa] ?? l.etapa}</strong> · ciclo {l.ciclo}
        {l.origemCiclo && l.origemCiclo !== 'inicial' ? ` (${ORIGEM_CICLO[l.origemCiclo] ?? l.origemCiclo})` : ''}
        {l.faltaNoCiclo?.length ? ` · falta: ${l.faltaNoCiclo.map(f => FALTA_CICLO[f] ?? f).join(', ')}` : ''}
      </p>
      {l.ciclosAnteriores?.length ? (
        <ul className="imp-lista">
          {l.ciclosAnteriores.map(c => (
            <li key={c.ciclo}>
              Ciclo {c.ciclo} encerrado em {formatarDataHora(c.encerradoEm)}: {c.motivo}
            </li>
          ))}
        </ul>
      ) : null}
      {l.plano ? (
        <p>
          <strong>Plano</strong> (registrado por {l.plano.registradoPor}, {formatarDataHora(l.plano.registradoEm)}): modelo {l.plano.modelo} · dioptria{' '}
          {formatarDioptria(l.plano.dioptria)}
          {l.plano.torica ? ` · tórica: cilindro ${formatarDioptria(l.plano.cilindro)}, eixo ${formatarEixo(l.plano.eixo)}` : ' · não tórica'}
          {l.plano.reserva ? ` · reserva: ${l.plano.reserva.modelo} ${formatarDioptria(l.plano.reserva.dioptria)}` : ' · reserva: não informada'}
          {l.plano.alvoRefrativo !== undefined && l.plano.alvoRefrativo !== null ? ` · alvo refrativo ${formatarDioptria(l.plano.alvoRefrativo)}` : ''}
          {l.plano.dataPedido ? ` · pedido em ${formatarData(l.plano.dataPedido)}` : ''}
        </p>
      ) : (
        <p className="imp-nota">Valores do plano não registrados ou não visíveis para o seu papel (conferência cega).</p>
      )}
      {l.chegada && (
        <p>
          <strong>Chegada</strong> (checkpoint 1, {l.chegada.registradoPor}, {formatarDataHora(l.chegada.registradoEm)}): data {formatarData(l.chegada.dataChegada)} · lote{' '}
          {l.chegada.lote} · validade {formatarData(l.chegada.validade)}
        </p>
      )}
      {l.cp2 && (
        <p>
          <strong>Checkpoint 2</strong> ({l.cp2.registradoPor}, {formatarDataHora(l.cp2.registradoEm)}): modelo {l.cp2.modelo} · dioptria {formatarDioptria(l.cp2.dioptria)}
          {l.cp2.torica ? ` · cilindro ${formatarDioptria(l.cp2.cilindro)}, eixo ${formatarEixo(l.cp2.eixo)}` : ''}
        </p>
      )}
      {l.cp2Resultado && (
        <p>
          Comparação do checkpoint 2: <strong>{l.cp2Resultado.confere ? 'confere' : 'DIVERGE'}</strong> · campos divergentes:{' '}
          {camposDivergentes(l.cp2Resultado.camposDivergentes)} · {l.cp2Resultado.porNome}, {formatarDataHora(l.cp2Resultado.em)}
        </p>
      )}
      {l.timeOut && (
        <p>
          <strong>Leitura da caixa no Time Out</strong> ({l.timeOut.registradoPor}, {formatarDataHora(l.timeOut.registradoEm)}): modelo {l.timeOut.modelo} · dioptria{' '}
          {formatarDioptria(l.timeOut.dioptria)}
          {l.timeOut.cilindro !== null ? ` · cilindro ${formatarDioptria(l.timeOut.cilindro)}` : ''}
          {l.timeOut.eixo !== null ? ` · eixo ${formatarEixo(l.timeOut.eixo)}` : ''}
        </p>
      )}
      {l.timeOutResultado && (
        <p>
          Comparação no Time Out: <strong>{l.timeOutResultado.confere ? 'confere' : 'DIVERGE'}</strong> · campos divergentes:{' '}
          {camposDivergentes(l.timeOutResultado.camposDivergentes)} · {l.timeOutResultado.porNome}, {formatarDataHora(l.timeOutResultado.em)}
        </p>
      )}
      {l.quarentena && (
        <p>
          <strong>Quarentena</strong> {l.quarentena.aberta ? <span className="imp-marcador">ABERTA</span> : '(encerrada)'} · etapa {l.quarentena.etapa} · motivo:{' '}
          {l.quarentena.motivo} · desde {formatarDataHora(l.quarentena.desde)}
          {l.quarentena.resolucao ? (
            <>
              <br />
              Resolução escrita por {l.quarentena.resolucao.cirurgiaoNome} em {formatarDataHora(l.quarentena.resolucao.em)} (
              {l.quarentena.resolucao.acao === 'novo_plano' ? 'novo plano' : 'mantém o plano'}): <strong>{l.quarentena.resolucao.texto}</strong>
            </>
          ) : (
            <span className="imp-campos-branco">
              <Linha rotulo="Resolução por escrito do cirurgião" largura="longa" />
            </span>
          )}
        </p>
      )}
    </section>
  )
}

function Conteudo(props: { v: EpisodioVisao; impressoEm: string }) {
  const { v } = props
  const e = v.episodio
  const pac = v.paciente
  const identificacaoCurta = (
    <>
      <span>
        <strong>OFTA VITTA</strong> · Registro do episódio cirúrgico
      </span>
      <span>
        {pac.nomeCompleto} · nasc. {formatarData(pac.dataNascimento)}
        {pac.prontuario ? ` · pront. ${pac.prontuario}` : ''} · <strong>{e.olhoExtenso}</strong>
      </span>
    </>
  )
  const alertasAtivos = v.alertas.filter(a => !a.inativo)
  const alertasInativos = v.alertas.filter(a => a.inativo)
  return (
    <Folha cabecalho={identificacaoCurta} rodape={<p>Impresso em {props.impressoEm}. Episódio {e.id}.</p>} rotulo="Registro do episódio">
      <h1>Registro do episódio cirúrgico: catarata</h1>
      <section className="imp-identificacao" aria-label="Identificação">
        <dl>
          <dt>Paciente</dt>
          <dd>
            <strong>{pac.nomeCompleto}</strong>
          </dd>
          <dt>Nascimento</dt>
          <dd>
            {formatarData(pac.dataNascimento)}
            {pac.idade !== null && pac.idade !== undefined ? ` (${pac.idade} anos)` : ''}
          </dd>
          {pac.nomeMae && (
            <>
              <dt>Nome da mãe</dt>
              <dd>{pac.nomeMae}</dd>
            </>
          )}
          <dt>Prontuário</dt>
          <dd>{pac.prontuario ?? 'não informado'}</dd>
          <dt>Cirurgião</dt>
          <dd>{e.cirurgiao.nome}</dd>
          <dt>Data da cirurgia</dt>
          <dd>
            {e.dataCirurgia ? formatarData(e.dataCirurgia) : 'não agendada'}
            {e.horario ? ` · ${e.horario}` : ''}
            {e.ordem !== null && e.ordem !== undefined ? ` · ordem ${e.ordem}` : ''}
          </dd>
          <dt>Cirurgia e lente</dt>
          <dd>
            {e.tipoCirurgia} · {e.tipoLente}
          </dd>
          <dt>Situação</dt>
          <dd>{ROTULO_ESTADO[e.estado] ?? e.estado}</dd>
          <dt>Cadastro</dt>
          <dd>{pac.conferidoDatasigh ? 'Conferido no Datasigh' : 'Não conferido no Datasigh'}</dd>
        </dl>
        <div className="imp-olho" aria-label="Olho a operar">
          <small>Olho a operar</small>
          {e.olhoExtenso}
        </div>
      </section>
      {v.identificacao.alertasExtenso.length > 0 && (
        <ul className="imp-alertas-extenso" aria-label="Alertas por extenso">
          {v.identificacao.alertasExtenso.map(a => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {(v.identificacao.exigeNomeMae || v.identificacao.nomesParecidos.length > 0) && (
        <p>
          <strong>Homônimo ou nome parecido no dia:</strong> nome da mãe obrigatório em todas as conferências.
          {v.identificacao.nomesParecidos.length > 0 ? ` Nomes: ${v.identificacao.nomesParecidos.map(n => n.nomeCompleto).join('; ')}.` : ''}
        </p>
      )}
      <p>
        <strong>Dots:</strong>{' '}
        {v.dots.length ? v.dots.map(d => `${d.letra} (${d.rotulo}: ${d.motivo})`).join(' · ') : 'nenhum.'} Ausência de dot não significa ausência de risco: alergias,
        α-bloqueador e anticoagulação são verbalizados no Time Out para todo paciente.
      </p>

      <h2>Hard stops abertos</h2>
      {v.hardStops.length === 0 ? (
        <p>Nenhum hard stop aberto no momento da impressão.</p>
      ) : (
        <ul className="imp-lista">
          {v.hardStops.map(h => (
            <li key={h.codigo}>
              <strong>{h.titulo}</strong> <span className="imp-marcador">HARD STOP</span> · desde {formatarDataHora(h.abertoDesde)}
              <br />
              {h.descricao} Como resolver: {h.comoResolver} (competência: {rotulosPapeis(h.resolvivelPor)}).
              <br />
              <span className="imp-campos-branco">
                <Linha rotulo="Resolução por escrito" largura="longa" />
                <Linha rotulo="Quem resolveu" largura="media" />
                <Linha rotulo="Hora" largura="curta" />
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2>Alertas e condutas</h2>
      {alertasAtivos.length === 0 ? <p>Nenhum alerta ativo.</p> : <ul className="imp-lista">{alertasAtivos.map(a => <AlertaImpresso key={a.id} alerta={a} />)}</ul>}
      {alertasInativos.length > 0 && <ul className="imp-lista">{alertasInativos.map(a => <AlertaImpresso key={a.id} alerta={a} />)}</ul>}

      <Lente lente={v.lente} />

      <h2>Termo de consentimento (TCLE)</h2>
      <p>
        Situação: <strong>{ROTULO_STATUS_TCLE[v.tcle.status] ?? v.tcle.status}</strong>
      </p>
      {v.tcle.historico.length > 0 && (
        <ul className="imp-lista">
          {v.tcle.historico.map((h, i) => (
            <li key={i}>
              {ROTULO_STATUS_TCLE[h.status] ?? h.status} · {h.porNome} · {formatarDataHora(h.em)}
            </li>
          ))}
        </ul>
      )}

      <h2>Contatos e autorizações</h2>
      {v.contatos.length === 0 ? (
        <p>Nenhum contato registrado.</p>
      ) : (
        <table className="imp-tabela">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Nome</th>
              <th scope="col">Telefone</th>
              <th scope="col">Anuência do paciente</th>
              <th scope="col">Número confirmado</th>
            </tr>
          </thead>
          <tbody>
            {v.contatos.map(c => (
              <tr key={c.id}>
                <td>{ROTULO_TIPO_CONTATO[c.tipo] ?? c.tipo}</td>
                <td>
                  {c.nome}
                  {c.parentesco ? ` (${c.parentesco})` : ''}
                  {c.operaCelular ? ` · opera o celular: ${c.operaCelular}` : ''}
                </td>
                <td>{c.telefone ?? '—'}</td>
                <td>{c.anuenciaPaciente ? 'Sim' : 'Não'}</td>
                <td>{c.confirmadoEm ? formatarDataHora(c.confirmadoEm) : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Orientações, materiais e quiz</h2>
      <p>
        Teach-back:{' '}
        {v.teachBack
          ? `${TEACH_BACK[v.teachBack.resultado] ?? v.teachBack.resultado} · ${v.teachBack.porNome} · ${formatarDataHora(v.teachBack.em)}${v.teachBack.observacao ? ` · ${v.teachBack.observacao}` : ''}`
          : 'não registrado'}
      </p>
      <p>
        Link do paciente: {v.materiais.linkCriadoEm ? `criado em ${formatarDataHora(v.materiais.linkCriadoEm)}` : 'não criado'}
        {v.materiais.linkExpiraEm ? ` · expira em ${formatarDataHora(v.materiais.linkExpiraEm)}` : ''}
        {v.materiais.abertoEm ? ` · aberto em ${formatarDataHora(v.materiais.abertoEm)}` : ' · não aberto'}
      </p>
      {v.materiais.enviados.length > 0 && (
        <ul className="imp-lista">
          {v.materiais.enviados.map((m, i) => (
            <li key={`${m.materialId}-${i}`}>
              {m.titulo} (versão {m.versao}) · {formatarDataHora(m.em)} · {ROTULO_ESTADO_MENSAGEM[m.estado] ?? m.estado}
            </li>
          ))}
        </ul>
      )}
      {v.materiais.quiz.length > 0 ? (
        <ul className="imp-lista">
          {v.materiais.quiz.map((q, i) => (
            <li key={i}>
              Tentativa {i + 1} · {formatarDataHora(q.em)} · {q.acertos} de 11 · críticas {q.criticasOk ? 'corretas' : 'com erro'} · olho{' '}
              {q.olhoConfere === null ? 'não informado' : q.olhoConfere ? 'confere com a agenda' : 'NÃO confere com a agenda'} ·{' '}
              <strong>{q.aprovado ? 'aprovado' : 'não aprovado'}</strong>
              {q.quemInstila ? ` · quem instila: ${q.quemInstila.eu ? 'o próprio paciente' : q.quemInstila.nome ?? 'outra pessoa'}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>Quiz não respondido.</p>
      )}
      {v.materiais.contatoHumano && (
        <p>
          <strong>Contato humano necessário:</strong> {MOTIVO_CONTATO[v.materiais.contatoHumano.motivo] ?? v.materiais.contatoHumano.motivo} · desde{' '}
          {formatarDataHora(v.materiais.contatoHumano.desde)}
        </p>
      )}
      <p>
        Avisos à família: {v.avisosFamilia.suspensos ? `SUSPENSOS${v.avisosFamilia.motivoSuspensao ? ` (${v.avisosFamilia.motivoSuspensao})` : ''}` : 'ativos'} ·{' '}
        {v.avisosFamilia.mensagens.length} mensagem(ns) na fila
      </p>

      {ORDEM_MODELOS.map((m: ModeloId) =>
        v.modelos?.[m] ? <BlocoImpresso key={m} modelo={v.modelos[m]} bloco={v.blocos?.[m]} respostas={v.respostas?.[m]} /> : null,
      )}

      <h2>Intercorrências</h2>
      {v.intercorrencias.length === 0 ? (
        <p>Nenhuma intercorrência registrada.</p>
      ) : (
        <ul className="imp-lista">
          {v.intercorrencias.map((i, n) => (
            <li key={n}>
              {formatarDataHora(i.em)} · {i.porNome}: {i.descricao}
            </li>
          ))}
        </ul>
      )}

      <h2>O que falta (no momento da impressão)</h2>
      {v.pendencias.length === 0 ? (
        <p>Nenhuma pendência.</p>
      ) : (
        <ul className="imp-lista">
          {v.pendencias.map(p => (
            <li key={p.id}>
              <span className="imp-marcador">{ROTULO_SEVERIDADE[p.severidade]}</span> {p.descricao} · responsável: {rotulosPapeis(p.responsavel)} · desde{' '}
              {formatarDataHora(p.desde)}
            </li>
          ))}
        </ul>
      )}

      <p className="imp-nota">
        Versões dos modelos usadas neste episódio:{' '}
        {Object.entries(e.versoesModelos ?? {})
          .map(([m, ver]) => `${m} ${ver}`)
          .join(' · ') || 'não informadas'}
        .
      </p>

      <LinhasAssinatura papeis={ASSINATURAS_EPISODIO} titulo="Assinaturas do registro" />
    </Folha>
  )
}

export default function ImpressaoEpisodio() {
  const { id = '' } = useParams()
  useTitulo('Registro do episódio para impressão · OFTA VITTA')
  const [impressoEm] = useState(() => formatarDataHora(new Date().toISOString()))
  const carga = useCarga(() => chamar('episodio.obter', { episodioId: id }), [id])
  return (
    <main className="imp-documento">
      <BarraImpressao voltar={{ para: ROTAS.episodio(id), rotulo: 'Voltar ao episódio' }} />
      {carga.erro ? (
        <div className="imp-folha">
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        </div>
      ) : !carga.dados ? (
        <div className="imp-folha">
          <Carregando />
        </div>
      ) : (
        <Conteudo v={carga.dados} impressoEm={impressoEm} />
      )}
    </main>
  )
}
