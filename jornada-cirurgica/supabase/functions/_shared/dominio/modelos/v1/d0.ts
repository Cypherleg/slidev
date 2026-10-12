// Checklist do dia D (POP §9 A–D), anestesia (briefing §6.5) e alta (POP §10).
// Itens do checkpoint 3 da LIO (POP §3) incluídos onde cabem.

import type { ConfigJornada, ModeloChecklist, Papel } from '../../tipos.ts'
import { fnv1a } from '../../util/hash.ts'
import { ADM, ALTA, AN, CONDICAO_OLHO_UNICO, SI, SO, TO, VERSAO_MODELOS } from '../ids.ts'
import { FONTE_HOMONIMO, item, itensMudancaMedicacao, NOME_MAE_CONFERENCIA, PENDENTE_OLHO_UNICO } from './comum.ts'
import { modeloD7 } from './d7.ts'
import { medicamentoAdmissao } from '../ids.ts'
import type { OpcaoItem } from '../../tipos.ts'

const ENF: Papel[] = ['enfermagem']
const CIRC: Papel[] = ['circulante']
const CIR: Papel[] = ['cirurgiao']
const ANE: Papel[] = ['anestesista']

/** Identificação ativa (POP §13) com a alternativa do POP §11 para déficit cognitivo. */
const OPCOES_IDENTIFICACAO: OpcaoItem[] = [
  { valor: 'sim', rotulo: 'Sim: o paciente diz e confere' },
  { valor: 'acompanhante', rotulo: 'Déficit cognitivo: confirmado com o acompanhante/representante, documento com foto e pulseira' },
  { valor: 'nao', rotulo: 'Não: divergência' },
]
const AJUDA_DEFICIT = 'Com déficit cognitivo registrado no D-7 (POP §11), o paciente não é fonte confiável: a identificação é confirmada com o acompanhante ou representante, o documento com foto e a pulseira.'

