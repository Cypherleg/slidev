# Notas do agente banco

Schema `jornada_cirurgica` (Postgres 16 local nos testes; destino: Supabase "Pipeline", Postgres 17).
Testes: `npx vitest run tests/banco` → **94 testes passando** (6 arquivos), também num cluster novo, sem papéis pré-existentes.

---

## ATENÇÃO: divergências e acréscimos em relação à ARQUITETURA §4.3

Leia isto antes de escrever SQL contra o schema. Tudo abaixo está coberto por testes.

1. **`membros.pin_hash` não é legível por `jornada_api`** (concessão por coluna). Consequências:
   - `select *` e `returning *` em `membros` como `jornada_api` falham (42501). Liste as colunas.
   - Coluna nova **`tem_pin boolean`** (gerada: `pin_hash is not null`), legível por `jornada_api`.
   - Verificação de PIN: ler `pin_hash` como `jornada_sistema`.
   - Motivo: PIN de 6 dígitos com hash legível por toda a equipe pode ser quebrado offline.
2. **Regras por linha em `membros`** (trigger `membros_guarda`, só quando `current_user = 'jornada_api'`):
   - só a gestora altera `nome`, `papeis`, `ativo` (erro `JC002`);
   - `pin_hash` não nulo só pelo próprio membro (`user_id = ator_id()`); a gestora pode apenas **zerar** (`null`) o PIN de outro (erro `JC002`);
   - `email` e `user_id` não são alteráveis por `jornada_api` (sem UPDATE na coluna).
   - `membros.email` é `not null`.
3. **`episodios`: `olho`, `paciente_id`, `aberto_em`, `aberto_por` são imutáveis** (sem UPDATE para ninguém além do dono). Olho errado = cancelar e abrir outro episódio.
4. **`jornada_sistema` recebeu, além da §4.3:**
   - `UPDATE (versao, resumo, atualizado_em)` em `episodios` (página do paciente mantém `seq = versao + 1`);
   - `INSERT` em `modelos_checklist` **somente com `publicado_por is null`** (semeadura de `modelosPadrao()`; pedido do agente api). Escolha registrada: **gravação do sistema = `publicado_por` nulo**; o autor fixo `ATOR_SISTEMA_ID` (`00000000-0000-4000-8000-000000000000`) é **recusado** nessa tabela. A tabela continua só cresce: a PK (`id`, `versao`) impede sobrescrever versão publicada; UPDATE/DELETE/TRUNCATE bloqueados por trigger.
5. **`acessos`: o próprio ator lê as suas linhas** (além da gestora). Necessário porque `INSERT ... RETURNING` / `ON CONFLICT` exigem que quem insere enxergue a linha.
6. **`aparelhos`**: `jornada_api` insere/atualiza **só o aparelho do contexto** (`id = current_setting('jornada.aparelho')`); a gestora atualiza qualquer um e lê todos; o membro lê o próprio (necessário para o upsert `ON CONFLICT`). Faça o upsert depois de `set_config('jornada.aparelho', ...)`.
7. **Visibilidade de `eventos` é CHECK da tabela** (vale para todos os papéis, inclusive `jornada_sistema` e o dono):
   - `checklist.item_respondido` + `cp1` → `conferencia_1`; + `cp2` → `conferencia_2`;
   - `lente.plano_registrado`, `lente.chegada_registrada` → `geral` **ou** `conferencia_1` (tipos.ts diz conferencia_1; §4.4 diz geral; os dois são aceitos);
   - `lente.cp2_registrado` → `geral` ou `conferencia_2`;
   - todo o resto, inclusive `bloco.concluido` de cp1/cp2, → `geral`.
   - Eventos `geral` **não podem conter as chaves `dioptria`, `cilindro` ou `eixo` em nenhum nível** do JSON (valores em array, como `camposDivergentes: ['dioptria']`, são aceitos). O mesmo vale para `episodios.resumo`.
