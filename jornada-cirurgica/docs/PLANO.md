# Plano — Painel da Jornada Cirúrgica de catarata (OFTA VITTA)

Estado em 12/10/2026. Documento para aprovação do Dr. Augusto Legnani Neto.
Arquitetura detalhada: `ARQUITETURA.md`. Decisões: `DECISOES.md`. Roteiro de demonstração: `ROTEIRO-DEMO.md`.

## 1. Situação em uma frase

O código das fases 1 a 5 está escrito e testado localmente, só com dados fictícios. **Nada foi criado na nuvem, nenhuma migração foi aplicada e nenhuma mensagem pode sair.** Para colocar no ar, falta o seu "ok" nos itens da seção 9 e as respostas da seção 7.

## 2. O que foi lido (fase 0)

| Fonte | Lido? | Observação |
| --- | --- | --- |
| POP de segurança da catarata v0.4 | Sim | Base de todos os itens de checklist, hard stops, dots, quiz, textos e indicadores |
| Briefing v1 | Sim | — |
| Projeto Supabase "Pipeline": schema `ofta_journey`, migrations, Edge Function `ofta-journey` | Sim, só leitura (estrutura e código; nenhum dado de paciente) | Padrão reaproveitado: Supabase Auth + e-mails autorizados + ator vindo do login verificado + erros genéricos + CORS restrito |
| Pacote local `cloud-patient-journey` (README e docs) | **Não** | Está no seu computador; esta sessão roda na nuvem e não alcança arquivos locais |
| Notas do vault Obsidian | **Não** | Mesmo motivo. Nada foi gravado no vault |
| API do Datasigh | **Não sondada** | Exige o cadastro de teste que o senhor indicar e a credencial, que está no n8n |
| Workflows n8n | **Não** | Nada foi lido, editado ou executado |

## 3. Arquitetura proposta (resumo)

- **Banco:** schema novo `jornada_cirurgica` no projeto "Pipeline". Reaproveita só o login (Supabase Auth). Nada existente é alterado (decisão A1).
- **Servidor:** Edge Functions novas: `jornada-cirurgica` (equipe), `jornada-paciente` (página do paciente) e `jornada-envios` (fila do WhatsApp, desligada).
- **Regras do POP:** motor determinístico em TypeScript, sem modelo de linguagem, executado no servidor (A2).
- **Interface:** aplicação web própria (React), publicada na Vercel em endereço próprio, pensada para tablet; funciona sem computador local ligado e sem conta de ferramenta de IA (A6).
- **Segurança:** registro que só cresce (A3), papel aplicado no banco por RLS (A4), conferência cega em três camadas (A5), PIN para troca rápida de usuário (A8), segundo fator para cirurgião e gestora (A9), CPF guardado só como HMAC, limite de consultas, link do paciente com token longo e validade.

### Estender `ofta_journey` ou criar schema novo?

| | Estender `ofta_journey` | Schema novo (recomendado) |
| --- | --- | --- |
| Login da equipe | O mesmo | O mesmo (Supabase Auth) |
| Papéis | clinician/operator/admin: seria preciso alterar tabela existente | 7 papéis do POP, sem tocar no existente |
| Risco para o painel de pré-consulta | Migração mexe em produção | Isolado |
| Ligação futura pré-consulta → cirurgia | Direta | Por chave estável (id do Datasigh), sem unir por nome ou telefone |
| Custo | Menor no curto prazo | Dois cadastros de papéis (um login) |

### Onde publicar o front-end

Vercel, projeto novo, com domínio próprio (sugestão: um subdomínio do hospital, como `jornada.<domínio-do-hospital>`). O painel de pré-consulta continua onde está. Motivos: a Vercel já está na stack, publica site estático com HTTPS e domínio próprio, e não depende de nenhum computador ligado.

### Quem fala com a Meta

Proposta: Edge Function `jornada-envios`, que lê a fila do banco e respeita idempotência e estados (decisão A7). Alternativa: um workflow n8n **novo**, que lê a mesma fila. Depende da pergunta 3.

## 4. Modelo de dados (resumo)