export function modeloAdmissao(): ModeloChecklist {
  return {
    id: 'admissao',
    versao: VERSAO_MODELOS,
    titulo: 'Admissão (recepção e enfermagem)',
    papeisConclusao: ['enfermagem'],
    fonte: 'POP §9.A',
    secoes: [
      {
        id: 'A',
        titulo: 'A. Admissão',
        itens: [
          item(ADM.identificacao, 'Documento com foto conferido; paciente diz nome completo e data de nascimento', 'opcao', ENF, 'POP §9.A, §13 (identificação ativa) e §11', {
            opcoes: OPCOES_IDENTIFICACAO,
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
            ajuda: `Identificação ativa: o paciente diz; pergunta fechada não vale. "Não" (divergência) abre hard stop. ${AJUDA_DEFICIT}`,
          }),
          item(ADM.acompanhantePresente, 'Acompanhante adulto, lúcido e identificado presente', 'sim_nao', ENF, 'POP §9.A e §8; [P] CFM 1.886/2008', {
            exigeSim: true,
            hardStop: 'HS4_SEM_ACOMPANHANTE',
            ajuda: 'Ausente = STOP (POP §8): sem midriático, sedação nem bloqueio. Menor de idade ou sem lucidez equivale a ausência.',
          }),
          item(ADM.acompanhante, 'Acompanhante: nome e telefone', 'pessoa', ENF, 'POP §9.A', { camposPessoa: ['nome', 'telefone'] }),
          item(ADM.pulseira, 'Pulseira impressa conferida com o paciente: nome, nascimento, prontuário, olho por extenso', 'sim_nao', ENF, 'POP §9.A', {
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
          }),
          item(ADM.pulseiraBraco, 'Braço da pulseira', 'opcao', ENF, 'POP §9.A e §0', {
            opcoes: [
              { valor: 'lado_do_olho', rotulo: 'Lado do olho' },
              { valor: 'excecao', rotulo: 'Exceção (registrar o motivo na observação)' },
            ],
            ajuda: 'Lateralidade é a impressa por extenso; a posição do braço é pista redundante. Exceção registrada na ficha.',
          }),
          item(ADM.pulseirasOutras, 'Pulseiras de outros serviços e pulseiras coloridas de uso pessoal retiradas ou cobertas', 'confirmacao', ENF, 'POP §2 (regra 6)'),
          item(ADM.etiquetaPeito, 'Etiqueta do peito colada e conferida com paciente e acompanhante', 'confirmacao', ENF, 'POP §9.A'),
          item(ADM.mudouRemedio, 'Mudou remédio ou estado de saúde nos últimos 7 dias?', 'sim_nao', ENF, 'POP §9.A e §0 ("reconferir no D0")', {
            alerta: { descricao: 'Sim → cirurgião (comunicar antes de concluir a admissão)', nivel: 'alerta' },
          }),
          ...itensMudancaMedicacao({
            idClasses: ADM.mudouClasses,
            idMudou: ADM.mudouRemedio,
            idItem: medicamentoAdmissao,
            textoClasses: 'O que mudou: classes da lista crítica, outro remédio ou estado de saúde',
            papeis: ENF,
            fonte: 'POP §9.A e §0',
            itensD7: modeloD7().secoes.flatMap((x) => x.itens),
            incluirEstadoSaude: true,
          }),
          item(ADM.usaGlp1, 'Usa análogo de GLP-1 ou tirzepatida (caneta para diabetes ou para emagrecer)?', 'sim_nao', ENF, 'POP §9.A e §0 ("reconferir no D0")', {
            ajuda: 'Reconferência no D0. Se o D-7 ou o D-2 registraram GLP-1 em uso e o paciente diz que não usa mais, registre a mudança de medicação (classe GLP-1).',
          }),
          item(ADM.glp1UltimaDose, 'Análogo de GLP-1 ou tirzepatida: data da última dose', 'data', ENF, 'POP §9.A ("inclusive a data da última dose de análogo de GLP-1")', {
            obrigatorio: false,
            exigidoQuando: { itemId: ADM.usaGlp1, valores: ['sim'] },
            ajuda: 'A janela de suspensão é recalculada com esta data (regra do serviço: semanais 7 dias; diários, véspera e dia). Dose dentro do prazo: ALERTA ao cirurgião.',
          }),
          item(ADM.alergias, 'Alergias reconfirmadas com o paciente, sem alergia nova ou diferente do registrado', 'sim_nao', ENF, 'POP §9.A e §2 (dot A)', {
            ajuda: '"Não" (mudou): registrar a alergia nova abaixo; ela entra no dot A e na verbalização do Time Out.',
          }),
          item(ADM.alergiaNova, 'Alergia nova: substância e reação', 'texto', ENF, 'POP §9.A e §2 (dot A)', {
            obrigatorio: false,
            exigidoQuando: { itemId: ADM.alergias, valores: ['nao'] },
          }),
          item(ADM.dotsColados, 'Dots colados pela enfermagem, pela ficha já conferida no D-2', 'confirmacao', ENF, 'POP §9.A e §2 (regra 2)'),
          item(ADM.olhoVermelho, 'Olho vermelho ou com secreção hoje?', 'sim_nao', ENF, 'POP §9.A e §13.7 item 7', {
            hardStop: 'HS7_OLHO_VERMELHO',
            ajuda: '"Sim" → cirurgião: hard stop até a avaliação registrada por escrito.',
          }),
          item(ADM.coliriosPre, 'Colírios pré-operatórios usados conforme o cartão', 'confirmacao', ENF, 'POP §9.A e §4', {
            obrigatorio: false,
            pendente: 'O esquema AL-01 ainda não define colírio pré-operatório ("[informar se há colírio antes da cirurgia]", POP §4 e §14).',
          }),
          item(ADM.jejum, 'Jejum e medicações conforme orientação', 'sim_nao', ENF, 'POP §9.A e §5', {
            alerta: { descricao: 'Não → ALERTA ao cirurgião (conduta: regras em aberto no POP §14)', nivel: 'alerta' },
            pendente: 'Horário de referência do jejum, lista de líquidos e exceções (insulina, GLP-1 dentro do prazo) a confirmar (POP §5 e §14).',
          }),
          item(ADM.pa, 'PA', 'texto', ENF, 'POP §9.A'),
          item(ADM.glicemia, 'Glicemia capilar (dot D)', 'texto', ENF, 'POP §9.A e §2 (dot D)', {
            obrigatorio: false,
            exigidoQuando: { contexto: 'dot_D' },
          }),
          item(ADM.tcle, 'TCLE assinado no prontuário', 'sim_nao', ENF, 'POP §9.A e §13.7 item 5', {
            exigeSim: true,
            hardStop: 'HS5_TCLE',
          }),
          item(ADM.tcleOlho, 'Olho do TCLE = olho da agenda', 'sim_nao', ENF, 'POP §9.A e §13.7 item 3', {
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
            ajuda: '"Não" abre hard stop de identidade/olho: resolução escrita do cirurgião.',
          }),
          item(ADM.nomeMae, NOME_MAE_CONFERENCIA, 'confirmacao', ENF, FONTE_HOMONIMO, { obrigatorio: false, exigidoQuando: { contexto: 'homonimo_no_dia' } }),
        ],
      },
    ],
  }
}