8. `eventos.seq` exige `episodio_id` e é ≥ 1.
9. `jornada_sistema` só insere eventos com `autor_papel in ('sistema','paciente')` **e `tipo` presente na matriz**. `autor_id` é livre para o sistema (a API usa `ATOR_SISTEMA_ID`).
10. `materiais`: só `ativo` é alterável. Nova versão = nova linha (`unique (codigo, versao)`).
11. `mensagens_saida`: `jornada_api` só insere com `estado in ('ensaio','pendente')`, `tentativas = 0`, `provedor_id is null`. `jornada_sistema` **não altera mensagem em `ensaio`** nem põe nenhuma em `ensaio` (modo ensaio nunca sai).
12. Formatos: `links_paciente.token_hash` = SHA-256 em **hex minúsculo (64)** — o token base64url é recusado; `anexos.sha256` = hex (64); `pacientes.cpf_hmac` ≥ 32 caracteres (CPF puro é recusado); `convites.email` minúsculo e sem espaços.
13. `permissoes_evento`: em vez de PK sobre expressão, `unique nulls not distinct (tipo, modelo)` (mesmo efeito; `on conflict (tipo, modelo)` funciona).
14. `lente_registros`: CHECK etapa × visibilidade (`plano`/`chegada` → `conferencia_1`; `cp2` → `conferencia_2`; `time_out` livre — a leitura é controlada pela etapa).
15. `service_role` também não recebe nada no schema (além de `anon`/`authenticated`/PUBLIC).

---

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `supabase/migrations/20261012120000_jornada_cirurgica_base.sql` | Papéis, schema, privilégios padrão, funções de contexto e do ator, 16 tabelas com checks e índices, triggers (só cresce, `atualizado_em`, guarda de membros), RLS habilitado |
| `supabase/migrations/20261012120100_jornada_cirurgica_acesso.sql` | Políticas de RLS, `reivindicar_mensagens`, `inscrever_por_email`, concessões por papel/coluna, revogações explícitas |
| `supabase/migrations/20261012120200_jornada_cirurgica_permissoes_evento.sql` | Matriz §4.4 (57 linhas; recarregada por inteiro) |
| `supabase/migrations/20261012120300_jornada_cirurgica_storage.sql` | Bucket privado `jornada-cirurgica` (só se `storage.buckets` existir) |
| `tests/banco/apoio-rls.ts` | Membros fictícios, semente, `comoAtor`, `tentar` (sempre desfaz), `erroDe` |
| `tests/banco/migrations.test.ts` | Aplicação do zero, idempotência (reaplica 2x), RLS em todas as tabelas, `search_path`, papéis, nenhum acesso externo, sessão tipo `authenticator`, Storage simulado |
| `tests/banco/so-cresce.test.ts` | UPDATE/DELETE/TRUNCATE (e CASCADE) falham nas 6 tabelas, inclusive como postgres |
| `tests/banco/rls-leitura.test.ts` | Conferência cega, inativo/não membro/sem ator, leitura por tabela, `pin_hash` |
| `tests/banco/rls-escrita.test.ts` | INSERT/UPDATE por papel, matriz, visibilidade, sistema, membros, mensagens, modelos |
| `tests/banco/restricoes-e-funcoes.test.ts` | `seq` único, idempotência, CHECK sem RLS, fila concorrente, inscrição |
| `tests/banco/matriz.test.ts` | Matriz = tabela literal = tabela lida do `docs/ARQUITETURA.md` §4.4; cobre todos os `TipoEvento` e `ModeloId` |
| `tests/apoio/supabase-stub.sql` | (alterado) criação de `anon`/`authenticated`/`service_role` tolerante a corrida entre arquivos de teste em paralelo |

---

## Nomes exatos para a API

### Contexto (por transação)

```sql
set local role jornada_api;   -- ou jornada_sistema
select set_config('jornada.ator', '<uuid>', true),
       set_config('jornada.sessao', '<uuid>', true),
       set_config('jornada.aparelho', '<texto>', true);
```

Padrões de coluna que leem o contexto: `eventos.autor_id`, `lente_registros.autor_id`, `anexos.autor_id`, `acessos.ator_id`, `pacientes.criado_por`, `episodios.aberto_por`, `convites.criado_por`, `links_paciente.criado_por`, `mensagens_saida.criado_por`, `modelos_checklist.publicado_por`, `materiais.criado_por`, `config.atualizado_por` = `ator_id()`; `eventos/acessos.sessao_usuario_id` = `sessao_atual()`; `eventos/acessos.aparelho_id` = `aparelho_atual()`. Passar o valor explicitamente também funciona (a política confere que é o ator).

### Funções (`jornada_cirurgica.`)

