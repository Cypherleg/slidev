// Checkpoint 2 da LIO: conferência CEGA (briefing §6.3, regra 7; POP §3).
// O componente não recebe nenhum valor do plano nem do checkpoint 1: começa sempre vazio.
// A comparação é feita no servidor; aqui só se digita a partir da biometria original e da caixa.
import { useState } from 'react'
import type { ValoresLente } from '@dominio/tipos.ts'
import { Aviso, Botao } from '../base/index.tsx'
import type { EstadoLente } from './CamposLente.tsx'
import { CamposLente, estadoLenteVazio, lerEstadoLente, resumoValores } from './CamposLente.tsx'

export function FormularioCego(props: {
  idPrefixo?: string
  desabilitado?: boolean
  motivo?: string | null
  /** Devolve true quando o servidor registrou (o formulário é limpo). */
  aoEnviar: (valores: ValoresLente) => Promise<boolean>
}) {
  const id = props.idPrefixo ?? 'cp2'
  const [estado, setEstado] = useState<EstadoLente>(estadoLenteVazio)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const leitura = lerEstadoLente(estado)

  const enviar = async () => {
    setTentou(true)
    if (!leitura.valores) return
    setEnviando(true)
    try {
      const ok = await props.aoEnviar(leitura.valores)
      if (ok) {
        setEstado(estadoLenteVazio())
        setTentou(false)
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      className="cartao pilha formulario-cego"
      aria-labelledby={`${id}-titulo`}
      autoComplete="off"
      onSubmit={e => {
        e.preventDefault()
        void enviar()
      }}
    >
      <h3 id={`${id}-titulo`}>Checkpoint 2: conferência independente (cega)</h3>
      <Aviso tipo="info" titulo="Comece pela biometria original (ARGOS) e pelo plano assinado; depois a caixa.">
        Você não vê o que foi digitado no checkpoint 1, e ninguém corrige o valor do outro. Leia em voz alta e digite de novo olho, modelo, dioptria (com sinal), cilindro e eixo. O
        sistema compara no servidor; qualquer diferença põe a lente em quarentena e avisa o cirurgião.
      </Aviso>
      <CamposLente
        idPrefixo={id}
        estado={estado}
        aoMudar={parcial => setEstado(e => ({ ...e, ...parcial }))}
        erros={tentou ? leitura.erros : {}}
        desabilitado={props.desabilitado || enviando}
      />
      {leitura.valores && (
        <p className="aviso info" style={{ margin: 0 }}>
          <strong>Confira antes de registrar:</strong> {resumoValores(leitura.valores)}
        </p>
      )}
      <div>
        <Botao submit grande desabilitado={props.desabilitado || enviando} motivo={props.desabilitado ? props.motivo : null} id={`${id}-enviar`}>
          {enviando ? 'Registrando…' : 'Registrar checkpoint 2'}
        </Botao>
      </div>
    </form>
  )
}
