// Agenda da cirurgia: data, horário e ordem na lista do dia (episodio.agendar).
import { useEffect, useState } from 'react'
import { Botao, Campo, Cartao } from '../../../componentes/base/index.tsx'
import { formatarData, formatarHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

export function PainelAgenda(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const ep = visao.episodio
  const [data, setData] = useState(ep.dataCirurgia ?? ep.dataSugerida ?? '')
  const [horario, setHorario] = useState(ep.horario ?? '')
  const [ordem, setOrdem] = useState(ep.ordem ? String(ep.ordem) : '')
  useEffect(() => {
    setData(ep.dataCirurgia ?? ep.dataSugerida ?? '')
    setHorario(ep.horario ?? '')
    setOrdem(ep.ordem ? String(ep.ordem) : '')
  }, [ep.dataCirurgia, ep.dataSugerida, ep.horario, ep.ordem])
  const p = permissao(visao, papeis, 'episodio.agendar')
  const encerrado = motivoEncerrado(visao)
  const bloqueado = !p.permitido || Boolean(encerrado)
  const ordemNum = ordem.trim() === '' ? null : Number(ordem)
  const ordemValida = ordemNum === null || (Number.isInteger(ordemNum) && ordemNum > 0)
  return (
    <Cartao titulo="Agenda da cirurgia" id="agenda">
      <p style={{ margin: 0 }}>
        Data sugerida no D-7: <strong>{ep.dataSugerida ? formatarData(ep.dataSugerida) : 'não informada'}</strong> · Agendada:{' '}
        <strong>
          {ep.dataCirurgia ? formatarData(ep.dataCirurgia) : 'sem data'}
          {ep.horario ? ` às ${formatarHora(ep.horario)}` : ''}
          {ep.ordem ? `, ${ep.ordem}º da lista` : ''}
        </strong>
      </p>
      <form
        className="grade-2"
        onSubmit={e => {
          e.preventDefault()
          if (!ordemValida) return
          void ctl.executar('episodio.agendar', { dataCirurgia: data || null, horario: horario || null, ordem: ordemNum }, 'Agenda atualizada')
        }}
      >
        <Campo rotulo="Data da cirurgia" id="agenda-data">
          <input id="agenda-data" type="date" value={data} onChange={e => setData(e.target.value)} disabled={bloqueado} />
        </Campo>
        <Campo rotulo="Horário" id="agenda-horario">
          <input id="agenda-horario" type="time" value={horario} onChange={e => setHorario(e.target.value)} disabled={bloqueado} />
        </Campo>
        <Campo rotulo="Ordem na lista do dia" id="agenda-ordem" erro={ordemValida ? null : 'Ordem deve ser um número inteiro positivo.'}>
          <input id="agenda-ordem" type="text" inputMode="numeric" value={ordem} onChange={e => setOrdem(e.target.value.replace(/\D/g, ''))} disabled={bloqueado} />
        </Campo>
        <div style={{ alignSelf: 'end' }}>
          <Botao submit desabilitado={bloqueado || !ordemValida || ctl.ocupado !== null} motivo={!p.permitido ? p.motivo : encerrado}>
            Salvar agenda
          </Botao>
        </div>
      </form>
    </Cartao>
  )
}