export function modeloSignIn(): ModeloChecklist {
  return {
    id: 'sign_in',
    versao: VERSAO_MODELOS,
    titulo: 'Sign In — antes de midriático, bloqueio ou sedação',
    descricao: 'Leitura em voz alta: registrar quem leu e quem confirmou. Ordem: identificação ativa, consentimento e marcação do sítio antes do midriático.',
    papeisConclusao: ['circulante', 'enfermagem', 'cirurgiao', 'anestesista'],
    exigeLeituraEmVozAlta: true,
    fonte: 'POP §9.B e §3 (checkpoint 3)',
    secoes: [
      {
        id: 'B',
        titulo: 'B. Sign In',
        itens: [
          item(SI.identificacao, 'Paciente diz: nome, nascimento, olho e cirurgia', 'opcao', ['enfermagem', 'circulante'], 'POP §9.B, §13 (identificação ativa) e §11', {
            opcoes: OPCOES_IDENTIFICACAO,
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
            ajuda: `Conferir contra prontuário, TCLE e pulseira. "Não" (divergência) abre hard stop. ${AJUDA_DEFICIT}`,
          }),
          item(SI.consentimento, 'Reconfirmação do consentimento: leu e assinou, sem dúvidas, continua de acordo', 'sim_nao', ['enfermagem', 'cirurgiao'], 'POP §9.B e §7 (etapa 8)', {
            exigeSim: true,
            hardStop: 'HS5_TCLE',
            ajuda: '"O senhor leu e assinou o termo? Tem alguma dúvida? Continua de acordo em operar o olho ___ hoje?" "Não" (dúvida não resolvida) = hard stop até resolução escrita do cirurgião.',
          }),
          item(SI.marcacao, 'Cirurgião marca a pele acima do supercílio do olho a operar, com o paciente acordado', 'confirmacao', CIR, 'POP §9.B, §0 e §14', {
            depoisDe: [SI.identificacao],
          }),
          item(SI.toricaMarcacao, 'Tórica: marcação de referência com o paciente sentado, antes de deitar; eixo conferido contra o cálculo impresso', 'confirmacao', CIR, 'POP §3 (checkpoint 3)', {
            obrigatorio: false,
            exigidoQuando: { contexto: 'lente_torica' },
          }),
          item(SI.midriatico, 'Midriático somente no olho marcado (quem instilou e hora ficam registrados)', 'confirmacao', ['enfermagem', 'circulante'], 'POP §9.B, §0 e §13.7 item 9', {
            depoisDe: [SI.identificacao, SI.consentimento, SI.marcacao],
            hardStop: 'HS9_SITIO_NAO_MARCADO',
          }),
          item(SI.condutaAlertas, 'α-bloqueador, anticoagulante ou antiagregante: conduta escrita do cirurgião presente', 'opcao', ['enfermagem', 'circulante', 'cirurgiao'], 'POP §9.B e §13.7 item 6', {
            opcoes: [
              { valor: 'presente', rotulo: 'Conduta escrita do cirurgião presente' },
              { valor: 'nao_se_aplica', rotulo: 'Não se aplica (sem α-bloqueador, anticoagulante ou antiagregante registrado)' },
            ],
            hardStop: 'HS6_SEM_CONDUTA_ALFA_ANTICOAG',
          }),
          item(SI.posicionamento, 'Posicionamento testado: consegue deitar e permanecer imóvel', 'confirmacao', ['enfermagem', 'circulante', 'anestesista'], 'POP §9.B'),
          item(SI.monitorizacao, 'Monitorização e acesso venoso conforme protocolo anestésico', 'confirmacao', ['anestesista', 'enfermagem', 'circulante'], 'POP §9.B'),
          item(SI.salaBiometria, 'Na sala: biometria original e plano de LIO do paciente presentes (papel ou tela)', 'sim_nao', CIRC, 'POP §9.B, §3 (checkpoint 3) e §13.7 item 2', {
            exigeSim: true,
            hardStop: 'HS2_BIOMETRIA_AUSENTE',
          }),
          item(SI.salaLio, 'Na sala: LIO e LIO reserva', 'confirmacao', CIRC, 'POP §9.B e §0'),
          item(SI.facoMicroscopio, 'Faco e microscópio testados', 'confirmacao', CIRC, 'POP §9.B'),
          item(SI.esterilizacao, 'Indicadores de esterilização conferidos', 'confirmacao', CIRC, 'POP §9.B'),
          item(SI.dots, 'Dots da pulseira conferidos pela circulante contra a ficha', 'confirmacao', CIRC, 'POP §9.B e §2'),
          item(SI.liosDoDia, 'Só as LIOs da lista do dia entram no centro cirúrgico, na ordem da agenda', 'confirmacao', CIRC, 'POP §3 (checkpoint 3)'),
          item(SI.nomeMae, NOME_MAE_CONFERENCIA, 'confirmacao', ['enfermagem', 'circulante'], FONTE_HOMONIMO, {
            obrigatorio: false,
            exigidoQuando: { contexto: 'homonimo_no_dia' },
          }),
        ],
      },
    ],
  }
}

