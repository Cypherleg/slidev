# Notas do agente domínio

Regras do POP v0.4 em TypeScript puro: `supabase/functions/_shared/dominio/` (sem dependências; imports relativos com `.ts`).
Testes: `npx vitest run tests/dominio` → **169 testes passando** (10 arquivos). `npx tsc -p tsconfig.json --noEmit` sem erros.
`tests/api` (banco real): 82 passam, 2 falham + 1 suíte (`beforeAll`), todos pela mesma causa no preenchedor de `dev/` (seção 8, item 1);
com a correção de uma linha proposta lá, os 88 passam (conferido com uma cópia do preenchedor fora do repositório).
A fase 2 (revisão de fidelidade ao POP) está nas seções 7 a 9.

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
| `modelos/v1/*.ts` | Modelos v1 (versão `pop-0.4/2` desde a fase 2; era `pop-0.4/1`): `d7.ts`, `lente.ts` (cp1, cp2), `d2.ts`, `d0.ts` (admissão, Sign In, anestesia, Time Out, Sign Out, alta), `index.ts` (`modelosPadrao(config?)`, `versoesDosModelos`). |
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
3. **Hard stops**: abertos por condição (somem quando o registro competente corrige a condição) ou por ocorrência escrita, que só fecha com `hardstop.resolver` do cirurgião (HS3, HS7 e, desde a fase 2, a dúvida do consentimento no HS5 e a divergência de procedimento no HS_LIO_TIME_OUT). Um código pode ter as duas partes; `exigeResolucaoEscrita`, `resolvivelPor` e `comoResolver` da visão dizem qual está aberta. `hardstop.resolver` em hard stop só de condição → `VALIDACAO` com o "como resolver". HS1 e a parte LIO do HS_LIO_TIME_OUT saem por `lente.resolver_quarentena`; HS6 pela conduta no alerta.
4. **Quase-evento automático** (POP §13.9) quando um comando abre HS1, HS2, HS3, HS4, HS5, HS6, HS7, HS8 ou HS_LIO_TIME_OUT, ou quando um deles já aberto ganha nova fonte escrita (nova divergência). Leva `categoria` (`identidade`, `olho`, `lio`, `outro`). HS9, HS_ORDEM_SIGN_IN (regras de ordem, abertos durante todo Sign In), HS_HOMONIMO_NOME_MAE e HS_LIO_SEM_DUPLA_CONFERENCIA não geram (pergunta P3 da seção 9).
5. **Avisos suspensos** com intercorrência, suspensão, cancelamento ou hard stop aberto, exceto as regras de ordem do Sign In (HS9 e HS_ORDEM_SIGN_IN), que estão abertas por construção logo depois da admissão.
6. **Ordem dos blocos**: d2 só é respondido depois do D-7 concluído; admissão depois do D-2; Sign In e anestesia depois da admissão; Time Out depois do Sign In; Sign Out depois do Time Out; alta depois do Sign Out e exige anestesia concluída. cp1 exige plano; cp2 exige cp1 concluído e sem quarentena. cp1, cp2 e anestesia não mudam o estado.
7. **Hora real (regra 5)** — fora de hora, com motivo: (a) resposta a item de bloco já concluído (cp1/cp2: no ciclo atual); (b) item de bloco do D0 respondido depois de um bloco POSTERIOR do D0 concluído (sequência admissão → Sign In → Time Out → Sign Out → alta; na anestesia, por item: `foraDeHoraApos` = Time Out para jejum e monitorização, alta para liberação e extras); (c) item ou conclusão de bloco do D0 (e a leitura do Time Out) registrado em data local (São Paulo) diferente da data da cirurgia, ou sem data agendada. Correção depois da conclusão é aceita e sinalizada (não é recusada).
8. **D-7, D-2 e admissão**: concluir exige todos os itens exigidos e todos os alertas de nível `alerta` comunicados (D-7 também a coerência das alergias). Conduta escrita pelo cirurgião também conta como comunicação (ele foi informado). Conduta pode vir depois: vira pendência do cirurgião e, para α-bloqueador, anticoagulante e antiagregante, HS6 no D0. Desde a fase 2, comunicação e conduta valem para o conteúdo do alerta na hora em que foram registradas (seção 7, item 2).
9. **Agenda**: a data não muda depois da admissão; horário e ordem podem mudar até o Time Out.
10. **Suspensão e cancelamento**: causa obrigatória; `evitavel` em branco vira `true` para as causas listadas no indicador 6 (o POP as lista como evitáveis) e fica nulo para "outra". Suspenso e cancelado são terminais (nenhum comando clínico); cancelar um suspenso é permitido.
11. **Sign In/Time Out**: `leitorId` e `confirmadorId` obrigatórios e distintos, membros ativos da equipe do bloco; no Time Out o leitor tem papel circulante e o confirmador, cirurgião.
12. **Indicadores**: período pela data da cirurgia (4 e 5 pela data do evento). 1 e 3 sobre cirurgias realizadas (Time Out concluído); 3 exige cp1 e cp2 por pessoas diferentes, ambos antes da data da cirurgia, no ciclo usado; 4 conta quase-eventos com `categoria` identidade, olho ou LIO, automáticos ou à mão, por etapa; 5 conta intercorrências marcadas como never event; 6 conta suspensões/cancelamentos registrados no dia da cirurgia com causa evitável; 7 TCLE assinado até D-2 ÷ cirurgias realizadas. Complementar (nº 9): aprovação no quiz na 1ª tentativa + perguntas mais erradas. 2 e 8: nulos (dado externo).