| Função | Quem executa | Observação |
| --- | --- | --- |
| `ator_id() → uuid` | api, sistema | `jornada.ator` |
| `sessao_atual() → uuid`, `aparelho_atual() → text` | api, sistema | `jornada.sessao`, `jornada.aparelho` |
| `ator_papeis() → text[]` | api, sistema | SECURITY DEFINER; `{}` se inativo/ausente |
| `ator_ativo() → boolean` | api, sistema | SECURITY DEFINER |
| `ator_tem_papel(variadic text[]) → boolean` | api, sistema | SECURITY DEFINER |
| `papeis_do_evento(tipo text, modelo text) → text[]` | api, sistema | SECURITY DEFINER; nulo se o par não existe |
| `reivindicar_mensagens(p_limite int default 10) → setof mensagens_saida` | **só sistema** | `pendente → enviando`, `tentativas + 1`, grava `mensagens_saida_eventos` (`enviando`); `FOR UPDATE SKIP LOCKED`; limite saturado em 0..100; SECURITY INVOKER |
| `inscrever_por_email(p_user_id uuid, p_email text) → setof membros` | **só sistema** | SECURITY DEFINER. Membro existente: devolvido sem alteração (vincula convite se faltar). Convite ativo não vinculado a outra conta: cria membro ativo e vincula. Caso contrário: nenhuma linha. E-mail normalizado (`lower(btrim())`) |
| `impedir_alteracao()`, `tocar_atualizado_em()`, `membros_guarda()` | triggers | — |

### Tabelas e colunas

- `membros(user_id pk, email unique not null, nome, papeis text[], ativo, pin_hash*, tem_pin [gerada], pin_atualizado_em, criado_em, atualizado_em)` — *não legível por api
- `convites(email pk minúsculo, nome, papeis, ativo, vinculado_user_id unique, criado_em, criado_por)`
- `pacientes(id, datasigh_id unique, cpf_hmac unique, nome_completo, nome_normalizado, data_nascimento, nome_mae, prontuario, conferido_datasigh, criado_em, criado_por, atualizado_em)`
- `episodios(id, paciente_id, olho, cirurgiao_id, tipo_cirurgia, tipo_lente, data_sugerida, data_cirurgia, horario, ordem, estado default 'd7_em_andamento', versao default 0, versoes_modelos jsonb default '{}', resumo jsonb, aberto_em, aberto_por, atualizado_em)`
- `eventos(id bigint identity, episodio_id, paciente_id, seq, tipo, dados jsonb default '{}', visibilidade default 'geral', autor_id, autor_papel, sessao_usuario_id, aparelho_id, registrado_em, fora_de_hora, motivo_fora_de_hora, versao_modelo, chave_idempotencia unique)`; unique `(episodio_id, seq)`
- `lente_registros(id uuid, episodio_id, ciclo default 1, etapa, dados, visibilidade, autor_id, registrado_em)`
- `acessos(id bigint identity, ator_id, sessao_usuario_id, aparelho_id, registrado_em, recurso ~ '^[a-z][a-z0-9_.]*$', episodio_id, paciente_id, detalhe jsonb default '{}')`
- `permissoes_evento(tipo, modelo, papeis)`
- `modelos_checklist(id, versao, conteudo, publicado_em, publicado_por)` pk `(id, versao)`; `id` ∈ 10 `ModeloId`
- `config(chave pk, valor jsonb, atualizado_em, atualizado_por)`
- `materiais(id, codigo, versao default 1, titulo, tipo, url, conteudo, momento, publico, ativo, criado_em, criado_por)`
- `links_paciente(id, episodio_id, token_hash unique, criado_em, expira_em > criado_em, revogado_em, criado_por)`
- `mensagens_saida(id, episodio_id, gatilho [9 GatilhoAviso], contato_id, telefone, texto, modelo_meta, parametros jsonb, chave_idempotencia unique not null, estado [8 EstadoMensagem], tentativas, provedor_id, ultimo_erro, criado_em, criado_por, atualizado_em)`
- `mensagens_saida_eventos(id bigint identity, mensagem_id, estado, registrado_em, detalhe jsonb)`
- `anexos(id, episodio_id, tipo='foto_plano', storage_path unique, sha256 hex, content_type jpeg|png, tamanho > 0, autor_id, registrado_em)`
- `aparelhos(id text pk, nome, ultimo_acesso, criado_em)`

