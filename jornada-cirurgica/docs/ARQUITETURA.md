# Arquitetura e contrato técnico — Painel da Jornada Cirúrgica

Documento de referência para quem escreve código neste diretório (pessoas e agentes).
Decisões e justificativas: `docs/DECISOES.md`. Plano, fases e perguntas: `docs/PLANO.md`.

## 1. Visão geral

```
Tablet / computador (navegador)
  └─ web/ (React + Vite, SPA estática; publicada na Vercel)
       │  POST /functions/v1/jornada-cirurgica  (JWT da sessão Supabase + aparelho + ator por PIN)
       │  POST /functions/v1/jornada-paciente   (página do paciente: token do link, sem login)
       ▼
Supabase (projeto existente "Pipeline", schema NOVO `jornada_cirurgica`)
  ├─ Edge Function jornada-cirurgica  → _shared/api (handler) → _shared/dominio (regras puras)
  ├─ Edge Function jornada-paciente   → idem, só ações da página do paciente
  ├─ Edge Function jornada-envios     → fila de saída → Meta Cloud API (desligado por padrão)
  ├─ Postgres: schema jornada_cirurgica (tabelas próprias; nada existente é alterado)
  ├─ Auth: reaproveitado (mesmos usuários do painel de pré-consulta); papéis próprios
  └─ Storage: bucket privado jornada-cirurgica (foto do plano de LIO)
```

- Regras do POP: **TypeScript puro** em `supabase/functions/_shared/dominio/`, usado pela API (para decidir e bloquear) e pela interface (só para exibir).
- Banco: registro que só cresce (`eventos`, `lente_registros`, `acessos` sem UPDATE/DELETE), RLS por papel, papéis de banco próprios.
- Fuso: UTC no banco; America/Sao_Paulo na tela.

## 2. Diretórios e responsáveis

| Caminho | Conteúdo | Responsável |
| --- | --- | --- |
| `supabase/functions/_shared/dominio/` | Tipos, modelos de checklist v1 (POP), motor de regras, decisão de comandos, projeção por papel, mensagens, etiquetas, quiz, indicadores | agente **domínio** |
| `tests/dominio/` | Testes do domínio (Vitest) | agente **domínio** |
| `supabase/migrations/` | SQL do schema `jornada_cirurgica` | agente **banco** |
| `tests/banco/`, `tests/apoio/banco.ts` | Testes de banco contra Postgres local | agente **banco** |
| `supabase/functions/_shared/api/` | Handler HTTP, autenticação, repositório SQL, Datasigh (GET), HMAC de CPF, limite de taxa, PIN, fila de saída | agente **api** |
| `supabase/functions/jornada-*/index.ts` | Pontos de entrada Deno (finos) | agente **api** |
| `dev/` | Servidor local de demonstração (Node + Postgres local + auth fictícia + Datasigh fictício + semente fictícia) | agente **api** |
| `tests/api/` | Testes de integração da API | agente **api** |
| `web/src/app/`, `web/src/componentes/`, `web/src/telas/{inicio,episodio,dia}/` | Interface principal (D-7, D-2, dia da cirurgia) | agente **web-clínico** |
| `web/src/telas/{paciente,gestao,impressao,resumo,pendencias}/` | Página do paciente, gestão, impressão/PDF, resumo da véspera, pendências, indicadores | agente **web-apoio** |
| `web/src/api/` | Cliente HTTP tipado (já escrito; só o orquestrador altera) | orquestrador |
| `docs/` | Plano, decisões, arquitetura, roteiro de demonstração | orquestrador |

Arquivos compartilhados (`package.json`, `tsconfig.json`, `vitest.config.ts`, `contrato.ts`, `dominio/index.ts`, `dominio/tipos.ts`): **não alterar sem o orquestrador**. Se faltar algo no contrato, registre em `docs/notas-agentes/<agente>.md` e contorne localmente.

