# Notas do agente api

Camada HTTP das Edge Functions `jornada-cirurgica` (equipe), `jornada-paciente` (página do paciente, sem login) e `jornada-envios` (fila de saída), mais o servidor local de demonstração.

Testes: `npx vitest run tests/api` (ver "Estado dos testes" no fim).

---

## 1. Arquitetura do handler

Código em `supabase/functions/_shared/api/` (TypeScript puro, imports relativos com `.ts`, sem pacote de runtime: banco, Auth, Datasigh, Storage e Meta chegam por injeção).

| Arquivo | Conteúdo |
| --- | --- |
| `handler.ts` | `criarHandler(deps)` → `(req) => Promise<Response>`. Rota (`/functions/v1/<nome>` ou `/<nome>`; `funcoes` limita o que cada Edge Function serve), CORS só para `JORNADA_ORIGENS_PERMITIDAS` (outra origem: 403 sem tocar no banco), POST + `application/json`, corpo com limite (256 KB; 7,2 MB só para `anexo.enviar`), cabeçalhos de segurança (`no-store`, `nosniff`, `DENY`, CSP `default-src 'none'`, `no-referrer`, HSTS), autenticação, membro, ator, despacho, erros. |
| `acoes-equipe.ts` | As 55 ações de `AcoesEquipe` (contrato.ts), todas implementadas. |
| `acoes-paciente.ts` | `pagina.obter`, `material.visualizado`, `quiz.responder`. |
| `servico.ts` | Contexto da requisição e pipeline de comando (abaixo). |
| `repositorio.ts` | SQL do schema `jornada_cirurgica` sobre a interface `Db`. |
| `db.ts` | `Db` (consulta parametrizada + transação) e `adaptadorPostgres(sql)` para postgres.js (Node: `import postgres from 'postgres'`; Deno: `npm:postgres@3.4.9`, `prepare: false`). |
| `auth.ts` | Produção: `GET {SUPABASE_URL}/auth/v1/user` com `apikey = SUPABASE_ANON_KEY`; e-mail confirmado; `aal` lido do payload do mesmo JWT (depois de o Auth aceitá-lo) e `sub` conferido com o usuário devolvido. Dev: token HMAC fictício (`dev1.<payload>.<assinatura>`), só com `JORNADA_MODO_DEV=true` e fora de produção. |
| `pin.ts` | PIN (6 dígitos; recusa repetidos e sequências), hash `pbkdf2-sha256$<iter>$<sal>$<hash>` com pepper HMAC do `JORNADA_SEGREDO_ATOR`; token de ator `at1.*` (HMAC, TTL `JORNADA_ATOR_TTL_MIN`, preso ao usuário do login e ao aparelho). |
| `datasigh.ts` | Cliente somente GET (`fetchSomenteGet` lança `ErroMetodoProibido` para qualquer outro método, antes da rede). |
| `armazenamento.ts` | `ArmazenamentoAnexos`: Supabase Storage (REST, service role, bucket privado `jornada-cirurgica`, URL assinada de 120 s) e local (memória ou disco, URL assinada por HMAC). Valida JPEG/PNG por assinatura do arquivo, 5 MB, SHA-256. |
| `link-paciente.ts` | Token do link (32 bytes aleatórios, base64url), hash SHA-256 hex; o token nunca fica em texto claro no banco (na fila vai cifrado, ver §5). |
| `fila.ts` | `processarFila(deps)` e `criarClienteMeta(config)`. |
| `config.ts` | `lerConfig(env)` (falha com os NOMES das variáveis, nunca os valores). |
| `erros.ts`, `logger.ts`, `validar.ts`, `cripto.ts` | Mapeamento de erros, log restrito, validação de forma, WebCrypto. |

Pontos de entrada Deno (finos): `supabase/functions/jornada-cirurgica/index.ts`, `jornada-paciente/index.ts`, `jornada-envios/index.ts`, com a inicialização comum em `supabase/functions/_deno/inicializar.ts` (pasta com `_`: não é função; fora do `tsc` do projeto por usar `Deno` e `npm:`; conferido com um tsconfig à parte e tipos simulados). `supabase/config.toml` mínimo com `verify_jwt = false` nas três.

### Fluxo de uma ação da equipe