`atualizado_em` é posto em `now()` por trigger em `membros`, `pacientes`, `episodios`, `config`, `mensagens_saida`.

### Concessões por coluna (UPDATE)

| Tabela | `jornada_api` | `jornada_sistema` |
| --- | --- | --- |
| membros | nome, papeis, ativo, pin_hash, pin_atualizado_em, atualizado_em | — (inscrição: INSERT ou função) |
| convites | nome, papeis, ativo (gestora) | vinculado_user_id (só convite ativo e ainda não vinculado) |
| pacientes | datasigh_id, cpf_hmac, nome_completo, nome_normalizado, data_nascimento, nome_mae, prontuario, conferido_datasigh, atualizado_em (concierge, gestora) | — |
| episodios | cirurgiao_id, tipo_cirurgia, tipo_lente, data_sugerida, data_cirurgia, horario, ordem, estado, versao, versoes_modelos, resumo, atualizado_em (membro ativo) | versao, resumo, atualizado_em |
| config | valor, atualizado_em, atualizado_por (gestora) | — |
| materiais | ativo (gestora) | — |
| links_paciente | revogado_em (concierge, gestora) | — |
| mensagens_saida | — | estado, tentativas, provedor_id, ultimo_erro, atualizado_em |
| aparelhos | nome, ultimo_acesso | — |

### Códigos de erro (SQLSTATE)

| Código | Significado |
| --- | --- |
| `JC001` | UPDATE/DELETE/TRUNCATE em tabela que só cresce |
| `JC002` | Regra de `membros` (papéis/situação só pela gestora; PIN só pelo próprio membro) |
| `42501` | Sem privilégio ou RLS (inclusive linha inserida que o autor não poderia ver, com `RETURNING`) |
| `23514` | CHECK (visibilidade obrigatória, valores de lente em evento geral, formatos) |
| `23505` | Unique (`seq` por episódio → `conflito_versao`; `chave_idempotencia`) |

UPDATE barrado pela RLS de linha não dá erro: afeta 0 linhas (use `returning` para detectar).

---

## Decisões

- **Funções do ator SECURITY DEFINER** (dono = quem aplica a migration) com `set search_path = ''` e nomes totalmente qualificados; as demais funções também fixam `search_path = ''`. Nas políticas, as chamadas ficam em `(select ...)` para serem avaliadas uma vez por comando.
- **Sem `FORCE ROW LEVEL SECURITY`**: o dono e as funções SECURITY DEFINER ignoram a RLS. A API nunca deve consultar dados como `postgres` sem `SET LOCAL ROLE`.
- **Triggers de só cresce** (`<tabela>_so_cresce` por linha, `<tabela>_so_cresce_truncate` por comando) em `eventos`, `lente_registros`, `acessos`, `mensagens_saida_eventos`, `anexos`, `modelos_checklist`. Valem para o dono e para superusuário; `TRUNCATE ... CASCADE` de `episodios`/`pacientes` também é barrado. Sem `ON DELETE CASCADE` em nenhuma FK.
- **Matriz**: `checklist.item_respondido` e `bloco.concluido` têm só linhas por modelo; o banco exige `dados->>'modelo'` e o confere. Nos demais tipos, `dados->>'modelo'` é ignorado (ex.: `alerta.comunicado` com `modelo` no JSON). `material.aberto`/`quiz.respondido` têm `papeis = '{}'` (nenhum membro). A política exige: `autor_id = ator_id()`, ator ativo, `autor_papel ∈ papéis do ator` e `papeis_do_evento ∩ papéis do ator ≠ ∅` (como pedido; uma versão mais estrita exigiria `autor_papel ∈ papeis_do_evento` — não aplicada para não quebrar a API).
- **Conferência cega**: leitura por `visibilidade` (`eventos`) e por `etapa` (`lente_registros`); `anexos` (foto do plano) só concierge, cirurgião e gestora. Quem tem papel duplo (ex.: conferente + concierge) vê as duas conferências — o domínio recusa o cp2 quando `atorViuConferencia1`.
- **Idempotência**: `if not exists`, `create or replace` (funções e triggers), `drop policy if exists` + `create policy`, matriz recarregada por inteiro, concessões zeradas e refeitas. Testado: reaplicar 2x mantém estrutura (políticas, funções, ACLs, concessões por coluna, triggers) e dados idênticos. Limitação: alterar uma coluna/constraint de tabela existente exige migration nova (não é refeito por `create table if not exists`).
- **Papéis**: criação tolerante a corrida; a migration não usa `ALTER ROLE` (o `postgres` do Supabase não pode mexer em SUPERUSER/BYPASSRLS) — confere os atributos e falha se o papel existir com LOGIN/SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB.
- **Revogações**: `revoke all ... from public, anon, authenticated, service_role` explícito em tabelas, sequências, funções e schema (o `alter default privileges ... in schema` não remove privilégios padrão globais, como EXECUTE a PUBLIC).
- **Storage**: a migration cria/força privado o bucket `jornada-cirurgica` (10 MB, JPEG/PNG) e **não cria nem altera políticas em `storage.objects`**. Ela emite WARNING para cada política de `storage.objects` para anon/authenticated/public que não mencione `bucket_id`.
- **`registrado_em`** tem padrão `now()`, mas a API pode informá-lo (relógio injetado em testes). Endurecimento possível para produção: retirar INSERT dessa coluna de `jornada_api`.

