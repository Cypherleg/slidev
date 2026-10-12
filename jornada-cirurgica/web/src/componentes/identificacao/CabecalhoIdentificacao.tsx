// Cabeçalho fixo de identificação do episódio (regras 1, 2 e 8 do briefing).
// Dois identificadores sempre visíveis (nome completo e nascimento); olho por extenso e em destaque;
// dots com letra; alertas raros por extenso; homônimo e nome parecido exigem o nome da mãe.
import type { ReactNode } from 'react'
import type { EpisodioVisao } from '@dominio/tipos.ts'
import { ROTULO_ESTADO } from '@dominio/tipos.ts'
import { Dots, OlhoDestaque, Selo } from '../base/index.tsx'
import { formatarData, formatarHora } from '../formato.ts'

export type DadosCabecalho = Pick<EpisodioVisao, 'episodio' | 'paciente' | 'dots' | 'identificacao'>

export function CabecalhoIdentificacao(props: { visao: DadosCabecalho; variante?: 'padrao' | 'sala'; acoes?: ReactNode; linkPrimeiroOlho?: (primeiroEpisodioId: string) => ReactNode }) {
  const { episodio, paciente, dots, identificacao } = props.visao
  const sala = props.variante === 'sala'
  const faltaNomeMae = identificacao.exigeNomeMae && !paciente.nomeMae
  return (
    <header className={`cabecalho-id pilha${sala ? ' sala' : ''}`} aria-label="Identificação do paciente">
      <div className="linha-id" style={{ justifyContent: 'space-between' }}>
        <div className="pilha" style={{ minWidth: 0 }}>
          <p className="nome" data-testid="nome-completo">
            {paciente.nomeCompleto}
          </p>
          <dl>
            <div>
              <dt>Nascimento</dt>
              <dd data-testid="nascimento">
                {formatarData(paciente.dataNascimento)}
                {paciente.idade !== null && paciente.idade !== undefined ? ` (${paciente.idade} anos)` : ''}
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
          {!paciente.conferidoDatasigh && (
            <span>
              <Selo tipo="atencao">NÃO CONFERIDO NO DATASIGH</Selo>
            </span>
          )}
        </div>
        <div className="pilha" style={{ alignItems: 'flex-end' }}>
          <OlhoDestaque olho={episodio.olho} grande={!sala} enorme={sala} />
          {props.acoes}
        </div>
      </div>
      <div className="linha-id">
        <Dots dots={dots} legenda={sala} />
      </div>
      {(identificacao.alertasExtenso.length > 0 || identificacao.homonimoNoDia || identificacao.nomesParecidos.length > 0 || faltaNomeMae) && (
        <div className="alertas-extenso" aria-label="Alertas por extenso">
          {identificacao.alertasExtenso.map(a => (
            <span key={a} className="alerta-extenso">
              {a}
            </span>
          ))}
          {identificacao.homonimoNoDia && !identificacao.alertasExtenso.some(a => a.toUpperCase().includes('HOMÔNIMO')) && (
            <span className="alerta-extenso">HOMÔNIMO NO DIA</span>
          )}
          {identificacao.nomesParecidos.length > 0 && (
            <span className="alerta-extenso">NOME PARECIDO NO DIA: {identificacao.nomesParecidos.map(n => n.nomeCompleto).join('; ')}</span>
          )}
          {identificacao.exigeNomeMae && (
            <span className="alerta-extenso">
              {faltaNomeMae ? 'EXIGE NOME DA MÃE (3º IDENTIFICADOR): NÃO REGISTRADO' : 'CONFERIR NOME DA MÃE (3º IDENTIFICADOR)'}
            </span>
          )}
        </div>
      )}
      {identificacao.segundoOlho && (
        <p style={{ margin: 0 }}>
          {!identificacao.alertasExtenso.some(a => a.includes('2º OLHO')) && (
            <strong>
              2º OLHO
              {identificacao.segundoOlho.dataPrimeiro ? `, 1º operado em ${formatarData(identificacao.segundoOlho.dataPrimeiro)}` : ''}.{' '}
            </strong>
          )}
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
  )
}