1. `Authorization: Bearer` → `Autenticador.verificar` (produção: Auth do Supabase). E-mail não confirmado → `nao_autenticado`.
2. Como `jornada_sistema`: membro por `user_id`; se não houver, `jornada_cirurgica.inscrever_por_email(user_id, email do Auth)` (o corpo nunca informa e-mail ou papéis). Inativo/sem convite → `sem_permissao` ("Usuário sem acesso a este painel.").
3. Ator: cabeçalho `x-jornada-ator` (token do `ator.pin`), conferido contra o usuário do login e o aparelho (`x-jornada-aparelho`) e contra `ator.encerrar` (linha `acessos.recurso = 'ator_encerrado'` com o `jti`). Inválido/expirado → `nao_autenticado` com `detalhes.motivo = 'ator'` (a interface descarta só o ator, não a sessão).
4. MFA (`JORNADA_EXIGIR_MFA=true`): o USUÁRIO DO LOGIN com papel cirurgião ou gestora precisa de `aal2`; senão `mfa_exigido` em todas as ações menos `sessao` (que responde `aal` e `mfaExigidoPara` para a interface pedir o código). Decisão a validar: o ator por PIN não exige `aal2` (o PIN é o fator do aparelho compartilhado); ações de gestão exigem a gestora com o próprio login (sem PIN).
5. Comando sobre episódio (`servico.executarComando`), numa transação:
   - `pg_advisory_xact_lock` do episódio (serializa escritas sem exigir UPDATE);
   - `SET LOCAL ROLE jornada_sistema` → carrega o estado COMPLETO (`EntradaEstado`: episódio, paciente, eventos, lente, modelos da versão do episódio, membros, mensagens, mesmo dia, episódios anteriores do paciente, config da tabela sobre `configPadrao()`); confere `versao` (diferente → `conflito_versao` com `detalhes.versaoAtual`);
   - `ctx.atorViuConferencia1` = existe `acessos(ator, episódio, 'lente_conferencia_1')`;
   - `montarEstado` → `decidir` (o domínio decide e bloqueia; a API não reimplementa regra do POP);
   - `SET LOCAL ROLE jornada_api` + `set_config('jornada.ator'|'jornada.sessao'|'jornada.aparelho', …, true)` → grava eventos com `seq = versao + 1…`, `lente_registros`, `mensagens_saida` (com envio desligado, sempre `ensaio`, mesmo que o domínio peça outra coisa), upsert do aparelho;
   - recalcula o estado completo com os novos eventos e atualiza a projeção `episodios` (`estado`, `versao`, `resumo = resumoDia(estado completo)` e, no agendamento, `data_cirurgia/horario/ordem`) com `where versao = $esperada`;
   - lê a resposta como `jornada_api` (a RLS filtra as conferências) → `montarEstado` → `projetarVisao(estado, ator)`; grava `acessos('episodio')` e, se a leitura alcançou algo do checkpoint 1 (eventos `conferencia_1` ou registros `plano`/`chegada` visíveis ao ator), `acessos('lente_conferencia_1')`.
6. Erros: `ErroDominio` → código do contrato (`ESTADO` → `validacao` com status 409 e `detalhes.motivo = 'estado'`; `NAO_IMPLEMENTADO` → `indisponivel`). Erros do Postgres: só o código (23505 de `seq` → `conflito_versao`; 42501/JC001/JC002 → `sem_permissao`; 22P02/23514… → `validacao`); a mensagem do banco nunca é repassada nem registrada.
7. Log (`logger.ts`): uma linha por requisição com `funcao`, `acao`, `status`, `codigo`, `sqlstate`, `ms`. Campos fora da lista são descartados. Nunca corpo, CPF, nome, telefone, valores de lente, URL do Datasigh.

Leituras em lista (`dia.lista`, `episodios.buscar`, `pendencias.listar`, `resumo.vespera`, `indicadores.calcular`, `alertas.abertos`) usam o estado completo (o domínio não põe valores de lente nessas saídas) e são calculadas na hora (o `resumo` da projeção é um retrato da última escrita). `dia.visao_leitura` e `etiquetas.gerar` usam o estado filtrado pela RLS do ator. Toda leitura de dado de paciente grava `acessos` (sem dado de paciente no `detalhe`).

### Ações que a API monta sem comando do domínio