`membros`, `convites`, `pacientes` (CPF só como HMAC), `episodios` (um paciente, um olho, uma cirurgia), `eventos` (toda marcação, com autor, papel, aparelho, hora do servidor, "fora de hora", versão do modelo), `lente_registros` (transcrições da lente por etapa, com visibilidade), `acessos` (toda consulta a dado de paciente), `permissoes_evento`, `modelos_checklist` (versionados), `config`, `materiais` (versionados), `links_paciente` (só o hash do token), `mensagens_saida` e `mensagens_saida_eventos` (fila com idempotência), `anexos` (foto do plano, em bucket privado), `aparelhos`. Detalhes: `ARQUITETURA.md` §4.

## 5. Fases

| Fase | Entrega | Situação | Critério de aceite e como é verificado |
| --- | --- | --- | --- |
| 0. Descoberta | Leitura, este plano | Pronto, aguardando aprovação. Datasigh não sondado | Aprovação do plano e respostas da seção 7 |
| 1. Base e D-7 | Modelo de dados, login e papéis, abertura por CPF, checklist da concierge, alertas ao cirurgião | Código e testes locais | Episódio fictício percorre o D-7 inteiro (teste automatizado + roteiro de demonstração) |
| 2. Lente e D-2 | Conferência cega, quarentena, etiquetas | Código e testes locais | Divergência plantada é barrada; a segunda conferente não vê a primeira entrada nem pela API (teste que varre todas as respostas da API) |
| 3. Dia da cirurgia | Lista do dia, seis blocos, hard stops, PDF | Código e testes locais | Cada hard stop tem um teste que o dispara e outro que o resolve |
| 4. Materiais e avisos | Catálogo, página do paciente, quiz, fila de saída, modo ensaio | Código e testes locais; envio desligado | Em ensaio, a sequência completa é gerada sem envio; com intercorrência, nenhuma mensagem |
| 5. O que falta e indicadores | Pendências, resumo da véspera, indicadores | Código e testes locais | Números batem com os episódios fictícios |
| 6. Piloto | Uso em paralelo ao papel | Não iniciado | Decisão sua e da gestora, com os registros |

Resultado dos testes e da verificação ponta a ponta: seção 8.

## 6. Riscos

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| API do Datasigh sem documentação | Abertura por CPF cai no cadastro manual ("não conferido no Datasigh") | Cliente só GET, configurável por variável; sondagem com cadastro de teste antes de ligar |
| Troca de papel de banco (`SET ROLE`) a partir da Edge Function no Supabase | Se o provedor restringir, a RLS por ator não funciona como desenhada | Validar num **branch** do Supabase antes de produção; plano B documentado (funções SECURITY DEFINER com checagem de papel) |
| Aparelho compartilhado | Marcação em nome de outra pessoa | PIN por marcação, token de ator curto, bloqueio por inatividade, aparelho registrado em cada evento |
| Falha de rede no centro cirúrgico | Equipe sem painel | Contingência em papel (regra 12); fila de envio nunca bloqueia o checklist |
| Envio indevido de WhatsApp | Mensagem errada à família | Envio nasce desligado; modo ensaio; bloqueio automático com intercorrência e hard stop; idempotência; timeout vira "desconhecido", sem reenvio automático |
| Validade jurídica do registro eletrônico | Registro não substitui o papel | PDF do episódio impresso e assinado até a validação (briefing §9) |
| Repositório público | Exposição de documento interno | POP e briefing fora do git; recomendo tornar o repositório privado ou mover o projeto para um repositório privado |
| Regras [S] interpretadas | Bloqueio a mais ou a menos | Todas configuráveis ou listadas para sua decisão (DECISOES R1–R7 e seção 7) |

## 7. Perguntas

### Do briefing (§13)

1. **Datasigh:** como busca paciente por CPF e quais campos devolve? Qual cadastro de teste usar? (Sem isso, a abertura é manual.)
2. **Publicação:** aprova aplicativo próprio na Vercel, com subdomínio do hospital? Qual subdomínio?
3. **WhatsApp:** qual número envia os avisos e quem cadastra os modelos na Meta? Envio pela Edge Function nova ou por um workflow n8n novo?
4. **Alertas do D-7 ao cirurgião:** painel, WhatsApp ou Slack? (Hoje: painel + registro de quem avisou e por qual via.)
5. **Etiquetas:** qual programa imprime e que formato aceita? (Hoje: texto configurável com botão "Copiar".)
6. **Anestesia:** quais itens entram no bloco, além dos três do POP?
7. **Tempos de espera** por etapa (admissão até início; duração; recuperação até alta). Sem valor, a mensagem sai sem previsão.
8. **Usuários iniciais:** e-mails e papéis de cada pessoa (inclusive substitutas).
9. **Aparelhos:** quais na recepção, no D-2 e na sala? (Define tamanho de tela e se haverá PIN em todos.)
10. **TCLE:** qual plataforma de assinatura? (Hoje: link e status marcados por uma pessoa.)
11. **Pendências do POP por fase:** ver quadro abaixo.

