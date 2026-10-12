// Leitura da LIO no Time Out (POP §3, checkpoint 3): a circulante lê DA CAIXA, em voz alta, e digita na hora.
// Formulário vazio: não mostra o plano. O servidor compara com as duas conferências.
import { useState } from 'react'
import type { LeituraTimeOut } from '@dominio/index.ts'
import { Aviso, Botao } from '../base/index.tsx'
import type { EstadoLente } from './CamposLente.tsx'
import { CamposLente, estadoLenteVazio, lerEstadoLente, resumoValores } from './CamposLente.tsx'

export function FormularioLeituraTimeOut(props: { desabilitado?: boolean; motivo?: string | null; aoEnviar: (leitura: LeituraTimeOut) => Promise<boolean> }) {
  const [estado, setEstado] = useState<EstadoLente>(estadoLenteVazio)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const leitura = lerEstadoLente(estado, false)

  const enviar = async () => {
    setTentou(true)
    if (!leitura.valores) return
    setEnviando(true)
    try {
      const v = leitura.valores
      const ok = await props.aoEnviar({ modelo: v.modelo, dioptria: v.dioptria, cilindro: v.torica ? v.cilindro : null, eixo: v.torica ? v.eixo : null })
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
      aria-labelledby="leitura-to-titulo"
      autoComplete="off"
      onSubmit={e => {
        e.preventDefault()
        void enviar()
      }}
    >
      <h3 id="leitura-to-titulo">Leitura da LIO da caixa (Time Out)</h3>
      <Aviso tipo="info" titulo="A circulante lê da CAIXA, em voz alta: nome na etiqueta, modelo, dioptria com sinal, cilindro e eixo.">
        O cirurgião confirma olhando a biometria original e repete modelo e dioptria (read-back). Digite o que foi lido; a tela não mostra o plano. Diferença: a cirurgia não começa.
      </Aviso>
      <CamposLente
        idPrefixo="leitura-to"
        estado={estado}
        aoMudar={parcial => setEstado(e => ({ ...e, ...parcial }))}
        erros={tentou ? leitura.erros : {}}
        desabilitado={props.desabilitado || enviando}
        mostrarOlho={false}
        rotuloModelo="Modelo lido da caixa"
      />
      {leitura.valores && (
        <p className="aviso info" style={{ margin: 0 }}>
          <strong>Lido:</strong> {resumoValores(leitura.valores, false)}
        </p>
      )}
      <div>
        <Botao submit grande desabilitado={props.desabilitado || enviando} motivo={props.desabilitado ? props.motivo : null} id="leitura-to-enviar">
          {enviando ? 'Registrando…' : 'Registrar leitura da caixa'}
        </Botao>
      </div>
    </form>
  )
}