Não rodar `git commit`, `git push`, `npm install` nem criar recurso em nuvem. Não usar dados reais de paciente.

## 3. Convenções de código

- TypeScript estrito. Imports relativos com extensão `.ts` / `.tsx`.
- `_shared/` não importa pacotes de runtime (nem `postgres`, nem `npm:`); recebe dependências por injeção.
- Português do Brasil em nomes de domínio, mensagens e interface. Marca: "OFTA". Sem emojis.
- Datas de calendário: `'aaaa-mm-dd'`. Instantes: ISO 8601 UTC. Exibição: `formatarData*` do domínio.
- Olho: `'OD' | 'OE'` no dado; na tela, sempre `OLHO DIREITO` / `OLHO ESQUERDO`, em destaque.
- Dioptria: número com sinal; exibição `+21,50 D`.
- Nunca registrar dado de paciente em log, mensagem de erro ou nome de teste. CPF nunca é gravado: só HMAC.
- Dados fictícios: nomes claramente fictícios (ex.: "Paciente Teste Alfa da Silva"), CPFs de teste gerados com dígito válido e prefixo reservado nos testes.

## 4. Banco de dados (schema `jornada_cirurgica`)

### 4.1 Papéis de banco

- `jornada_api` (NOLOGIN): ações da equipe. A API abre transação, `SET LOCAL ROLE jornada_api` e define `set_config('jornada.ator', '<uuid>', true)`, `set_config('jornada.sessao', '<uuid>', true)`, `set_config('jornada.aparelho', '<texto>', true)`. RLS aplica as regras de papel a partir de `jornada_cirurgica.ator_id()`.
- `jornada_sistema` (NOLOGIN): tarefas sem usuário (página do paciente por token, fila de saída, inscrição por e-mail autorizado) e leitura do estado completo para decisão. Concessões mínimas.
- A conexão da Edge Function usa `SUPABASE_DB_URL` (usuário `postgres`); o migration concede `jornada_api` e `jornada_sistema` a `postgres`.
- `anon` e `authenticated` (PostgREST) **não** recebem nenhum privilégio no schema. O schema **não** é exposto na API REST.

### 4.2 Funções auxiliares

- `jornada_cirurgica.ator_id() returns uuid` — `nullif(current_setting('jornada.ator', true), '')::uuid`.
- `jornada_cirurgica.ator_papeis() returns text[]` — papéis do membro ativo (SECURITY DEFINER, `search_path = ''`).
- `jornada_cirurgica.ator_tem_papel(variadic text[]) returns boolean`.
- `jornada_cirurgica.impedir_alteracao()` — trigger que rejeita UPDATE/DELETE/TRUNCATE nas tabelas que só crescem.

### 4.3 Tabelas