- `paciente.corrigir`: o `Comando` não tem esse tipo; a API valida a forma, confere o papel pela matriz do domínio (`papeisPermitidosParaEvento('paciente.corrigido')`), grava o evento `paciente.corrigido` (`{ campo, valorAnterior, valor, motivo }`) e atualiza `pacientes` e o `resumo` dos episódios do paciente. Sugestão ao domínio: `corrigirPaciente(...)`.
- Gestão (`membros.*`, `modelos.publicar`, `materiais.salvar`, `config.salvar`): sem regra do POP; acesso pela gestora (com o próprio login), eventos `membro.alterado`, `modelo.publicado` (versão atribuída pelo servidor: incrementa o número final, ex. `pop-0.4/1` → `pop-0.4/2`), `material.catalogo_alterado`, `config.alterada`.
- Página do paciente: eventos montados pelo domínio (`eventoMaterialAberto`, `eventoQuizRespondido` com `{ tentativa, erradas }`) ou, na primeira abertura da página, `material.aberto` com `{ origem: 'pagina', linkId }`; gravados como `jornada_sistema`, `autor_papel = 'paciente'`, `autor_id = ATOR_SISTEMA_ID`. Situação do quiz/TCLE por `situacaoPaginaPaciente`; prévia do envio por `previaMateriais` (domínio).

### Ator "sistema"

`ATOR_SISTEMA_ID = '00000000-0000-4000-8000-000000000000'`: autor dos eventos sem pessoa (página do paciente). Nunca é membro; não é aceito em `modelos_checklist` (lá a gravação do sistema usa `publicado_por = null`).

---

## 2. PIN e troca rápida de usuário

- `membro.definir_pin` vale sempre para o usuário do login (ignora o ator). Com PIN já definido, exige `pinAtual`. Recusa sequências e repetidos.
- `ator.pin {membroId, pin}`: falha registra `acessos(recurso 'pin_falha', detalhe {alvo})`; bloqueio (`limite_taxa`) com 5 falhas por membro-alvo ou 10 por usuário do login em 15 min. Sucesso registra `acessos('ator_pin')`. Mensagem de falha: "PIN não confere." (403 `sem_permissao`, `detalhes.motivo = 'pin'`).
- Eventos: `autor_id` = ator; `sessao_usuario_id` = login; `aparelho_id` = `x-jornada-aparelho`.
- `bloco.concluir.confirmadorToken`: token de ator de quem confirmou a leitura em voz alta, preso à mesma sessão e aparelho → `confirmadorId` para o domínio.

## 3. CPF e Datasigh

- `paciente.buscar_cpf`: papel conferido pela matriz (`paciente.cadastrado`: concierge, gestora); `validarCpf`/`normalizarCpf` do domínio; limite `JORNADA_CPF_CONSULTAS_HORA` por usuário do LOGIN (a troca por PIN não contorna), contado em `acessos('cpf_consulta')` (gravado antes da consulta, sem o CPF); HMAC-SHA256 (`JORNADA_SEGREDO_CPF`, rótulo `cpf`, hex de 64); paciente existente por `cpf_hmac` ou `datasigh_id` (nunca nome/telefone); a leitura grava `acessos('paciente')`.
- Datasigh: só GET; `DATASIGH_CAMINHO_BUSCA_CPF` relativo à `DATASIGH_BASE_URL`, com `{cpf}` (11 dígitos) ou `{cpf_formatado}`; não pode sair do host da base; `redirect: 'error'`; cabeçalho de autenticação `DATASIGH_AUTH_HEADER: DATASIGH_AUTH_VALOR`. `DATASIGH_MAPA_CAMPOS` (JSON, caminhos com ponto): `lista` (onde está a lista de resultados, opcional), `datasighId`, `nomeCompleto`, `dataNascimento` (aceita `aaaa-mm-dd` e `dd/mm/aaaa`; outro formato é omitido), `prontuario`, `telefones` (um caminho ou vários). Sem caminho/mapa → `nao_configurado`; 404, lista vazia ou registro sem nenhum campo mapeado → `nao_encontrado`; erro, timeout (8 s, `DATASIGH_TIMEOUT_MS`), JSON inválido ou mais de um cadastro distinto → `indisponivel`. Só os campos que vieram são devolvidos.
- **Pendente**: documentação do Datasigh (caminho real, nome do parâmetro, formato do CPF, campos, autenticação). Nada disso foi inventado: tudo é configuração.

## 4. Página do paciente

