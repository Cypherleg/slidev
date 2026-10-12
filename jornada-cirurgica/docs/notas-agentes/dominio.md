# Notas do agente domínio

Regras do POP v0.4 em TypeScript puro: `supabase/functions/_shared/dominio/` (sem dependências; imports relativos com `.ts`).
Testes: `npx vitest run tests/dominio` → **137 testes passando** (9 arquivos). `npx tsc -p tsconfig.json --noEmit` sem erros
(também limpo com `--noUnusedLocals --noUnusedParameters` nos arquivos do domínio). Os 69 testes de `tests/api` (banco real) passam com este domínio.

Só dados fictícios. Nenhum telefone, nome da equipe ou número de WhatsApp do POP foi para o código (o repositório é público):
`configPadrao().telefones` vem nulo e é preenchido pela gestora.

---

## 1. Módulos

| Arquivo | Conteúdo |
| --- | --- |
| `index.ts` | Superfície pública. Mesmas assinaturas do contrato; implementações nos módulos abaixo. Exports novos no fim do arquivo. |
| `contrato.ts` | Tipos que estavam em `index.ts` (`ErroDominio`, `Ator`, `Comando`, `EntradaEstado`, `Estado`, `ContextoDecisao`, `NovaMensagem`, `RegistroLente`, `MaterialCatalogo`, `Etiqueta`, `Indicador`...), movidos sem mudar a forma (evita ciclo de import). `index.ts` reexporta tudo. |
| `tipos.ts` | Só acréscimos opcionais (seção 6). |
| `config.ts` | `configPadrao()`, modelos de etiqueta padrão, limiar técnico de nome parecido. |
| `permissoes.ts` | Matriz papel × evento (ARQUITETURA §4.4), `linhasMatrizPermissoes()`, papéis de leitura das conferências. |
| `modelos/ids.ts` | Ids estáveis dos itens que as regras consultam (`D7`, `CP1`, `CP2`, `D2`, `ADM`, `SI`, `AN`, `TO`, `SO`, `ALTA`). |
| `modelos/v1/*.ts` | Modelos v1 (`pop-0.4/1`): `d7.ts`, `lente.ts` (cp1, cp2), `d2.ts`, `d0.ts` (admissão, Sign In, anestesia, Time Out, Sign Out, alta), `index.ts` (`modelosPadrao(config?)`, `versoesDosModelos`). |
| `estado/tipos.ts` | Estrutura interna do `Estado` (não é contrato). |
| `estado/montar.ts` | `montarEstado`: dobra em ordem de `seq`; ciclos da lente; trilha de alertas e de hard stops. |
| `estado/consultas.ts` | Consultas puras (ciclo atual, herança, etapa da lente, respostas, conclusões). |
| `regras/alertas.ts` | Alertas do POP (ALERTA e "registrar e sinalizar"), GLP-1, quiz e teach-back. |
| `regras/hardstops.ts` | Os 13 `CodigoHardStop`: condição, o que bloqueia, quem resolve, como resolver, fonte, se gera quase-evento, se suspende avisos. |
| `regras/dots.ts` | Dots A, Q, M, I, S, D com motivo; teto 6. |
| `regras/identificacao.ts` | Homônimo, nome parecido, 2º olho, alertas por extenso. |
| `regras/lente.ts` | `compararLente`, `formatarDioptria`, validação de plano, chegada, cp2 e leitura do Time Out. |
| `regras/blocos.ts` | Disponibilidade, itens exigidos, `faltam`, impedimentos, situação de cada bloco. |
| `regras/horareal.ts` | Regra 5 (fora de hora). |
| `regras/pendencias.ts` | "O que falta". |
| `decidir.ts` | `decidir` + pré-checagens (`PRE`) reaproveitadas pelo mapa de permissões. |
| `projecao.ts` | `projetarVisao` (filtro por papel) e `permissoesDoAtor`. |
| `mensagens.ts` | Textos exatos (briefing §7 e TCLE), destinatários, bloqueio, idempotência. |
| `resumos.ts` | `resumoDia`, `resumoVespera`, `visaoLeituraDia`. |
| `etiquetas.ts`, `quiz.ts`, `indicadores.ts`, `abertura.ts`, `paciente-pagina.ts` | Etiquetas; quiz (§6); indicadores (§12); cadastro, abertura e correção de paciente; prévia de materiais e situação da página do paciente. |
| `util/*.ts` | CPF, nomes (Jaro-Winkler), datas (`Intl`, America/Sao_Paulo), telefone, hash curto. |

