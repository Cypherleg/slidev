// Materiais ao paciente: mostra textos e destinatários ANTES de enviar (briefing §6.1 "Fechamento" e §6.2).
// Modo ensaio sempre explícito: a mensagem é montada e registrada, mas não sai.
import { useState } from 'react'
import type { AcoesEquipe } from '@contrato'
import { chamar } from '../../../api/cliente.ts'
import { useTratarErro } from '../../../app/erros.tsx'
import { Aviso, Botao, Cartao, Selo } from '../../../componentes/base/index.tsx'
import { formatarDataHora } from '../../../componentes/formato.ts'
import { permissao } from '../../../componentes/permissoes.ts'
import { ROTULO_ESTADO_MENSAGEM, rotuloGatilho } from '../../../componentes/rotulos.ts'
import type { PropsPainel } from './comum.tsx'
import { motivoEncerrado } from './comum.tsx'

type Previa = AcoesEquipe['materiais.previa']['S']

const ROTULO_CONTATO_HUMANO: Record<string, string> = {
  reprovacao_dupla: 'Reprovação dupla no quiz',
  erro_olho: 'Erro na pergunta do olho',
  link_nao_aberto_d3: 'Link não aberto até D-3',
  teach_back_inadequado: 'Teach-back inadequado',
}

export function PainelMateriais(props: PropsPainel & { destacar?: boolean }) {
  const { visao, ctl, papeis } = props
  const tratar = useTratarErro()
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const pPrevia = permissao(visao, papeis, 'materiais.previa')
  const pEnviar = permissao(visao, papeis, 'materiais.enviar')
  const encerrado = motivoEncerrado(visao)
  const mat = visao.materiais

  const verPrevia = async () => {
    setCarregando(true)
    try {
      setPrevia(await chamar('materiais.previa', { episodioId: visao.episodio.id }))
    } catch (e) {
      tratar(e)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Cartao titulo="Materiais ao paciente (vídeo, orientação, TCLE)" id="materiais" destaque={props.destacar ? 'atencao' : undefined}>
      {props.destacar && <Aviso tipo="atencao">D-7 concluído: confira o pacote de materiais antes de enviar.</Aviso>}
      {mat.contatoHumano && (
        <Aviso tipo="perigo" titulo="Contato humano necessário">
          {ROTULO_CONTATO_HUMANO[mat.contatoHumano.motivo] ?? mat.contatoHumano.motivo}, desde {formatarDataHora(mat.contatoHumano.desde)}. Ligação da concierge ou enfermagem, com teach-back
          oral.
        </Aviso>
      )}
      <dl className="valores-lente" style={{ fontSize: '.95rem' }}>
        <dt>Link do paciente</dt>
        <dd style={{ fontSize: '1rem' }}>{mat.linkCriadoEm ? `criado em ${formatarDataHora(mat.linkCriadoEm)}${mat.linkExpiraEm ? `, válido até ${formatarDataHora(mat.linkExpiraEm)}` : ''}` : 'ainda não criado'}</dd>
        <dt>Abertura</dt>
        <dd style={{ fontSize: '1rem' }}>{mat.abertoEm ? `aberto em ${formatarDataHora(mat.abertoEm)}` : 'não aberto'}</dd>
        <dt>Quiz</dt>
        <dd style={{ fontSize: '1rem' }}>
          {mat.quiz.length === 0
            ? 'sem tentativas'
            : mat.quiz.map((q, i) => (
                <span key={q.em} style={{ display: 'block' }}>
                  {i + 1}ª tentativa, {formatarDataHora(q.em)}: {q.aprovado ? 'APROVADO' : 'REPROVADO'} ({q.acertos} de 11; críticas {q.criticasOk ? 'certas' : 'com erro'}
                  {q.olhoConfere === false ? '; OLHO INFORMADO DIVERGE DA AGENDA' : ''})
                </span>
              ))}
        </dd>
      </dl>
      {mat.enviados.length > 0 && (
        <table className="tabela">
          <caption className="sr-only">Materiais enviados</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Versão</th>
              <th scope="col">Quando</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {mat.enviados.map(e => (
              <tr key={`${e.materialId}-${e.em}`}>
                <td>{e.titulo}</td>
                <td>{e.versao}</td>
                <td>{formatarDataHora(e.em)}</td>
                <td>{ROTULO_ESTADO_MENSAGEM[e.estado] ?? e.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="linha">
        <Botao tipo="secundario" onClick={() => void verPrevia()} desabilitado={carregando || !pPrevia.permitido} motivo={!pPrevia.permitido ? pPrevia.motivo : null}>
          {carregando ? 'Montando…' : previa ? 'Atualizar a prévia' : 'Ver o que será enviado'}
        </Botao>
      </div>
      {previa && (
        <div className="pilha">
          {previa.modoEnvio === 'ensaio' ? (
            <Aviso tipo="atencao" titulo="MODO ENSAIO: nada sai para o paciente">
              As mensagens serão montadas e registradas, mas não serão enviadas pelo WhatsApp. O envio real só é ligado com autorização expressa da direção, depois do piloto.
            </Aviso>
          ) : (
            <Aviso tipo="perigo" titulo="ENVIO REAL">
              As mensagens abaixo serão enviadas pelo WhatsApp aos números indicados.
            </Aviso>
          )}
          {previa.impedimentos.length > 0 && (
            <Aviso tipo="perigo" titulo="Não é possível enviar ainda">
              <ul className="lista-simples">
                {previa.impedimentos.map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Aviso>
          )}
          <h3 style={{ margin: 0 }}>Mensagens ({previa.mensagens.length})</h3>
          {previa.mensagens.length === 0 && <p className="suave">Nenhuma mensagem seria enviada.</p>}
          {previa.mensagens.map((m, i) => (
            <div key={`${m.gatilho}-${i}`} className="cartao" style={{ padding: 12 }}>
              <p style={{ margin: 0 }}>
                <strong>{rotuloGatilho(m.gatilho)}</strong> para <strong>{m.destinoMascarado}</strong>
              </p>
              <p className="texto-mensagem">{m.texto}</p>
            </div>
          ))}
          <h3 style={{ margin: 0 }}>Materiais ({previa.materiais.length})</h3>
          <ul className="lista-simples">
            {previa.materiais.map(m => (
              <li key={m.id}>
                {m.titulo} <Selo tipo="neutro">versão {m.versao}</Selo> <span className="suave">({m.publico}, momento {m.momento})</span>
              </li>
            ))}
          </ul>
          <div>
            <Botao
              grande
              desabilitado={previa.impedimentos.length > 0 || !pEnviar.permitido || Boolean(encerrado) || ctl.ocupado !== null}
              motivo={!pEnviar.permitido ? pEnviar.motivo : previa.impedimentos.length ? 'Resolva os impedimentos acima.' : encerrado}
              onClick={async () => {
                if (await ctl.executar('materiais.enviar', {}, previa.modoEnvio === 'ensaio' ? 'Envio registrado em modo ensaio (não saiu)' : 'Materiais enviados para a fila')) setPrevia(null)
              }}
            >
              {previa.modoEnvio === 'ensaio' ? 'Registrar envio (modo ensaio)' : 'Enviar agora'}
            </Botao>
          </div>
        </div>
      )}
    </Cartao>
  )
}
