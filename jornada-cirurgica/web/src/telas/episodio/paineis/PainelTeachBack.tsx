// Teach-back das orientações (POP §6): "Quero ter certeza de que EU expliquei bem."
import { useState } from 'react'
import { Botao, Campo, Cartao, EscolhaUnica } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import { ROTULO_TEACH_BACK } from '../../../componentes/rotulos.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

type Resultado = keyof typeof ROTULO_TEACH_BACK

export function PainelTeachBack(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [obs, setObs] = useState('')
  const p = permissao(visao, papeis, 'orientacoes.teach_back')
  const encerrado = motivoEncerrado(visao)
  const tb = visao.teachBack
  return (
    <Cartao titulo="Revisão das orientações (teach-back)" id="teach-back">
      <p style={{ margin: 0 }}>
        Abertura: <em>"Quero ter certeza de que eu expliquei bem. Me conte com suas palavras:"</em>
      </p>
      <ol className="lista-simples">
        <li>"Como o senhor vai pingar os colírios em casa, e em qual olho?"</li>
        <li>"O que o senhor vai fazer com os seus remédios até o dia da cirurgia?"</li>
        <li>"Em que situação o senhor liga para nós antes de vir?"</li>
      </ol>
      {tb && (
        <p className={`aviso ${tb.resultado === 'inadequado' ? 'perigo' : 'ok'}`} style={{ margin: 0 }}>
          <strong>Registrado: {ROTULO_TEACH_BACK[tb.resultado]}</strong>
          {tb.observacao ? ` · ${tb.observacao}` : ''}
          <span className="suave" style={{ display: 'block' }}>
            {tb.porNome}, {formatarDataHora(tb.em)}
          </span>
        </p>
      )}
      <form
        className="pilha"
        onSubmit={async e => {
          e.preventDefault()
          if (!resultado) return
          if (await ctl.executar('orientacoes.teach_back', { resultado, observacao: obs.trim() || null }, 'Teach-back registrado')) {
            setResultado(null)
            setObs('')
          }
        }}
      >
        <EscolhaUnica
          rotulo={tb ? 'Registrar nova revisão' : 'Resultado'}
          nome="teach-back"
          opcoes={(Object.keys(ROTULO_TEACH_BACK) as Resultado[]).map(v => ({ valor: v, rotulo: ROTULO_TEACH_BACK[v] }))}
          valor={resultado}
          aoMudar={setResultado}
          desabilitado={!p.permitido || Boolean(encerrado)}
        />
        <Campo rotulo="O que foi reorientado (opcional)" id="teach-back-obs">
          <input id="teach-back-obs" type="text" value={obs} onChange={e => setObs(e.target.value)} disabled={!p.permitido || Boolean(encerrado)} />
        </Campo>
        <div>
          <Botao submit desabilitado={!resultado || !p.permitido || Boolean(encerrado) || ctl.ocupado !== null} motivo={!p.permitido ? p.motivo : encerrado}>
            Registrar teach-back
          </Botao>
        </div>
      </form>
    </Cartao>
  )
}