Testes em `tests/dominio/`: `apoio.ts` (simulador que faz o papel da API: grava eventos com `seq`, monta o estado completo ou só o que a RLS deixaria o papel ler), `hardstops`, `conferencia-cega`, `jornada` (D-7, D-2, D0 até a alta; avisos), `ordem-horareal`, `alertas-dots`, `pendencias-indicadores`, `quiz`, `utilitarios-modelos` (inclui a matriz comparada com a tabela da ARQUITETURA §4.4), `permissoes-estado`.

---

## 2. O que outros agentes precisam saber

### API
- **Decisão**: `decidir(montarEstado(entradaCompleta), comando, ctx)`. Os eventos voltam sem `id`, `seq` e `registradoEm`; grave na ordem devolvida. Os registros de lente já vêm com `id` (de `ctx.gerarId`). O domínio nunca recebe hora do cliente: usa `ctx.agora` para a hora real.
- **Visibilidade**: `checklist.item_respondido` de cp1 → `conferencia_1`, de cp2 → `conferencia_2`; todo o resto é `geral` (inclusive `lente.plano_registrado`, `lente.chegada_registrada`, `lente.cp2_registrado` e `bloco.concluido` de cp1/cp2, para a segunda conferente saber a situação sem ver valores). Nenhum evento `geral` tem as chaves `dioptria`, `cilindro` ou `eixo` (teste varre todos os eventos de uma jornada tórica; o CHECK do banco está coberto).
- **Registros de lente**: `plano`/`chegada` → `conferencia_1`; `cp2` → `conferencia_2`; `time_out` → `conferencia_1` (o banco filtra a leitura por etapa; o valor escolhido não expõe nada à segunda conferente).
- **`ctx.atorViuConferencia1`**: se verdadeiro, o cp2 é recusado com `CONFERENCIA_CEGA`. Além disso o domínio recusa quem registrou plano, chegada, respostas ou conclusão do cp1 em QUALQUER ciclo do episódio.
- **Erros**: `HARD_STOP` traz `detalhes.hardStops` (lista de códigos) e `detalhes.transicao`; `ORDEM` pode trazer `detalhes.hardStop`; `VALIDACAO` de conclusão traz `detalhes.impedimentos` (lista de textos) e muitas vezes `detalhes.campo`/`itemId`. Mensagens sem dado de paciente.
- **Avisos**: `NovaMensagem.estadoInicial` = `ensaio` com `ctx.envioHabilitado=false`. Gatilhos automáticos em `bloco.concluir` de admissão, Time Out, Sign Out e alta; atraso só por `avisos.atraso` (recusado com `ESTADO` quando os avisos estão suspensos). Para cada mensagem há um evento `mensagem.enfileirada` (`{ mensagemId, gatilho, contatoId, estadoInicial }`). Chave: `jc1:<episodio>:<gatilho>:<contato>:<ocorrência>`.
- **Página do paciente**: `corrigirQuiz` não preenche `tentativa.em` (fica `''`): a API preenche com a hora do servidor; `eventoQuizRespondido({ ..., tentativa, erradas: questoesErradas(...) })`, `eventoMaterialAberto(...)`, `situacaoPaginaPaciente(estado)`, `proximaAcaoQuiz`, `podeResponderQuiz`. Na dobra, `quiz.respondido` aceita `dados.tentativa` ou os campos soltos.
- **Prévia**: `previaMateriais(estado, materiais, ctx)` (não grava; texto com "[link gerado no envio]").
- **`paciente.corrigir`**: agora existe `corrigirPaciente({ paciente, campo, valor, motivo }, ctx)` → `NovoEvento` (`{ campo, valorAnterior, valor, motivo, nomeNormalizado? }`). Opcional: a API já monta esse evento.
- **Intercorrência**: `Comando` ganhou `neverEvent?: 'olho_errado' | 'paciente_errado' | 'lio_errada'` (opcional) para o indicador 5. O `AcoesEquipe['intercorrencia.registrar']` do contrato da API ainda não tem o campo (sugestão ao orquestrador).
- **`contato.salvar`**: no domínio o `id` é obrigatório (a API gera quando a interface não manda). Trocar o telefone, o tipo ou retirar a anuência desfaz a confirmação.
- **`materiais.enviar`**: exige `ctx.urlPaginaPaciente` e WhatsApp do paciente com anuência e confirmado; o texto da mensagem contém o link com o token (a API já troca por marcador antes de gravar).
- **`modelosPadrao(config?)`**: com `itensAnestesiaExtras`, o modelo de anestesia ganha a seção `EXTRAS` (ids `EXTRA.<id>`) e versão `pop-0.4/1+anest.<hash>`.

