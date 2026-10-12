// Validação mínima de um modelo de checklist antes de publicar (o servidor valida de novo).
// Confere estrutura e valores fechados; não julga o conteúdo clínico.

import type { ModeloChecklist, ModeloId, TipoResposta } from '@dominio/tipos.ts'
import { ORDEM_MODELOS, PAPEIS } from '@dominio/tipos.ts'

const TIPOS: readonly TipoResposta[] = ['confirmacao', 'sim_nao', 'opcao', 'multipla', 'texto', 'data', 'hora', 'numero', 'olho', 'medicamento', 'alergia', 'pessoa']
const NIVEIS = ['alerta', 'sinalizado']
const CAMPOS_PESSOA = ['nome', 'parentesco', 'telefone', 'observacao']
const CONTEXTOS = ['homonimo_no_dia', 'lente_torica', 'dot_D']

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const ehTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function conferirPapeis(v: unknown, onde: string, erros: string[]) {
  if (!Array.isArray(v) || v.length === 0) {
    erros.push(`${onde}: informe pelo menos um papel.`)
    return
  }
  const invalidos = v.filter(p => !(PAPEIS as readonly unknown[]).includes(p))
  if (invalidos.length) erros.push(`${onde}: papel desconhecido (${invalidos.map(String).join(', ')}). Válidos: ${PAPEIS.join(', ')}.`)
}

export interface ResultadoValidacao {
  modelo: ModeloChecklist | null
  erros: string[]
}

