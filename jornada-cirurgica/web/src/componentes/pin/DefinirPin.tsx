// O usuário da sessão define ou troca o próprio PIN (6 dígitos, decisão A8).
import { useState } from 'react'
import { chamar, ErroChamada } from '../../api/cliente.ts'
import { Aviso, Botao, Campo } from '../base/index.tsx'

export function DefinirPin(props: { temPin: boolean; aoConcluir?: () => void }) {
  const [atual, setAtual] = useState('')
  const [novo, setNovo] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    setErro(null)
    setOk(false)
    if (!/^\d{6}$/.test(novo)) return setErro('O PIN tem 6 dígitos numéricos.')
    if (/^(\d)\1{5}$/.test(novo) || '0123456789'.includes(novo) || '9876543210'.includes(novo)) return setErro('Escolha um PIN menos previsível (sem sequência nem dígitos repetidos).')
    if (novo !== confirmacao) return setErro('A confirmação não é igual ao PIN novo.')
    if (props.temPin && !/^\d{4,8}$/.test(atual)) return setErro('Digite o PIN atual.')
    setEnviando(true)
    try {
      await chamar('membro.definir_pin', { pinNovo: novo, pinAtual: props.temPin ? atual : null }, { semAtor: true })
      setOk(true)
      setAtual('')
      setNovo('')
      setConfirmacao('')
      props.aoConcluir?.()
    } catch (e) {
      if (e instanceof ErroChamada && e.codigo === 'limite_taxa') setErro('Muitas tentativas. Aguarde alguns minutos.')
      else if (e instanceof ErroChamada && e.codigo === 'validacao') setErro(e.erro.mensagem)
      else setErro('Não foi possível salvar o PIN. Confira o PIN atual e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const so = (f: (v: string) => void) => (e: { target: { value: string } }) => f(e.target.value.replace(/\D/g, '').slice(0, 6))
  return (
    <form
      className="pilha"
      autoComplete="off"
      onSubmit={e => {
        e.preventDefault()
        void enviar()
      }}
    >
      <p style={{ margin: 0 }}>
        O PIN serve para marcar em seu nome num aparelho compartilhado (sala, recepção), sem sair do login de outra pessoa. Não compartilhe o seu PIN.
      </p>
      {props.temPin && (
        <Campo rotulo="PIN atual" id="pin-atual">
          <input id="pin-atual" type="password" inputMode="numeric" autoComplete="off" value={atual} onChange={so(setAtual)} style={{ maxWidth: 220 }} />
        </Campo>
      )}
      <Campo rotulo="PIN novo (6 dígitos)" id="pin-novo">
        <input id="pin-novo" type="password" inputMode="numeric" autoComplete="off" value={novo} onChange={so(setNovo)} style={{ maxWidth: 220 }} />
      </Campo>
      <Campo rotulo="Repita o PIN novo" id="pin-confirmacao">
        <input id="pin-confirmacao" type="password" inputMode="numeric" autoComplete="off" value={confirmacao} onChange={so(setConfirmacao)} style={{ maxWidth: 220 }} />
      </Campo>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">PIN salvo.</Aviso>}
      <div>
        <Botao submit desabilitado={enviando}>
          {enviando ? 'Salvando…' : props.temPin ? 'Trocar PIN' : 'Definir PIN'}
        </Botao>
      </div>
    </form>
  )
}