- `materiais.enviar` gera o token (32 bytes), grava só `sha256(token)` em `links_paciente` (validade `JORNADA_LINK_VALIDADE_DIAS`, padrão 30) e passa o token ao domínio, que monta as mensagens. Antes de gravar, o token é trocado por `{{LINK_TOKEN}}` no texto/parâmetros e guardado cifrado (AES-GCM, chave derivada do `JORNADA_SEGREDO_ATOR`) em `parametros._link_token_cifrado`; a função de envio restaura só na hora de enviar. Listas mostram "[link do paciente]". Se o token aparecesse em algum evento, é trocado por `[token]`.
- Link inválido, expirado, revogado ou episódio cancelado → `nao_encontrado` genérico. `revogado_em` existe; não há ação de revogar no contrato (pendência).
- `pagina.obter` registra a primeira abertura (evento) e toda abertura em `acessos('pagina_paciente')` (ator = `ATOR_SISTEMA_ID`, detalhe só com o id do link); nunca devolve o olho (a pergunta 1 do quiz oferece os dois). `quiz.responder` usa `corrigirQuiz`, `questoesErradas`, `proximaAcaoQuiz` e `situacaoPaginaPaciente().podeResponder` do domínio.

## 5. Fila de saída (`jornada-envios`)

- Agendador (cron) chama `POST /functions/v1/jornada-envios` com `x-jornada-envios: <JORNADA_SEGREDO_ENVIOS>` (≥ 32 caracteres).
- Com `ENVIO_PACIENTES_HABILITADO=false`: não reivindica nada (as mensagens já nascem `ensaio`, que o banco não deixa o sistema alterar).
- Com envio ligado: `reivindicar_mensagens(n)` (pendente → enviando, `FOR UPDATE SKIP LOCKED`); para cada uma, reconfere no domínio se os avisos do episódio estão suspensos (`avisosFamilia.suspensos` → `cancelado`); restaura o link; envia (Meta Cloud API, `graph.facebook.com/<versão>/<phone_id>/messages`, texto ou modelo `pt_BR` com parâmetros em ordem numérica). 2xx com id → `enviado`; 4xx → `falhou` (`ultimo_erro = http_<código>`); timeout, rede ou 5xx → `desconhecido` (nunca reenviado automaticamente; reconciliação manual). Cada mudança grava `mensagens_saida_eventos`.

## 6. Variáveis de ambiente

