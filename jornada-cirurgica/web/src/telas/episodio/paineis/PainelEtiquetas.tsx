// Etiquetas (briefing §6.4): o painel gera o texto de cada etiqueta, com botão "Copiar" por etiqueta.
// A cópia usa a Clipboard API e fica registrada (`etiqueta.copiada`).
import { useState } from 'react'
import type { Etiqueta } from '@dominio/index.ts'
import { chamar } from '../../../api/cliente.ts'
import { useTratarErro } from '../../../app/erros.tsx'
import { Aviso, Botao, Cartao } from '../../../componentes/base/index.tsx'
import { permissao } from '../../../componentes/permissoes.ts'
import type { PropsPainel } from './comum.tsx'

/** Copia texto para a área de transferência. Usa a Clipboard API; sem ela, tenta o método antigo. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* tenta o método antigo abaixo */
  }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function PainelEtiquetas(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const tratar = useTratarErro()
  const [etiquetas, setEtiquetas] = useState<Etiqueta[] | null>(null)
  const [gerando, setGerando] = useState(false)
  const [copiada, setCopiada] = useState<string | null>(null)
  const [falhou, setFalhou] = useState<string | null>(null)
  const pGerar = permissao(visao, papeis, 'etiquetas.gerar')

  const gerar = async () => {
    setGerando(true)
    try {
      setEtiquetas(await chamar('etiquetas.gerar', { episodioId: visao.episodio.id }))
    } catch (e) {
      tratar(e)
    } finally {
      setGerando(false)
    }
  }

  const copiar = async (et: Etiqueta) => {
    setFalhou(null)
    const ok = await copiarTexto(et.texto)
    if (!ok) {
      setFalhou(et.tipo)
      return
    }
    setCopiada(et.tipo)
    // Registra a cópia (evento do episódio; a visão é recarregada para manter a versão em dia).
    await ctl.executarERecarregar('etiqueta.copiada', { episodioId: visao.episodio.id, versao: visao.episodio.versao, etiqueta: et.tipo })
  }

  return (
    <Cartao titulo="Etiquetas" id="etiquetas">
      <p className="suave" style={{ margin: 0 }}>
        Uma etiqueta por bloco de texto: peito (nome, olho, cirurgia), pulseira, caixa da lente e alertas por extenso. Programa e formato da impressora ainda não definidos: copie e cole no
        programa da impressora.
      </p>
      <div>
        <Botao onClick={() => void gerar()} desabilitado={gerando || !pGerar.permitido} motivo={!pGerar.permitido ? pGerar.motivo : null}>
          {gerando ? 'Gerando…' : etiquetas ? 'Gerar de novo' : 'Gerar etiquetas'}
        </Botao>
      </div>
      {etiquetas?.map(et => (
        <div key={et.tipo} className="pilha">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{et.titulo}</h3>
            <Botao onClick={() => void copiar(et)} rotuloAria={`Copiar etiqueta: ${et.titulo}`} desabilitado={ctl.ocupado !== null}>
              {copiada === et.tipo ? 'Copiado' : 'Copiar'}
            </Botao>
          </div>
          <pre className="texto-etiqueta" aria-label={`Texto da etiqueta ${et.titulo}`}>
            {et.texto}
          </pre>
          {falhou === et.tipo && <Aviso tipo="atencao">Este aparelho não permitiu copiar. Selecione o texto acima e copie manualmente.</Aviso>}
        </div>
      ))}
    </Cartao>
  )
}
