// Dados FICTÍCIOS para os testes de componente das telas de apoio. Nenhum dado real.

import type { BlocoVisao, EpisodioVisao, ModeloChecklist, ModeloId } from '@dominio/tipos.ts'
import { ORDEM_MODELOS } from '@dominio/tipos.ts'

export function modeloFicticio(id: ModeloId = 'sign_in', versao = 'teste/1'): ModeloChecklist {
  return {
    id,
    versao,
    titulo: `Modelo fictício ${id}`,
    descricao: 'Modelo de teste.',
    papeisConclusao: ['circulante', 'cirurgiao'],
    exigeLeituraEmVozAlta: id === 'sign_in' || id === 'time_out',
    fonte: 'teste',
    secoes: [
      {
        id: 'A',
        titulo: 'Seção A de teste',
        itens: [
          { id: `${id}.A.confirma`, texto: `Item de confirmação ${id}`, tipo: 'confirmacao', obrigatorio: true, papeis: ['circulante'], fonte: 'teste' },
          { id: `${id}.A.simnao`, texto: `Item sim ou não ${id}`, tipo: 'sim_nao', obrigatorio: true, papeis: ['circulante'], fonte: 'teste', alerta: { descricao: 'Sim gera alerta', nivel: 'alerta' } },
          { id: `${id}.A.olho`, texto: `Olho dito pelo paciente ${id}`, tipo: 'olho', permiteNaoSabe: true, obrigatorio: true, papeis: ['circulante'], fonte: 'teste' },
        ],
      },
      {
        id: 'B',
        titulo: 'Seção B de teste',
        itens: [
          {
            id: `${id}.B.opcao`,
            texto: `Item de opção ${id}`,
            tipo: 'opcao',
            opcoes: [
              { valor: 'x', rotulo: 'Opção X' },
              { valor: 'y', rotulo: 'Opção Y' },
            ],
            obrigatorio: true,
            papeis: ['circulante'],
            fonte: 'teste',
            pendente: 'decisão pendente de teste',
          },
          { id: `${id}.B.medicamento`, texto: `Item de medicamento ${id}`, tipo: 'medicamento', obrigatorio: true, papeis: ['circulante'], fonte: 'teste', hardStop: 'HS6_SEM_CONDUTA_ALFA_ANTICOAG' },
          { id: `${id}.B.texto`, texto: `Item de texto ${id}`, tipo: 'texto', obrigatorio: false, papeis: ['circulante'], fonte: 'teste' },
          { id: `${id}.B.data`, texto: `Item de data ${id}`, tipo: 'data', obrigatorio: true, papeis: ['circulante'], fonte: 'teste' },
        ],
      },
    ],
  }
}

function blocoFicticio(modelo: ModeloId): BlocoVisao {
  return { modelo, situacao: 'disponivel', faltam: [], impedimentos: [] }
}