---

## 4. Interpretações [S] a confirmar

1. **GLP-1/tirzepatida — janela de suspensão**: semanal = última aplicação pelo menos 7 dias antes da data da cirurgia; diário = sem uso na véspera nem no dia (última aplicação pelo menos 2 dias antes). Data de referência: data agendada ou, sem agenda, a sugerida. O ALERTA geral do GLP-1 existe sempre; o específico "avisar o cirurgião no mesmo dia" (`d7:B.glp1.prazo`) só quando o prazo não cabe. Recalcula se a data mudar.
2. **`manter_plano`** — herança da tabela da seção 3. No Time Out, conservador: a caixa é reconferida por duas pessoas (chegada, cp1, cp2) antes de nova leitura. `manter_plano` é recusado quando o olho do plano difere do olho do episódio.
3. **Conferência cega por autoria em qualquer ciclo** (mais conservador que "no ciclo").
4. **HS3 e HS7 com resolução escrita só do cirurgião**; o item que divergiu ainda precisa ser reconferido ("sim") para o bloco concluir. HS7 também abre no D0 (a partir do D-2 concluído) se o alerta de olho vermelho do D-7 estiver sem conduta. Novo achado (D-2, depois admissão) abre nova ocorrência.
5. **HS5** (revisto na fase 2): abre na admissão (primeira resposta da admissão) até o Sign In se o TCLE não estiver "assinado" (ou "olho conferido"), e sempre que "TCLE assinado no prontuário" (admissão) for "não". Antes da admissão, TCLE não assinado é pendência. Dúvida na reconfirmação do consentimento (Sign In) abre a parte escrita do HS5 (só o cirurgião resolve). O olho do TCLE é o item separado `A.tcle_olho` ("não" → HS3).
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
19. **Dots**: Q por cadeira de rodas, marcha instável/risco de queda (sem limiar de idade), baixa visão no olho contralateral (`C.baixa_visao_contralateral`) e olho único (ambliopia sozinha não dá Q, fase 2); I e S também por uso passado (S: anticoagulante ou antiagregante); D só com insulina ou sulfonilureia EM USO. I, S e D usam o registro efetivo do medicamento (D-7, D-2 ou admissão); A também usa a alergia nova da admissão.
20. **"Olho do exame = olho do pedido"** (G) como conferência: sem ela o D-7 não conclui (o POP não diz o que fazer na divergência; não inventei alerta).
21. **Quiz**: erro na pergunta 1 → aguardar contato humano já na 1ª tentativa (além do ALERTA); a ligação vence no MESMO dia (fase 2; pergunta P2). Contato humano (reprovação dupla/erro do olho) e "link não aberto até D-3" são resolvidos por um teach-back registrado depois (ou pela abertura do link).
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

Nada foi removido nem mudou de tipo na fase 1. Mudanças da fase 2: seção 7.

---

## 7. Correções da revisão de fidelidade (fase 2)

