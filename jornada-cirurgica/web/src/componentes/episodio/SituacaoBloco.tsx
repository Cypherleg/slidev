// Situação de um bloco (texto, nunca só cor) e quem concluiu.
import type { BlocoVisao } from '@dominio/tipos.ts'
import { Selo } from '../base/index.tsx'
import { formatarDataHora } from '../formato.ts'
import { ROTULO_SITUACAO_BLOCO } from '../rotulos.ts'

export function SeloSituacao(props: { bloco: BlocoVisao }) {
  const s = props.bloco.situacao
  const tipo = s === 'concluido' ? 'ok' : s === 'bloqueado' ? 'perigo' : s === 'em_andamento' ? 'info' : 'neutro'
  return <Selo tipo={tipo}>{ROTULO_SITUACAO_BLOCO[s] ?? s}</Selo>
}

export function ConclusaoBloco(props: { bloco: BlocoVisao }) {
  const c = props.bloco.concluido
  if (!c) return null
  return (
    <p style={{ margin: 0 }}>
      Concluído por <strong>{c.porNome}</strong> em {formatarDataHora(c.em)}
      {c.leitorNome ? `; leu em voz alta: ${c.leitorNome}` : ''}
      {c.confirmadorNome ? `; confirmou: ${c.confirmadorNome}` : ''}
      {c.foraDeHora && (
        <>
          {' '}
          <Selo tipo="atencao">FORA DE HORA</Selo>
        </>
      )}
    </p>
  )
}
