// Lista do dia cirúrgico (briefing §6.5): ordem, horário, paciente, nascimento, olho por extenso, cirurgião, estado,
// dots, alertas por extenso, contadores, homônimo/nome parecido, etapa da lente, avisos suspensos.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { EpisodioResumoDia } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { useTratarErro } from '../../app/erros.tsx'
import { Aviso, Botao, Carregando } from '../../componentes/base/index.tsx'
import { dataComDiaDaSemana, dataValida, hojeLocal, somarDias } from '../../componentes/formato.ts'
import { ROTAS } from '../../rotas.ts'
import { ItemDia, ordenarDia } from './ItemDia.tsx'

export default function ListaDia() {
  const { data: dataParam } = useParams()
  const navegar = useNavigate()
  const tratar = useTratarErro()
  const data = dataValida(dataParam) ? dataParam : hojeLocal()
  const [lista, setLista] = useState<EpisodioResumoDia[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      setLista(ordenarDia(await chamar('dia.lista', { data })))
    } catch (e) {
      setLista([])
      setErro('Não foi possível carregar a lista do dia.')
      tratar(e)
    }
  }, [data, tratar])

  // Recarrega só ao trocar de data.
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar
  useEffect(() => {
    setLista(null)
    void carregarRef.current()
  }, [data])

  const homonimos = lista?.filter(e => e.homonimoOuParecido).length ?? 0
  return (
    <main className="pagina pilha">
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Dia cirúrgico: {dataComDiaDaSemana(data)}</h1>
        <div className="linha nao-imprimir">
          <Botao tipo="secundario" onClick={() => navegar(ROTAS.dia(somarDias(data, -1)))} rotuloAria="Dia anterior">
            Dia anterior
          </Botao>
          <Botao tipo="secundario" onClick={() => navegar(ROTAS.dia(hojeLocal()))}>
            Hoje
          </Botao>
          <Botao tipo="secundario" onClick={() => navegar(ROTAS.dia(somarDias(data, 1)))} rotuloAria="Próximo dia">
            Próximo dia
          </Botao>
          <label className="sr-only" htmlFor="dia-data">
            Escolher data
          </label>
          <input id="dia-data" type="date" className="entrada" style={{ width: 'auto' }} value={data} onChange={e => dataValida(e.target.value) && navegar(ROTAS.dia(e.target.value))} />
          <Botao onClick={() => void carregar()}>Atualizar</Botao>
        </div>
      </div>
      <p className="nao-imprimir" style={{ margin: 0 }}>
        <Link to={ROTAS.vespera(data)}>Resumo do dia para o cirurgião</Link> · <Link to={ROTAS.pendencias}>Pendências</Link> ·{' '}
        <Link to={ROTAS.impressaoBranco('sign_in')}>Checklists em branco (contingência em papel)</Link>
      </p>
      {homonimos > 0 && (
        <Aviso tipo="perigo" titulo={`Homônimo ou nome parecido no dia: ${homonimos} ${homonimos === 1 ? 'episódio' : 'episódios'}`}>
          Terceiro identificador (nome da mãe) em todas as conferências; cirurgias não consecutivas, se possível.
        </Aviso>
      )}
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!lista && <Carregando texto="Carregando a lista do dia…" />}
      {lista && lista.length === 0 && !erro && <p>Nenhuma cirurgia agendada para este dia.</p>}
      {lista && lista.length > 0 && (
        <ol className="lista-dia" aria-label={`Cirurgias de ${dataComDiaDaSemana(data)}`}>
          {lista.map(e => (
            <ItemDia key={e.episodioId} e={e} />
          ))}
        </ol>
      )}
    </main>
  )
}
