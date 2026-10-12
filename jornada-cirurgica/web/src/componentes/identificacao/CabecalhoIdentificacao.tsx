// Cabeçalho de identificação do episódio (regras 1, 2 e 8 do briefing).
// Dois identificadores sempre visíveis (nome completo e nascimento); olho por extenso e em destaque;
// dots com letra; alertas raros por extenso; homônimo e nome parecido exigem o nome da mãe.
// O cabeçalho completo fica no topo; ao rolar, uma faixa FIXA enxuta (nome, nascimento, prontuário, OLHO,
// dots, alertas por extenso) aparece no alto da tela, para a identificação nunca sair de vista sem cobrir o tablet.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { EpisodioVisao } from '@dominio/tipos.ts'
import { OLHO_EXTENSO, ROTULO_ESTADO } from '@dominio/tipos.ts'
import { Dots, OlhoDestaque, Selo } from '../base/index.tsx'
import { formatarData, formatarHora } from '../formato.ts'

export type DadosCabecalho = Pick<EpisodioVisao, 'episodio' | 'paciente' | 'dots' | 'identificacao'>

/** Alertas por extenso na ordem de exibição (sem repetir rótulos genéricos que a tela detalha). */
export function alertasPorExtenso(identificacao: DadosCabecalho['identificacao'], nomeMae: string | null): string[] {
  const lista = identificacao.alertasExtenso.filter(a => !(identificacao.nomesParecidos.length > 0 && a.trim().toUpperCase() === 'NOME PARECIDO NO DIA'))
  if (identificacao.homonimoNoDia && !lista.some(a => a.toUpperCase().includes('HOMÔNIMO'))) lista.push('HOMÔNIMO NO DIA')
  if (identificacao.nomesParecidos.length > 0) lista.push(`NOME PARECIDO NO DIA: ${identificacao.nomesParecidos.map(n => n.nomeCompleto).join('; ')}`)
  if (identificacao.exigeNomeMae) lista.push(nomeMae ? 'CONFERIR NOME DA MÃE (3º IDENTIFICADOR)' : 'EXIGE NOME DA MÃE (3º IDENTIFICADOR): NÃO REGISTRADO')
  if (identificacao.segundoOlho && !lista.some(a => a.includes('2º OLHO'))) {
    lista.push(`2º OLHO${identificacao.segundoOlho.dataPrimeiro ? ` — 1º OPERADO EM ${formatarData(identificacao.segundoOlho.dataPrimeiro)}` : ''}`)
  }
  return lista
}

/** true quando o elemento saiu da área visível por cima (rolagem). */
function useForaDeVista(ref: RefObject<HTMLElement | null>): boolean {
  const [fora, setFora] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setFora(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return fora
}

export function CabecalhoIdentificacao(props: {
  visao: DadosCabecalho
  variante?: 'padrao' | 'sala'
  /** Botões (Sala, Imprimir, Atualizar...) exibidos logo abaixo do cabeçalho. */
  acoes?: ReactNode
  linkPrimeiroOlho?: (primeiroEpisodioId: string) => ReactNode
}) {
  const { episodio, paciente, dots, identificacao } = props.visao
  const sala = props.variante === 'sala'
  const alertas = alertasPorExtenso(identificacao, paciente.nomeMae)
  const ref = useRef<HTMLElement | null>(null)
  const fora = useForaDeVista(ref)
  const idade = paciente.idade !== null && paciente.idade !== undefined ? ` (${paciente.idade} anos)` : ''

  return (
    <>
      <header ref={ref} className={`cabecalho-id pilha${sala ? ' sala' : ''}`} aria-label="Identificação do paciente">
        <div className="cabecalho-id-grade">
          <div className="pilha" style={{ minWidth: 0 }}>
            <p className="nome" data-testid="nome-completo">
              {paciente.nomeCompleto}
            </p>
            <dl>
              <div>
                <dt>Nascimento</dt>
                <dd data-testid="nascimento">
                  {formatarData(paciente.dataNascimento)}
                  {idade}
                </dd>
              </div>
              <div>
                <dt>Prontuário</dt>
                <dd>{paciente.prontuario ?? 'não informado'}</dd>
              </div>
              {paciente.nomeMae && (
                <div>
                  <dt>Mãe</dt>
                  <dd>{paciente.nomeMae}</dd>
                </div>
              )}
              <div>
                <dt>Cirurgião</dt>
                <dd>{episodio.cirurgiao.nome}</dd>
              </div>
              <div>
                <dt>Cirurgia</dt>
                <dd>
                  {episodio.dataCirurgia ? formatarData(episodio.dataCirurgia) : episodio.dataSugerida ? `sugerida ${formatarData(episodio.dataSugerida)}` : 'sem data'}
                  {episodio.horario ? ` às ${formatarHora(episodio.horario)}` : ''}
                  {episodio.ordem ? ` · ${episodio.ordem}º da lista` : ''}
                </dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <span className="etiqueta-estado">{ROTULO_ESTADO[episodio.estado] ?? episodio.estado}</span>
                </dd>
              </div>
            </dl>
          </div>
          <div className="cabecalho-id-olho">
            <OlhoDestaque olho={episodio.olho} grande={!sala} enorme={sala} />
          </div>
        </div>
        <div className="linha-id">
          <Dots dots={dots} legenda={sala} />
          {!paciente.conferidoDatasigh && <Selo tipo="atencao">NÃO CONFERIDO NO DATASIGH</Selo>}
        </div>
        {alertas.length > 0 && (
          <div className="alertas-extenso" aria-label="Alertas por extenso">
            {alertas.map(a => (
              <span key={a} className="alerta-extenso">
                {a}
              </span>
            ))}
          </div>
        )}
        {identificacao.segundoOlho && (
          <p style={{ margin: 0 }}>
            {props.linkPrimeiroOlho?.(identificacao.segundoOlho.primeiroEpisodioId)}
            <span className="suave"> Nada da lente do 1º olho é copiado para este episódio.</span>
          </p>
        )}
        {sala && (
          <p className="lembrete-verbalizar" style={{ margin: 0 }}>
            Verbalizar alergias, α-bloqueador e anticoagulação para TODO paciente, mesmo que negativos. Ausência de dot não significa ausência de risco.
          </p>
        )}
      </header>
      {props.acoes && <div className="linha nao-imprimir acoes-cabecalho">{props.acoes}</div>}
      {fora && (
        <div className="faixa-id-fixa nao-imprimir" aria-hidden="true" data-testid="faixa-identificacao">
          <span className="faixa-id-nome">{paciente.nomeCompleto}</span>
          <span>
            Nasc. {formatarData(paciente.dataNascimento)}
            {idade}
          </span>
          {paciente.prontuario && <span>Pront. {paciente.prontuario}</span>}
          <span className="faixa-id-olho">{OLHO_EXTENSO[episodio.olho]}</span>
          {dots.length > 0 && (
            <span className="dots">
              {dots.map(d => (
                <span key={d.letra} className={`dot ${d.cor}`}>
                  {d.letra}
                </span>
              ))}
            </span>
          )}
          {alertas.map(a => (
            <span key={a} className="faixa-id-alerta">
              {a}
            </span>
          ))}
        </div>
      )}
    </>
  )
}