---

## Validar num branch do Supabase antes de produção

1. Aplicar as 4 migrations no branch (Postgres 17) com o mesmo usuário da `SUPABASE_DB_URL` e conferir que nada fora de `jornada_cirurgica` mudou (diff de `pg_dump --schema-only` de `public`, `ofta_journey`, `auth`, `storage`).
2. `create role ... nologin nobypassrls ...` e **`grant jornada_api/jornada_sistema to postgres`** executados pelo `postgres` (não superusuário, CREATEROLE, regras de PG16+: ADMIN implícito, `createrole_self_grant`). Conferir `pg_has_role('postgres','jornada_api','SET')` e `... 'MEMBER'`.
3. Pela conexão da Edge Function (`SUPABASE_DB_URL`, inclusive pelo pooler/Supavisor em modo transação): `begin; set local role jornada_api; select set_config('jornada.ator', ..., true); ... commit;` e o mesmo com `jornada_sistema`.
4. Se o `postgres` do projeto tiver BYPASSRLS: confirmar que, depois de `SET LOCAL ROLE jornada_api`, a RLS se aplica (o atributo vale para o papel corrente).
5. `has_schema_privilege('anon'|'authenticated'|'service_role', 'jornada_cirurgica', 'USAGE')` = false; nenhuma linha de ACL para esses papéis (consulta do teste `migrations.test.ts`). Conferir que o schema **não** está em "Exposed schemas" da API e que o pg_graphql não o expõe.
6. Event triggers do Supabase (PostgREST/pg_graphql) não alteram grants no schema novo.
7. Bucket: ler os WARNINGs da migration de Storage; se existir política genérica em `storage.objects` (sem `bucket_id`) para anon/authenticated, decidir com o Dr. Augusto uma política RESTRICTIVE para o bucket (`bucket_id is distinct from 'jornada-cirurgica'`) — isso altera tabela existente, por isso não foi feito automaticamente.
8. `jsonb_path_exists`, `unique nulls not distinct`, `create or replace trigger`: disponíveis no PG17 (testados no PG16).
9. Desempenho: `explain analyze` das leituras do dia e do episódio como `jornada_api` (funções em initplan).

## Riscos e pendências

- **Divergências da §4.3** (seção do topo) precisam ser conhecidas pela API; a leitura do código atual do agente api (`repositorio.ts`, `acoes-equipe.ts`, `fila.ts`, `acoes-paciente.ts`) não mostrou conflito: usa `tem_pin`, lê `pin_hash` como sistema, define PIN com ator = membro da sessão, semeia modelos com `publicado_por` nulo, não registra `enviando` nem soma `tentativas` (a função já faz).
- Um papel com acesso à conexão `postgres` ignora a RLS e pode desligar triggers (`ALTER TABLE ... DISABLE TRIGGER`): a garantia de "só cresce" contra o dono é por trigger, não contra quem administra o banco. Backups/auditoria do projeto continuam necessários.
- O CHECK "geral sem valores de lente" olha as chaves `dioptria`, `cilindro`, `eixo`; texto livre (ex.: motivo de quarentena) não é verificado.
- `jornada_sistema` pode inserir eventos de qualquer tipo da matriz com `autor_papel = 'sistema'` (como a §4.3 define); restringir por tipo se o domínio fechar a lista.