### Interface
- Chaves de `EpisodioVisao.permissoes`: `"<acao>"` (nomes de `api/contrato.ts`), `"checklist.responder:<modelo>"`, `"bloco.concluir:<modelo>"`, `"hardstop.resolver:<codigo>"` (só para os de resolução escrita abertos). `bloco.concluir:<modelo>` já considera impedimentos; o motivo é o primeiro impedimento.
- **Itens com tratamento especial** (ids em `modelos/ids.ts`):
  - `D7.olhoPaciente` (`A.olho_paciente`): tipo `olho` com "não sabe". "Pedido e paciente coincidem?" NÃO é item: é o alerta `d7:A.olho_paciente`.
  - `D7.alertasComunicados` (`G.alertas_comunicados`): só marcável quando todos os alertas de nível `alerta` estiverem comunicados (ou com conduta).
  - `D7.materiais` (`G.materiais`): opção `enviados` só depois de `materiais.enviar`; `presencial` para quem não tem smartphone ou não lê (POP §7 e §14).
  - `D7.nenhumaAlergia` (`D.nenhuma`): coerente com os 6 itens de alergia (tipo `alergia`, reação obrigatória quando `tem`).
  - Itens `pessoa` do bloco E (`E.acompanhante_titular`, `E.acompanhante_reserva`, `E.contato_emergencia`, `E.whatsapp`, `E.quem_instila_pessoa`) também viram contatos pela interface (`contato.salvar` com os tipos `acompanhante_titular`, `acompanhante_reserva`, `emergencia`, `whatsapp_paciente`, `cuidador_colirios`). `camposPessoa` diz o que é obrigatório.
  - `C.representante` (pessoa, exigida se `C.demencia = sim`) alimenta "DÉFICIT COGNITIVO — REPRESENTANTE: nome".
  - Medicamentos: `camposMedicamento` (`['glp1']` em `B.glp1`, `['insulina']` em `B.insulina_antidiabeticos`). Em uso, o nome comercial é obrigatório; GLP-1 em uso exige dose (`detalhes`), aplicação, última aplicação, início/aumento e náusea; insulina em uso exige `detalhes` e `insulinaOuSulfonilureia`; colírio em uso exige `detalhes` (nome e olho).
  - Sign In: `B.marcacao_sitio` (só cirurgião) depois de `B.identificacao_ativa`; `B.midriatico` depois de identificação, consentimento ("sim") e marcação, **registrados antes em envios separados** (no mesmo envio é recusado). `B.conduta_alertas`: `presente` | `nao_se_aplica` (conferido contra os alertas).
  - Time Out: a leitura da caixa é o comando `lente.time_out` (pseudo-item `marcar:time_out.leitura_lio` nos `bloqueia` dos hard stops); `C.read_back` só depois da leitura conferida.
  - Anestesia: `AN.liberacao_recuperacao` só depois do Sign Out concluído.
  - Sign Out: `D.intercorrencias = registradas` exige intercorrência registrada; `sem_intercorrencia` é recusado se houver.
  - Itens `confirmacao` só aceitam `true` (item não conferido não é marcado).