Versão dos modelos: **`pop-0.4/2`** (`VERSAO_MODELOS`; `VERSAO_MODELOS_V1 = 'pop-0.4/1'` mantida). Episódios com respostas na /1 continuam montando: o id antigo do TCLE da admissão (`A.tcle`, em `ADM_LEGADO.tcle`) ainda abre o HS5 se for "não". Testes novos em `tests/dominio/revisao-fidelidade.test.ts` (um ou mais por item), mais ajustes em `hardstops`, `jornada`, `pendencias-indicadores` e `utilitarios-modelos`.

| # | Achado | O que mudou (ids em `modelos/ids.ts`) |
| --- | --- | --- |
| 1 | Medicação mudada depois do D-7 | D-2 `D2.mudanca_medicacao` = sim e admissão `A.mudou_remedio` = sim exigem as classes que mudaram (`D2.mudanca_classes` / `A.mudou_classes`, múltipla com as 10 classes do §1.B + "outra" e, na admissão, "estado de saúde"; "outra"/"estado de saúde" exigem observação) e, para cada classe marcada, o registro atualizado no formato do D-7 (`D2.med.<classe>` / `A.med.<classe>`; `medicamentoD2(c)`, `medicamentoAdmissao(c)`). O registro efetivo de cada classe é o mais recente (D-7 → D-2 → admissão) e alimenta alertas (mesmos ids `d7:B.<item>`, origem = bloco que registrou), dots I/S/D, HS6 e a janela do GLP-1. Na admissão, `A.usa_glp1` + `A.glp1_ultima_dose` (data, não pode ser futura) recalculam a janela (a data é exigida com "usa = sim"); "não usa" contra GLP-1 registrado em uso, sem a mudança (classe GLP-1) registrada, impede concluir a admissão. Os alertas abertos no D-2 e na admissão precisam estar comunicados antes de concluir o bloco. O alerta do D-2 continua [S]. |
| 2 | Correção não apaga alerta | Trilha por assinatura (nível + título + descrição): mudou o conteúdo, a comunicação e a conduta anteriores deixam de valer (`Alerta.atualizadoEm`, `comunicacaoPendente`, `condutaDesatualizada`). Alerta desativado por correção continua exigindo comunicação (aparece em `alertas` e nas pendências). Corrigir item crítico do D-7 já concluído (`A.olho_paciente`, α-bloqueador, anticoagulante, antiagregante, GLP-1) exige observação. `B.conduta_alertas = nao_se_aplica` é recusado enquanto houver alerta HS6 ativo, e alerta desativado não dispensa a comunicação. |
| 3 | TCLE da admissão em dois itens | `A.tcle_assinado` ("não" → HS5) e `A.tcle_olho` ("não" → HS3, resolução escrita do cirurgião). `ADM.tcle` aponta para `A.tcle_assinado`. |
| 4 | Segundo olho | `A.primeiro_segundo = segundo` exige `A.data_primeiro_olho` (POP §11); a identificação por extenso usa a resposta e a data. Resposta diferente do que o painel detecta (ou data diferente) → ALERTA `d7:A.primeiro_segundo`. |
| 5 | Confirmações que registram divergência | Admissão `A.alergias_reconfirmadas` sim/não; "não" exige `A.alergia_nova`, que entra no dot A e na verbalização do Time Out (`EpisodioVisao.verbalizacaoTimeOut`). Time Out `TO.procedimento` sim/não; "não" abre a parte escrita do `HS_LIO_TIME_OUT` (agora "Divergência no Time Out"), quase-evento categoria `outro`, resolução escrita do cirurgião. Admissão `A.jejum_medicacoes` sim/não; "não" → ALERTA `admissao:A.jejum_medicacoes`, conduta `pendente` (POP §14). |
| 6 | Dúvida no consentimento do Sign In | `SI.consentimento = nao` abre a parte escrita do HS5: só fecha com `hardstop.resolver` do cirurgião. |
| 7 | Erro do olho no quiz | Prazo da ligação: mesmo dia (pergunta P2). |
| 8 | Quarentena da LIO | ALERTA `lente:quarentena:<ciclo>` com prazo no mesmo dia; exige comunicação (quem, quando, via). A resolução escrita da quarentena conta como conduta. |
| 9 | Déficit cognitivo | `A.identificacao` e `SI.identificacao` viraram `opcao`: sim / "confirmado com o acompanhante ou representante" / não ("não" → HS3). "Acompanhante" só é aceito com demência = sim no D-7. D-7 `A.olho_acompanhante` (tipo olho, exigido com demência); diferente do pedido ou "não sabe" → ALERTA `d7:A.olho_acompanhante`. |
| 10 | Expectativa sem conduta (§1.F) | Com o alerta `d7:F.sem_oculos` sem conduta válida, `materiais.enviar` tira os materiais do TCLE (`video_tcle`, `link_tcle`) e não gera mensagem; só materiais de preparo (sem nenhum: `ESTADO` com `MOTIVO_TCLE_RETIDO`). `previaMateriais` devolve `avisos`. Pendência `tcle.retido_expectativa` (cirurgião). |
| 11 | Midriático | HS3, HS4, HS5, HS6 e HS7 também bloqueiam `marcar:sign_in.B.midriatico`. |
| 12 | Página do paciente | `tcleLink` nulo até a aprovação no quiz, ou até um teach-back registrado depois da última reprovação; sempre nulo com o TCLE retido (`tcleLiberadoNaPagina`). |
| 13 | Dot Q | Gatilho `C.baixa_visao_contralateral` (novo) ou olho único; ambliopia sozinha não dá Q. `C.olho_unico_qual` (olho único / ambliopia). |
| 14 | Olho único (§11) | `D2.olho_unico_conversa`, `ALTA.olho_unico_apoio_domiciliar`, `ALTA.olho_unico_ligacao_noite`: visíveis, `pendente` "[S] POP §11 (olho único): depende do diretor técnico.", não obrigatórios. `TO.olho_unico_preceptor` (confirmação) obrigatório no Time Out com olho único (POP §14, item decidido). Condição por referência entre modelos: `CONDICAO_OLHO_UNICO = { itemId: 'd7:C.olho_unico_qual', valores: ['olho_unico'] }`. |
| 15 | Pulseira sem prontuário | `PRONTUÁRIO NÃO REGISTRADO`. |
| 17 | Acompanhante reserva | `E.acompanhante_reserva_situacao`: "registrado" (exige `E.acompanhante_reserva`) ou "nenhum disponível" (exige observação; pendência `d7.sem_acompanhante_reserva`, não alerta). |
| 18 | Homônimo | Texto do HS inclui "cirurgias não consecutivas, se possível". |
| 19 | HS5 | Abre na admissão; antes é pendência (pergunta P3 sobre HS9). |
| 20 | Avisos com HS9/HS_ORDEM abertos | Mantido e marcado [S] (seção 9). |
| 21 | Tratamento | Mensagem do TCLE: "A Dra. <nome> esclarece antes." / "O Dr. <nome> ..." pelo prefixo do cadastro ([S]). |
| 22 | Indicadores | `quase_evento.registrar` aceita `categoria?: 'identidade' \| 'olho' \| 'lio' \| 'outro'` (`CategoriaQuaseEvento` em `dominio/contrato.ts`). Indicador 4 conta só identidade, olho e LIO (automáticos: HS1 e leitura do Time Out = `lio`; HS3 = `olho` se a fonte é TCLE/marcação, senão `identidade`; HS2, HS8 e os demais = `outro`; eventos antigos sem categoria: HS1/HS_LIO_TIME_OUT = `lio`, HS3 = `identidade`). Indicador 7: denominador = cirurgias realizadas. |
| 23 | Plausibilidade do cp2 | Ajuda sem números: "Critérios a definir pelo cirurgião [RASCUNHO]". |

