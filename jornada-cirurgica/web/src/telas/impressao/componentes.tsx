// Peças comuns da impressão (contingência em papel, briefing regra 12).

import type { ReactNode } from 'react'
import { Link } from 'react-router'

export const LEMBRETE_JURIDICO = 'Registro eletrônico em validação jurídica: imprimir e assinar.'

/** Barra de ações (não sai no papel). */
export function BarraImpressao(props: { voltar?: { para: string; rotulo: string }; children?: ReactNode }) {
  return (
    <div className="imp-barra nao-imprimir" role="toolbar" aria-label="Ações de impressão">
      <button type="button" className="botao" onClick={() => window.print()}>
        Imprimir / salvar PDF
      </button>
      {props.voltar && (
        <Link className="botao secundario imp-link-botao" to={props.voltar.para}>
          {props.voltar.rotulo}
        </Link>
      )}
      {props.children}
      <p className="imp-dica">Para gerar o PDF, escolha "Salvar como PDF" na janela de impressão. Papel A4.</p>
    </div>
  )
}

/**
 * Folha A4. O cabeçalho (thead) e o rodapé (tfoot) se repetem em cada página impressa,
 * com a identificação do paciente e o lembrete jurídico.
 */
export function Folha(props: { cabecalho: ReactNode; rodape?: ReactNode; children: ReactNode; quebraAntes?: boolean; rotulo?: string }) {
  return (
    <article className={`imp-folha${props.quebraAntes ? ' imp-quebra' : ''}`} aria-label={props.rotulo}>
      <table className="imp-moldura" role="presentation">
        <thead>
          <tr>
            <td>
              <div className="imp-cabecalho-repetido">{props.cabecalho}</div>
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="imp-rodape">
                {props.rodape}
                <p className="imp-lembrete">{LEMBRETE_JURIDICO}</p>
              </div>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>{props.children}</td>
          </tr>
        </tbody>
      </table>
    </article>
  )
}

/** Caixa para marcar à mão. */
export function Caixa(props: { marcada?: boolean }) {
  return (
    <span className={`imp-caixa${props.marcada ? ' marcada' : ''}`} aria-hidden="true">
      {props.marcada ? 'X' : ''}
    </span>
  )
}

/** Opção com caixa: "[ ] OLHO DIREITO". */
export function OpcaoCaixa(props: { rotulo: string; marcada?: boolean }) {
  return (
    <span className="imp-opcao">
      <Caixa marcada={props.marcada} />
      <span>{props.rotulo}</span>
    </span>
  )
}

/** Linha em branco para escrever. */
export function Linha(props: { rotulo?: string; largura?: 'curta' | 'media' | 'longa' }) {
  return (
    <span className={`imp-linha-campo ${props.largura ?? 'media'}`}>
      {props.rotulo && <span className="imp-linha-rotulo">{props.rotulo}</span>}
      <span className="imp-linha" />
    </span>
  )
}

/** Linhas de assinatura: nome legível, assinatura, data e hora. */
export function LinhasAssinatura(props: { papeis: string[]; titulo?: string }) {
  return (
    <section className="imp-assinaturas" aria-label={props.titulo ?? 'Assinaturas'}>
      <h3>{props.titulo ?? 'Assinaturas'}</h3>
      <div className="imp-assinaturas-grade">
        {props.papeis.map(p => (
          <div key={p} className="imp-assinatura">
            <p className="imp-assinatura-papel">{p}</p>
            <Linha rotulo="Nome legível" largura="longa" />
            <Linha rotulo="Assinatura" largura="longa" />
            <Linha rotulo="Data e hora" largura="media" />
          </div>
        ))}
      </div>
    </section>
  )
}