- Campos novos de `ItemModelo`: `exigeSim`, `exigidoQuando` (`{itemId, valores}` ou `{contexto: 'homonimo_no_dia' | 'lente_torica' | 'dot_D'}`), `camposPessoa`, `exigeBlocosConcluidos`, `foraDeHoraApos`, `camposMedicamento`.
- Campos novos da visão: `lente.timeOut` (leitura, só circulante/cirurgião/gestora), `lente.origemCiclo`, `lente.faltaNoCiclo`, `lente.ciclosAnteriores`, `hardStopsResolvidos`.
- `Pendencia.local` (valores usados): `hardstops`, `d7`, `d7.<seção>` (A–G), `alertas`, `lente.plano`, `lente.chegada`, `lente.cp1`, `lente.cp2`, `episodio`, `tcle`, `materiais`, `contatos`, `orientacoes`, `d7.E`, `d2`, e os modelos do D0 (`admissao`, `sign_in`, `anestesia`, `time_out`, `sign_out`, `alta`).
- Pré-visualização de etiqueta: `preencherModelo(modelo, valores)` (mesma regra do domínio: linha com marcadores vazios some). Formatação: `formatarDioptria`, `formatarData`, `formatarDataHora`, `dataLocal`, `horaLocal` exportados.
- Catálogos: `catalogoHardStops()`, `LEGENDA_DOTS`, `ROTULO_ETAPA_LENTE`, `MODELOS_META`.

### Banco
- Matriz idêntica à §4.4 (o teste lê a tabela do `docs/ARQUITETURA.md` e compara com `linhasMatrizPermissoes()`).
- Registro `time_out` em `lente_registros` com visibilidade `conferencia_1` (ver acima).

---

## 3. Decisões de implementação

1. **Ciclos da lente.** Cada resolução de quarentena e cada troca de LIO abre um novo ciclo (`ciclo` nos dados dos eventos de lente e das respostas/conclusões de cp1/cp2). Herança:
   | Origem do ciclo | Herda | Refaz |
   | --- | --- | --- |
   | `novo_plano` (quarentena) | nada | plano, chegada, cp1, cp2 |
   | `troca_d0` | nada | plano, chegada, cp1, cp2 |
   | `manter_plano` com quarentena no cp1 | plano | chegada, cp1, cp2 |
   | `manter_plano` com quarentena no cp2 | plano, chegada, cp1 | cp2 (cego) |
   | `manter_plano` com quarentena no Time Out | plano | chegada, cp1, cp2 e nova leitura |
   Ninguém corrige o valor do outro: não há edição de cp2 (uma digitação por ciclo); o plano só pode ser redigitado pela concierge antes de concluir o cp1 do ciclo.
