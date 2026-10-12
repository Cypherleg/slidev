# Registro de decisões — Painel da Jornada Cirúrgica

Formato: data · decisão · motivo · estado (`proposta` = aguarda aprovação do Dr. Augusto; `aprovada`; `revogada`).
Itens marcados **[S]** são interpretações do agente de código, não regras do POP: precisam de confirmação.

## Processo

| # | Data | Decisão | Motivo | Estado |
| --- | --- | --- | --- | --- |
| D1 | 12/10/2026 | O pedido "faça este app com agentes em paralelo" foi lido como autorização para **escrever e testar o código localmente com dados fictícios**. Não foi criado nenhum recurso em nuvem, não foi aplicada migração e nada foi publicado. | O briefing exige "ok" explícito antes de recurso em nuvem e migração; o pedido não diz isso. | proposta |
| D2 | 12/10/2026 | O POP e o briefing ficam fora do git (`docs/privado/`, ignorado). | O repositório `Cypherleg/slidev` é **público**. O POP é rascunho interno e o briefing cita nomes da equipe, caminhos locais e infraestrutura. | proposta |
| D3 | 12/10/2026 | Nomes da equipe, identificadores de projeto, URLs internas e telefones não aparecem no código nem na documentação versionada. Entram por configuração (tabela `config`, convites de membros, variáveis de ambiente). | Repositório público; LGPD; segredos fora do código. | proposta |
| D4 | 12/10/2026 | Trabalho em paralelo por cinco agentes (domínio, banco, API, interface clínica, interface de apoio) sobre um contrato escrito antes (`docs/ARQUITETURA.md`, `dominio/index.ts`, `api/contrato.ts`). | Pedido do Dr. Augusto (otimizar tempo); o contrato evita divergência entre agentes. | aprovada |

## Arquitetura

| # | Data | Decisão | Motivo | Estado |
| --- | --- | --- | --- | --- |
| A1 | 12/10/2026 | **Schema novo** `jornada_cirurgica` no mesmo projeto Supabase ("Pipeline"), reaproveitando **só a autenticação** (Supabase Auth). Membros e papéis próprios (7 papéis do briefing), inscrição por e-mail autorizado como no painel de pré-consulta. | Os papéis do `ofta_journey` (clinician/operator/admin) não cobrem os 7 papéis do POP; o domínio é outro; um erro de migração aqui não atinge o painel em produção; o briefing proíbe alterar tabelas existentes. Contra: dois cadastros de equipe (o mesmo login, papéis separados). | proposta |
| A2 | 12/10/2026 | Regras do POP em **TypeScript puro** (`_shared/dominio`), executadas no servidor (Edge Function) para decidir e bloquear; a interface só exibe. | Testável sem banco; uma única fonte de regra; nada de regra só na tela. | proposta |
| A3 | 12/10/2026 | Banco com **registro que só cresce** (`eventos`, `lente_registros`, `acessos`, ...): UPDATE/DELETE/TRUNCATE bloqueados por trigger. Tabelas `pacientes` e `episodios` são projeções reconstruíveis a partir dos eventos. | Regra 6 do briefing (correção é novo evento). | proposta |
| A4 | 12/10/2026 | Acesso por papel **no banco**: papéis de banco próprios (`jornada_api`, `jornada_sistema`), RLS por papel do ator, matriz `permissoes_evento` (tipo de evento × papel). A Edge Function troca de papel na transação (`SET LOCAL ROLE`) e informa o ator. `anon`/`authenticated` sem acesso; schema não exposto na API REST. | Briefing §9: acesso por papel aplicado no banco, não só na tela. Difere do padrão do `ofta_journey` (RPC com service role): aqui a regra de papel fica também no banco. | proposta |
| A5 | 12/10/2026 | **Conferência cega em três camadas**: (1) valores do checkpoint 1 em `lente_registros` com visibilidade `conferencia_1`, que o banco não entrega à segunda conferente; (2) a projeção da API filtra de novo por papel; (3) o checkpoint 2 é recusado se a pessoa registrou ou consultou o checkpoint 1 daquele episódio (tabela `acessos`). A comparação é feita no servidor com o estado completo; para todos sai só "confere/diverge" e os nomes dos campos divergentes. | Briefing §6.3 e critério de aceite da fase 2 ("nem pela API"). | proposta |
| A6 | 12/10/2026 | Front-end: **SPA estática na Vercel** (React + Vite), com domínio próprio sugerido (ex.: subdomínio do hospital). Página do paciente na mesma aplicação (`/p/<token>`), sem login. | Não depende de computador local nem de conta pessoal de ferramenta de IA (briefing §10). As Edge Functions do Supabase não servem HTML como página no domínio padrão; a Vercel já faz parte da stack. | proposta |
| A7 | 12/10/2026 | Envio de WhatsApp por **Edge Function nova** (`jornada-envios`) lendo a fila `mensagens_saida`, e não por workflow n8n. Alternativa equivalente documentada: workflow n8n novo que lê a mesma fila. | Mantém idempotência, estados e trilha no mesmo banco e no mesmo código testado; não toca nos workflows existentes. Contra: o número e os modelos da Meta já vivem no n8n; a decisão depende da pergunta 3. | proposta |
| A8 | 12/10/2026 | Troca rápida de usuário por **PIN de 6 dígitos** (hash PBKDF2; token de ator de 15 min; falhas registradas). A marcação sai em nome do ator do PIN; o login do aparelho fica registrado à parte. | Briefing §5. | proposta |
| A9 | 12/10/2026 | Segundo fator (TOTP do Supabase Auth) exigível para cirurgião e gestora por variável de ambiente (`JORNADA_EXIGIR_MFA`). | Briefing §9 ("se a plataforma permitir": o Supabase Auth permite). | proposta |
| A10 | 12/10/2026 | Contingência em papel: a própria aplicação gera os checklists em branco e o registro preenchido do episódio, prontos para imprimir ou salvar em PDF pelo navegador. | Briefing regra 12. Limitação: se o servidor cair, só imprime o que já estava aberto; recomenda-se um jogo de PDFs em branco impresso por dia. | proposta |