export function modeloAnestesia(config?: Pick<ConfigJornada, 'itensAnestesiaExtras'> | null): ModeloChecklist {
  const extras = (config?.itensAnestesiaExtras ?? []).filter((e) => e && typeof e.id === 'string' && e.id.trim() && typeof e.texto === 'string' && e.texto.trim())
  const versao = extras.length ? `${VERSAO_MODELOS}+anest.${fnv1a(JSON.stringify(extras.map((e) => [e.id, e.texto])))}` : VERSAO_MODELOS
  return {
    id: 'anestesia',
    versao,
    titulo: 'Anestesia',
    descricao: 'Itens do POP (jejum e medicações; monitorização e acesso venoso; liberação da recuperação). Demais itens: a definir com o serviço de anestesia.',
    papeisConclusao: ['anestesista'],
    fonte: 'briefing §6.5; POP §13 (responsabilidades: anestesista)',
    secoes: [
      {
        id: 'AN',
        titulo: 'Itens do POP',
        itens: [
          item(AN.jejum, 'Jejum e medicações', 'confirmacao', ANE, 'briefing §6.5; POP §9.A', { foraDeHoraApos: 'time_out' }),
          item(AN.monitorizacao, 'Monitorização e acesso venoso', 'confirmacao', ANE, 'briefing §6.5; POP §9.B', { foraDeHoraApos: 'time_out' }),
          item(AN.liberacao, 'Liberação da recuperação', 'confirmacao', ANE, 'briefing §6.5; POP §13 (responsabilidades)', {
            exigeBlocosConcluidos: ['sign_out'],
            foraDeHoraApos: 'alta',
          }),
        ],
      },
      {
        id: 'EXTRAS',
        titulo: 'Itens definidos com o serviço de anestesia',
        itens: extras.map((e) =>
          item(`EXTRA.${e.id.trim()}`, e.texto.trim(), 'confirmacao', ANE, 'config.itensAnestesiaExtras', { foraDeHoraApos: 'alta' }),
        ),
      },
    ],
  }
}