| Tabela | Colunas principais | Escrita | Leitura (`jornada_api`) |
| --- | --- | --- | --- |
| `membros` | `user_id uuid pk` (sem FK para auth.users: inscrição por e-mail), `email text unique`, `nome`, `papeis text[]` (check nos 7 papéis), `ativo bool`, `pin_hash text null`, `pin_atualizado_em`, `criado_em`, `atualizado_em` | gestora (via API) | membros ativos |
| `convites` | `email text pk` (minúsculo), `nome`, `papeis text[]`, `ativo bool`, `vinculado_user_id uuid unique null`, `criado_em`, `criado_por` | gestora | gestora |
| `pacientes` | `id uuid pk`, `datasigh_id text unique null`, `cpf_hmac text unique null`, `nome_completo`, `nome_normalizado`, `data_nascimento date`, `nome_mae null`, `prontuario null`, `conferido_datasigh bool`, `criado_em`, `criado_por`, `atualizado_em` | projeção dos eventos `paciente.*` (concierge, gestora) | membros ativos |
| `episodios` | `id uuid pk`, `paciente_id fk`, `olho text check ('OD','OE')`, `cirurgiao_id uuid`, `tipo_cirurgia`, `tipo_lente`, `data_sugerida date null`, `data_cirurgia date null`, `horario time null`, `ordem int null`, `estado text`, `versao int not null default 0`, `versoes_modelos jsonb`, `resumo jsonb` (EpisodioResumoDia, sem valores de lente), `aberto_em`, `aberto_por`, `atualizado_em` | projeção (API, na mesma transação dos eventos) | membros ativos |
| `eventos` (só cresce) | `id bigint identity pk`, `episodio_id uuid null fk`, `paciente_id uuid null fk`, `seq int null` (unique com episodio_id), `tipo text`, `dados jsonb`, `visibilidade text check ('geral','conferencia_1','conferencia_2')`, `autor_id uuid`, `autor_papel text`, `sessao_usuario_id uuid null`, `aparelho_id text null`, `registrado_em timestamptz default now()`, `fora_de_hora bool`, `motivo_fora_de_hora text null`, `versao_modelo text null`, `chave_idempotencia text unique null` | insert: `autor_id = ator_id()` e papel permitido para (`tipo`, `dados->>'modelo'`) em `permissoes_evento` | `geral`: membros ativos; `conferencia_1`: concierge, cirurgião, gestora; `conferencia_2`: conferente, cirurgião, gestora |
| `lente_registros` (só cresce) | `id uuid pk`, `episodio_id fk`, `ciclo int`, `etapa text check ('plano','chegada','cp2','time_out')`, `dados jsonb`, `visibilidade text`, `autor_id`, `registrado_em` | plano/chegada: concierge; cp2: conferente; time_out: circulante | `plano`,`chegada`: concierge, cirurgião, gestora; `cp2`: conferente, cirurgião, gestora; `time_out`: circulante, cirurgião, gestora |
| `acessos` (só cresce) | `id bigint pk`, `ator_id`, `sessao_usuario_id`, `aparelho_id`, `registrado_em`, `recurso text` (`episodio`, `paciente`, `cpf_consulta`, `dia`, `pin_falha`, `anexo`, `etiquetas`, ...), `episodio_id null`, `paciente_id null`, `detalhe jsonb` (sem dado de paciente) | qualquer membro ativo (o próprio ator) | gestora |
| `permissoes_evento` | `tipo text`, `modelo text null`, `papeis text[]`, pk (`tipo`, `coalesce(modelo,'')`) | migration | membros ativos |
| `modelos_checklist` | `id text`, `versao text`, `conteudo jsonb`, `publicado_em`, `publicado_por`, pk (`id`,`versao`) (só cresce) | gestora | membros ativos |
| `config` | `chave text pk`, `valor jsonb`, `atualizado_em`, `atualizado_por` | gestora | membros ativos |
| `materiais` | `id uuid pk`, `codigo text`, `versao int`, `titulo`, `tipo`, `url null`, `conteudo null`, `momento`, `publico`, `ativo bool`, `criado_em`, `criado_por`, unique (`codigo`,`versao`) | gestora | membros ativos |
| `links_paciente` | `id uuid pk`, `episodio_id fk`, `token_hash text unique` (SHA-256 do token), `criado_em`, `expira_em`, `revogado_em null`, `criado_por` | concierge, gestora | concierge, gestora; `jornada_sistema` por `token_hash` |
| `mensagens_saida` | `id uuid pk`, `episodio_id fk`, `gatilho text`, `contato_id text`, `telefone text`, `texto text`, `modelo_meta text null`, `parametros jsonb`, `chave_idempotencia text unique`, `estado text check (...)`, `tentativas int`, `provedor_id text null`, `ultimo_erro text null` (sem dado de paciente), `criado_em`, `criado_por`, `atualizado_em` | insert: membros (via API); atualização de estado: `jornada_sistema` | membros ativos (telefone só pela API, mascarado) |
| `mensagens_saida_eventos` (só cresce) | `id bigint pk`, `mensagem_id fk`, `estado`, `registrado_em`, `detalhe jsonb` | `jornada_sistema` | gestora |
| `anexos` (só cresce) | `id uuid pk`, `episodio_id fk`, `tipo text check ('foto_plano')`, `storage_path text`, `sha256 text`, `content_type`, `tamanho int`, `autor_id`, `registrado_em` | concierge, cirurgião, gestora | concierge, cirurgião, gestora |
| `aparelhos` | `id text pk`, `nome text null`, `ultimo_acesso`, `criado_em` | qualquer membro (upsert do próprio aparelho) | gestora |