Também: datas no futuro só são recusadas quando o item se aplica (`A.data_primeiro_olho` com "segundo"; `A.glp1_ultima_dose` com "usa = sim"); o preenchedor de `dev/` responde itens condicionais mesmo quando não se aplicam.

---

## 8. Para o orquestrador ligar

Não toquei em `_shared/api`, `contrato.ts` da API, `web/` nem `dev/`.

1. **`dev/preencher.ts` (faz os 2 testes + 1 suíte de `tests/api` voltarem a passar)**: incluir `ADM.jejum` e `ADM.alergias` em `SIM_SEGURO`. Hoje o preenchedor responde "não" ao jejum, o que agora gera ALERTA não comunicado e trava a conclusão da admissão ("Alerta não comunicado ao cirurgião: Jejum ou medicações fora da orientação."). Conferido: com essas duas linhas, `tests/api` passa 88/88.
2. **Rótulo na interface**: `ROTULO_HARD_STOP_CURTO.HS_LIO_TIME_OUT` → "Divergência no Time Out" (agora cobre LIO e procedimento).
3. **`exigidoQuando` entre modelos**: `itemId` pode vir como `'<modelo>:<itemId>'` (ex.: `'d7:C.olho_unico_qual'`). O renderizador deve procurar a resposta no outro modelo (o domínio já faz; `bloco.concluir` e `faltam` estão certos).
4. **Itens de identificação** (`A.identificacao`, `SI.identificacao`): agora `opcao` (sim / acompanhante / não). Mostrar "acompanhante" só com demência registrada.
5. **Time Out**: exibir `EpisodioVisao.verbalizacaoTimeOut` (alergias, inclusive a nova da admissão; α-bloqueador; anticoagulação) na tela da sala.
6. **Alertas**: exibir `comunicacaoPendente` e `condutaDesatualizada`; alertas `ativo: false` com `comunicacaoPendente` ainda precisam do botão "comunicar".
7. **Contrato da API**: `quase_evento.registrar` com `categoria` opcional; intercorrência com `neverEvent` opcional (pendente da fase 1); `materiais.previa` repassar `avisos`.
8. **Seed dos modelos**: `modelosAtivos` só semeia quando falta o id do modelo; bancos com `pop-0.4/1` precisam receber a /2 (nova versão ativa).
9. **`G.materiais = enviados`** só depois de `materiais.enviar` com a mensagem do TCLE (envio só de preparo, com TCLE retido, não conta).
10. Evitei contextos novos em `exigidoQuando` e códigos novos de hard stop porque a interface tem `Record` exaustivos; se quiserem um código próprio para "procedimento divergente no Time Out", é mudança coordenada domínio + interface.

