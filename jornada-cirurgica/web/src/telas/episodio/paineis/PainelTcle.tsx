// TCLE: o painel guarda o link e o status, marcado por uma pessoa (briefing §6.2).
import { useState } from 'react'
import type { StatusTcle } from '@dominio/tipos.ts'
import { Botao, Campo, Cartao, Selo } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import { ROTULO_TCLE } from '../../../componentes/rotulos.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

function linkSeguro(link: string | null | undefined): string | null {
  if (!link) return null
  try {
    const u = new URL(link)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function PainelTcle(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const tcle = visao.tcle
  const [link, setLink] = useState(tcle.link ?? '')
  const p = permissao(visao, papeis, 'tcle.status')
  const encerrado = motivoEncerrado(visao)
  const bloqueado = !p.permitido || Boolean(encerrado) || ctl.ocupado !== null
  const marcar = (status: Exclude<StatusTcle, 'nao_enviado'>) =>
    void ctl.executar('tcle.status', { status, link: link.trim() || tcle.link || null }, `TCLE: ${ROTULO_TCLE[status].toLowerCase()}`)
  const href = linkSeguro(tcle.link)
  return (
    <Cartao titulo="TCLE (termo de consentimento)" id="tcle">
      <p style={{ margin: 0 }}>
        Situação:{' '}
        <Selo tipo={tcle.status === 'olho_conferido' ? 'ok' : tcle.status === 'nao_enviado' ? 'perigo' : 'atencao'}>{ROTULO_TCLE[tcle.status] ?? tcle.status}</Selo>
      </p>
      {href && (
        <p style={{ margin: 0 }}>
          Link:{' '}
          <a href={href} target="_blank" rel="noopener noreferrer">
            abrir o TCLE
          </a>
        </p>
      )}
      <p className="suave" style={{ margin: 0 }}>
        Um TCLE por olho e por cirurgia: o termo do 1º olho não cobre o 2º. Confira o olho do TCLE contra a agenda.
      </p>
      <Campo rotulo="Link do TCLE (plataforma de assinatura)" id="tcle-link">
        <input id="tcle-link" type="url" autoComplete="off" value={link} onChange={e => setLink(e.target.value)} disabled={bloqueado} placeholder="https://" />
      </Campo>
      <div className="linha">
        <Botao pequeno tipo="secundario" desabilitado={bloqueado} onClick={() => marcar('enviado')}>
          Marcar como enviado
        </Botao>
        <Botao pequeno tipo="secundario" desabilitado={bloqueado} onClick={() => marcar('assinado')}>
          Marcar como assinado
        </Botao>
        <Botao pequeno desabilitado={bloqueado} onClick={() => marcar('olho_conferido')}>
          Assinado e olho do TCLE = olho da agenda
        </Botao>
      </div>
      {!p.permitido && <p className="motivo-bloqueio">{p.motivo}</p>}
      {tcle.historico.length > 0 && (
        <details>
          <summary>Histórico do TCLE ({tcle.historico.length})</summary>
          <ul className="lista-simples">
            {tcle.historico.map((h, i) => (
              <li key={`${h.em}-${i}`}>
                {ROTULO_TCLE[h.status] ?? h.status}: {h.porNome}, {formatarDataHora(h.em)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Cartao>
  )
}