export function episodioFicticio(): EpisodioVisao {
  const modelos = Object.fromEntries(ORDEM_MODELOS.map(m => [m, modeloFicticio(m)])) as Record<ModeloId, ModeloChecklist>
  const blocos = Object.fromEntries(ORDEM_MODELOS.map(m => [m, blocoFicticio(m)])) as Record<ModeloId, BlocoVisao>
  blocos.sign_in = {
    modelo: 'sign_in',
    situacao: 'concluido',
    faltam: [],
    impedimentos: [],
    concluido: { em: '2026-10-20T11:05:00Z', porId: 'u-circ', porNome: 'Circulante Teste', leitorNome: 'Circulante Teste', confirmadorNome: 'Cirurgião Teste', foraDeHora: false },
  }
  return {
    episodio: {
      id: 'ep-ficticio-1',
      olho: 'OE',
      olhoExtenso: 'OLHO ESQUERDO',
      estado: 'sign_in_concluido',
      tipoCirurgia: 'Facoemulsificação com LIO',
      tipoLente: 'Monofocal',
      dataSugerida: '2026-10-20',
      dataCirurgia: '2026-10-20',
      horario: '08:00',
      ordem: 1,
      cirurgiao: { id: 'u-cir', nome: 'Cirurgião Teste' },
      versao: 7,
      versoesModelos: Object.fromEntries(ORDEM_MODELOS.map(m => [m, 'teste/1'])) as Record<ModeloId, string>,
      abertoEm: '2026-10-13T12:00:00Z',
    },
    paciente: {
      id: 'pac-1',
      nomeCompleto: 'Paciente Teste Alfa da Silva',
      dataNascimento: '1950-01-31',
      nomeMae: null,
      prontuario: 'T-0001',
      datasighId: null,
      conferidoDatasigh: false,
      idade: 76,
    },
    modelos,
    respostas: {
      sign_in: {
        'sign_in.A.confirma': { valor: true, autorId: 'u-circ', autorNome: 'Circulante Teste', registradoEm: '2026-10-20T11:00:00Z', foraDeHora: false, correcoes: 0 },
        'sign_in.A.simnao': { valor: 'nao', autorId: 'u-circ', autorNome: 'Circulante Teste', registradoEm: '2026-10-20T11:01:00Z', foraDeHora: true, correcoes: 1 },
        'sign_in.A.olho': { valor: 'OE', autorId: 'u-circ', autorNome: 'Circulante Teste', registradoEm: '2026-10-20T11:02:00Z', foraDeHora: false, correcoes: 0 },
        'sign_in.B.opcao': { valor: 'y', observacao: 'observação de teste', autorId: 'u-circ', autorNome: 'Circulante Teste', registradoEm: '2026-10-20T11:03:00Z', foraDeHora: false, correcoes: 0 },
      },
    },
    blocos,
    alertas: [
      {
        id: 'd7:B.alfa',
        origem: { modelo: 'd7', itemId: 'B.alfa' },
        titulo: 'α-bloqueador em uso',
        descricao: 'Risco de IFIS.',
        nivel: 'alerta',
        geradoEm: '2026-10-13T12:10:00Z',
        comunicado: { por: 'u-con', porNome: 'Concierge Teste', em: '2026-10-13T12:20:00Z', via: 'telefone', cirurgiaoId: 'u-cir' },
        conduta: { texto: 'Manter o remédio. Materiais de íris disponíveis.', cirurgiaoId: 'u-cir', cirurgiaoNome: 'Cirurgião Teste', em: '2026-10-13T15:00:00Z' },
      },
      { id: 'd7:C.cog', origem: { modelo: 'd7', itemId: 'C.cog' }, titulo: 'Déficit cognitivo', descricao: 'Representante assina.', nivel: 'alerta', geradoEm: '2026-10-13T12:11:00Z' },
    ],
    hardStops: [
      {
        codigo: 'HS5_TCLE',
        titulo: 'TCLE ausente',
        descricao: 'TCLE não assinado.',
        bloqueia: ['concluir:admissao'],
        resolvivelPor: ['cirurgiao'],
        exigeResolucaoEscrita: false,
        comoResolver: 'Registrar o TCLE assinado do olho certo.',
        abertoDesde: '2026-10-18T12:00:00Z',
        fonte: 'POP §13.7',
      },
    ],
    dots: [{ letra: 'I', cor: 'azul', rotulo: 'IFIS', motivo: 'α-bloqueador' }],
    identificacao: { homonimoNoDia: false, nomesParecidos: [], exigeNomeMae: false, segundoOlho: null, alertasExtenso: ['OLHO ÚNICO'] },
    contatos: [{ id: 'c1', tipo: 'acompanhante_titular', nome: 'Acompanhante Teste', parentesco: 'filha', telefone: '(00) 90000-0001', anuenciaPaciente: true, confirmadoEm: null }],
    lente: {
      ciclo: 1,
      etapa: 'cp2_confere',
      plano: { olho: 'OE', modelo: 'LIO-TESTE', dioptria: 21.5, torica: false, cilindro: null, eixo: null, reserva: { modelo: 'LIO-SULCO-TESTE', dioptria: 20 }, registradoPor: 'Concierge Teste', registradoEm: '2026-10-13T12:30:00Z' },
      cp2Resultado: { confere: true, camposDivergentes: [], em: '2026-10-18T13:00:00Z', porNome: 'Conferente Teste' },
    },
    tcle: { status: 'assinado', link: null, historico: [{ status: 'enviado', em: '2026-10-13T13:00:00Z', porNome: 'Concierge Teste' }] },
    materiais: { enviados: [], quiz: [], contatoHumano: null },
    avisosFamilia: { suspensos: false, mensagens: [] },
    pendencias: [],
    intercorrencias: [],
    teachBack: null,
    permissoes: {},
  }
}
