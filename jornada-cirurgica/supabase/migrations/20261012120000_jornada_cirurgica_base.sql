-- =============================================================================
-- Jornada Cirúrgica (catarata) — OFTA VITTA
-- Migration 1/4: papéis de banco, schema, funções auxiliares, tabelas, índices,
-- triggers de "registro que só cresce" e RLS habilitado.
--
-- Contrato: docs/ARQUITETURA.md §4. Notas do agente banco: docs/notas-agentes/banco.md.
--
-- Regras desta migration (projeto Supabase JÁ EM PRODUÇÃO, Postgres 17):
--   * Nada fora do schema `jornada_cirurgica` é alterado (exceto criar os papéis
--     `jornada_api` / `jornada_sistema` e concedê-los a `postgres`).
--   * Idempotente: pode ser aplicada duas vezes sem erro.
--   * Nenhum DROP fora do schema novo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Papéis de banco (NOLOGIN, sem BYPASSRLS). Criação tolerante a corrida
--    (testes em paralelo no mesmo cluster) e a reaplicação.
-- -----------------------------------------------------------------------------
do $$
declare
  v_papel text;
begin
  foreach v_papel in array array['jornada_api', 'jornada_sistema'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_papel) then
      begin
        execute format('create role %I nologin nobypassrls nocreatedb nocreaterole', v_papel);
      exception when duplicate_object or unique_violation then
        null; -- criado por outra sessão ao mesmo tempo
      end;
    end if;
    -- Não usamos ALTER ROLE (exige privilégios que o `postgres` do Supabase pode não ter);
    -- conferimos os atributos e falhamos se alguém tiver mudado o papel.
    if exists (
      select 1 from pg_catalog.pg_roles
      where rolname = v_papel and (rolsuper or rolbypassrls or rolcanlogin or rolcreaterole or rolcreatedb)
    ) then
      raise exception 'jornada_cirurgica: o papel % existe com atributos inesperados (LOGIN/SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB)', v_papel;
    end if;
    begin
      execute format('grant %I to postgres', v_papel);
    exception when unique_violation then
      null; -- concessão concorrente idêntica
    end;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Schema e privilégios padrão (nada para PUBLIC / anon / authenticated).
-- -----------------------------------------------------------------------------
create schema if not exists jornada_cirurgica;
comment on schema jornada_cirurgica is
  'Painel da Jornada Cirúrgica de catarata (OFTA VITTA). Não exposto no PostgREST. Acesso só por jornada_api / jornada_sistema via Edge Functions.';

revoke all on schema jornada_cirurgica from public;
grant usage on schema jornada_cirurgica to jornada_api, jornada_sistema;

alter default privileges in schema jornada_cirurgica revoke all on tables from public;
alter default privileges in schema jornada_cirurgica revoke all on sequences from public;
alter default privileges in schema jornada_cirurgica revoke all on functions from public;

do $$
declare
  v_papel text;
begin
  foreach v_papel in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_papel) then
      execute format('revoke all on schema jornada_cirurgica from %I', v_papel);
      execute format('alter default privileges in schema jornada_cirurgica revoke all on tables from %I', v_papel);
      execute format('alter default privileges in schema jornada_cirurgica revoke all on sequences from %I', v_papel);
      execute format('alter default privileges in schema jornada_cirurgica revoke all on functions from %I', v_papel);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Contexto da requisição (definido pela API com set_config(..., true)).
-- -----------------------------------------------------------------------------
create or replace function jornada_cirurgica.ator_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('jornada.ator', true), '')::uuid
$$;
comment on function jornada_cirurgica.ator_id() is 'Ator da requisição (jornada.ator). Nulo quando não definido.';

create or replace function jornada_cirurgica.sessao_atual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('jornada.sessao', true), '')::uuid
$$;
comment on function jornada_cirurgica.sessao_atual() is 'Usuário que fez o login no aparelho (jornada.sessao). Pode diferir do ator (troca por PIN).';

create or replace function jornada_cirurgica.aparelho_atual()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('jornada.aparelho', true), '')
$$;
comment on function jornada_cirurgica.aparelho_atual() is 'Aparelho da requisição (jornada.aparelho).';