### Surgidas na construção

12. Sem checkpoint 2 concluído, o Time Out pode ocorrer? (R1; padrão atual: não.)
13. Sem D-2 concluído, a admissão pode ocorrer? (R2; padrão atual: não.)
14. A confirmação por resposta do número vale para todo envio ou só para os avisos do dia? (R3.)
15. Quem registra suspensão e cancelamento? (R4.)
16. O dot Q (queda) inclui "sedação" como gatilho? Se todos recebem sedação, Q vira universal.
17. O nome da concierge que assina a mensagem do TCLE vem do usuário que envia ou é fixo?
18. A segunda conferente pode ver a foto do plano assinado? (Hoje: não; ela parte do papel original.)

19. Erro do olho no quiz: ligação **no mesmo dia** (§6, pergunta 1) ou **em até 1 dia útil** (§6, "Se reprovar")? O POP diz os dois; implementado "mesmo dia".
20. Hard stop recusado por regra de ordem (sítio não marcado antes do midriático) deve ser registrado como quase-evento? O §13.9 diz "todo hard stop acionado"; hoje a ação é recusada e nada é gravado.
21. Qual texto enviar quando só os materiais de preparo podem sair (TCLE retido até realinhar a expectativa, POP §1.F)? Sem texto aprovado, nada é enviado.
22. Mudança de medicação no D-2 tratada como ALERTA (comunicar ao cirurgião antes de concluir o D-2). Confirma?
23. Quase-evento registrado à mão deve ter categoria obrigatória (identidade, olho, LIO, outro)? Sem categoria, não entra no indicador 4.
24. A funcionária A do checkpoint 1 (no POP, "administrativo de materiais") precisa ter o papel de concierge no painel. Confirma?
25. Validade das mensagens na fila: avisos pendentes há mais de 60 minutos ou de outro dia são cancelados e nunca saem. Qual prazo?

### Pendências do POP que afetam o software

| Pendência (colchete no POP) | Onde aparece | Bloqueia qual fase |
| --- | --- | --- |
| Colírio pré-operatório do esquema AL-01 | Item "uso dos colírios" no D-2 e na admissão | 2 e 3 (o item existe, marcado como pendência) |
| Sinais de plausibilidade da biometria (checkpoint 2) | Item do checkpoint 2 | 2 (marcado como pendência) |
| Exceções de insulina (DM1, bomba), sulfonilureia, glinida, SGLT2; horário de referência do jejum; lista de líquidos; conduta com GLP-1 dentro do prazo | Ajuda do D-7 e orientação escrita | 1 e 4 (texto exibido como pendência) |
| 60 minutos de estabilidade na faco sob tópica | Item de alta | 3 |
| Enquadramento da unidade (CFM 1.886/2008) e acompanhante que só busca na alta | Hard stop do acompanhante | 3 |
| Residente em campo × cláusula do TCLE (observador) | Item do Time Out sobre preceptor | 3 |
| Plataforma e nível de assinatura do TCLE | TCLE | 4 |
| WhatsApp da concierge e escala do telefone fora do horário | Página do paciente, folha de alta | 4 |
| NSP, observação do Time Out, canal de quase-eventos | Indicadores 2 e 4 | 5 |

## 8. Resultado dos testes (12/10/2026, local, dados fictícios, modelos `pop-0.4/2`)

