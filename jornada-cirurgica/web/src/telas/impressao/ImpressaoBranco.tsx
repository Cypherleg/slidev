// Checklists em branco para imprimir (contingência em papel, briefing regra 12).
// /impressao/branco/:modelo   modelo = um ModeloId, 'd0' (os seis blocos do dia da cirurgia) ou 'todos'.
// ?versao=...                 versão específica (só para um modelo); sem ela, a versão ativa.

import { Link, useParams, useSearchParams } from 'react-router'
import type { ModeloChecklist, ModeloId } from '@dominio/tipos.ts'
import { modelosPadrao } from '@dominio/index.ts'
import { ORDEM_MODELOS, ROTULO_PAPEL } from '@dominio/tipos.ts'
import { chamar } from '../../api/cliente.ts'
import { Aviso, Carregando } from '../../componentes/base/index.tsx'
import { ROTAS } from '../../rotas.ts'
import { codigoErro, useCarga, useTitulo } from '../gestao/comum/carga.ts'
import { ErroCarga } from '../gestao/comum/componentes.tsx'
import { ROTULO_MODELO } from '../gestao/comum/rotulos.ts'
import { BarraImpressao, Folha, Linha, LinhasAssinatura } from './componentes.tsx'
import { CabecalhoEmBranco, CampoEmBranco, NotasItem, tituloSecao } from './itens.tsx'
import './impressao.css'

const GRUPOS: Record<string, { rotulo: string; modelos: readonly ModeloId[] }> = {
  todos: { rotulo: 'Todos os checklists', modelos: ORDEM_MODELOS },
  d0: { rotulo: 'Dia da cirurgia (seis blocos)', modelos: ['admissao', 'sign_in', 'anestesia', 'time_out', 'sign_out', 'alta'] },
}

function modelosDaRota(param: string): readonly ModeloId[] {
  if (GRUPOS[param]) return GRUPOS[param].modelos
  return (ORDEM_MODELOS as readonly string[]).includes(param) ? [param as ModeloId] : []
}

function FolhaModeloBranco(props: { modelo: ModeloChecklist; quebraAntes: boolean }) {
  const { modelo } = props
  const papeis = modelo.papeisConclusao.length > 0 ? modelo.papeisConclusao.map(p => ROTULO_PAPEL[p] ?? p) : ['Responsável']
  let n = 0
  return (
    <Folha
      quebraAntes={props.quebraAntes}
      rotulo={modelo.titulo}
      cabecalho={
        <>
          <span>
            <strong>OFTA VITTA</strong> · {modelo.titulo} · versão {modelo.versao}
          </span>
          <span>Paciente: ____________________ Nasc.: ___/___/_____ Olho: ____________</span>
        </>
      }
    >
      <h1>{modelo.titulo}</h1>
      {modelo.descricao && <p>{modelo.descricao}</p>}
      <p className="imp-nota">
        Checklist em branco · versão do modelo {modelo.versao} · fonte: {modelo.fonte}. Item não conferido não é marcado depois; marcação fora de hora leva a hora
        real.
      </p>
      <CabecalhoEmBranco />
      {modelo.exigeLeituraEmVozAlta && (
        <p className="imp-campos-branco" style={{ marginTop: '3mm' }}>
          <strong>Leitura em voz alta:</strong>
          <Linha rotulo="Quem leu" largura="longa" />
          <Linha rotulo="Quem confirmou" largura="longa" />
        </p>
      )}
      <table className="imp-tabela">
        <thead>
          <tr>
            <th className="col-caixa" scope="col">
              Nº
            </th>
            <th scope="col">Item</th>
            <th className="col-registro" scope="col">
              Registro
            </th>
            <th className="col-rubrica" scope="col">
              Rubrica e hora
            </th>
          </tr>
        </thead>
        <tbody>
          {modelo.secoes.map(secao => [
            <tr key={`s-${secao.id}`} className="secao">
              <td colSpan={4}>{tituloSecao(secao)}</td>
            </tr>,
            ...secao.itens.map(item => {
              n += 1
              return (
                <tr key={item.id} data-item={item.id}>
                  <td className="col-caixa">{n}</td>
                  <td>
                    <span className="imp-item-texto">{item.texto}</span>
                    {item.obrigatorio || item.exigidoQuando ? '' : <span className="imp-nota"> (se aplicável)</span>} <NotasItem item={item} />
                  </td>
                  <td>
                    <CampoEmBranco item={item} />
                  </td>
                  <td className="col-rubrica" />
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
      <LinhasAssinatura papeis={papeis} titulo={`Assinaturas: ${modelo.titulo}`} />
    </Folha>
  )
}

export default function ImpressaoBranco() {
  const { modelo: param = '' } = useParams()
  const [busca] = useSearchParams()
  const ids = modelosDaRota(param)
  const versao = ids.length === 1 ? busca.get('versao') || undefined : undefined
  useTitulo('Checklist em branco · OFTA VITTA')

  const carga = useCarga(async () => {
    try {
      return { modelos: await Promise.all(ids.map(id => chamar('modelos.obter', versao ? { id, versao } : { id }))), embutidos: false }
    } catch (e) {
      // Contingência (regra 12): sem servidor, imprime a versão padrão embutida no aplicativo, com aviso.
      // Também sem sessão (expirada ou aparelho sem login): o checklist em branco não tem dado de paciente.
      if (!['indisponivel', 'nao_autenticado', 'mfa_exigido'].includes(codigoErro(e) ?? '')) throw e
      let padrao: ReturnType<typeof modelosPadrao>
      try {
        padrao = modelosPadrao()
      } catch {
        throw e
      }
      return { modelos: ids.map(id => padrao[id]), embutidos: true }
    }
  }, [param, versao])

  const seletor = (
    <nav className="imp-seletor" aria-label="Escolher checklist">
      {[...Object.keys(GRUPOS), ...ORDEM_MODELOS].map(chave => (
        <Link key={chave} to={ROTAS.impressaoBranco(chave)} aria-current={chave === param ? 'page' : undefined}>
          {GRUPOS[chave]?.rotulo ?? ROTULO_MODELO[chave as ModeloId]}
        </Link>
      ))}
    </nav>
  )

  return (
    <main className="imp-documento">
      <BarraImpressao>{seletor}</BarraImpressao>
      {ids.length === 0 ? (
        <div className="imp-folha">
          <p role="alert">Checklist não encontrado. Escolha um modelo acima.</p>
        </div>
      ) : carga.erro ? (
        <div className="imp-folha">
          <ErroCarga erro={carga.erro} onTentar={carga.recarregar} />
        </div>
      ) : !carga.dados ? (
        <div className="imp-folha">
          <Carregando />
        </div>
      ) : (
        <>
          {carga.dados.embutidos && (
            <div className="imp-folha nao-imprimir">
              <Aviso tipo="atencao" titulo="Servidor indisponível ou sem sessão: versão embutida no aplicativo.">
                Estes checklists vêm da versão padrão do POP guardada no aplicativo ({carga.dados.modelos.map(m => m.versao).filter((v, i, a) => a.indexOf(v) === i).join(', ')}). Se a
                gestora publicou versão mais nova, ela pode ser diferente. A versão sai impressa no cabeçalho de cada folha.
              </Aviso>
            </div>
          )}
          {carga.dados.modelos.map((m, i) => (
            <FolhaModeloBranco key={`${m.id}-${m.versao}`} modelo={m} quebraAntes={i > 0} />
          ))}
        </>
      )}
    </main>
  )
}