2. **Quarentena** abre por: divergência do cp2 (contra o plano e contra o olho do episódio); "não" no cp1/cp2 em itens de identidade, olho, modelo, dioptria, tórica (cilindro/eixo) e "coluna do modelo" (cp2); plano com olho diferente do olho do episódio; leitura divergente no Time Out (contra o plano e contra o cp2). Cada abertura gera `quase_evento.registrado` com a etapa (`chegada`, `d2`, `d0`).
3. **Hard stops**: abertos por condição (somem quando o registro competente corrige a condição) ou, para HS3 e HS7, por ocorrência que só fecha com `hardstop.resolver` do cirurgião. `hardstop.resolver` em hard stop de condição → `VALIDACAO` com o "como resolver". HS1 e HS_LIO_TIME_OUT saem por `lente.resolver_quarentena`; HS6 pela conduta no alerta.
4. **Quase-evento automático** (POP §13.9) quando um comando abre HS1, HS2, HS3, HS4, HS5, HS6, HS7, HS8 ou HS_LIO_TIME_OUT. HS9, HS_ORDEM_SIGN_IN (regras de ordem, abertos durante todo Sign In), HS_HOMONIMO_NOME_MAE e HS_LIO_SEM_DUPLA_CONFERENCIA não geram.
5. **Avisos suspensos** com intercorrência, suspensão, cancelamento ou hard stop aberto, exceto as regras de ordem do Sign In (HS9 e HS_ORDEM_SIGN_IN), que estão abertas por construção logo depois da admissão.
6. **Ordem dos blocos**: d2 só é respondido depois do D-7 concluído; admissão depois do D-2; Sign In e anestesia depois da admissão; Time Out depois do Sign In; Sign Out depois do Time Out; alta depois do Sign Out e exige anestesia concluída. cp1 exige plano; cp2 exige cp1 concluído e sem quarentena. cp1, cp2 e anestesia não mudam o estado.
7. **Hora real (regra 5)** — fora de hora, com motivo: (a) resposta a item de bloco já concluído (cp1/cp2: no ciclo atual); (b) item de bloco do D0 respondido depois de um bloco POSTERIOR do D0 concluído (sequência admissão → Sign In → Time Out → Sign Out → alta; na anestesia, por item: `foraDeHoraApos` = Time Out para jejum e monitorização, alta para liberação e extras); (c) item ou conclusão de bloco do D0 (e a leitura do Time Out) registrado em data local (São Paulo) diferente da data da cirurgia, ou sem data agendada. Correção depois da conclusão é aceita e sinalizada (não é recusada).
8. **D-7**: concluir exige todos os itens exigidos, coerência das alergias e todos os alertas de nível `alerta` comunicados. Conduta escrita pelo cirurgião também conta como comunicação (ele foi informado). Conduta pode vir depois: vira pendência do cirurgião e, para α-bloqueador, anticoagulante e antiagregante, HS6 no D0.
9. **Agenda**: a data não muda depois da admissão; horário e ordem podem mudar até o Time Out.
10. **Suspensão e cancelamento**: causa obrigatória; `evitavel` em branco vira `true` para as causas listadas no indicador 6 (o POP as lista como evitáveis) e fica nulo para "outra". Suspenso e cancelado são terminais (nenhum comando clínico); cancelar um suspenso é permitido.
11. **Sign In/Time Out**: `leitorId` e `confirmadorId` obrigatórios e distintos, membros ativos da equipe do bloco; no Time Out o leitor tem papel circulante e o confirmador, cirurgião.
12. **Indicadores**: período pela data da cirurgia (4 e 5 pela data do evento). 1 e 3 sobre cirurgias realizadas (Time Out concluído); 3 exige cp1 e cp2 por pessoas diferentes, ambos antes da data da cirurgia, no ciclo usado; 4 conta quase-eventos de identidade/olho/LIO (HS1, HS3, HS_LIO_TIME_OUT) e os registrados à mão, por etapa; 5 conta intercorrências marcadas como never event; 6 conta suspensões/cancelamentos registrados no dia da cirurgia com causa evitável; 7 TCLE assinado até D-2. Complementar (nº 9): aprovação no quiz na 1ª tentativa + perguntas mais erradas. 2 e 8: nulos (dado externo).

---

## 4. Interpretações [S] a confirmar

