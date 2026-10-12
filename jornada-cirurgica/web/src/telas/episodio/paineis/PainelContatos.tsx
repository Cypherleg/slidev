// Contatos e autorizações (POP §1.E, §8; briefing §6.1 e §7).
// Avisos do dia só para número cadastrado, com anuência registrada e confirmado por resposta do próprio número.
import { useState } from 'react'
import type { Contato, TipoContato } from '@dominio/tipos.ts'
import { Aviso, Botao, Campo, Cartao, Selo } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import { ORDEM_TIPOS_CONTATO, ROTULO_TIPO_CONTATO } from '../../../componentes/rotulos.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

type ContatoForm = Omit<Contato, 'id' | 'confirmadoEm' | 'confirmadoPor'> & { id?: string }

const VAZIO: ContatoForm = { tipo: 'whatsapp_paciente', nome: '', parentesco: '', telefone: '', operaCelular: '', anuenciaPaciente: false }

const PEDE_ANUENCIA: TipoContato[] = ['familiar_avisos', 'whatsapp_paciente', 'acompanhante_titular', 'acompanhante_reserva', 'cuidador_colirios']

export function PainelContatos(props: PropsPainel) {
  const { visao, ctl, papeis } = props
  const [editando, setEditando] = useState<ContatoForm | null>(null)
  const pSalvar = permissao(visao, papeis, 'contato.salvar')
  const pRemover = permissao(visao, papeis, 'contato.remover')
  const pConfirmar = permissao(visao, papeis, 'contato.confirmar')
  const encerrado = motivoEncerrado(visao)
  const faltando = (['whatsapp_paciente', 'acompanhante_titular', 'acompanhante_reserva', 'familiar_avisos', 'emergencia'] as TipoContato[]).filter(
    t => !visao.contatos.some(c => c.tipo === t),
  )
  return (
    <Cartao
      titulo="Contatos e autorizações"
      id="contatos"
      acoes={
        !editando && (
          <Botao pequeno desabilitado={!pSalvar.permitido || Boolean(encerrado)} motivo={!pSalvar.permitido ? pSalvar.motivo : encerrado} onClick={() => setEditando({ ...VAZIO, tipo: faltando[0] ?? 'whatsapp_paciente' })}>
            Adicionar contato
          </Botao>
        )
      }
    >
      {faltando.length > 0 && (
        <Aviso tipo="atencao" titulo="Ainda sem registro">
          {faltando.map(t => ROTULO_TIPO_CONTATO[t]).join('; ')}.
        </Aviso>
      )}
      {editando && (
        <FormularioContato
          inicial={editando}
          ocupado={ctl.ocupado !== null}
          aoCancelar={() => setEditando(null)}
          aoSalvar={async c => {
            const ok = await ctl.executar('contato.salvar', { contato: c }, 'Contato salvo')
            if (ok) setEditando(null)
            return ok
          }}
        />
      )}
      {ORDEM_TIPOS_CONTATO.map(tipo => {
        const lista = visao.contatos.filter(c => c.tipo === tipo)
        if (!lista.length) return null
        return (
          <div key={tipo} className="pilha">
            <h3 style={{ margin: 0 }}>{ROTULO_TIPO_CONTATO[tipo]}</h3>
            {lista.map(c => (
              <div key={c.id} className="cartao pilha" style={{ padding: 12 }}>
                <p style={{ margin: 0 }}>
                  <strong>{c.nome}</strong>
                  {c.parentesco ? ` (${c.parentesco})` : ''}
                  {c.telefone ? ` · ${c.telefone}` : ' · sem telefone'}
                  {c.operaCelular ? ` · quem opera o celular: ${c.operaCelular}` : ''}
                </p>
                <p className="linha" style={{ margin: 0, gap: 6 }}>
                  {c.anuenciaPaciente ? <Selo tipo="ok">Anuência do paciente registrada</Selo> : <Selo tipo="atencao">Sem anuência do paciente</Selo>}
                  {c.confirmadoEm ? (
                    <Selo tipo="ok">Número confirmado por resposta em {formatarDataHora(c.confirmadoEm)}</Selo>
                  ) : (
                    c.telefone && <Selo tipo="atencao">Número ainda não confirmado</Selo>
                  )}
                </p>
                <div className="linha">
                  {!c.confirmadoEm && c.telefone && (
                    <Botao
                      pequeno
                      desabilitado={!pConfirmar.permitido || !c.anuenciaPaciente || Boolean(encerrado) || ctl.ocupado !== null}
                      motivo={!pConfirmar.permitido ? pConfirmar.motivo : !c.anuenciaPaciente ? 'Registre a anuência antes.' : encerrado}
                      onClick={() => void ctl.executar('contato.confirmar', { contatoId: c.id }, 'Confirmação registrada')}
                    >
                      Confirmado por resposta do próprio número
                    </Botao>
                  )}
                  <Botao
                    pequeno
                    tipo="secundario"
                    desabilitado={!pSalvar.permitido || Boolean(encerrado)}
                    onClick={() =>
                      setEditando({ id: c.id, tipo: c.tipo, nome: c.nome, parentesco: c.parentesco ?? '', telefone: c.telefone ?? '', operaCelular: c.operaCelular ?? '', anuenciaPaciente: c.anuenciaPaciente })
                    }
                  >
                    Corrigir
                  </Botao>
                  <Botao
                    pequeno
                    tipo="secundario"
                    desabilitado={!pRemover.permitido || Boolean(encerrado) || ctl.ocupado !== null}
                    onClick={() => {
                      if (window.confirm(`Remover o contato "${c.nome}" deste episódio? O registro anterior continua no histórico.`)) void ctl.executar('contato.remover', { contatoId: c.id }, 'Contato removido')
                    }}
                  >
                    Remover
                  </Botao>
                </div>
              </div>
            ))}
          </div>
        )
      })}
      <p className="suave" style={{ margin: 0 }}>
        "Confirmado por resposta do número": marque somente depois que o próprio número respondeu à mensagem de confirmação. Sem anuência e sem confirmação, nenhum aviso automático sai para
        esse número.
      </p>
    </Cartao>
  )
}

