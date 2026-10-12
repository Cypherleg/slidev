// Troca rápida de usuário por PIN em aparelho compartilhado (briefing §5; decisão A8).
// Modo 'ator': a marcação passa a sair em nome de quem digitou o PIN (definirAtor).
// Modo 'confirmador': só obtém o token de quem confirmou a leitura em voz alta (Sign In, Time Out),
// sem trocar o usuário que está marcando.
import { useEffect, useMemo, useState } from 'react'
import type { Papel } from '@dominio/tipos.ts'
import { definirAtor } from '../../api/ator.ts'
import { chamar, ErroChamada } from '../../api/cliente.ts'
import { Aviso, Botao, Carregando } from '../base/index.tsx'
import { rotuloPapeis } from '../rotulos.ts'

export interface ResultadoPin {
  token: string
  expiraEm: string
  ator: { id: string; nome: string; papeis: Papel[] }
}

interface MembroAtivo {
  id: string
  nome: string
  papeis: Papel[]
}

export function mensagemErroPin(e: unknown): string {
  if (e instanceof ErroChamada) {
    if (e.codigo === 'limite_taxa') return 'Muitas tentativas. Aguarde alguns minutos ou entre com e-mail e senha.'
    if (e.codigo === 'indisponivel') return 'Sem conexão com o servidor. Siga o checklist em papel se necessário.'
    if (e.codigo === 'mfa_exigido') return 'Este papel exige segundo fator: entre com e-mail, senha e código.'
  }
  return 'PIN não confere (ou a sessão do aparelho expirou). Tente de novo.'
}

export function TrocaPin(props: {
  modo: 'ator' | 'confirmador'
  titulo?: string
  instrucao?: string
  /** Mostrar só quem tem algum destes papéis. */
  papeis?: Papel[]
  excluirIds?: string[]
  aoConcluir: (r: ResultadoPin) => void
  aoCancelar?: () => void
}) {
  const [membros, setMembros] = useState<MembroAtivo[] | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<MembroAtivo | null>(null)
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)
  const papelUnico = props.papeis?.length === 1 ? props.papeis[0] : undefined

  useEffect(() => {
    let vivo = true
    chamar('membros.ativos', papelUnico ? { papel: papelUnico } : {})
      .then(lista => vivo && setMembros(lista))
      .catch((e: unknown) => {
        if (!vivo) return
        setErroLista(e instanceof ErroChamada && e.codigo === 'nao_autenticado' ? 'Sessão do aparelho expirada. Entre de novo.' : 'Não foi possível carregar a lista da equipe.')
      })
    return () => {
      vivo = false
    }
  }, [papelUnico])

  const visiveis = useMemo(() => {
    if (!membros) return []
    return membros
      .filter(m => !props.papeis || props.papeis.some(p => m.papeis.includes(p)))
      .filter(m => !props.excluirIds?.includes(m.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [membros, props.papeis, props.excluirIds])

  const confirmar = async () => {
    if (!selecionado) return
    if (!/^\d{4,8}$/.test(pin)) {
      setErro('Digite o PIN (somente números).')
      return
    }
    setVerificando(true)
    setErro(null)
    try {
      const r = await chamar('ator.pin', { membroId: selecionado.id, pin })
      setPin('')
      if (props.modo === 'ator') definirAtor({ token: r.token, expiraEm: r.expiraEm, id: r.ator.id, nome: r.ator.nome, papeis: r.ator.papeis })
      props.aoConcluir(r)
    } catch (e) {
      setPin('')
      setErro(mensagemErroPin(e))
    } finally {
      setVerificando(false)
    }
  }

  const idPin = `pin-${props.modo}`
  return (
    <div className="pilha troca-pin">
      <h3 style={{ margin: 0 }}>{props.titulo ?? (props.modo === 'ator' ? 'Quem vai marcar agora?' : 'Quem confirmou?')}</h3>
      {props.instrucao && <p style={{ margin: 0 }}>{props.instrucao}</p>}
      {erroLista && <Aviso tipo="perigo">{erroLista}</Aviso>}
      {!membros && !erroLista && <Carregando texto="Carregando a equipe…" />}
      {membros && !selecionado && (
        <div className="opcoes-toque" role="list" aria-label="Membros da equipe">
          {visiveis.length === 0 && <p className="suave">Ninguém disponível com o papel exigido.</p>}
          {visiveis.map(m => (
            <span role="listitem" key={m.id}>
              <button type="button" className="opcao-toque" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '8px 16px' }} onClick={() => setSelecionado(m)}>
                <span>{m.nome}</span>
                <span className="suave" style={{ fontWeight: 400, fontSize: '.85rem' }}>
                  {rotuloPapeis(m.papeis)}
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      {selecionado && (
        <form
          className="pilha"
          autoComplete="off"
          onSubmit={e => {
            e.preventDefault()
            void confirmar()
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{selecionado.nome}</strong> <span className="suave">({rotuloPapeis(selecionado.papeis)})</span>
          </p>
          <div className="campo">
            <label htmlFor={idPin}>PIN de {selecionado.nome}</label>
            <input
              id={idPin}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              autoFocus
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              style={{ maxWidth: 220, fontSize: '1.5rem', letterSpacing: '.3em' }}
            />
          </div>
          {erro && <Aviso tipo="perigo">{erro}</Aviso>}
          <div className="linha">
            <Botao submit desabilitado={verificando || pin.length < 4}>
              {verificando ? 'Verificando…' : 'Confirmar PIN'}
            </Botao>
            <Botao
              tipo="secundario"
              onClick={() => {
                setSelecionado(null)
                setPin('')
                setErro(null)
              }}
            >
              Escolher outra pessoa
            </Botao>
          </div>
        </form>
      )}
      {props.aoCancelar && (
        <div>
          <Botao tipo="secundario" onClick={props.aoCancelar}>
            Cancelar
          </Botao>
        </div>
      )}
    </div>
  )
}