## Regras e interpretações [S]

| # | Data | Interpretação | Por que é preciso decidir | Estado |
| --- | --- | --- | --- | --- |
| R1 | 12/10/2026 | [S] Time Out exige checkpoint 2 concluído (configurável: `exigirCp2AntesDoTimeOut`, padrão sim). | O POP mede "dupla conferência antes do D0" (indicador 3, meta 100%), mas não lista "checkpoint 2 ausente" como hard stop. | proposta |
| R2 | 12/10/2026 | [S] Admissão exige o D-2 concluído. | O POP diz que os dots são colados "pela ficha já conferida no D-2"; não diz o que fazer se o D-2 não ocorreu. | proposta |
| R3 | 12/10/2026 | [S] Mensagens automáticas (inclusive TCLE e materiais) só para número com anuência registrada **e** confirmado por resposta do próprio número. Até haver integração de mensagens recebidas, a confirmação é marcada por uma pessoa no painel. | O briefing exige a confirmação para os avisos do dia; aplicar a todos os envios é o caminho conservador. | proposta |
| R4 | 12/10/2026 | [S] Suspender ou cancelar: cirurgião ou gestora. A enfermagem registra a ausência de acompanhante (hard stop) e pede a decisão. | O POP manda suspender sem acompanhante, mas não diz quem registra a suspensão. | proposta |
| R5 | 12/10/2026 | [S] Biometria original ausente vira item explícito nos checkpoints 1 e 2 ("presente nesta conferência: sim/não"). | Materializa o hard stop 2 do POP em uma pergunta registrável. | proposta |
| R6 | 12/10/2026 | [S] "Fora de hora": resposta a item de bloco já concluído, item do D0 respondido depois de um bloco posterior concluído ou em data diferente da cirurgia. O horário é sempre o do servidor. | Briefing regra 5. | proposta |
| R7 | 12/10/2026 | [S] Avisos à família suspensos (inclusive o de atraso) enquanto houver intercorrência, hard stop aberto, suspensão ou cancelamento. | Briefing §7. | proposta |

As interpretações específicas de cada módulo estão em `docs/notas-agentes/*.md` e são consolidadas no `PLANO.md`, seção "Pendências e interpretações".

## Correções das revisões independentes (12/10/2026)

| # | Data | Decisão | Motivo | Estado |
| --- | --- | --- | --- | --- |
| S1 | 12/10/2026 | [S] Checkpoint 2 só com o **login da própria conferente** (sem troca por PIN), e recusado se o usuário do login consultou ou registrou o checkpoint 1 do episódio. | A troca por PIN no aparelho de quem fez o checkpoint 1 enfraquecia a independência. | proposta |
| S2 | 12/10/2026 | Confirmação da leitura em voz alta (Sign In, Time Out) por **token próprio, de uso único**, preso ao episódio e ao bloco, válido por 5 minutos; quem conclui o bloco é quem leu. | O token de troca de usuário servia para outras ações por 15 minutos. | proposta |
| S3 | 12/10/2026 | Limites de PIN (5 falhas em 15 min por alvo) e de consulta de CPF (por hora) serializados no banco; tentativa registrada antes da verificação. | Tentativas simultâneas burlavam o limite. | proposta |
| S4 | 12/10/2026 | [S] Mensagem pendente há mais de 60 minutos (configurável) ou de outro dia é cancelada e nunca sai. | Evita aviso de "cirurgia começou" horas depois, se o envio parar e voltar. | proposta |
| S5 | 12/10/2026 | Listas (dia, busca, pendências, véspera, alertas) obedecem à mesma filtragem por papel da visão do episódio. | Evitava que a segunda conferente visse informação derivada do checkpoint 1. | proposta |
| F1 | 12/10/2026 | Modelos de checklist passam a `pop-0.4/2` após a revisão de fidelidade; episódios guardam a versão usada. | Correções de fidelidade (ver `notas-agentes/dominio.md` §7). | proposta |