| Conjunto | Testes | O que cobre |
| --- | --- | --- |
| Domínio (`tests/dominio`) | 171 | Modelos v1, cada hard stop disparado e resolvido, conferência cega, jornada D-7 → alta, ordem e hora real, alertas, dots, pendências, indicadores, quiz, avisos em ensaio e bloqueio por intercorrência |
| Banco (`tests/banco`) | 94 | Migrations do zero e reaplicadas, "só cresce" (inclusive como administrador), RLS por papel e visibilidade, matriz de permissões, sem acesso de `anon`/`authenticated`, fila sem entrega dupla |
| API (`tests/api`) | 93 | Fluxo completo pela API, conferente varrendo todas as leituras sem achar os valores plantados, autora do checkpoint 1 recusada no 2, CPF nunca gravado nem logado, Datasigh só GET, limite de taxa, PIN, conflito de versão, CORS |
| Interface (`web/src`) | 75 | Renderizador de checklist, identificação (olho por extenso, dots com letra), formulário cego, página do paciente sem o olho, quiz, impressão, gestão |
| Ponta a ponta no navegador (`tests/e2e`, tablet) | 5 | Lista do dia, conferência cega com quarentena, sala, página do paciente, checklist em branco sem sessão |

Total: 438 testes (433 + 5 no navegador), todos passando, depois das correções das duas revisões independentes. Verificação de tipos e build da interface sem erros.

Não testado aqui: Deno real (as Edge Functions foram verificadas com tipos simulados), Postgres 17 e o usuário da `SUPABASE_DB_URL` do Supabase, Datasigh real, Meta real.

### Revisões independentes

Depois da construção, dois revisores independentes auditaram o código:

- **Segurança e privacidade:** nada crítico; não há caminho para a segunda conferente ver o checkpoint 1; todo SQL roda sob papel próprio. Oito defeitos de gravidade média ou baixa (cadastro como oráculo de CPF, limites burláveis por concorrência, token de confirmação reaproveitável, listas com informação derivada do checkpoint 1, conferência cega por sessão, e-mail confirmado, fila sem validade, corpo lido antes da autenticação) foram corrigidos, cada um com teste.
- **Fidelidade ao POP:** 24 achados, 5 de gravidade alta (remédio que muda depois do D-7 escapava das regras; correção de resposta apagava alerta; TCLE de outro olho na admissão; 2º olho sem histórico; itens de "confirmação" sem como registrar divergência). Todos corrigidos no motor de regras; o que exigia decisão clínica virou pergunta (seção 7, itens 19 a 25) ou interpretação [S].

### Interpretações a confirmar

Além de R1–R7 (`DECISOES.md`), o motor de regras registrou 23 interpretações em `notas-agentes/dominio.md` §4. As que mais afetam o fluxo:

- Janela do GLP-1: semanal com última aplicação ≥ 7 dias antes; diário sem uso na véspera nem no dia.
- Quarentena "manter plano": no checkpoint 1 refaz chegada, cp1 e cp2; no cp2 refaz só o cp2 cego; no Time Out a caixa é reconferida por duas pessoas antes de nova leitura.
- Conferência cega bloqueada para quem tocou o checkpoint 1 em qualquer ciclo do episódio.
- Hard stops 3 (identidade/olho) e 7 (olho vermelho) só fecham com resolução escrita do cirurgião.
- Hard stop 6 inclui antiagregante.
- "NOME PARECIDO NO DIA" para nomes parecidos (o POP só traz "HOMÔNIMO NO DIA"); limiar de similaridade 0,9, configurável.
- Aviso de fim de cirurgia sem tempo configurado: sai só "Agora é a recuperação." (texto aprovado sem a oração da previsão).
- Alerta de expectativa só para LIO monofocal.
- Validade "aaaa-mm" da LIO lida como o primeiro dia do mês.

## 9. Para colocar no ar: o que depende do seu "ok"

Em ordem, cada passo com ok explícito:

1. Tornar o repositório privado (ou mover o projeto para um repositório privado).
2. Criar um **branch** de desenvolvimento no Supabase (tem custo) e aplicar as migrations nele; validar `SET ROLE` e RLS com a `SUPABASE_DB_URL` real.
3. Definir segredos no cofre do Supabase: `JORNADA_SEGREDO_CPF`, `JORNADA_SEGREDO_ATOR`, origens permitidas. `ENVIO_PACIENTES_HABILITADO=false`.
4. Publicar as três Edge Functions no branch; publicar o front na Vercel (projeto novo) apontando para o branch.
5. Cadastrar os usuários iniciais (convites) e fazer a demonstração com dados fictícios.
6. Sondar o Datasigh com o cadastro de teste indicado (somente GET).
7. Aplicar as migrations no projeto de produção; publicar em produção.
8. Piloto em paralelo ao papel. Envio de WhatsApp continua desligado até a sua decisão.