---

## 9. Novas perguntas e interpretações [S] (fase 2)

- **P1 [S]** Mudança de medicação no D-2: tratada como ALERTA (comunicar antes de concluir o D-2). O POP só diz "avisar o cirurgião".
- **P2** Erro do olho no quiz: o POP pede ligação "no mesmo dia" (§6), mas outro trecho fala em "1 dia útil". Implementado mesmo dia. Qual vale?
- **P3** Hard stop recusado por regra de ordem (HS9 e HS_ORDEM_SIGN_IN) não gera quase-evento. O §13.9 diz "todo hard stop acionado é registrado como quase-evento". Devem gerar?
- **P4 [S]** Avisos à família continuam com HS9/HS_ORDEM_SIGN_IN abertos (estão abertos por construção durante o Sign In).
- **P5 [S]** "A Dra." / "O Dr." pelo prefixo do cadastro do cirurgião (o texto aprovado só traz "Dr.").
- **P6** Sem texto aprovado para enviar só os materiais de preparo (TCLE retido): o domínio registra o envio sem gerar mensagem. Qual texto?
- **P7 [S]** Time Out com déficit cognitivo: "paciente confirma" aceita só sim/não; confirmação pelo acompanhante ficou só na admissão e no Sign In (é o que a revisão pediu).
- **P8** Quase-evento registrado à mão sem categoria não entra no indicador 4. A interface deve tornar a categoria obrigatória?
- **P9 [S]** Olho único com "qual" (olho único / ambliopia) sem resposta: tratado como olho único (mais conservador).
- **P10 [S]** Divergência de procedimento no Time Out usa o código `HS_LIO_TIME_OUT` (sem código novo, ver seção 8 item 10).
- **P11 [S]** Conduta escrita antes de uma mudança do alerta deixa de valer; toda mudança de conteúdo do alerta pede nova comunicação.
- **P12 [S]** Itens de olho único dependentes do diretor técnico ficam visíveis, mas não obrigatórios, até a decisão.
- **P13 [S]** Admissão pergunta "usa GLP-1?" sempre (`A.usa_glp1`), para reconferir a data da última dose (POP §9.A), mesmo sem mudança declarada.
- **P14 [S]** Indicador 4: biometria ausente (HS2) e troca de LIO no D0 (HS8) contam como `outro`, não como divergência de LIO.