export function validarModelo(texto: string): ResultadoValidacao {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { modelo: null, erros: ['O texto não é um JSON válido. Confira vírgulas, aspas e chaves.'] }
  }
  if (!ehObj(bruto)) return { modelo: null, erros: ['O conteúdo deve ser um objeto JSON com o modelo.'] }
  const m = bruto
  const erros: string[] = []

  if (!(ORDEM_MODELOS as readonly unknown[]).includes(m.id)) erros.push(`"id": deve ser um destes: ${ORDEM_MODELOS.join(', ')}.`)
  // A versão é atribuída pelo servidor ao publicar (a seguinte à última); o campo, se vier, é ignorado.
  if (m.versao !== undefined && typeof m.versao !== 'string') erros.push('"versao": se informada, deve ser texto (o servidor atribui a nova versão).')
  if (!ehTexto(m.titulo)) erros.push('"titulo": obrigatório.')
  if (!ehTexto(m.fonte)) erros.push('"fonte": obrigatória (referência no POP).')
  if (m.descricao !== undefined && typeof m.descricao !== 'string') erros.push('"descricao": deve ser texto.')
  if (m.exigeLeituraEmVozAlta !== undefined && typeof m.exigeLeituraEmVozAlta !== 'boolean') erros.push('"exigeLeituraEmVozAlta": deve ser true ou false.')
  conferirPapeis(m.papeisConclusao, '"papeisConclusao"', erros)

  const idsItens = new Set<string>()
  const dependencias: { onde: string; ids: unknown }[] = []
  if (!Array.isArray(m.secoes) || m.secoes.length === 0) {
    erros.push('"secoes": informe pelo menos uma seção.')
  } else {
    const idsSecoes = new Set<string>()
    m.secoes.forEach((s: unknown, i: number) => {
      const onde = `Seção ${i + 1}`
      if (!ehObj(s)) {
        erros.push(`${onde}: deve ser um objeto.`)
        return
      }
      if (!ehTexto(s.id)) erros.push(`${onde}: "id" obrigatório.`)
      else if (idsSecoes.has(s.id)) erros.push(`${onde}: "id" repetido (${s.id}).`)
      else idsSecoes.add(s.id)
      if (!ehTexto(s.titulo)) erros.push(`${onde}: "titulo" obrigatório.`)
      if (!Array.isArray(s.itens) || s.itens.length === 0) {
        erros.push(`${onde}: "itens" deve ter pelo menos um item.`)
        return
      }
      s.itens.forEach((it: unknown, j: number) => {
        const ondeItem = `${onde}, item ${j + 1}${ehObj(it) && ehTexto(it.id) ? ` (${it.id})` : ''}`
        if (!ehObj(it)) {
          erros.push(`${ondeItem}: deve ser um objeto.`)
          return
        }
        if (!ehTexto(it.id)) erros.push(`${ondeItem}: "id" obrigatório.`)
        else if (idsItens.has(it.id)) erros.push(`${ondeItem}: "id" repetido no modelo.`)
        else idsItens.add(it.id)
        if (!ehTexto(it.texto)) erros.push(`${ondeItem}: "texto" obrigatório.`)
        if (!(TIPOS as readonly unknown[]).includes(it.tipo)) erros.push(`${ondeItem}: "tipo" deve ser um destes: ${TIPOS.join(', ')}.`)
        if (it.tipo === 'opcao' || it.tipo === 'multipla') {
          if (!Array.isArray(it.opcoes) || it.opcoes.length === 0) erros.push(`${ondeItem}: "opcoes" obrigatório para o tipo ${String(it.tipo)}.`)
          else {
            const valores = new Set<string>()
            it.opcoes.forEach((o: unknown, k: number) => {
              if (!ehObj(o) || !ehTexto(o.valor) || !ehTexto(o.rotulo)) erros.push(`${ondeItem}: opção ${k + 1} precisa de "valor" e "rotulo".`)
              else if (valores.has(o.valor)) erros.push(`${ondeItem}: opção com "valor" repetido (${o.valor}).`)
              else valores.add(o.valor)
            })
          }
        }
        if (typeof it.obrigatorio !== 'boolean') erros.push(`${ondeItem}: "obrigatorio" deve ser true ou false.`)
        conferirPapeis(it.papeis, `${ondeItem}: "papeis"`, erros)
        if (!ehTexto(it.fonte)) erros.push(`${ondeItem}: "fonte" obrigatória.`)
        if (it.alerta !== undefined && (!ehObj(it.alerta) || !ehTexto(it.alerta.descricao) || !NIVEIS.includes(it.alerta.nivel as string))) {
          erros.push(`${ondeItem}: "alerta" precisa de "descricao" e "nivel" (alerta ou sinalizado).`)
        }
        if (it.hardStop !== undefined && !(typeof it.hardStop === 'string' && /^HS[0-9A-Z_]*$/.test(it.hardStop))) erros.push(`${ondeItem}: "hardStop" deve ser um código de hard stop (ex.: HS5_TCLE).`)
        for (const campo of ['ajuda', 'pendente'] as const) {
          if (it[campo] !== undefined && typeof it[campo] !== 'string') erros.push(`${ondeItem}: "${campo}" deve ser texto.`)
        }
        for (const campo of ['permiteNaoSabe', 'exigeSim'] as const) {
          if (it[campo] !== undefined && typeof it[campo] !== 'boolean') erros.push(`${ondeItem}: "${campo}" deve ser true ou false.`)
        }
        if (it.foraDeHoraApos !== undefined && !(ORDEM_MODELOS as readonly unknown[]).includes(it.foraDeHoraApos)) erros.push(`${ondeItem}: "foraDeHoraApos" deve ser um id de modelo.`)
        if (it.exigeBlocosConcluidos !== undefined && (!Array.isArray(it.exigeBlocosConcluidos) || it.exigeBlocosConcluidos.some(x => !(ORDEM_MODELOS as readonly unknown[]).includes(x))))
          erros.push(`${ondeItem}: "exigeBlocosConcluidos" deve ser uma lista de ids de modelo.`)
        if (it.camposPessoa !== undefined && (!Array.isArray(it.camposPessoa) || it.camposPessoa.some(x => !CAMPOS_PESSOA.includes(x as string))))
          erros.push(`${ondeItem}: "camposPessoa" aceita ${CAMPOS_PESSOA.join(', ')}.`)
        if (it.exigidoQuando !== undefined) {
          const c = it.exigidoQuando
          if (ehObj(c) && 'itemId' in c) {
            if (!ehTexto(c.itemId) || !Array.isArray(c.valores)) erros.push(`${ondeItem}: "exigidoQuando" precisa de "itemId" e "valores".`)
            else dependencias.push({ onde: `${ondeItem} (exigidoQuando)`, ids: [c.itemId] })
          } else if (!(ehObj(c) && CONTEXTOS.includes(c.contexto as string))) erros.push(`${ondeItem}: "exigidoQuando" inválido (use itemId e valores, ou contexto: ${CONTEXTOS.join(', ')}).`)
        }
        if (it.depoisDe !== undefined) dependencias.push({ onde: ondeItem, ids: it.depoisDe })
      })
    })
  }
  for (const d of dependencias) {
    if (!Array.isArray(d.ids) || d.ids.some(x => typeof x !== 'string')) erros.push(`${d.onde}: deve citar ids de itens.`)
    else {
      const faltam = d.ids.filter(x => !idsItens.has(x))
      if (faltam.length) erros.push(`${d.onde}: cita item inexistente (${faltam.join(', ')}).`)
    }
  }
  return erros.length ? { modelo: null, erros } : { modelo: m as unknown as ModeloChecklist, erros: [] }
}

export function ehModeloId(v: string): v is ModeloId {
  return (ORDEM_MODELOS as readonly string[]).includes(v)
}