| Nome | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Auth (`/auth/v1/user`). |
| `SUPABASE_DB_URL` | Conexão (postgres.js, `prepare: false`, `max: 3`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Só Storage (foto do plano). Sem ela, `anexo.*` responde `indisponivel`. |
| `JORNADA_ORIGENS_PERMITIDAS` | Origens do front (CORS), vírgula; `https` (http só no modo dev). |
| `JORNADA_SEGREDO_CPF`, `JORNADA_SEGREDO_ATOR` | ≥ 32 caracteres e diferentes. ATOR também deriva o pepper do PIN e a chave do link cifrado na fila. |
| `JORNADA_ATOR_TTL_MIN` (15), `JORNADA_CPF_CONSULTAS_HORA` (30), `JORNADA_LINK_VALIDADE_DIAS` (30) | Limites. |
| `JORNADA_EXIGIR_MFA` | `true` exige `aal2` do login de cirurgião e gestora. |
| `JORNADA_URL_PAGINA_PACIENTE` | Base pública da página do paciente (ex.: `https://<front>/p/`). |
| `ENVIO_PACIENTES_HABILITADO` | `false` (padrão). `true` exige `META_*` e recusa o modo dev. |
| `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`, `META_GRAPH_VERSAO` (`v21.0`) | Envio real (piloto autorizado). |
| `DATASIGH_BASE_URL`, `DATASIGH_AUTH_HEADER`, `DATASIGH_AUTH_VALOR`, `DATASIGH_CAMINHO_BUSCA_CPF`, `DATASIGH_MAPA_CAMPOS`, `DATASIGH_TIMEOUT_MS` (8000) | Datasigh, somente GET (§3). |
| **Novas**: `JORNADA_SEGREDO_ENVIOS` | Segredo do agendador da função `jornada-envios`. |
| `JORNADA_AMBIENTE` | `producao` (padrão fora do modo dev) ou `homologacao`; aparece em `sessao.ambiente`. |
| `JORNADA_PIN_ITERACOES` | Iterações do PBKDF2 (padrão 310000; mínimo 100000 fora do modo dev). |
| `JORNADA_MODO_DEV` | Só no servidor local. As Edge Functions recusam (503) se estiver `true`. |

## 7. Servidor local de demonstração

```
npm run pg:iniciar        # Postgres local (54329)
npm run dev:api           # npx tsx dev/servidor.ts → http://127.0.0.1:8787
npm run dev               # Postgres + API + Vite (scripts/dev.sh)
```

- `JORNADA_DEV_BANCO` (padrão `jornada_dev`), `JORNADA_DEV_RECRIAR=true` (derruba, recria, aplica stub + migrations e semeia), `JORNADA_DEV_PORTA` (8787), `JORNADA_ORIGENS_PERMITIDAS` (padrão: 127.0.0.1/localhost nas portas 5173 e 4173). A cada partida as migrations (idempotentes) são reaplicadas; a semente roda por etapa quando falta (membros, modelos, config, materiais, cenários). A porta só abre depois da semente: `GET /dev/usuarios` responde 200 quando tudo está pronto.
- Rotas: `/functions/v1/jornada-cirurgica`, `/functions/v1/jornada-paciente`, `GET /dev/usuarios`, `POST /dev/login {userId}` → `{token}`, `GET /dev/links` (links da página do paciente gerados; modo ensaio, nada saiu), `GET /dev/datasigh/pacientes?cpf=` (Datasigh FICTÍCIO), `GET /dev/anexos/...` (URL assinada local), `GET /dev/saude`.
- Sempre `ENVIO_PACIENTES_HABILITADO=false`. Segredos fixos de desenvolvimento (nunca usar fora do servidor local).

### Usuários fictícios (PIN de todos: `135790`)

| id | Nome | Papel |
| --- | --- | --- |
| `d0000000-0000-4000-8000-000000000001` | Ana Ficticia (Concierge) | concierge |
| `…0002` | Bruna Ficticia (Concierge substituta) | concierge |
| `…0003` | Carla Ficticia (Segunda conferente) | conferente |
| `…0004` | Debora Ficticia (Conferente substituta) | conferente |
| `…0005` | Elisa Ficticia (Enfermagem) | enfermagem |
| `…0006` | Fabio Ficticio (Circulante) | circulante |
| `…0007` | Dr. Gil Ficticio (Anestesista) | anestesista |
| `…0008` | Dr. Hugo Ficticio (Cirurgiao) | cirurgiao |
| `…0009` | Dra. Iris Ficticia (Cirurgia) | cirurgiao |
| `…0010` | Julia Ficticia (Gestora) | gestora |

### Datasigh fictício (formato inventado, traduzido pelo mapa de campos)

CPFs de teste (prefixo 900, dígitos válidos): `cpfFicticio(101)` → cadastro completo; `102` → só nome e nascimento; `103` → simula Datasigh fora do ar (indisponível); `104` → dois telefones; qualquer outro → não encontrado. Valores em `dev/datasigh-ficticio.ts`.

### Semente (dados fictícios, pela própria API)

Materiais de exemplo (`https://exemplo.invalid/video-preparo`, orientação escrita, vídeo e link do TCLE), telefones fictícios na config, modelos v1 (gravados pela própria API como `jornada_sistema`), e episódios:

| Dia | Paciente (fictício) | Situação |
| --- | --- | --- |
| HOJE | Charlie Teste Lima (OD) | Pronto para o dia: D-7, checkpoint 1, checkpoint 2 e D-2 concluídos |
| HOJE | Bravo Teste Souza (OE) e Bravo Teste Sousa (OD) | Par de nomes parecidos no mesmo dia ("NOME PARECIDO NO DIA"), D-7 concluído |
| HOJE | Alfa Teste da Silva (OE) | 2º olho ("2º OLHO — 1º operado em …"; o OD foi agendado 30 dias antes), checkpoint 1 concluído |
| AMANHÃ | Delta Teste Rocha (OE) | Aguardando D-2 (D-7 e checkpoint 1 concluídos) |
| AMANHÃ | Eco Teste Martins (OD) | Lente em quarentena (divergência plantada no checkpoint 2: +23,00 × +23,50), hard stop HS1 |
| AMANHÃ | Foxtrot Teste Nunes (OD) | D-7 em andamento (só a seção A respondida) |

Os nomes não compartilham o início (Jaro-Winkler do domínio, limiar 0,9): só o par Bravo é "parecido". Roteiro reutilizável em `dev/roteiro.ts` (também usado nos testes: D-7 → checkpoints → D-2 → admissão → Sign In com leitura e confirmação por PIN → anestesia → Time Out com leitura da LIO → Sign Out → liberação da anestesia → alta) e respostas "sem risco" em `dev/preencher.ts`. O link da página do paciente de cada episódio aparece em `GET /dev/links`.

---

## 8. Pendências

- **Datasigh**: documentação do fornecedor (busca por CPF, campos, autenticação). Configurar `DATASIGH_*`; nada a mudar no código se o formato couber no mapa de campos.
- **Meta**: número, modelos aprovados (nomes e ordem dos parâmetros), token. Webhook de status (`entregue`, falha posterior) não implementado: os estados param em `enviado`/`falhou`/`desconhecido`.
- **Confirmação do contato por resposta do próprio número** (briefing §7): por ora marcada manualmente pela equipe (`contato.confirmar`). Falta o webhook de mensagens recebidas.
- **Reconciliação de `desconhecido`**: sem ação no contrato; hoje é manual no banco/painel da Meta.
- **Revogar link do paciente**: coluna existe; falta ação no contrato. Episódio cancelado já invalida a página.
- **Agendador** da `jornada-envios` (pg_cron/Supabase Scheduled) e o segredo `JORNADA_SEGREDO_ENVIOS`.
- Sugestões ao domínio/orquestrador: `corrigirPaciente` no domínio; `etiqueta.copiada` devolver a visão (o web-clínico pediu; o contrato fixa `{ ok: true }`).

## 9. Riscos de produção

- `SUPABASE_DB_URL` com usuário `postgres`: a segurança depende de a API sempre trocar de papel (`SET LOCAL ROLE`) — garantido no repositório; qualquer SQL novo deve fazer o mesmo.
- Pooler em modo transação: `prepare: false` obrigatório; `SET LOCAL`/`set_config(..., true)` valem só dentro da transação (todas as operações estão em `transacao`).
- Limite de CPU das Edge Functions: PBKDF2 com 310 mil iterações custa ~100–300 ms por verificação de PIN.
- Tokens de ator são sem estado (revogação por `acessos`); a troca de segredo `JORNADA_SEGREDO_ATOR` invalida PINs (pepper), tokens e links pendentes na fila.
- Bloqueio de PIN por membro-alvo (5 falhas em 15 min): alguém no aparelho pode bloquear temporariamente o PIN de outra pessoa (negação de serviço curta, registrada em `acessos`).
- Página do paciente sem limite de taxa (token de 256 bits; força bruta inviável). Cada abertura fica em `acessos('pagina_paciente')`.
- `modelosPadrao(config)` do domínio aceita itens extras de anestesia; a semeadura usa o padrão sem extras (a versão é a mesma). Mudou `itensAnestesiaExtras`? Publicar nova versão do modelo de anestesia (gestão).
- Postgres 16 nos testes; produção é 17 (sem diferença conhecida para o SQL usado).
- CORS restrito, mas a autenticação é por cabeçalho Bearer (sem cookie): CSRF não se aplica.
- O servidor local usa segredos fixos e autenticação fictícia: nunca expor fora de 127.0.0.1.

---

## 10. Estado dos testes (12/10/2026, domínio já implementado)

- `npx vitest run tests/api`: **69 testes passando** em 7 arquivos — `infra` (29, sem banco: criptografia, PIN, tokens, autenticação de produção e dev, Datasigh só GET, anexos, configuração, rotas, CORS, cabeçalhos, limites, mapeamento de erros), `sessao` (9: inscrição por convite, MFA, PIN, ator, encerrar, bloqueio), `cpf` (5: HMAC, CPF ausente do banco e dos logs, limite por login, Datasigh só GET, sem união por nome), `matriz` (2: `papeisPermitidosParaEvento` = `permissoes_evento`), `fluxo` (14: D-7, PIN, conflito de versão, conferência cega por TODAS as ações de leitura com controle positivo, autora e leitora do checkpoint 1 recusadas, quarentena, hard stop, sequência completa de avisos em ensaio, intercorrência sem avisos, página do paciente, CORS), `fila` (5: cliente Meta, enviado/falhou/desconhecido, sem reenvio, ensaio intocado, cancelamento por avisos suspensos), `gestao` (5: semeadura dos modelos como sistema, publicação versionada, config, materiais, membros).
- Suíte inteira (`npx vitest run`): passando junto com os testes do domínio, do banco e da interface (rodada três vezes seguidas sem falha nos arquivos da API).
- `npx tsc -p tsconfig.json --noEmit`: nenhum erro em `supabase/functions/_shared/api`, `dev/` e `tests/api`. Pontos de entrada Deno conferidos com tsconfig à parte (tipos simulados de `Deno` e `npm:postgres`).
- Servidor local conferido em banco e porta separados (semente completa, Datasigh fictício encontrado/indisponível, página do paciente por `/dev/links`); banco de conferência apagado depois.