function FormularioContato(props: { inicial: ContatoForm; ocupado: boolean; aoCancelar: () => void; aoSalvar: (c: ContatoForm) => Promise<boolean> }) {
  const [c, setC] = useState<ContatoForm>(props.inicial)
  const [erro, setErro] = useState<string | null>(null)
  const mudar = (p: Partial<ContatoForm>) => setC(x => ({ ...x, ...p }))
  const id = 'contato-form'
  return (
    <form
      className="cartao pilha formulario-cego"
      onSubmit={async e => {
        e.preventDefault()
        setErro(null)
        if (!c.nome.trim()) return setErro('Informe o nome.')
        if (c.tipo !== 'cuidador_colirios' && !(c.telefone ?? '').replace(/\D/g, '')) return setErro('Informe o telefone.')
        if (c.tipo === 'familiar_avisos' && !c.anuenciaPaciente) return setErro('O familiar só recebe avisos com a anuência do paciente registrada.')
        await props.aoSalvar({
          ...c,
          nome: c.nome.trim(),
          parentesco: c.parentesco?.trim() || undefined,
          telefone: c.telefone?.trim() || undefined,
          operaCelular: c.tipo === 'whatsapp_paciente' ? c.operaCelular?.trim() || undefined : undefined,
        })
      }}
    >
      <h3 style={{ margin: 0 }}>{c.id ? 'Corrigir contato' : 'Novo contato'}</h3>
      <Campo rotulo="Tipo" id={`${id}-tipo`}>
        <select id={`${id}-tipo`} value={c.tipo} onChange={e => mudar({ tipo: e.target.value as TipoContato })} disabled={Boolean(c.id)}>
          {ORDEM_TIPOS_CONTATO.map(t => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CONTATO[t]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grade-2">
        <Campo rotulo={c.tipo === 'whatsapp_paciente' ? 'Nome de quem usa este número' : 'Nome'} id={`${id}-nome`} obrigatorio>
          <input id={`${id}-nome`} type="text" autoComplete="off" value={c.nome} onChange={e => mudar({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Parentesco" id={`${id}-parentesco`}>
          <input id={`${id}-parentesco`} type="text" autoComplete="off" value={c.parentesco ?? ''} onChange={e => mudar({ parentesco: e.target.value })} />
        </Campo>
        <Campo rotulo="Telefone (com DDD)" id={`${id}-telefone`}>
          <input id={`${id}-telefone`} type="tel" autoComplete="off" value={c.telefone ?? ''} onChange={e => mudar({ telefone: e.target.value })} />
        </Campo>
        {c.tipo === 'whatsapp_paciente' && (
          <Campo rotulo="Quem opera o celular" id={`${id}-opera`}>
            <input id={`${id}-opera`} type="text" autoComplete="off" value={c.operaCelular ?? ''} onChange={e => mudar({ operaCelular: e.target.value })} />
          </Campo>
        )}
      </div>
      <label className="confirmacao-toque" style={{ alignSelf: 'flex-start' }}>
        <input type="checkbox" checked={c.anuenciaPaciente} onChange={e => mudar({ anuenciaPaciente: e.target.checked })} />
        <span>
          {PEDE_ANUENCIA.includes(c.tipo) && c.tipo === 'familiar_avisos'
            ? 'O paciente autorizou este familiar a receber os avisos do dia da cirurgia'
            : 'O paciente autorizou o contato por este número (anuência registrada)'}
        </span>
      </label>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <div className="linha">
        <Botao submit desabilitado={props.ocupado}>
          Salvar contato
        </Botao>
        <Botao tipo="secundario" onClick={props.aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