-- -----------------------------------------------------------------------------
-- 4. Tabelas
-- -----------------------------------------------------------------------------

-- 4.1 membros ---------------------------------------------------------------
create table if not exists jornada_cirurgica.membros (
  user_id            uuid primary key, -- id do auth.users, sem FK (inscrição por e-mail)
  email              text not null,
  nome               text not null,
  papeis             text[] not null default '{}'::text[],
  ativo              boolean not null default true,
  pin_hash           text null,
  tem_pin            boolean generated always as (pin_hash is not null) stored,
  pin_atualizado_em  timestamptz null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint membros_email_unico unique (email),
  constraint membros_nome_preenchido check (length(btrim(nome)) > 0),
  constraint membros_papeis_validos check (
    papeis <@ array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']::text[]
  )
);
comment on table jornada_cirurgica.membros is 'Equipe. pin_hash NÃO é legível por jornada_api (use tem_pin); verificação de PIN como jornada_sistema.';

-- 4.2 convites --------------------------------------------------------------
create table if not exists jornada_cirurgica.convites (
  email              text primary key,
  nome               text not null,
  papeis             text[] not null,
  ativo              boolean not null default true,
  vinculado_user_id  uuid null,
  criado_em          timestamptz not null default now(),
  criado_por         uuid null default jornada_cirurgica.ator_id(),
  constraint convites_vinculado_unico unique (vinculado_user_id),
  constraint convites_email_minusculo check (email = lower(btrim(email)) and position('@' in email) > 1),
  constraint convites_papeis_validos check (
    papeis <@ array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']::text[]
  )
);
comment on table jornada_cirurgica.convites is 'Lista de e-mails autorizados (inscrição no primeiro acesso).';

-- 4.3 pacientes -------------------------------------------------------------
create table if not exists jornada_cirurgica.pacientes (
  id                  uuid primary key default gen_random_uuid(),
  datasigh_id         text null,
  cpf_hmac            text null,
  nome_completo       text not null,
  nome_normalizado    text not null,
  data_nascimento     date not null,
  nome_mae            text null,
  prontuario          text null,
  conferido_datasigh  boolean not null default false,
  criado_em           timestamptz not null default now(),
  criado_por          uuid not null default jornada_cirurgica.ator_id(),
  atualizado_em       timestamptz not null default now(),
  constraint pacientes_datasigh_unico unique (datasigh_id),
  constraint pacientes_cpf_hmac_unico unique (cpf_hmac),
  -- CPF nunca é gravado: só o HMAC (>= 32 caracteres; 11 dígitos de CPF puro são recusados).
  constraint pacientes_cpf_hmac_formato check (cpf_hmac is null or length(cpf_hmac) >= 32),
  constraint pacientes_nome_preenchido check (length(btrim(nome_completo)) > 0)
);
comment on column jornada_cirurgica.pacientes.cpf_hmac is 'HMAC do CPF com segredo do servidor. O CPF em si nunca é gravado.';

-- 4.4 episodios -------------------------------------------------------------
create table if not exists jornada_cirurgica.episodios (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references jornada_cirurgica.pacientes (id),
  olho             text not null,
  cirurgiao_id     uuid not null,
  tipo_cirurgia    text not null,
  tipo_lente       text not null,
  data_sugerida    date null,
  data_cirurgia    date null,
  horario          time null,
  ordem            int null,
  estado           text not null default 'd7_em_andamento',
  versao           int not null default 0,
  versoes_modelos  jsonb not null default '{}'::jsonb,
  resumo           jsonb null,
  aberto_em        timestamptz not null default now(),
  aberto_por       uuid not null default jornada_cirurgica.ator_id(),
  atualizado_em    timestamptz not null default now(),
  constraint episodios_olho check (olho in ('OD', 'OE')),
  constraint episodios_estado check (estado in (
    'd7_em_andamento','d7_concluido','d2_concluido','admitido','sign_in_concluido',
    'time_out_concluido','sign_out_concluido','alta','suspenso','cancelado'
  )),
  constraint episodios_versao check (versao >= 0),
  constraint episodios_ordem check (ordem is null or ordem >= 0),
  constraint episodios_versoes_modelos_objeto check (jsonb_typeof(versoes_modelos) = 'object'),
  -- A projeção do dia nunca carrega valores de lente.
  constraint episodios_resumo_sem_valores_lente check (
    resumo is null or not (
      jsonb_path_exists(resumo, 'lax $.**.dioptria')
      or jsonb_path_exists(resumo, 'lax $.**.cilindro')
      or jsonb_path_exists(resumo, 'lax $.**.eixo')
    )
  )
);
create index if not exists episodios_data_cirurgia_idx on jornada_cirurgica.episodios (data_cirurgia, ordem);
create index if not exists episodios_paciente_idx on jornada_cirurgica.episodios (paciente_id);
create index if not exists episodios_estado_idx on jornada_cirurgica.episodios (estado);

