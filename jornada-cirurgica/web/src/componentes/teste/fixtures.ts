// Dados FICTÍCIOS para testes de componente. Nenhum dado real de paciente.
import type { BlocoVisao, EpisodioVisao, ModeloChecklist, ModeloId } from '@dominio/tipos.ts'
import { ORDEM_MODELOS } from '@dominio/tipos.ts'

export function modeloSimples(id: ModeloId, titulo: string): ModeloChecklist {
  return {
    id,
    versao: 'teste/1',
    titulo,
    papeisConclusao: ['concierge'],
    fonte: 'teste',
    secoes: [{ id: 'A', titulo: 'Itens', itens: [{ id: 'A.um', texto: `Item de ${titulo}`, tipo: 'confirmacao', obrigatorio: true, papeis: ['concierge', 'conferente', 'circulante'], fonte: 'teste' }] }],
  }
}

export function blocoVazio(modelo: ModeloId): BlocoVisao {
  return { modelo, situacao: 'disponivel', faltam: [], impedimentos: [] }
}

export function visaoFicticia(parcial?: Partial<EpisodioVisao>): EpisodioVisao {
  const modelos = {} as Record<ModeloId, ModeloChecklist>
  const blocos = {} as Record<ModeloId, BlocoVisao>
  const versoes = {} as Record<ModeloId, string>
  for (const m of ORDEM_MODELOS) {
    modelos[m] = modeloSimples(m, `Modelo ${m}`)
    blocos[m] = blocoVazio(m)
    versoes[m] = 'teste/1'
  }
  const base: EpisodioVisao = {
    episodio: {
      id: 'ep-teste-1',
      olho: 'OE',
      olhoExtenso: 'OLHO ESQUERDO',
      estado: 'd7_concluido',
      tipoCirurgia: 'Cirurgia fictícia de teste',
      tipoLente: 'monofocal',
      dataSugerida: '2026-10-20',
      dataCirurgia: '2026-10-21',
      horario: '07:30',
      ordem: 2,
      cirurgiao: { id: 'cir-teste', nome: 'Dr. Cirurgião Fictício' },
      versao: 7,
      versoesModelos: versoes,
      abertoEm: '2026-10-12T13:00:00Z',
    },
    paciente: {
      id: 'pac-teste',
      nomeCompleto: 'Paciente Teste Alfa da Silva',
      dataNascimento: '1950-03-15',
      nomeMae: null,
      prontuario: 'PRT-0001',
      datasighId: null,
      conferidoDatasigh: true,
      idade: 76,
    },
    modelos,
    respostas: {},
    blocos,
    alertas: [],
    hardStops: [],
    dots: [
      { letra: 'A', cor: 'vermelho', rotulo: 'Alergia', motivo: 'Alergia a látex registrada' },
      { letra: 'I', cor: 'azul', rotulo: 'IFIS', motivo: 'α1-bloqueador em uso' },
    ],
    identificacao: { homonimoNoDia: false, nomesParecidos: [], exigeNomeMae: false, segundoOlho: null, alertasExtenso: [] },
    contatos: [],
    lente: { ciclo: 1, etapa: 'chegada_conferida' },
    tcle: { status: 'enviado', link: null, historico: [] },
    materiais: { enviados: [], quiz: [] },
    avisosFamilia: { suspensos: false, mensagens: [] },
    pendencias: [],
    intercorrencias: [],
    teachBack: null,
    permissoes: {},
  }
  return { ...base, ...parcial }
}