export function modeloTimeOut(): ModeloChecklist {
  const CC: Papel[] = ['circulante', 'cirurgiao']
  return {
    id: 'time_out',
    versao: VERSAO_MODELOS,
    titulo: 'Time Out — antes da incisão, todos param',
    descricao:
      'Circulante lê; cirurgião confirma em voz alta. A LIO é lida da caixa pela circulante e digitada no painel (comparada com o plano e com o checkpoint 2); divergência: a cirurgia não começa.',
    papeisConclusao: ['circulante', 'cirurgiao'],
    exigeLeituraEmVozAlta: true,
    fonte: 'POP §9.C e §3 (checkpoint 3)',
    secoes: [
      {
        id: 'C',
        titulo: 'C. Time Out',
        itens: [
          item(TO.equipe, 'Equipe se apresenta por nome e função; com residente em campo, a circulante nomeia em voz alta o preceptor responsável', 'confirmacao', CIRC, 'POP §9.C', {
            pendente: 'POP §14: o TCLE prevê residentes apenas como observadores; seções 7, 9, 11 e 13 ainda preveem residente em campo — alinhar.',
          }),
          item(TO.paciente, 'Paciente acordado confirma nome, nascimento e olho', 'sim_nao', CC, 'POP §9.C e §3 (checkpoint 3)', {
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
          }),
          item(TO.marca, 'Marca visível no campo, do lado correto', 'sim_nao', CC, 'POP §9.C', {
            exigeSim: true,
            hardStop: 'HS3_DIVERGENCIA_IDENTIDADE_OLHO',
          }),
          item(TO.procedimento, 'Procedimento confirmado', 'sim_nao', CC, 'POP §9.C e §3 ("divergência detectada no Time Out")', {
            exigeSim: true,
            hardStop: 'HS_LIO_TIME_OUT',
            ajuda: '"Não" = divergência no Time Out: a cirurgia não começa; quase-evento; resolução escrita do cirurgião.',
          }),
          item(TO.olhoUnicoPreceptor, 'Olho único: operado pelo preceptor (residente não opera olho único)', 'confirmacao', CC, 'POP §11 e §14 (decidido em 12/10/2026)', {
            obrigatorio: false,
            exigidoQuando: { ...CONDICAO_OLHO_UNICO },
          }),
          item(TO.mesaSoLio, 'Na mesa, apenas a LIO do paciente que está na sala', 'confirmacao', CIRC, 'POP §3 (checkpoint 3)'),
          item(TO.readBack, 'LIO lida da caixa × biometria original: cirurgião vê a caixa e repete modelo e dioptria (read-back); abertura só depois', 'confirmacao', CIR, 'POP §9.C e §3 (checkpoint 3)', {
            ajuda: 'Só pode ser marcado depois que a leitura da caixa (digitada pela circulante) conferiu com o plano.',
          }),
          item(TO.verbalizados, 'Alergias, α-bloqueador e anticoagulação verbalizados, mesmo que negativos', 'confirmacao', CC, 'POP §9.C e §2 (regra 4)'),
          item(TO.antissepsia, 'Antissepsia com PVPI e profilaxia de endoftalmite conforme protocolo institucional', 'confirmacao', CC, 'POP §9.C'),
          item(TO.dificuldades, 'Dificuldades previstas (pupila pequena, zônula frágil, catarata densa) e materiais especiais disponíveis', 'confirmacao', CC, 'POP §9.C'),
          item(TO.preocupacao, '"Alguém tem alguma preocupação?" Pausa real para resposta', 'confirmacao', CIRC, 'POP §9.C'),
          item(TO.nomeMae, NOME_MAE_CONFERENCIA, 'confirmacao', CC, FONTE_HOMONIMO, { obrigatorio: false, exigidoQuando: { contexto: 'homonimo_no_dia' } }),
        ],
      },
    ],
  }
}