1. **GLP-1/tirzepatida — janela de suspensão**: semanal = última aplicação pelo menos 7 dias antes da data da cirurgia; diário = sem uso na véspera nem no dia (última aplicação pelo menos 2 dias antes). Data de referência: data agendada ou, sem agenda, a sugerida. O ALERTA geral do GLP-1 existe sempre; o específico "avisar o cirurgião no mesmo dia" (`d7:B.glp1.prazo`) só quando o prazo não cabe. Recalcula se a data mudar.
2. **`manter_plano`** — herança da tabela da seção 3. No Time Out, conservador: a caixa é reconferida por duas pessoas (chegada, cp1, cp2) antes de nova leitura. `manter_plano` é recusado quando o olho do plano difere do olho do episódio.
3. **Conferência cega por autoria em qualquer ciclo** (mais conservador que "no ciclo").
4. **HS3 e HS7 com resolução escrita só do cirurgião**; o item que divergiu ainda precisa ser reconferido ("sim") para o bloco concluir. HS7 também abre no D0 (a partir do D-2 concluído) se o alerta de olho vermelho do D-7 estiver sem conduta. Novo achado (D-2, depois admissão) abre nova ocorrência.
5. **HS5**: aberto do D-2 concluído até o Sign In se o TCLE não estiver "assinado" (ou "olho conferido"), e sempre que "TCLE assinado; olho do TCLE = olho da agenda" (admissão) ou a reconfirmação do consentimento (Sign In) for "não". O item da admissão é quem confere o olho.
6. **HS6** inclui antiagregante (POP §9.B e dot S); aberto do D-2 concluído até o Sign In.
7. **HS4** também na alta ("acompanhante presente" = "não").
8. **HS2** no item da biometria do cp1, do cp2 e no item da sala do Sign In ("biometria original e plano de LIO presentes").
9. **HS8**: `lente.troca_d0` aceito em qualquer fase antes do Time Out concluído (é o único caminho para o cirurgião trocar o plano depois do cp1); HS8 fica aberto até novo plano + cp1 + cp2 do novo ciclo.
10. **`exigirCp2AntesDoTimeOut: true`** (padrão): HS_LIO_SEM_DUPLA_CONFERENCIA do admitido até o Time Out quando o ciclo atual não tem cp2 concluído (fora de troca, coberta pelo HS8).
11. **Marcação do sítio depois da identificação ativa** (o cirurgião marca o olho que o paciente confirmou).
12. **Validade da LIO "aaaa-mm"** lida como o PRIMEIRO dia do mês (conservador): cp1 não conclui se a validade não for posterior à data da cirurgia; pendência se a data mudar depois.
13. **Texto "NOME PARECIDO NO DIA"** para nome parecido (o POP só dá "HOMÔNIMO NO DIA"). Limiar técnico de similaridade 0,9 (Jaro-Winkler sobre o nome normalizado), configurável; validar com a agenda real.
14. **2º olho sem data do 1º**: "2º OLHO — 1º olho sem data de cirurgia registrada". Episódios cancelados ou suspensos do outro olho não contam.
15. **Fim da cirurgia sem previsão**: só a oração da previsão sai ("Agora é a recuperação."), para não perder a frase.
16. **TCLE**: `[nome]` = primeiro nome; nome da concierge = `config.assinaturaConcierge` (se configurado) ou primeiro nome do usuário que envia; "Dr." antes do nome do cirurgião (prefixo "Dr./Dra." do cadastro é retirado para não duplicar).
17. **Destinatários dos avisos do D0**: contatos `familiar_avisos` e `whatsapp_paciente` com anuência, confirmados e telefone válido; número repetido recebe uma vez.
18. **Expectativa × LIO**: ALERTA só para LIO "monofocal" (o POP lista "tórica" à parte). Confirmar se tórica monofocal também deve alertar.
19. **Dots**: Q por cadeira de rodas, marcha instável/risco de queda (sem limiar de idade) e olho único/ambliopia; I e S também por uso passado (S: anticoagulante ou antiagregante); D só com insulina ou sulfonilureia EM USO.
20. **"Olho do exame = olho do pedido"** (G) como conferência: sem ela o D-7 não conclui (o POP não diz o que fazer na divergência; não inventei alerta).
21. **Quiz**: erro na pergunta 1 → aguardar contato humano já na 1ª tentativa (além do ALERTA). Contato humano (reprovação dupla/erro do olho) e "link não aberto até D-3" são resolvidos por um teach-back registrado depois (ou pela abertura do link).
22. **Pendência do D-2**: a partir do D-2 (00:00); vira alerta na véspera.
23. **Contato confirmado** perde a confirmação se o telefone, o tipo ou a anuência mudarem.

---

## 5. Pendências do POP refletidas no código