-- 4.5 eventos (só cresce) ---------------------------------------------------
create table if not exists jornada_cirurgica.eventos (
  id                   bigint generated always as identity primary key,
  episodio_id          uuid null references jornada_cirurgica.episodios (id),
  paciente_id          uuid null references jornada_cirurgica.pacientes (id),
  seq                  int null,
  tipo                 text not null,
  dados                jsonb not null default '{}'::jsonb,
  visibilidade         text not null default 'geral',
  autor_id             uuid not null default jornada_cirurgica.ator_id(),
  autor_papel          text not null,
  sessao_usuario_id    uuid null default jornada_cirurgica.sessao_atual(),
  aparelho_id          text null default jornada_cirurgica.aparelho_atual(),
  registrado_em        timestamptz not null default now(),
  fora_de_hora         boolean not null default false,
  motivo_fora_de_hora  text null,
  versao_modelo        text null,
  chave_idempotencia   text null,
  constraint eventos_episodio_seq_unico unique (episodio_id, seq),
  constraint eventos_chave_idempotencia_unica unique (chave_idempotencia),
  constraint eventos_seq_positivo check (seq is null or seq >= 1),
  constraint eventos_seq_exige_episodio check (seq is null or episodio_id is not null),
  constraint eventos_tipo_formato check (tipo ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  constraint eventos_dados_objeto check (jsonb_typeof(dados) = 'object'),
  constraint eventos_visibilidade check (visibilidade in ('geral', 'conferencia_1', 'conferencia_2')),
  constraint eventos_autor_papel check (autor_papel in (
    'concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora','sistema','paciente'
  )),
  -- Visibilidade obrigatória (ARQUITETURA §4.4). Os eventos lente.* de registro aceitam
  -- 'geral' (sem valores) ou a conferência correspondente (tipos.ts).
  constraint eventos_visibilidade_obrigatoria check (
    case
      when tipo = 'checklist.item_respondido' and dados ->> 'modelo' = 'cp1' then visibilidade = 'conferencia_1'
      when tipo = 'checklist.item_respondido' and dados ->> 'modelo' = 'cp2' then visibilidade = 'conferencia_2'
      when tipo in ('lente.plano_registrado', 'lente.chegada_registrada') then visibilidade in ('geral', 'conferencia_1')
      when tipo = 'lente.cp2_registrado' then visibilidade in ('geral', 'conferencia_2')
      else visibilidade = 'geral'
    end
  ),
  -- Eventos 'geral' nunca carregam valores de lente (os valores ficam em lente_registros).
  constraint eventos_geral_sem_valores_lente check (
    visibilidade <> 'geral' or not (
      jsonb_path_exists(dados, 'lax $.**.dioptria')
      or jsonb_path_exists(dados, 'lax $.**.cilindro')
      or jsonb_path_exists(dados, 'lax $.**.eixo')
    )
  )
);
comment on table jornada_cirurgica.eventos is 'Registro que só cresce. Correção é novo evento. UPDATE/DELETE/TRUNCATE bloqueados por trigger (inclusive para o dono).';
-- (episodio_id, seq) já tem índice pela unique.
create index if not exists eventos_paciente_idx on jornada_cirurgica.eventos (paciente_id) where paciente_id is not null;
create index if not exists eventos_tipo_registrado_idx on jornada_cirurgica.eventos (tipo, registrado_em);
create index if not exists eventos_autor_registrado_idx on jornada_cirurgica.eventos (autor_id, registrado_em);

-- 4.6 lente_registros (só cresce) --------------------------------------------
create table if not exists jornada_cirurgica.lente_registros (
  id             uuid primary key default gen_random_uuid(),
  episodio_id    uuid not null references jornada_cirurgica.episodios (id),
  ciclo          int not null default 1,
  etapa          text not null,
  dados          jsonb not null,
  visibilidade   text not null,
  autor_id       uuid not null default jornada_cirurgica.ator_id(),
  registrado_em  timestamptz not null default now(),
  constraint lente_registros_ciclo check (ciclo >= 1),
  constraint lente_registros_etapa check (etapa in ('plano', 'chegada', 'cp2', 'time_out')),
  constraint lente_registros_dados_objeto check (jsonb_typeof(dados) = 'object'),
  constraint lente_registros_visibilidade check (visibilidade in ('geral', 'conferencia_1', 'conferencia_2')),
  constraint lente_registros_visibilidade_etapa check (
    case etapa
      when 'plano' then visibilidade = 'conferencia_1'
      when 'chegada' then visibilidade = 'conferencia_1'
      when 'cp2' then visibilidade = 'conferencia_2'
      else true -- time_out: leitura controlada pela etapa (circulante, cirurgião, gestora)
    end
  )
);
comment on table jornada_cirurgica.lente_registros is 'Valores da LIO por etapa (conferência cega). Leitura por etapa via RLS. Só cresce.';
create index if not exists lente_registros_episodio_idx on jornada_cirurgica.lente_registros (episodio_id, ciclo, etapa, registrado_em);

-- 4.7 acessos (só cresce) -----------------------------------------------------
create table if not exists jornada_cirurgica.acessos (
  id                 bigint generated always as identity primary key,
  ator_id            uuid null default jornada_cirurgica.ator_id(),
  sessao_usuario_id  uuid null default jornada_cirurgica.sessao_atual(),
  aparelho_id        text null default jornada_cirurgica.aparelho_atual(),
  registrado_em      timestamptz not null default now(),
  recurso            text not null,
  episodio_id        uuid null references jornada_cirurgica.episodios (id),
  paciente_id        uuid null references jornada_cirurgica.pacientes (id),
  detalhe            jsonb not null default '{}'::jsonb,
  constraint acessos_recurso_formato check (recurso ~ '^[a-z][a-z0-9_.]*$'),
  constraint acessos_detalhe_objeto check (jsonb_typeof(detalhe) = 'object')
);
comment on table jornada_cirurgica.acessos is 'Toda leitura de dado de paciente (e falhas de PIN). detalhe nunca contém dado de paciente. Só cresce.';
create index if not exists acessos_ator_recurso_idx on jornada_cirurgica.acessos (ator_id, recurso, registrado_em);
create index if not exists acessos_recurso_idx on jornada_cirurgica.acessos (recurso, registrado_em);
create index if not exists acessos_episodio_idx on jornada_cirurgica.acessos (episodio_id, ator_id, recurso) where episodio_id is not null;

-- 4.8 permissoes_evento ---------------------------------------------------------
create table if not exists jornada_cirurgica.permissoes_evento (
  tipo    text not null,
  modelo  text null,
  papeis  text[] not null,
  -- Equivale a pk (tipo, coalesce(modelo, '')).
  constraint permissoes_evento_pk unique nulls not distinct (tipo, modelo),
  constraint permissoes_evento_papeis_validos check (
    papeis <@ array['concierge','conferente','enfermagem','circulante','anestesista','cirurgiao','gestora']::text[]
  )
);
comment on table jornada_cirurgica.permissoes_evento is 'Matriz (tipo, modelo) -> papéis (ARQUITETURA §4.4). papeis vazio = só jornada_sistema. Escrita só por migration.';

-- 4.9 modelos_checklist (só cresce) ---------------------------------------------
create table if not exists jornada_cirurgica.modelos_checklist (
  id             text not null,
  versao         text not null,
  conteudo       jsonb not null,
  publicado_em   timestamptz not null default now(),
  publicado_por  uuid null default jornada_cirurgica.ator_id(),
  constraint modelos_checklist_pk primary key (id, versao),
  constraint modelos_checklist_id check (id in (
    'd7','cp1','cp2','d2','admissao','sign_in','anestesia','time_out','sign_out','alta'
  )),
  constraint modelos_checklist_conteudo_objeto check (jsonb_typeof(conteudo) = 'object')
);

-- 4.10 config -------------------------------------------------------------------
create table if not exists jornada_cirurgica.config (
  chave           text primary key,
  valor           jsonb not null,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid null default jornada_cirurgica.ator_id()
);

-- 4.11 materiais ----------------------------------------------------------------
create table if not exists jornada_cirurgica.materiais (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  versao      int not null default 1,
  titulo      text not null,
  tipo        text not null,
  url         text null,
  conteudo    text null,
  momento     text not null,
  publico     text not null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid null default jornada_cirurgica.ator_id(),
  constraint materiais_codigo_versao_unico unique (codigo, versao),
  constraint materiais_versao check (versao >= 1),
  constraint materiais_tipo check (tipo in ('video', 'texto', 'video_tcle', 'link_tcle', 'outro')),
  constraint materiais_momento check (momento in ('d7', 'd3', 'd2', 'd1', 'd0', 'alta')),
  constraint materiais_publico check (publico in ('paciente', 'cuidador', 'familiar'))
);

-- 4.12 links_paciente -----------------------------------------------------------
create table if not exists jornada_cirurgica.links_paciente (
  id           uuid primary key default gen_random_uuid(),
  episodio_id  uuid not null references jornada_cirurgica.episodios (id),
  token_hash   text not null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  revogado_em  timestamptz null,
  criado_por   uuid not null default jornada_cirurgica.ator_id(),
  constraint links_paciente_token_hash_unico unique (token_hash),
  constraint links_paciente_token_hash_formato check (length(token_hash) >= 32),
  constraint links_paciente_validade check (expira_em > criado_em)
);
comment on column jornada_cirurgica.links_paciente.token_hash is 'SHA-256 do token do link. O token em si nunca é gravado.';
create index if not exists links_paciente_episodio_idx on jornada_cirurgica.links_paciente (episodio_id);

-- 4.13 mensagens_saida ----------------------------------------------------------
create table if not exists jornada_cirurgica.mensagens_saida (
  id                  uuid primary key default gen_random_uuid(),
  episodio_id         uuid not null references jornada_cirurgica.episodios (id),
  gatilho             text not null,
  contato_id          text not null,
  telefone            text not null,
  texto               text not null,
  modelo_meta         text null,
  parametros          jsonb not null default '{}'::jsonb,
  chave_idempotencia  text not null,
  estado              text not null,
  tentativas          int not null default 0,
  provedor_id         text null,
  ultimo_erro         text null,
  criado_em           timestamptz not null default now(),
  criado_por          uuid not null default jornada_cirurgica.ator_id(),
  atualizado_em       timestamptz not null default now(),
  constraint mensagens_saida_chave_idempotencia_unica unique (chave_idempotencia),
  constraint mensagens_saida_gatilho check (gatilho in (
    'admissao_concluida','inicio_cirurgia','fim_cirurgia','alta','atraso',
    'tcle_envio','tcle_lembrete','tcle_confirmacao','materiais_preparo'
  )),
  constraint mensagens_saida_estado check (estado in (
    'ensaio','pendente','enviando','enviado','entregue','falhou','desconhecido','cancelado'
  )),
  constraint mensagens_saida_tentativas check (tentativas >= 0),
  constraint mensagens_saida_parametros_objeto check (jsonb_typeof(parametros) = 'object')
);
comment on column jornada_cirurgica.mensagens_saida.ultimo_erro is 'Sem dado de paciente.';
create index if not exists mensagens_saida_pendentes_idx on jornada_cirurgica.mensagens_saida (criado_em, id) where estado = 'pendente';
create index if not exists mensagens_saida_episodio_idx on jornada_cirurgica.mensagens_saida (episodio_id, criado_em);

-- 4.14 mensagens_saida_eventos (só cresce) ---------------------------------------
create table if not exists jornada_cirurgica.mensagens_saida_eventos (
  id             bigint generated always as identity primary key,
  mensagem_id    uuid not null references jornada_cirurgica.mensagens_saida (id),
  estado         text not null,
  registrado_em  timestamptz not null default now(),
  detalhe        jsonb not null default '{}'::jsonb,
  constraint mensagens_saida_eventos_estado check (estado in (
    'ensaio','pendente','enviando','enviado','entregue','falhou','desconhecido','cancelado'
  )),
  constraint mensagens_saida_eventos_detalhe_objeto check (jsonb_typeof(detalhe) = 'object')
);
create index if not exists mensagens_saida_eventos_mensagem_idx on jornada_cirurgica.mensagens_saida_eventos (mensagem_id, registrado_em);

-- 4.15 anexos (só cresce) -------------------------------------------------------
create table if not exists jornada_cirurgica.anexos (
  id             uuid primary key default gen_random_uuid(),
  episodio_id    uuid not null references jornada_cirurgica.episodios (id),
  tipo           text not null,
  storage_path   text not null,
  sha256         text not null,
  content_type   text not null,
  tamanho        int not null,
  autor_id       uuid not null default jornada_cirurgica.ator_id(),
  registrado_em  timestamptz not null default now(),
  constraint anexos_storage_path_unico unique (storage_path),
  constraint anexos_tipo check (tipo in ('foto_plano')),
  constraint anexos_sha256_hex check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  constraint anexos_content_type check (content_type in ('image/jpeg', 'image/png')),
  constraint anexos_tamanho check (tamanho > 0)
);
create index if not exists anexos_episodio_idx on jornada_cirurgica.anexos (episodio_id, registrado_em);

-- 4.16 aparelhos ----------------------------------------------------------------
create table if not exists jornada_cirurgica.aparelhos (
  id             text primary key,
  nome           text null,
  ultimo_acesso  timestamptz not null default now(),
  criado_em      timestamptz not null default now(),
  constraint aparelhos_id_tamanho check (length(id) between 1 and 200)
);

-- -----------------------------------------------------------------------------
-- 5. Funções do ator (SECURITY DEFINER: leem membros sem depender da RLS).
-- -----------------------------------------------------------------------------
create or replace function jornada_cirurgica.ator_papeis()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.papeis
       from jornada_cirurgica.membros m
      where m.user_id = jornada_cirurgica.ator_id()
        and m.ativo),
    '{}'::text[]
  )
