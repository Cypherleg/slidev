// Aba D-2 (segunda conferente): confirmações do D-2, TCLE, observações (itens do modelo d2), etiquetas.
import { Link } from 'react-router'
import { Cartao, Selo } from '../../componentes/base/index.tsx'
import { ROTULO_ETAPA_LENTE } from '../../componentes/rotulos.ts'
import { ROTAS } from '../../rotas.ts'
import type { PropsPainel } from './paineis/comum.tsx'
import { ChecklistDoBloco } from './paineis/comum.tsx'
import { PainelEtiquetas } from './paineis/PainelEtiquetas.tsx'
import { PainelTcle } from './paineis/PainelTcle.tsx'

export function AbaD2(props: PropsPainel) {
  const { visao } = props
  return (
    <div className="pilha">
      <Cartao titulo="Lente: checkpoint 2">
        <p style={{ margin: 0 }}>
          Situação: <Selo tipo={visao.lente.etapa === 'quarentena' ? 'perigo' : 'neutro'}>{ROTULO_ETAPA_LENTE[visao.lente.etapa]}</Selo>{' '}
          <Link to={ROTAS.episodio(visao.episodio.id, 'lente')}>Abrir a conferência da lente</Link>
        </p>
      </Cartao>
      <Cartao titulo="Confirmações do D-2" id="checklist-d2">
        <p style={{ margin: 0 }}>Ligação de confirmação: presença, acompanhante ("quem vem com o senhor?"), uso dos colírios, olho vermelho e mudança de medicação. O painel registra quem ligou.</p>
        <ChecklistDoBloco {...props} modelo="d2" rotuloConcluir="Concluir D-2" />
      </Cartao>
      <PainelTcle {...props} />
      <PainelEtiquetas {...props} />
    </div>
  )
}