`jornada_sistema`: SELECT em tudo o que a decisão precisa (estado completo de um episódio), INSERT em `eventos` com `autor_papel in ('sistema','paciente')`, UPDATE só de `estado/tentativas/provedor_id/ultimo_erro/atualizado_em` em `mensagens_saida`, INSERT em `mensagens_saida_eventos`, `acessos`, `membros` (inscrição) e `convites.vinculado_user_id`.

### 4.4 Matriz `permissoes_evento` (tipo, modelo → papéis)

A API também confere no domínio (por comando e por item). O banco é a segunda barreira.

| tipo | modelo | papéis |
| --- | --- | --- |
| paciente.cadastrado, paciente.corrigido | — | concierge, gestora |
| episodio.aberto | — | concierge, gestora |
| episodio.agendado, episodio.corrigido | — | concierge, gestora, cirurgiao |
| checklist.item_respondido / bloco.concluido | d7 | concierge |
| | cp1 | concierge |
| | cp2 | conferente |
| | d2 | conferente, concierge |
| | admissao | enfermagem |
| | sign_in | circulante, enfermagem, cirurgiao, anestesista |
| | anestesia | anestesista |
| | time_out | circulante, cirurgiao |
| | sign_out | circulante, cirurgiao, anestesista |
| | alta | enfermagem, cirurgiao |
| alerta.comunicado | — | concierge, conferente, enfermagem, circulante, gestora, cirurgiao |
| alerta.conduta_registrada | — | cirurgiao |
| contato.salvo, contato.removido | — | concierge, conferente, enfermagem, gestora |
| contato.confirmado | — | concierge, conferente, gestora |
| orientacoes.teach_back | — | concierge, enfermagem |
| lente.plano_registrado, lente.chegada_registrada | — | concierge |
| lente.cp2_registrado, lente.cp2_resultado | — | conferente |
| lente.quarentena_aberta | — | concierge, conferente, circulante, cirurgiao |
| lente.quarentena_resolvida, lente.troca_d0 | — | cirurgiao |
| lente.time_out_resultado | — | circulante |
| anexo.adicionado | — | concierge, cirurgiao, gestora |
| tcle.status | — | concierge, conferente, enfermagem, gestora |
| material.enviado, link_paciente.criado | — | concierge, gestora |
| etiqueta.copiada | — | conferente, concierge, enfermagem |
| hardstop.resolvido | — | todos os 7 (o domínio confere a competência por código) |
| intercorrencia.registrada | — | enfermagem, circulante, anestesista, cirurgiao |
| episodio.suspenso, episodio.cancelado | — | cirurgiao, gestora |
| avisos.atraso_solicitado | — | concierge, enfermagem, circulante, gestora, cirurgiao |
| mensagem.enfileirada, quase_evento.registrado | — | todos os 7 |
| membro.alterado, config.alterada, modelo.publicado, material.catalogo_alterado | — | gestora |
| material.aberto, quiz.respondido | — | (somente `jornada_sistema`, autor_papel 'paciente') |

Visibilidade obrigatória: `checklist.item_respondido` com modelo `cp1` → `conferencia_1`; com modelo `cp2` → `conferencia_2`. Demais eventos → `geral` e **nunca** carregam valores de lente (os valores ficam em `lente_registros`).

## 5. Fluxo de uma requisição da equipe

