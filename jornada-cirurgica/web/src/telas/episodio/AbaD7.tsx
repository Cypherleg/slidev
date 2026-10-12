// Aba D-7 (concierge): agenda, checklist POP §1 (A a G), alertas, contatos, teach-back, TCLE, concluir D-7, materiais.
import { Cartao } from '../../componentes/base/index.tsx'
import type { PropsPainel } from './paineis/comum.tsx'
import { ChecklistDoBloco, ConcluirBloco } from './paineis/comum.tsx'
import { PainelAgenda } from './paineis/PainelAgenda.tsx'
import { PainelAlertas } from './paineis/PainelAlertas.tsx'
import { PainelContatos } from './paineis/PainelContatos.tsx'
import { PainelMateriais } from './paineis/PainelMateriais.tsx'
import { PainelTcle } from './paineis/PainelTcle.tsx'
import { PainelTeachBack } from './paineis/PainelTeachBack.tsx'

export function AbaD7(props: PropsPainel) {
  const { visao } = props
  const d7Concluido = visao.blocos.d7?.situacao === 'concluido'
  return (
    <div className="pilha">
      <PainelAgenda {...props} />
      <Cartao titulo="Checklist da concierge (D-7)" id="checklist-d7">
        <p style={{ margin: 0 }}>
          A concierge coleta e sinaliza; não decide conduta. Nenhum campo fica em branco: "não" e "nenhuma conhecida" são respostas escritas. Peça caixas, receitas ou foto dos remédios e
          pergunte pelo nome comercial.
        </p>
        <ChecklistDoBloco {...props} modelo="d7" semConcluir />
      </Cartao>
      <PainelAlertas {...props} />
      <PainelContatos {...props} />
      <PainelTeachBack {...props} />
      <PainelTcle {...props} />
      <Cartao titulo="Fechamento do D-7" id="concluir-d7">
        <ConcluirBloco {...props} modelo="d7" rotuloConcluir="Concluir D-7" />
        {d7Concluido && <p style={{ margin: 0 }}>D-7 concluído. Confira abaixo o pacote de materiais antes de enviar.</p>}
      </Cartao>
      <PainelMateriais {...props} destacar={d7Concluido && visao.materiais.enviados.length === 0} />
    </div>
  )
}
