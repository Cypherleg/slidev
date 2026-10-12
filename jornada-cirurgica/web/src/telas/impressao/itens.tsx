// Itens de checklist para impressão: área em branco por tipo de resposta, marcadores e cabeçalho em branco.

import type { ItemModelo, SecaoModelo } from '@dominio/tipos.ts'
import { Linha, OpcaoCaixa } from './componentes.tsx'

const CONTEXTO: Record<string, string> = {
  homonimo_no_dia: 'houver homônimo ou nome parecido no dia',
  lente_torica: 'a lente for tórica',
  dot_D: 'houver dot D (insulina ou sulfonilureia)',
}

/** Área de registro em branco, conforme o tipo de resposta do item. */
export function CampoEmBranco(props: { item: ItemModelo }) {
  const { item } = props
  switch (item.tipo) {
    case 'confirmacao':
      return <OpcaoCaixa rotulo="Conferido" />
    case 'sim_nao':
      return (
        <span className="imp-campos-branco">
          <OpcaoCaixa rotulo="Sim" />
          <OpcaoCaixa rotulo="Não" />
        </span>
      )
    case 'opcao':
    case 'multipla':
      return (
        <span className="imp-campos-branco">
          {(item.opcoes ?? []).map(o => (
            <OpcaoCaixa key={o.valor} rotulo={o.rotulo} />
          ))}
          {item.tipo === 'multipla' && <span className="imp-nota">(pode marcar mais de uma)</span>}
          {(item.opcoes ?? []).length === 0 && <Linha largura="longa" />}
        </span>
      )
    case 'olho':
      return (
        <span className="imp-campos-branco">
          <OpcaoCaixa rotulo="OLHO DIREITO" />
          <OpcaoCaixa rotulo="OLHO ESQUERDO" />
          {item.permiteNaoSabe && <OpcaoCaixa rotulo="Não sabe" />}
        </span>
      )
    case 'data':
      return <span className="imp-data">____/____/________</span>
    case 'hora':
      return <span className="imp-data">____:____</span>
    case 'numero':
      return <Linha largura="curta" />
    case 'medicamento':
      return (
        <span className="imp-campos-branco">
          <OpcaoCaixa rotulo="Não usa" />
          <OpcaoCaixa rotulo="Usa" />
          <OpcaoCaixa rotulo="Já usou" />
          <Linha rotulo="Nomes" largura="longa" />
          <Linha rotulo="Dose, horário, detalhes" largura="longa" />
        </span>
      )
    case 'alergia':
      return (
        <span className="imp-campos-branco">
          <OpcaoCaixa rotulo="Não" />
          <OpcaoCaixa rotulo="Sim" />
          <Linha rotulo="Reação" largura="longa" />
        </span>
      )
    case 'pessoa':
      return (
        <span className="imp-campos-branco">
          <Linha rotulo="Nome" largura="longa" />
          <Linha rotulo="Parentesco" largura="media" />
          <Linha rotulo="Telefone" largura="media" />
        </span>
      )
    case 'texto':
    default:
      return <Linha largura="longa" />
  }
}

/** Marcadores do item: ALERTA, HARD STOP, pendência do POP e ajuda. */
export function NotasItem(props: { item: ItemModelo; compacto?: boolean }) {
  const { item } = props
  return (
    <>
      {item.alerta && (
        <span className="imp-marcador">
          {item.alerta.nivel === 'alerta' ? 'ALERTA' : 'SINALIZAR'}: {item.alerta.descricao}
        </span>
      )}
      {item.hardStop && <span className="imp-marcador">HARD STOP</span>}
      {item.exigeSim && <span className="imp-marcador">SÓ CONCLUI COM "SIM"</span>}
      {item.exigidoQuando && (
        <span className="imp-nota">
          {' '}
          (obrigatório{'contexto' in item.exigidoQuando ? ` se ${CONTEXTO[item.exigidoQuando.contexto] ?? item.exigidoQuando.contexto}` : ' conforme a resposta anterior'})
        </span>
      )}
      {item.ajuda && !props.compacto && <span className="imp-nota"> {item.ajuda}</span>}
      {item.pendente && !props.compacto && <span className="imp-pendente"> [Pendente no POP: {item.pendente}]</span>}
    </>
  )
}

export function CabecalhoEmBranco() {
  return (
    <section className="imp-identificacao" aria-label="Identificação do paciente (preencher)">
      <div className="imp-campos-branco">
        <Linha rotulo="Paciente (nome completo)" largura="longa" />
        <Linha rotulo="Nascimento" largura="media" />
        <Linha rotulo="Prontuário" largura="media" />
        <Linha rotulo="Nome da mãe (se homônimo ou nome parecido)" largura="longa" />
        <Linha rotulo="Cirurgião" largura="longa" />
        <Linha rotulo="Data" largura="media" />
      </div>
      <div className="imp-olho">
        <small>Olho a operar (por extenso)</small>
        <span className="imp-campos-branco">
          <OpcaoCaixa rotulo="DIREITO" />
          <OpcaoCaixa rotulo="ESQUERDO" />
        </span>
      </div>
    </section>
  )
}

/** 'A. Identificação' sem repetir a letra quando o título já a traz (ex.: 'A. Identificação e cirurgia'). */
export function tituloSecao(secao: Pick<SecaoModelo, 'id' | 'titulo'>): string {
  const t = secao.titulo.trim()
  const prefixo = new RegExp(`^${secao.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.)\\s:—-]`, 'i')
  return prefixo.test(t) ? t : `${secao.id}. ${t}`
}