export function modeloSignOut(): ModeloChecklist {
  return {
    id: 'sign_out',
    versao: VERSAO_MODELOS,
    titulo: 'Sign Out — antes de sair da sala',
    descricao: 'Regra de ouro: qualquer membro da equipe pode interromper. Item não conferido não é marcado "depois".',
    papeisConclusao: ['circulante', 'cirurgiao', 'anestesista'],
    fonte: 'POP §9.D e §3 (checkpoint 3)',
    secoes: [
      {
        id: 'D',
        titulo: 'D. Sign Out',
        itens: [
          item(SO.procedimentoOlho, 'Procedimento e olho registrados', 'confirmacao', ['circulante', 'cirurgiao'], 'POP §9.D'),
          item(SO.etiquetasLio, 'Etiquetas da LIO implantada: prontuário e cartão do paciente', 'confirmacao', CIRC, 'POP §9.D e §3 (checkpoint 3)', {
            pendente: 'Rastreabilidade de implantes: validar norma ANVISA aplicável (POP §3).',
          }),
          item(SO.intercorrencias, 'Intercorrências e mudança de plano registradas', 'opcao', ['circulante', 'cirurgiao', 'anestesista'], 'POP §9.D', {
            opcoes: [
              { valor: 'sem_intercorrencia', rotulo: 'Sem intercorrência nem mudança de plano' },
              { valor: 'registradas', rotulo: 'Intercorrências ou mudança de plano registradas no painel' },
            ],
          }),
          item(SO.lioSulco, 'Mudança intraoperatória para LIO de sulco', 'opcao', ['circulante', 'cirurgiao'], 'POP §3 (checkpoint 3)', {
            opcoes: [
              { valor: 'nao_houve', rotulo: 'Não houve' },
              { valor: 'reserva_com_read_back', rotulo: 'Usada a reserva do plano, com o mesmo read-back' },
            ],
          }),
          item(SO.contagem, 'Contagem de perfurocortantes e materiais', 'confirmacao', CIRC, 'POP §9.D'),
          item(SO.equipamento, 'Problemas de equipamento a reportar', 'opcao', CIRC, 'POP §9.D', {
            opcoes: [
              { valor: 'nenhum', rotulo: 'Nenhum' },
              { valor: 'reportados', rotulo: 'Reportados (descrever na observação)' },
            ],
          }),
          item(SO.prescricao, 'Prescrição, protetor ocular e orientações de alta definidos', 'confirmacao', CIR, 'POP §9.D'),
        ],
      },
      {
        id: 'ASS',
        titulo: 'Assinaturas',
        itens: [
          item(SO.assinaturaCirculante, 'Assinatura: circulante', 'confirmacao', CIRC, 'POP §9.D'),
          item(SO.assinaturaCirurgiao, 'Assinatura: cirurgião', 'confirmacao', CIR, 'POP §9.D'),
          item(SO.assinaturaAnestesista, 'Assinatura: anestesista', 'confirmacao', ANE, 'POP §9.D'),
        ],
      },
    ],
  }
}