| Pendência (POP/briefing) | Onde aparece |
| --- | --- |
| Colírio pré-operatório do AL-01 "[informar]" | `D2.colirios` e `A.colirios_pre`: `pendente`, não obrigatórios |
| Plausibilidade do cp2 [RASCUNHO] | `CP2.plausibilidade`: texto opcional, `pendente`, sem regra |
| Exceções da insulina, sulfonilureia/glinida, SGLT2 (§14) | `pendente` em `B.insulina_antidiabeticos` |
| Conduta quando GLP-1 aplicado dentro do prazo (§14) | `pendente` em `B.glp1` |
| Horário de referência do jejum e lista de líquidos | `pendente` em `A.jejum_medicacoes` |
| 60 min de estabilidade na faco sob tópica | `pendente` em `CRIT.sinais_vitais` |
| Residentes em campo × TCLE (§14) | `pendente` em `C.equipe_apresentada` |
| Rastreabilidade de implantes (ANVISA) | `pendente` em `D.etiquetas_lio` |
| WhatsApp da concierge, telefone fora do horário (escala) | `pendente` em `DOC.telefones`; `config.telefones` nulo |
| Demais itens da anestesia | descrição do modelo; `config.itensAnestesiaExtras` |
| Gatilho "sedação" do dot Q | não implementado: se todo paciente recebe sedação, Q seria universal. Decidir com o serviço |
| Itens de bloqueio/sedação (ordem do Sign In) | não existem no modelo; quando o serviço de anestesia definir, marcar como posteriores ao Sign In |
| Plataforma de assinatura do TCLE; "uma cópia segue em anexo" | `tcle.status` manual; textos de lembrete (D-3) e confirmação exportados (`textoTcleLembrete`, `textoTcleConfirmacao`) mas NÃO disparados automaticamente (precisam de agendador e do anexo); a pendência `tcle.lembrete_d3` avisa a concierge |
| Mensagem do D-1 ("sem acompanhante adulto a cirurgia não é realizada") | sem texto aprovado: não implementada |
| Modelos da Meta | nomes sugeridos em `MODELOS_META` (`jornada_admissao_v1`, `..._sem_previsao_v1` etc.); cadastro é da equipe |
| Tempos de espera por etapa | `temposEtapa` vazio: mensagens sem previsão |
| Acompanhante só na alta / horário-limite do acompanhante a caminho [RASCUNHO] | não modelado: HS4 conservador (sem acompanhante presente, não passa da admissão) |
| Programa e formato da impressora de etiquetas | só texto, modelos configuráveis |
| Reativação de episódio suspenso | não definida: suspenso é terminal (reagendar = novo episódio ou decisão a tomar) |
| Ligação no D1 quando o cuidador não é o acompanhante (§10) | registrada na opção do item `ALTA.quem_instila`; sem evento de conclusão, não vira pendência |
| "Se outra pessoa instila, ela também responde ao quiz" | o quiz não distingue quem respondeu (sugestão do web-apoio: `respondente`) |
| Bilateral no mesmo dia | fora do escopo (o mesmo paciente no dia não conta como homônimo) |

---

## 6. Mudanças no contrato (só acréscimos)

- `tipos.ts`: `ItemModelo` + `exigeSim`, `exigidoQuando`, `camposPessoa`, `exigeBlocosConcluidos`, `foraDeHoraApos`, `camposMedicamento`; tipo `CondicaoItem`; `LenteVisao` + `timeOut`, `origemCiclo`, `faltaNoCiclo`, `ciclosAnteriores`; `EpisodioVisao` + `hardStopsResolvidos`.
- `contrato.ts` (novo): tipos movidos de `index.ts` sem mudança; `Comando` de intercorrência + `neverEvent?`; tipo `NeverEvent`.
- `index.ts`: `modelosPadrao(config?)` (parâmetro opcional); exports novos: `versoesDosModelos`, ids de itens, `linhasMatrizPermissoes`, `PAPEIS_POR_MODELO`, `PAPEIS_POR_EVENTO`, `PAPEIS_LEITURA`, `permissoesDoAtor`, `normalizarModelo`, `validadePosterior`, `LEGENDA_DOTS`, `TETO_DOTS`, `textoDot`, `DEFINICOES_HARD_STOP`, `catalogoHardStops`, constantes de alertas, `prazoGlp1Cabe`, textos de identificação, textos de mensagens, `chaveIdempotencia`, funções do quiz e da página do paciente, `previaMateriais`, `preencherModelo`, `corrigirPaciente`, `ROTULO_ETAPA_LENTE`, `MODELOS_ETIQUETA_PADRAO`, `LIMIAR_NOME_PARECIDO_PADRAO`, `telefoneValido` e utilitários de data.

Nada foi removido nem mudou de tipo.
