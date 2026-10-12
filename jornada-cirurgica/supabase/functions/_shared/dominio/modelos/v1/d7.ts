// Checklist da concierge — dia dos exames (D-7). POP §1, blocos A a G.
// "A concierge coleta e sinaliza. Todo item marcado ALERTA chega ao cirurgião no mesmo dia, e ela nunca
// orienta suspender medicamento. Nenhum campo fica em branco: 'não' e 'nenhuma conhecida' são respostas escritas."

import type { ModeloChecklist, Papel } from '../../tipos.ts'
import { D7, VERSAO_MODELOS_V1 } from '../ids.ts'
import { item } from './comum.ts'

const C: Papel[] = ['concierge']
const NUNCA_SUSPENDER = 'Regra do serviço (informação): a concierge nunca orienta suspender medicamento; a conduta é do cirurgião.'

export function modeloD7(): ModeloChecklist {
  return {
    id: 'd7',
    versao: VERSAO_MODELOS_V1,
    titulo: 'D-7 — Checklist da concierge (dia dos exames)',
    descricao:
      'A concierge coleta e sinaliza. Todo item ALERTA chega ao cirurgião no mesmo dia. Nenhum campo fica em branco: "não" e "nenhuma conhecida" são respostas escritas.',
    papeisConclusao: ['concierge'],
    fonte: 'POP §1',
    secoes: [
      {
        id: 'A',
        titulo: 'A. Identificação e cirurgia',
        itens: [
          item(D7.nomeCompleto, 'Nome completo conferido com o documento com foto', 'confirmacao', C, 'POP §1.A'),
          item(D7.dataNascimento, 'Data de nascimento conferida com o documento', 'confirmacao', C, 'POP §1.A'),
          item(D7.nomeMae, 'Nome da mãe (3º identificador, obrigatório se houver homônimo)', 'texto', C, 'POP §1.A', {
            obrigatorio: false,
            exigidoQuando: { contexto: 'homonimo_no_dia' },
          }),
          item(D7.prontuario, 'Prontuário nº conferido', 'confirmacao', C, 'POP §1.A'),
          item(D7.cirurgiao, 'Cirurgião conferido', 'confirmacao', C, 'POP §1.A'),
          item(D7.olhoPaciente, 'Olho dito pelo paciente (pergunta aberta: "qual olho o senhor vai operar?")', 'olho', C, 'POP §1.A', {
            permiteNaoSabe: true,
            ajuda:
              'Pergunta aberta; nunca "é o olho direito?". O olho do pedido vem do episódio. "Pedido e paciente coincidem?" é calculado pelo painel: diferente ou "não sabe" gera ALERTA.',
            alerta: { descricao: 'Pedido e paciente não coincidem (ou paciente não sabe) → ALERTA', nivel: 'alerta' },
          }),
          item(D7.cirurgiaLio, 'Cirurgia proposta e tipo de LIO (monofocal, tórica, outra) conferidos', 'confirmacao', C, 'POP §1.A'),
          item(D7.primeiroSegundo, 'Primeiro ou segundo olho', 'opcao', C, 'POP §1.A', {
            opcoes: [
              { valor: 'primeiro', rotulo: 'Primeiro olho' },
              { valor: 'segundo', rotulo: 'Segundo olho' },
            ],
          }),
          item(D7.dataPrevista, 'Data prevista conferida com o paciente', 'confirmacao', C, 'POP §1.A'),
        ],
      },
      {
        id: 'B',
        titulo: 'B. Medicamentos — lista crítica',
        itens: [
          item(D7.alfaBloqueador, 'α1-bloqueador (uso atual ou passado)', 'medicamento', C, 'POP §1.B; [P] AAO Ophthalmic Surgery Checklist', {
            ajuda:
              'Exemplos: tansulosina, doxazosina, alfuzosina, terazosina, silodosina. Pergunta-padrão para homens e mulheres: "toma ou já tomou remédio para próstata ou para urinar?" Pedir caixas, receitas ou foto; perguntar por nome comercial. Regra do serviço (informação): α-bloqueador é mantido; risco sinalizado (dot I). ' +
              NUNCA_SUSPENDER,
            alerta: { descricao: 'Usa ou já usou → ALERTA: risco de IFIS (intraoperative floppy iris syndrome). Não suspender.', nivel: 'alerta' },
          }),
          item(D7.anticoagulante, 'Anticoagulante', 'medicamento', C, 'POP §1.B; [P] AAO Ophthalmic Surgery Checklist', {
            ajuda: 'Exemplos: varfarina, rivaroxabana, apixabana, dabigatrana, edoxabana, heparinas. Conduta é do cirurgião (caso a caso). ' + NUNCA_SUSPENDER,
            alerta: { descricao: 'Usa ou já usou → ALERTA. Conduta é do cirurgião.', nivel: 'alerta' },
          }),
          item(D7.antiagregante, 'Antiagregante', 'medicamento', C, 'POP §1.B', {
            ajuda: 'Exemplos: AAS, clopidogrel, ticagrelor, prasugrel. ' + NUNCA_SUSPENDER,
            alerta: { descricao: 'Usa ou já usou → ALERTA', nivel: 'alerta' },
          }),
          item(D7.insulina, 'Insulina e antidiabéticos', 'medicamento', C, 'POP §1.B e §5', {
            ajuda:
              'Registrar tipo, dose e horário; marcar se insulina ou sulfonilureia (dot D). A concierge não altera dose. Regra do serviço (informação, POP §5): insulina não é aplicada na manhã da cirurgia e volta quando o paciente se alimentar. ' +
              NUNCA_SUSPENDER,
            pendente: 'Exceções em aberto (POP §14): insulina basal em DM1/bomba, sulfonilureia/glinida, SGLT2.',
            camposMedicamento: ['insulina'],
          }),
          item(D7.glp1, 'Análogo de GLP-1 ou tirzepatida (caneta para diabetes ou para emagrecer)', 'medicamento', C, 'POP §1.B e §5', {
            ajuda:
              'Semanais: semaglutida injetável (Ozempic, Wegovy), tirzepatida (Mounjaro), dulaglutida (Trulicity). Diários: liraglutida (Victoza, Saxenda), semaglutida oral (Rybelsus). Registrar dose, data da última aplicação, início ou aumento de dose nos últimos 3 meses e náusea ou vômito. Regra do serviço (informação): semanais suspensos 7 dias antes da cirurgia; diários, na véspera e no dia. A orientação é do cirurgião. Se o prazo não couber até a data da cirurgia, avisar o cirurgião no mesmo dia. ' +
              NUNCA_SUSPENDER,
            alerta: { descricao: 'Usa ou já usou → ALERTA. Prazo de suspensão que não cabe até a cirurgia → ALERTA específico (avisar o cirurgião no mesmo dia).', nivel: 'alerta' },
            pendente: 'Conduta quando o GLP-1 já foi aplicado dentro do prazo: em aberto (POP §14).',
            camposMedicamento: ['glp1'],
          }),
          item(D7.antiHipertensivos, 'Anti-hipertensivos', 'medicamento', C, 'POP §1.B', {
            ajuda: 'Registrar. Uso no dia D: conforme médico. ' + NUNCA_SUSPENDER,
          }),
          item(D7.corticoide, 'Corticoide sistêmico ou imunossupressor', 'medicamento', C, 'POP §1.B', { ajuda: 'Registrar.' }),
          item(D7.antipsicoticos, 'Antipsicóticos e psicotrópicos', 'medicamento', C, 'POP §1.B', {
            ajuda: 'Há relatos de IFIS com alguns antipsicóticos. Registrar e sinalizar.',
            alerta: { descricao: 'Usa ou já usou → registrar e sinalizar ao cirurgião', nivel: 'sinalizado' },
          }),
          item(D7.colirios, 'Colírios em uso', 'medicamento', C, 'POP §1.B', {
            ajuda: 'Exemplos: glaucoma, lubrificantes, corticoide. Registrar nome e olho.',
          }),
          item(D7.fitoterapicos, 'Fitoterápicos e suplementos', 'medicamento', C, 'POP §1.B', {
            ajuda: 'Exemplos: ginkgo, fórmulas "para próstata". Registrar.',
          }),
        ],
      },
      {
        id: 'C',
        titulo: 'C. Patologias',
        itens: [
          item(D7.diabetes, 'Diabetes', 'sim_nao', C, 'POP §1.C'),
          item(D7.diabetesGlicemia, 'Diabetes: última glicemia ou HbA1c (se tiver)', 'texto', C, 'POP §1.C', { obrigatorio: false }),
          item(D7.hipertensao, 'Hipertensão', 'sim_nao', C, 'POP §1.C'),
          item(D7.cardiopatia, 'Cardiopatia, marca-passo ou CDI', 'sim_nao', C, 'POP §1.C'),
          item(D7.dpoc, 'DPOC, asma, tosse crônica, falta de ar ao deitar', 'sim_nao', C, 'POP §1.C'),
          item(D7.renal, 'Doença renal, diálise, fístula', 'sim_nao', C, 'POP §1.C'),
          item(D7.fistulaBraco, 'Fístula: qual braço', 'opcao', C, 'POP §1.C e §2 (dot M)', {
            obrigatorio: false,
            exigidoQuando: { itemId: D7.renal, valores: ['sim'] },
            opcoes: [
              { valor: 'sem_fistula', rotulo: 'Sem fístula' },
              { valor: 'direito', rotulo: 'Braço direito' },
              { valor: 'esquerdo', rotulo: 'Braço esquerdo' },
            ],
          }),
          item(D7.mastectomia, 'Mastectomia ou esvaziamento axilar', 'sim_nao', C, 'POP §1.C'),
          item(D7.mastectomiaLado, 'Mastectomia ou esvaziamento axilar: qual lado', 'opcao', C, 'POP §1.C e §2 (dot M)', {
            obrigatorio: false,
            exigidoQuando: { itemId: D7.mastectomia, valores: ['sim'] },
            opcoes: [
              { valor: 'direito', rotulo: 'Direito' },
              { valor: 'esquerdo', rotulo: 'Esquerdo' },
              { valor: 'ambos', rotulo: 'Ambos' },
            ],
          }),
          item(D7.avc, 'AVC, Parkinson, tremor', 'sim_nao', C, 'POP §1.C'),
          item(D7.demencia, 'Demência ou déficit cognitivo', 'sim_nao', C, 'POP §1.C e §11', {
            alerta: { descricao: 'Sim → ALERTA. Alerta por extenso: "DÉFICIT COGNITIVO — REPRESENTANTE: nome".', nivel: 'alerta' },
          }),
          item(D7.representante, 'Déficit cognitivo: representante legal ou familiar responsável (nome)', 'pessoa', C, 'POP §2 e §11', {
            obrigatorio: false,
            exigidoQuando: { itemId: D7.demencia, valores: ['sim'] },
            camposPessoa: ['nome'],
          }),
          item(D7.ansiedade, 'Ansiedade intensa, claustrofobia', 'sim_nao', C, 'POP §1.C'),
          item(D7.surdez, 'Surdez, barreira de idioma', 'sim_nao', C, 'POP §1.C'),
          item(D7.glaucoma, 'Glaucoma', 'sim_nao', C, 'POP §1.C'),
          item(D7.uveite, 'Uveíte', 'sim_nao', C, 'POP §1.C'),
          item(D7.retinopatia, 'Retinopatia diabética ou DMRI', 'sim_nao', C, 'POP §1.C'),
          item(D7.descolamento, 'Descolamento de retina prévio', 'sim_nao', C, 'POP §1.C'),
          item(D7.refrativa, 'Cirurgia refrativa prévia: LASIK, PRK, RK', 'sim_nao', C, 'POP §1.C', {
            alerta: { descricao: 'Sim → ALERTA (cálculo da LIO)', nivel: 'alerta' },
          }),
          item(D7.trauma, 'Trauma ocular prévio', 'sim_nao', C, 'POP §1.C'),
          item(D7.olhoUnico, 'Olho único ou ambliopia', 'sim_nao', C, 'POP §1.C e §11', {
            alerta: { descricao: 'Sim → ALERTA. Alerta por extenso: "OLHO ÚNICO".', nivel: 'alerta' },
          }),
          item(D7.olhoVermelho, 'Olho vermelho, secreção, terçol hoje', 'sim_nao', C, 'POP §1.C', {
            alerta: { descricao: 'Sim → ALERTA', nivel: 'alerta' },
          }),
          item(D7.cirurgiaOcularPrevia, 'Cirurgia ocular prévia no olho a operar', 'sim_nao', C, 'POP §1.C'),
        ],
      },
      {
        id: 'D',
        titulo: 'D. Alergias',
        itens: [
          item(D7.alergiaMedicamentos, 'Alergia a medicamentos (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.alergiaLatex, 'Alergia a látex (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.alergiaIodo, 'Alergia a iodo / PVPI (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.alergiaAdesivo, 'Alergia a adesivo, esparadrapo (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.alergiaAnestesicos, 'Alergia a anestésicos (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.alergiaSulfa, 'Alergia a sulfa (descrever a reação)', 'alergia', C, 'POP §1.D'),
          item(D7.nenhumaAlergia, 'Nenhuma alergia conhecida (marcar explicitamente)', 'sim_nao', C, 'POP §1.D', {
            ajuda: 'Tem de ser coerente com os itens acima: "sim" só se nenhum item tiver alergia; "não" exige ao menos uma alergia registrada.',
          }),
        ],
      },
      {
        id: 'E',
        titulo: 'E. Capacidade e logística',
        itens: [
          item(D7.deitar, 'Consegue deitar reto e imóvel por 30 min? (coluna, falta de ar, tosse, tremor de cabeça)', 'sim_nao', C, 'POP §1.E', {
            alerta: { descricao: 'Não → ALERTA', nivel: 'alerta' },
          }),
          item(D7.mobilidade, 'Mobilidade (cadeira de rodas, risco de queda)', 'multipla', C, 'POP §1.E e §2 (dot Q)', {
            opcoes: [
              { valor: 'sem_limitacao', rotulo: 'Sem limitação' },
              { valor: 'cadeira_rodas', rotulo: 'Cadeira de rodas' },
              { valor: 'marcha_instavel', rotulo: 'Marcha instável / risco de queda' },
            ],
          }),
          item(D7.compreende, 'Ouve e compreende comandos simples', 'sim_nao', C, 'POP §1.E', {
            alerta: { descricao: 'Não → ALERTA', nivel: 'alerta' },
          }),
          item(D7.quemInstila, 'Quem instila os colírios em casa', 'opcao', C, 'POP §1.E e §10 (quem instila)', {
            opcoes: [
              { valor: 'paciente', rotulo: 'O próprio paciente' },
              { valor: 'outra_pessoa', rotulo: 'Outra pessoa (cuidador)' },
              { valor: 'ninguem', rotulo: 'Ninguém disponível' },
            ],
            alerta: { descricao: 'Ninguém disponível → ALERTA ao cirurgião antes da cirurgia (POP §10)', nivel: 'alerta' },
          }),
          item(D7.quemInstilaPessoa, 'Quem instila: nome e telefone', 'pessoa', C, 'POP §1.E', {
            obrigatorio: false,
            exigidoQuando: { itemId: D7.quemInstila, valores: ['outra_pessoa'] },
            camposPessoa: ['nome', 'telefone'],
          }),
          item(D7.quemInstilaOrientacao, 'Quem instila estava na orientação?', 'sim_nao', C, 'POP §1.E', {
            obrigatorio: false,
            exigidoQuando: { itemId: D7.quemInstila, valores: ['outra_pessoa'] },
          }),
          item(D7.acompanhanteTitular, 'Acompanhante do dia D (titular): nome, parentesco, telefone', 'pessoa', C, 'POP §1.E e §8 (prevenção)', {
            camposPessoa: ['nome', 'parentesco', 'telefone'],
            ajuda: 'Também é cadastrado nos contatos do episódio (acompanhante titular).',
          }),
          item(D7.acompanhanteReserva, 'Acompanhante reserva: nome, telefone', 'pessoa', C, 'POP §8 (prevenção)', {
            obrigatorio: false,
            camposPessoa: ['nome', 'telefone'],
            ajuda: 'POP §8: acompanhante titular e reserva registrados no D-7, com telefone. Também é cadastrado nos contatos.',
          }),
          item(D7.emergencia, 'Contato de emergência (de preferência outra pessoa)', 'pessoa', C, 'POP §1.E', {
            camposPessoa: ['nome', 'telefone'],
            ajuda: 'Também é cadastrado nos contatos do episódio (emergência).',
          }),
          item(D7.cidadeTransporte, 'Cidade de residência e transporte', 'texto', C, 'POP §1.E'),
          item(D7.whatsapp, 'WhatsApp para vídeo e TCLE: número e quem opera o celular', 'pessoa', C, 'POP §1.E', {
            camposPessoa: ['nome', 'telefone'],
            ajuda: 'Nome = quem opera o celular. Também é cadastrado nos contatos (WhatsApp do paciente), com a anuência do paciente.',
          }),
        ],
      },
      {
        id: 'F',
        titulo: 'F. Expectativa',
        itens: [
          item(D7.esperaEnxergar, '"O que o senhor espera enxergar depois da cirurgia?" (registro literal)', 'texto', C, 'POP §1.F'),
          item(D7.semOculos, 'Espera ficar sem óculos?', 'opcao', C, 'POP §1.F', {
            opcoes: [
              { valor: 'sim', rotulo: 'Sim' },
              { valor: 'nao', rotulo: 'Não' },
              { valor: 'nao_sabe', rotulo: 'Não sabe' },
            ],
            alerta: { descricao: 'Espera ficar sem óculos e LIO monofocal planejada → ALERTA: realinhar expectativa em consulta antes do TCLE', nivel: 'alerta' },
          }),
          item(D7.atividade, 'Atividade visual principal (dirigir à noite, leitura, celular, costura)', 'texto', C, 'POP §1.F'),
        ],
      },
      {
        id: 'G',
        titulo: 'G. Fechamento',
        itens: [
          item(D7.folhasExame, 'Cada folha de exame impressa tem nome e data de nascimento conferidos', 'confirmacao', C, 'POP §1.G'),
          item(D7.olhoExame, 'Olho do exame = olho do pedido', 'confirmacao', C, 'POP §1.G'),
          item(D7.pacienteConferiu, 'Paciente (e acompanhante, com anuência) conferiu os dados impressos', 'confirmacao', C, 'POP §1.G e §0 (LGPD)'),
          item(D7.alertasComunicados, 'Alertas comunicados ao cirurgião: quem, quando, por qual via', 'confirmacao', C, 'POP §1.G', {
            ajuda: 'Só pode ser marcado quando todos os ALERTAS estiverem comunicados (registro de quem, quando e por qual via, em Alertas).',
          }),
          item(D7.materiais, 'Vídeo de preparo e link do TCLE enviados', 'opcao', C, 'POP §1.G; §7 (armadilhas); §14 (assinatura presencial)', {
            opcoes: [
              { valor: 'enviados', rotulo: 'Enviados pelo painel (vídeo de preparo e link do TCLE)' },
              { valor: 'presencial', rotulo: 'Sem smartphone ou não lê: orientação e TCLE presenciais (tablet com testemunha ou papel)' },
            ],
            ajuda: '"Enviados" exige o envio registrado pelo painel (materiais).',
          }),
          item(D7.concierge, 'Concierge: nome, data e assinatura (registrados na conclusão do bloco)', 'confirmacao', C, 'POP §1.G'),
        ],
      },
    ],
  }
}