1. Lê `Authorization`. Produção: valida com `GET {SUPABASE_URL}/auth/v1/user` (como no painel de pré-consulta) e exige e-mail confirmado. Desenvolvimento: token fictício assinado (`JORNADA_MODO_DEV=true`, nunca em produção).
2. Resolve o membro (`membros` ativo). Primeiro acesso: inscrição por `convites` (e-mail verificado pelo Auth, nunca do corpo).
3. Resolve o ator: `x-jornada-ator` (token HMAC de curta duração emitido por `ator.pin`) ou o próprio membro da sessão. MFA (`aal2`) exigido para cirurgião e gestora quando `JORNADA_EXIGIR_MFA=true`.
4. Transação: `SET LOCAL ROLE jornada_sistema` → carrega o estado COMPLETO do episódio → `dominio.decidir(...)` → `SET LOCAL ROLE jornada_api` + `set_config` do ator → grava eventos (`seq = versao+1...`), registros de lente, mensagens; atualiza a projeção `episodios` (estado, campos agendados, `versao`, `resumo`) com checagem de versão (`where versao = $esperada`).
5. Leitura da resposta como `jornada_api` (RLS filtra conferências) → `montarEstado` → `projetarVisao` (filtra de novo por papel) → JSON.
6. Toda leitura de dado de paciente grava uma linha em `acessos`.
7. Erros: códigos de `CodigoErroApi`, mensagem genérica, sem dado de paciente.

## 6. Variáveis de ambiente (Edge Functions)

| Nome | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Padrão das Edge Functions (service role só para Storage; nunca no navegador) |
| `JORNADA_ORIGENS_PERMITIDAS` | Origens do front-end (CORS), separadas por vírgula |
| `JORNADA_SEGREDO_CPF` | Segredo do HMAC do CPF (≥ 32 bytes) |
| `JORNADA_SEGREDO_ATOR` | Segredo dos tokens de ator (PIN) |
| `JORNADA_ATOR_TTL_MIN` | Validade do token de ator (padrão 15) |
| `JORNADA_CPF_CONSULTAS_HORA` | Limite de consultas de CPF por usuário por hora (padrão 30) |
| `JORNADA_EXIGIR_MFA` | `true` exige `aal2` para cirurgião e gestora |
| `ENVIO_PACIENTES_HABILITADO` | `false` (padrão): modo ensaio. Só o Dr. Augusto liga |
| `JORNADA_URL_PAGINA_PACIENTE` | Base pública da página do paciente (ex.: `https://<front>/p/`) |
| `JORNADA_LINK_VALIDADE_DIAS` | Validade do link do paciente |
| `DATASIGH_BASE_URL`, `DATASIGH_AUTH_HEADER`, `DATASIGH_AUTH_VALOR`, `DATASIGH_CAMINHO_BUSCA_CPF`, `DATASIGH_MAPA_CAMPOS` | Datasigh, somente GET. Sem caminho/mapa configurados → `nao_configurado` (pendência: documentação do fornecedor) |
| `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`, `META_GRAPH_VERSAO` | Envio real (fase de piloto, após autorização) |
| `JORNADA_MODO_DEV` | Somente no servidor local de demonstração |

## 7. Desenvolvimento local

```
npm run pg:iniciar          # Postgres 16 local em 127.0.0.1:54329 (dados fictícios)
npm run dev:api             # servidor local: http://127.0.0.1:8787/functions/v1/...
npm run dev:web             # Vite: http://127.0.0.1:5173 (proxy /functions/v1 → 8787)
npm test                    # domínio + banco + API
npm run test:e2e            # Playwright (Chromium em /opt/pw-browsers)
```

Testes de banco criam um banco descartável por arquivo de teste (`jc_teste_<aleatório>`), aplicam `tests/apoio/supabase-stub.sql` (schema `auth`, papéis `anon`/`authenticated`/`service_role`) e depois todas as migrations em ordem.