$$;
comment on function jornada_cirurgica.ator_papeis() is 'Papéis do ator se for membro ativo; vazio caso contrário.';

create or replace function jornada_cirurgica.ator_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from jornada_cirurgica.membros m
     where m.user_id = jornada_cirurgica.ator_id()
       and m.ativo
  )
$$;
comment on function jornada_cirurgica.ator_ativo() is 'O ator é membro ativo?';

create or replace function jornada_cirurgica.ator_tem_papel(variadic p_papeis text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select jornada_cirurgica.ator_papeis() operator(pg_catalog.&&) p_papeis
$$;
comment on function jornada_cirurgica.ator_tem_papel(text[]) is 'O ator (membro ativo) tem algum dos papéis?';

-- Papéis permitidos para (tipo, modelo). Para tipos com linhas por modelo
-- (checklist.item_respondido, bloco.concluido) o modelo é obrigatório e exato;
-- para os demais vale a linha sem modelo, qualquer que seja dados->>'modelo'.
create or replace function jornada_cirurgica.papeis_do_evento(p_tipo text, p_modelo text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select p.papeis
    from jornada_cirurgica.permissoes_evento p
   where p.tipo = p_tipo
     and (
       p.modelo = p_modelo
       or (
         p.modelo is null
         and not exists (
           select 1 from jornada_cirurgica.permissoes_evento q
            where q.tipo = p_tipo and q.modelo is not null
         )
       )
     )
   limit 1
$$;
comment on function jornada_cirurgica.papeis_do_evento(text, text) is 'Papéis da matriz permissoes_evento para (tipo, modelo); nulo se o par não existe.';

-- -----------------------------------------------------------------------------
-- 6. Triggers
-- -----------------------------------------------------------------------------

-- 6.1 Registro que só cresce: UPDATE/DELETE (por linha) e TRUNCATE (por comando).
--     Valem para qualquer papel, inclusive o dono das tabelas.
create or replace function jornada_cirurgica.impedir_alteracao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'jornada_cirurgica.%: % não permitido (registro que só cresce; correção é novo registro)',
    tg_table_name, tg_op
    using errcode = 'JC001';
end
$$;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'eventos', 'lente_registros', 'acessos', 'mensagens_saida_eventos', 'anexos', 'modelos_checklist'
  ] loop
    execute format(
      'create or replace trigger %I before update or delete on jornada_cirurgica.%I
         for each row execute function jornada_cirurgica.impedir_alteracao()',
      v_tabela || '_so_cresce', v_tabela);
    execute format(
      'create or replace trigger %I before truncate on jornada_cirurgica.%I
         for each statement execute function jornada_cirurgica.impedir_alteracao()',
      v_tabela || '_so_cresce_truncate', v_tabela);
  end loop;
end
$$;

-- 6.2 atualizado_em automático.
create or replace function jornada_cirurgica.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := pg_catalog.now();
  return new;
end
$$;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['membros', 'pacientes', 'episodios', 'config', 'mensagens_saida'] loop
    execute format(
      'create or replace trigger %I before update on jornada_cirurgica.%I
         for each row execute function jornada_cirurgica.tocar_atualizado_em()',
      v_tabela || '_atualizado_em', v_tabela);
  end loop;
end
$$;

-- 6.3 membros: regras por linha que a RLS não expressa (valem para jornada_api).
--   * Só a gestora altera nome, papéis e situação (ativo).
--   * PIN (pin_hash não nulo) só é definido pelo próprio membro; a gestora pode apenas zerar.
create or replace function jornada_cirurgica.membros_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'jornada_api' then
    if not jornada_cirurgica.ator_tem_papel('gestora')
       and (new.nome is distinct from old.nome
            or new.papeis is distinct from old.papeis
            or new.ativo is distinct from old.ativo) then
      raise exception 'jornada_cirurgica.membros: somente a gestora altera nome, papéis ou situação'
        using errcode = 'JC002';
    end if;
    if new.pin_hash is distinct from old.pin_hash
       and new.pin_hash is not null
       and new.user_id is distinct from jornada_cirurgica.ator_id() then
      raise exception 'jornada_cirurgica.membros: o PIN só é definido pelo próprio membro'
        using errcode = 'JC002';
    end if;
  end if;
  return new;
end
$$;

create or replace trigger membros_guarda
  before update on jornada_cirurgica.membros
  for each row execute function jornada_cirurgica.membros_guarda();

-- -----------------------------------------------------------------------------
-- 7. RLS habilitado em todas as tabelas (políticas na migration 2).
--    Sem FORCE: o dono (postgres) e as funções SECURITY DEFINER não passam pela RLS;
--    a API sempre troca de papel (SET LOCAL ROLE) antes de ler ou gravar.
-- -----------------------------------------------------------------------------
alter table jornada_cirurgica.membros                 enable row level security;
alter table jornada_cirurgica.convites                enable row level security;
alter table jornada_cirurgica.pacientes               enable row level security;
alter table jornada_cirurgica.episodios               enable row level security;
alter table jornada_cirurgica.eventos                 enable row level security;
alter table jornada_cirurgica.lente_registros         enable row level security;
alter table jornada_cirurgica.acessos                 enable row level security;
alter table jornada_cirurgica.permissoes_evento       enable row level security;
alter table jornada_cirurgica.modelos_checklist       enable row level security;
alter table jornada_cirurgica.config                  enable row level security;
alter table jornada_cirurgica.materiais               enable row level security;
alter table jornada_cirurgica.links_paciente          enable row level security;
alter table jornada_cirurgica.mensagens_saida         enable row level security;
alter table jornada_cirurgica.mensagens_saida_eventos enable row level security;
alter table jornada_cirurgica.anexos                  enable row level security;
alter table jornada_cirurgica.aparelhos               enable row level security;