export function modeloAlta(): ModeloChecklist {
  const EC: Papel[] = ['enfermagem', 'cirurgiao']
  const crit = (id: string, texto: string, extra = {}) => item(id, texto, 'confirmacao', EC, 'POP §10; [P] CFM 1.886/2008 item 4.5', extra)
  return {
    id: 'alta',
    versao: VERSAO_MODELOS,
    titulo: 'Alta e pós-operatório',
    descricao: 'Concluir exige o bloco de anestesia concluído (liberação da recuperação).',
    papeisConclusao: ['enfermagem', 'cirurgiao'],
    fonte: 'POP §10',
    secoes: [
      {
        id: 'CRIT',
        titulo: 'Critérios de alta (item 4.5)',
        itens: [
          crit(ALTA.orientado, 'Orientado no tempo e no espaço'),
          crit(ALTA.sinaisVitais, 'Sinais vitais estáveis há pelo menos 60 minutos', {
            pendente: 'Se a rotina de faco sob tópica for mais curta, é decisão do diretor técnico, a documentar; pendente com o jurídico (POP §10 e §14).',
          }),
          crit(ALTA.semNausea, 'Sem náusea ou vômito'),
          crit(ALTA.respiracao, 'Sem dificuldade respiratória'),
          crit(ALTA.liquidos, 'Ingere líquidos'),
          crit(ALTA.locomocao, 'Locomove-se como antes'),
          crit(ALTA.sangramento, 'Sangramento ausente ou mínimo'),
          crit(ALTA.dor, 'Sem dor importante'),
          crit(ALTA.urinaria, 'Sem retenção urinária'),
        ],
      },
      {
        id: 'ALTA',
        titulo: 'Alta',
        itens: [
          item(ALTA.altaMedica, 'Alta dada por médico da equipe (hora registrada)', 'confirmacao', CIR, 'POP §10; [P] CFM 1.886/2008 item 4.5'),
          item(ALTA.acompanhante, 'Acompanhante presente; orientações dadas aos dois, verbalmente e por escrito', 'sim_nao', ENF, 'POP §10 e §8; [P] CFM 1.886/2008 item 4.4', {
            exigeSim: true,
            hardStop: 'HS4_SEM_ACOMPANHANTE',
          }),
          item(ALTA.teachBack, 'Teach-back de alta: quem pinga, quando começa, quais sinais fazem ligar', 'confirmacao', ENF, 'POP §10'),
          item(ALTA.quemInstila, 'Quem instila o colírio', 'opcao', ENF, 'POP §10 (quem instila o colírio)', {
            opcoes: [
              { valor: 'paciente', rotulo: 'Paciente instila sozinho: demonstrou a técnica' },
              { valor: 'cuidador_presente', rotulo: 'Cuidador instila e está presente: recebeu a orientação e demonstrou' },
              { valor: 'cuidador_ausente', rotulo: 'Cuidador instila e não é o acompanhante: vídeo enviado a ele; ligação de confirmação no D1' },
            ],
          }),
          item(ALTA.primeiraInstilacao, 'Primeira instilação demonstrada ao cuidador antes de sair', 'confirmacao', ENF, 'POP §10 [S]'),
          item(ALTA.acessoPulseira, 'Acesso venoso e pulseira retirados', 'confirmacao', ENF, 'POP §10'),
          item(ALTA.olhoUnicoApoio, 'Olho único: apoio domiciliar confirmado para 24 a 48 h', 'confirmacao', ENF, 'POP §11 (olho único)', {
            obrigatorio: false,
            exigidoQuando: { ...CONDICAO_OLHO_UNICO },
            pendente: PENDENTE_OLHO_UNICO,
          }),
          item(ALTA.olhoUnicoLigacao, 'Olho único: ligação ativa na noite da cirurgia programada (retorno no D1 obrigatório)', 'confirmacao', ENF, 'POP §11 (olho único)', {
            obrigatorio: false,
            exigidoQuando: { ...CONDICAO_OLHO_UNICO },
            pendente: PENDENTE_OLHO_UNICO,
          }),
        ],
      },
      {
        id: 'RET',
        titulo: 'Retornos marcados (D1 e D15)',
        itens: [
          item(ALTA.d1Data, 'Retorno do 1º dia (D1): data', 'data', EC, 'POP §10'),
          item(ALTA.d1Hora, 'Retorno do 1º dia (D1): hora', 'hora', EC, 'POP §10'),
          item(ALTA.d15Data, 'Retorno do 15º dia (D15): data', 'data', EC, 'POP §10'),
          item(ALTA.d15Hora, 'Retorno do 15º dia (D15): hora', 'hora', EC, 'POP §10'),
          item(ALTA.local, 'Retornos: local', 'texto', EC, 'POP §10'),
        ],
      },
      {
        id: 'DOC',
        titulo: 'Entregue por escrito',
        itens: [
          item(ALTA.docOrientacoes, 'Folha de orientações pós-operatórias, com nome e olho operado', 'confirmacao', ENF, 'POP §10 (entregar por escrito); [P] CFM 1.886/2008 item 4.4'),
          item(ALTA.docCartaoColirios, 'Cartão de colírios pós-operatórios: código do esquema, grade diária, olho por extenso', 'confirmacao', ENF, 'POP §10 e §4'),
          item(ALTA.docReceita, 'Receita conforme esquema', 'confirmacao', ENF, 'POP §10'),
          item(ALTA.docCartaoLio, 'Cartão da LIO: etiqueta do implante, olho, data, cirurgião', 'confirmacao', ENF, 'POP §10'),
          item(ALTA.docRetornos, 'Retornos D1 e D15 com data e hora marcadas', 'confirmacao', ENF, 'POP §10'),
          item(ALTA.docTelefones, 'Telefones: horário comercial, WhatsApp da concierge e enfermagem fora do horário', 'confirmacao', ENF, 'POP §10', {
            pendente: 'Número do WhatsApp da concierge e escala do telefone fora do horário: em aberto (POP §14).',
          }),
          item(ALTA.docAtestado, 'Atestado ou declaração', 'opcao', ENF, 'POP §10', {
            opcoes: [
              { valor: 'entregue', rotulo: 'Entregue' },
              { valor: 'nao_solicitado', rotulo: 'Não solicitado' },
            ],
          }),
        ],
      },
    ],
  }
}
