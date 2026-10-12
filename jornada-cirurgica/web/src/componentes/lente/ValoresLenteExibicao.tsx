// Exibição de valores de lente que o SERVIDOR enviou (já filtrados pelo papel).
import type { CampoLente, DadosPlanoLente, ValoresLente } from '@dominio/tipos.ts'
import { OLHO_EXTENSO } from '@dominio/tipos.ts'
import { Selo } from '../base/index.tsx'
import { formatarData, formatarDataHora, formatarDioptria, formatarEixo } from '../formato.ts'
import { ROTULO_CAMPO_LENTE } from '../rotulos.ts'

export function ValoresLenteExibicao(props: { valores: ValoresLente & Partial<DadosPlanoLente> & { registradoPor?: string; registradoEm?: string } }) {
  const v = props.valores
  return (
    <dl className="valores-lente">
      <dt>Olho</dt>
      <dd>{OLHO_EXTENSO[v.olho]}</dd>
      <dt>Modelo</dt>
      <dd>{v.modelo}</dd>
      <dt>Dioptria</dt>
      <dd>{formatarDioptria(v.dioptria)}</dd>
      <dt>Tórica</dt>
      <dd>{v.torica ? 'Sim' : 'Não'}</dd>
      {v.torica && (
        <>
          <dt>Cilindro</dt>
          <dd>{formatarDioptria(v.cilindro)}</dd>
          <dt>Eixo</dt>
          <dd>{formatarEixo(v.eixo)}</dd>
        </>
      )}
      {v.reserva !== undefined && (
        <>
          <dt>LIO reserva</dt>
          <dd>{v.reserva ? `${v.reserva.modelo} ${formatarDioptria(v.reserva.dioptria)}` : 'não informada'}</dd>
        </>
      )}
      {v.alvoRefrativo !== undefined && (
        <>
          <dt>Alvo refrativo</dt>
          <dd>{v.alvoRefrativo === null ? 'não informado' : formatarDioptria(v.alvoRefrativo)}</dd>
        </>
      )}
      {v.dataPedido !== undefined && (
        <>
          <dt>Data do pedido</dt>
          <dd>{v.dataPedido ? formatarData(v.dataPedido) : 'não informada'}</dd>
        </>
      )}
      {v.registradoPor && (
        <>
          <dt>Registrado</dt>
          <dd style={{ fontSize: '1rem', fontWeight: 600 }}>
            {v.registradoPor}
            {v.registradoEm ? `, ${formatarDataHora(v.registradoEm)}` : ''}
          </dd>
        </>
      )}
    </dl>
  )
}

export function ResultadoComparacao(props: { titulo: string; resultado: { confere: boolean; camposDivergentes: CampoLente[]; em: string; porNome: string } }) {
  const r = props.resultado
  return (
    <div className={`aviso ${r.confere ? 'ok' : 'perigo'}`} role={r.confere ? 'status' : 'alert'}>
      <strong>
        {props.titulo}: {r.confere ? 'CONFERE' : 'DIVERGE'}
      </strong>
      {!r.confere && (
        <span>
          Campos divergentes:{' '}
          {r.camposDivergentes.map(c => (
            <Selo key={c} tipo="perigo">
              {ROTULO_CAMPO_LENTE[c] ?? c}
            </Selo>
          ))}
        </span>
      )}
      <span className="suave" style={{ display: 'block' }}>
        {r.porNome}, {formatarDataHora(r.em)}
      </span>
    </div>
  )
}
