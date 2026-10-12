-- =============================================================================
-- Jornada Cirúrgica — Migration 2/4: políticas de RLS, concessões por papel e
-- funções operacionais (fila de saída, inscrição).
--
-- Convenções:
--   * Políticas `<tabela>_api_<cmd>` valem para `jornada_api` (ações da equipe; o
--     ator vem de set_config('jornada.ator', ...)). Toda leitura exige ator ativo.
--   * Políticas `<tabela>_sistema_<cmd>` valem para `jornada_sistema`.
--   * Funções do ator dentro de `(select ...)` são avaliadas uma vez por comando.
--   * `drop policy if exists` + `create policy`: reaplicável.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- membros
-- -----------------------------------------------------------------------------
drop policy if exists membros_api_select on jornada_cirurgica.membros;
create policy membros_api_select on jornada_cirurgica.membros
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists membros_api_update on jornada_cirurgica.membros;
create policy membros_api_update on jornada_cirurgica.membros
  for update to jornada_api
  using (
    (select jornada_cirurgica.ator_ativo())
    and ((select jornada_cirurgica.ator_tem_papel('gestora')) or user_id = (select jornada_cirurgica.ator_id()))
  )
  with check (
    (select jornada_cirurgica.ator_ativo())
    and ((select jornada_cirurgica.ator_tem_papel('gestora')) or user_id = (select jornada_cirurgica.ator_id()))
  );

drop policy if exists membros_sistema_select on jornada_cirurgica.membros;
create policy membros_sistema_select on jornada_cirurgica.membros
  for select to jornada_sistema
  using (true);

-- Inscrição: só a partir de um convite ativo do mesmo e-mail, com papéis contidos no convite.
drop policy if exists membros_sistema_insert on jornada_cirurgica.membros;
create policy membros_sistema_insert on jornada_cirurgica.membros
  for insert to jornada_sistema
  with check (
    exists (
      select 1
        from jornada_cirurgica.convites c
       where c.email = lower(membros.email)
         and c.ativo
         and (c.vinculado_user_id is null or c.vinculado_user_id = membros.user_id)
         and membros.papeis <@ c.papeis
    )
  );

-- -----------------------------------------------------------------------------
-- convites (gestora; jornada_sistema vincula)
-- -----------------------------------------------------------------------------
drop policy if exists convites_api_select on jornada_cirurgica.convites;
create policy convites_api_select on jornada_cirurgica.convites
  for select to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('gestora')));

drop policy if exists convites_api_insert on jornada_cirurgica.convites;
create policy convites_api_insert on jornada_cirurgica.convites
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    and criado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists convites_api_update on jornada_cirurgica.convites;
create policy convites_api_update on jornada_cirurgica.convites
  for update to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('gestora')))
  with check ((select jornada_cirurgica.ator_tem_papel('gestora')));

drop policy if exists convites_sistema_select on jornada_cirurgica.convites;
create policy convites_sistema_select on jornada_cirurgica.convites
  for select to jornada_sistema
  using (true);

drop policy if exists convites_sistema_update on jornada_cirurgica.convites;
create policy convites_sistema_update on jornada_cirurgica.convites
  for update to jornada_sistema
  using (ativo and vinculado_user_id is null)
  with check (ativo and vinculado_user_id is not null);

-- -----------------------------------------------------------------------------
-- pacientes (projeção dos eventos paciente.*: concierge, gestora)
-- -----------------------------------------------------------------------------
drop policy if exists pacientes_api_select on jornada_cirurgica.pacientes;
create policy pacientes_api_select on jornada_cirurgica.pacientes
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists pacientes_api_insert on jornada_cirurgica.pacientes;
create policy pacientes_api_insert on jornada_cirurgica.pacientes
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('concierge', 'gestora'))
    and criado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists pacientes_api_update on jornada_cirurgica.pacientes;
create policy pacientes_api_update on jornada_cirurgica.pacientes
  for update to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('concierge', 'gestora')))
  with check ((select jornada_cirurgica.ator_tem_papel('concierge', 'gestora')));

drop policy if exists pacientes_sistema_select on jornada_cirurgica.pacientes;
create policy pacientes_sistema_select on jornada_cirurgica.pacientes
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- episodios (projeção atualizada pela API na mesma transação dos eventos)
-- -----------------------------------------------------------------------------
drop policy if exists episodios_api_select on jornada_cirurgica.episodios;
create policy episodios_api_select on jornada_cirurgica.episodios
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists episodios_api_insert on jornada_cirurgica.episodios;
create policy episodios_api_insert on jornada_cirurgica.episodios
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('concierge', 'gestora'))
    and aberto_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists episodios_api_update on jornada_cirurgica.episodios;
create policy episodios_api_update on jornada_cirurgica.episodios
  for update to jornada_api
  using ((select jornada_cirurgica.ator_ativo()))
  with check ((select jornada_cirurgica.ator_ativo()));

drop policy if exists episodios_sistema_select on jornada_cirurgica.episodios;
create policy episodios_sistema_select on jornada_cirurgica.episodios
  for select to jornada_sistema
  using (true);

-- Página do paciente (eventos material.aberto / quiz.respondido): permite manter
-- `versao`/`resumo` coerentes com `seq`. Colunas limitadas por GRANT.
drop policy if exists episodios_sistema_update on jornada_cirurgica.episodios;
create policy episodios_sistema_update on jornada_cirurgica.episodios
  for update to jornada_sistema
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- eventos (só cresce) — conferência cega por visibilidade
-- -----------------------------------------------------------------------------
drop policy if exists eventos_api_select on jornada_cirurgica.eventos;
create policy eventos_api_select on jornada_cirurgica.eventos
  for select to jornada_api
  using (
    (select jornada_cirurgica.ator_ativo())
    and (
      visibilidade = 'geral'
      or (visibilidade = 'conferencia_1' and (select jornada_cirurgica.ator_tem_papel('concierge', 'cirurgiao', 'gestora')))
      or (visibilidade = 'conferencia_2' and (select jornada_cirurgica.ator_tem_papel('conferente', 'cirurgiao', 'gestora')))
    )
  );

-- INSERT da equipe:
--   * autor é o ator da requisição e membro ativo;
--   * autor_papel é um dos papéis do ator;
--   * a matriz permite o (tipo, dados->>'modelo') a algum papel do ator;
--   * visibilidade obrigatória e "geral sem valores de lente": CHECKs da tabela.
drop policy if exists eventos_api_insert on jornada_cirurgica.eventos;
create policy eventos_api_insert on jornada_cirurgica.eventos
  for insert to jornada_api
  with check (
    autor_id = (select jornada_cirurgica.ator_id())
    and (select jornada_cirurgica.ator_ativo())
    and array[autor_papel] <@ (select jornada_cirurgica.ator_papeis())
    and coalesce(jornada_cirurgica.papeis_do_evento(tipo, dados ->> 'modelo'), '{}'::text[])
        && (select jornada_cirurgica.ator_papeis())
  );

drop policy if exists eventos_sistema_select on jornada_cirurgica.eventos;
create policy eventos_sistema_select on jornada_cirurgica.eventos
  for select to jornada_sistema
  using (true);

drop policy if exists eventos_sistema_insert on jornada_cirurgica.eventos;
create policy eventos_sistema_insert on jornada_cirurgica.eventos
  for insert to jornada_sistema
  with check (
    autor_papel in ('sistema', 'paciente')
    and exists (select 1 from jornada_cirurgica.permissoes_evento p where p.tipo = eventos.tipo)
  );

-- -----------------------------------------------------------------------------
-- lente_registros (só cresce) — leitura e escrita por etapa
-- -----------------------------------------------------------------------------
drop policy if exists lente_registros_api_select on jornada_cirurgica.lente_registros;
create policy lente_registros_api_select on jornada_cirurgica.lente_registros
  for select to jornada_api
  using (
    (etapa in ('plano', 'chegada') and (select jornada_cirurgica.ator_tem_papel('concierge', 'cirurgiao', 'gestora')))
    or (etapa = 'cp2' and (select jornada_cirurgica.ator_tem_papel('conferente', 'cirurgiao', 'gestora')))
    or (etapa = 'time_out' and (select jornada_cirurgica.ator_tem_papel('circulante', 'cirurgiao', 'gestora')))
  );

drop policy if exists lente_registros_api_insert on jornada_cirurgica.lente_registros;
create policy lente_registros_api_insert on jornada_cirurgica.lente_registros
  for insert to jornada_api
  with check (
    autor_id = (select jornada_cirurgica.ator_id())
    and (
      (etapa in ('plano', 'chegada') and (select jornada_cirurgica.ator_tem_papel('concierge')))
      or (etapa = 'cp2' and (select jornada_cirurgica.ator_tem_papel('conferente')))
      or (etapa = 'time_out' and (select jornada_cirurgica.ator_tem_papel('circulante')))
    )
  );

drop policy if exists lente_registros_sistema_select on jornada_cirurgica.lente_registros;
create policy lente_registros_sistema_select on jornada_cirurgica.lente_registros
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- acessos (só cresce)
-- -----------------------------------------------------------------------------
-- Gestora lê tudo; o próprio ator lê as suas linhas (necessário para INSERT ... RETURNING).
drop policy if exists acessos_api_select on jornada_cirurgica.acessos;
create policy acessos_api_select on jornada_cirurgica.acessos
  for select to jornada_api
  using (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    or ((select jornada_cirurgica.ator_ativo()) and ator_id = (select jornada_cirurgica.ator_id()))
  );

drop policy if exists acessos_api_insert on jornada_cirurgica.acessos;
create policy acessos_api_insert on jornada_cirurgica.acessos
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_ativo())
    and ator_id = (select jornada_cirurgica.ator_id())
  );

drop policy if exists acessos_sistema_select on jornada_cirurgica.acessos;
create policy acessos_sistema_select on jornada_cirurgica.acessos
  for select to jornada_sistema
  using (true);

drop policy if exists acessos_sistema_insert on jornada_cirurgica.acessos;
create policy acessos_sistema_insert on jornada_cirurgica.acessos
  for insert to jornada_sistema
  with check (true);

-- -----------------------------------------------------------------------------
-- permissoes_evento (somente leitura; escrita só por migration)
-- -----------------------------------------------------------------------------
drop policy if exists permissoes_evento_api_select on jornada_cirurgica.permissoes_evento;
create policy permissoes_evento_api_select on jornada_cirurgica.permissoes_evento
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists permissoes_evento_sistema_select on jornada_cirurgica.permissoes_evento;
create policy permissoes_evento_sistema_select on jornada_cirurgica.permissoes_evento
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- modelos_checklist (só cresce; gestora publica)
-- -----------------------------------------------------------------------------
drop policy if exists modelos_checklist_api_select on jornada_cirurgica.modelos_checklist;
create policy modelos_checklist_api_select on jornada_cirurgica.modelos_checklist
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists modelos_checklist_api_insert on jornada_cirurgica.modelos_checklist;
create policy modelos_checklist_api_insert on jornada_cirurgica.modelos_checklist
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    and publicado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists modelos_checklist_sistema_select on jornada_cirurgica.modelos_checklist;
create policy modelos_checklist_sistema_select on jornada_cirurgica.modelos_checklist
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- config (gestora)
-- -----------------------------------------------------------------------------
drop policy if exists config_api_select on jornada_cirurgica.config;
create policy config_api_select on jornada_cirurgica.config
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists config_api_insert on jornada_cirurgica.config;
create policy config_api_insert on jornada_cirurgica.config
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    and atualizado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists config_api_update on jornada_cirurgica.config;
create policy config_api_update on jornada_cirurgica.config
  for update to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('gestora')))
  with check ((select jornada_cirurgica.ator_tem_papel('gestora')));

drop policy if exists config_sistema_select on jornada_cirurgica.config;
create policy config_sistema_select on jornada_cirurgica.config
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- materiais (gestora; nova versão = nova linha; só `ativo` é alterável)
-- -----------------------------------------------------------------------------
drop policy if exists materiais_api_select on jornada_cirurgica.materiais;
create policy materiais_api_select on jornada_cirurgica.materiais
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists materiais_api_insert on jornada_cirurgica.materiais;
create policy materiais_api_insert on jornada_cirurgica.materiais
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    and criado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists materiais_api_update on jornada_cirurgica.materiais;
create policy materiais_api_update on jornada_cirurgica.materiais
  for update to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('gestora')))
  with check ((select jornada_cirurgica.ator_tem_papel('gestora')));

drop policy if exists materiais_sistema_select on jornada_cirurgica.materiais;
create policy materiais_sistema_select on jornada_cirurgica.materiais
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- links_paciente (concierge, gestora; jornada_sistema lê por token_hash)
-- -----------------------------------------------------------------------------
drop policy if exists links_paciente_api_select on jornada_cirurgica.links_paciente;
create policy links_paciente_api_select on jornada_cirurgica.links_paciente
  for select to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('concierge', 'gestora')));

drop policy if exists links_paciente_api_insert on jornada_cirurgica.links_paciente;
create policy links_paciente_api_insert on jornada_cirurgica.links_paciente
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('concierge', 'gestora'))
    and criado_por = (select jornada_cirurgica.ator_id())
  );

drop policy if exists links_paciente_api_update on jornada_cirurgica.links_paciente;
create policy links_paciente_api_update on jornada_cirurgica.links_paciente
  for update to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('concierge', 'gestora')))
  with check ((select jornada_cirurgica.ator_tem_papel('concierge', 'gestora')));

drop policy if exists links_paciente_sistema_select on jornada_cirurgica.links_paciente;
create policy links_paciente_sistema_select on jornada_cirurgica.links_paciente
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- mensagens_saida (insert pela equipe; estado só pelo jornada_sistema)
-- -----------------------------------------------------------------------------
drop policy if exists mensagens_saida_api_select on jornada_cirurgica.mensagens_saida;
create policy mensagens_saida_api_select on jornada_cirurgica.mensagens_saida
  for select to jornada_api
  using ((select jornada_cirurgica.ator_ativo()));

drop policy if exists mensagens_saida_api_insert on jornada_cirurgica.mensagens_saida;
create policy mensagens_saida_api_insert on jornada_cirurgica.mensagens_saida
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_ativo())
    and criado_por = (select jornada_cirurgica.ator_id())
    and estado in ('ensaio', 'pendente')
    and tentativas = 0
    and provedor_id is null
  );

drop policy if exists mensagens_saida_sistema_select on jornada_cirurgica.mensagens_saida;
create policy mensagens_saida_sistema_select on jornada_cirurgica.mensagens_saida
  for select to jornada_sistema
  using (true);

-- Modo ensaio: mensagem 'ensaio' nunca muda de estado (não sai).
drop policy if exists mensagens_saida_sistema_update on jornada_cirurgica.mensagens_saida;
create policy mensagens_saida_sistema_update on jornada_cirurgica.mensagens_saida
  for update to jornada_sistema
  using (estado <> 'ensaio')
  with check (estado <> 'ensaio');

-- -----------------------------------------------------------------------------
-- mensagens_saida_eventos (só cresce; jornada_sistema)
-- -----------------------------------------------------------------------------
drop policy if exists mensagens_saida_eventos_api_select on jornada_cirurgica.mensagens_saida_eventos;
create policy mensagens_saida_eventos_api_select on jornada_cirurgica.mensagens_saida_eventos
  for select to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('gestora')));

drop policy if exists mensagens_saida_eventos_sistema_select on jornada_cirurgica.mensagens_saida_eventos;
create policy mensagens_saida_eventos_sistema_select on jornada_cirurgica.mensagens_saida_eventos
  for select to jornada_sistema
  using (true);

drop policy if exists mensagens_saida_eventos_sistema_insert on jornada_cirurgica.mensagens_saida_eventos;
create policy mensagens_saida_eventos_sistema_insert on jornada_cirurgica.mensagens_saida_eventos
  for insert to jornada_sistema
  with check (true);

-- -----------------------------------------------------------------------------
-- anexos (só cresce; foto do plano: nunca para a segunda conferente)
-- -----------------------------------------------------------------------------
drop policy if exists anexos_api_select on jornada_cirurgica.anexos;
create policy anexos_api_select on jornada_cirurgica.anexos
  for select to jornada_api
  using ((select jornada_cirurgica.ator_tem_papel('concierge', 'cirurgiao', 'gestora')));

drop policy if exists anexos_api_insert on jornada_cirurgica.anexos;
create policy anexos_api_insert on jornada_cirurgica.anexos
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_tem_papel('concierge', 'cirurgiao', 'gestora'))
    and autor_id = (select jornada_cirurgica.ator_id())
  );

drop policy if exists anexos_sistema_select on jornada_cirurgica.anexos;
create policy anexos_sistema_select on jornada_cirurgica.anexos
  for select to jornada_sistema
  using (true);

-- -----------------------------------------------------------------------------
-- aparelhos (upsert do próprio aparelho = jornada.aparelho; gestora lê todos)
-- -----------------------------------------------------------------------------
drop policy if exists aparelhos_api_select on jornada_cirurgica.aparelhos;
create policy aparelhos_api_select on jornada_cirurgica.aparelhos
  for select to jornada_api
  using (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    or ((select jornada_cirurgica.ator_ativo()) and id = (select jornada_cirurgica.aparelho_atual()))
  );

drop policy if exists aparelhos_api_insert on jornada_cirurgica.aparelhos;
create policy aparelhos_api_insert on jornada_cirurgica.aparelhos
  for insert to jornada_api
  with check (
    (select jornada_cirurgica.ator_ativo())
    and id = (select jornada_cirurgica.aparelho_atual())
  );

drop policy if exists aparelhos_api_update on jornada_cirurgica.aparelhos;
create policy aparelhos_api_update on jornada_cirurgica.aparelhos
  for update to jornada_api
  using (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    or ((select jornada_cirurgica.ator_ativo()) and id = (select jornada_cirurgica.aparelho_atual()))
  )
  with check (
    (select jornada_cirurgica.ator_tem_papel('gestora'))
    or ((select jornada_cirurgica.ator_ativo()) and id = (select jornada_cirurgica.aparelho_atual()))
  );

-- =============================================================================
-- Funções operacionais
-- =============================================================================

-- Fila de saída: reivindica até p_limite (1..100) mensagens 'pendente', muda para
-- 'enviando', soma 1 em `tentativas`, registra o histórico e devolve as linhas.
-- FOR UPDATE SKIP LOCKED: dois envios concorrentes nunca recebem a mesma mensagem.
-- SECURITY INVOKER: roda com os privilégios (e a RLS) de jornada_sistema.
create or replace function jornada_cirurgica.reivindicar_mensagens(p_limite int default 10)
returns setof jornada_cirurgica.mensagens_saida
language sql
volatile
set search_path = ''
as $$
  with alvo as (
    select m.id
      from jornada_cirurgica.mensagens_saida m
     where m.estado = 'pendente'
     order by m.criado_em, m.id
     limit least(greatest(coalesce(p_limite, 10), 0), 100)
       for update skip locked
  ), reivindicadas as (
    update jornada_cirurgica.mensagens_saida m
       set estado = 'enviando',
           tentativas = m.tentativas + 1,
           atualizado_em = pg_catalog.now()
      from alvo
     where m.id = alvo.id
    returning m.*
  ), historico as (
    insert into jornada_cirurgica.mensagens_saida_eventos (mensagem_id, estado, detalhe)
    select r.id, 'enviando', pg_catalog.jsonb_build_object('origem', 'reivindicar_mensagens', 'tentativa', r.tentativas)
      from reivindicadas r
  )
  select * from reivindicadas
$$;
comment on function jornada_cirurgica.reivindicar_mensagens(int) is
  'Fila de saída: pendente -> enviando (FOR UPDATE SKIP LOCKED), tentativas + 1, histórico em mensagens_saida_eventos. Só jornada_sistema.';

-- Inscrição por e-mail autorizado (o e-mail vem do Auth verificado, nunca do corpo).
-- * Membro já existente: devolvido sem alteração (papéis e situação são da gestora).
-- * Convite ativo e não vinculado a outra conta: cria o membro ativo com os dados
--   do convite e vincula o convite ao usuário.
-- * Sem convite ativo: nenhuma linha.
create or replace function jornada_cirurgica.inscrever_por_email(p_user_id uuid, p_email text)
returns setof jornada_cirurgica.membros
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_convite jornada_cirurgica.convites%rowtype;
  v_membro  jornada_cirurgica.membros%rowtype;
begin
  if p_user_id is null or v_email = '' then
    return;
  end if;

  select * into v_membro from jornada_cirurgica.membros m where m.user_id = p_user_id;
  if found then
    if not exists (select 1 from jornada_cirurgica.convites c where c.vinculado_user_id = p_user_id) then
      update jornada_cirurgica.convites c
         set vinculado_user_id = p_user_id
       where c.email = v_membro.email and c.vinculado_user_id is null;
    end if;
    return next v_membro;
    return;
  end if;

  select * into v_convite
    from jornada_cirurgica.convites c
   where c.email = v_email and c.ativo
     for update;
  if not found then
    return;
  end if;
  if v_convite.vinculado_user_id is not null and v_convite.vinculado_user_id <> p_user_id then
    return;
  end if;

  insert into jornada_cirurgica.membros (user_id, email, nome, papeis, ativo)
  values (p_user_id, v_email, v_convite.nome, v_convite.papeis, true)
  returning * into v_membro;

  update jornada_cirurgica.convites c
     set vinculado_user_id = p_user_id
   where c.email = v_email;

  return next v_membro;
end
$$;
comment on function jornada_cirurgica.inscrever_por_email(uuid, text) is
  'Inscrição no primeiro acesso a partir de convite ativo. Só jornada_sistema.';

-- =============================================================================
-- Concessões (mínimas, por papel). As revogações explícitas no fim cobrem também
-- privilégios padrão globais do projeto.
-- =============================================================================

-- Limpa e recria (reaplicável).
revoke all on all tables in schema jornada_cirurgica from jornada_api, jornada_sistema;
revoke all on all sequences in schema jornada_cirurgica from jornada_api, jornada_sistema;
revoke all on all functions in schema jornada_cirurgica from jornada_api, jornada_sistema;

-- jornada_api ------------------------------------------------------------------
-- membros: pin_hash NÃO é legível (use tem_pin); a verificação do PIN é feita como jornada_sistema.
grant select (user_id, email, nome, papeis, ativo, tem_pin, pin_atualizado_em, criado_em, atualizado_em)
  on jornada_cirurgica.membros to jornada_api;
grant update (nome, papeis, ativo, pin_hash, pin_atualizado_em, atualizado_em)
  on jornada_cirurgica.membros to jornada_api;

grant select, insert on jornada_cirurgica.convites to jornada_api;
grant update (nome, papeis, ativo) on jornada_cirurgica.convites to jornada_api;

grant select, insert on jornada_cirurgica.pacientes to jornada_api;
grant update (datasigh_id, cpf_hmac, nome_completo, nome_normalizado, data_nascimento, nome_mae,
              prontuario, conferido_datasigh, atualizado_em)
  on jornada_cirurgica.pacientes to jornada_api;

-- episodios: id, paciente_id, olho, aberto_em e aberto_por são imutáveis.
grant select, insert on jornada_cirurgica.episodios to jornada_api;
grant update (cirurgiao_id, tipo_cirurgia, tipo_lente, data_sugerida, data_cirurgia, horario, ordem,
              estado, versao, versoes_modelos, resumo, atualizado_em)
  on jornada_cirurgica.episodios to jornada_api;

grant select, insert on jornada_cirurgica.eventos to jornada_api;
grant select, insert on jornada_cirurgica.lente_registros to jornada_api;
grant select, insert on jornada_cirurgica.acessos to jornada_api;
grant select on jornada_cirurgica.permissoes_evento to jornada_api;
grant select, insert on jornada_cirurgica.modelos_checklist to jornada_api;

grant select, insert on jornada_cirurgica.config to jornada_api;
grant update (valor, atualizado_em, atualizado_por) on jornada_cirurgica.config to jornada_api;

grant select, insert on jornada_cirurgica.materiais to jornada_api;
grant update (ativo) on jornada_cirurgica.materiais to jornada_api;

grant select, insert on jornada_cirurgica.links_paciente to jornada_api;
grant update (revogado_em) on jornada_cirurgica.links_paciente to jornada_api;

grant select, insert on jornada_cirurgica.mensagens_saida to jornada_api;
grant select on jornada_cirurgica.mensagens_saida_eventos to jornada_api;
grant select, insert on jornada_cirurgica.anexos to jornada_api;

grant select, insert on jornada_cirurgica.aparelhos to jornada_api;
grant update (nome, ultimo_acesso) on jornada_cirurgica.aparelhos to jornada_api;

grant execute on function
  jornada_cirurgica.ator_id(),
  jornada_cirurgica.sessao_atual(),
  jornada_cirurgica.aparelho_atual(),
  jornada_cirurgica.ator_papeis(),
  jornada_cirurgica.ator_ativo(),
  jornada_cirurgica.ator_tem_papel(text[]),
  jornada_cirurgica.papeis_do_evento(text, text)
to jornada_api;

-- jornada_sistema ----------------------------------------------------------------
grant select on
  jornada_cirurgica.membros,
  jornada_cirurgica.convites,
  jornada_cirurgica.pacientes,
  jornada_cirurgica.episodios,
  jornada_cirurgica.eventos,
  jornada_cirurgica.lente_registros,
  jornada_cirurgica.acessos,
  jornada_cirurgica.permissoes_evento,
  jornada_cirurgica.modelos_checklist,
  jornada_cirurgica.config,
  jornada_cirurgica.materiais,
  jornada_cirurgica.links_paciente,
  jornada_cirurgica.mensagens_saida,
  jornada_cirurgica.mensagens_saida_eventos,
  jornada_cirurgica.anexos
to jornada_sistema;

grant insert on
  jornada_cirurgica.eventos,
  jornada_cirurgica.mensagens_saida_eventos,
  jornada_cirurgica.acessos,
  jornada_cirurgica.membros
to jornada_sistema;

grant update (estado, tentativas, provedor_id, ultimo_erro, atualizado_em)
  on jornada_cirurgica.mensagens_saida to jornada_sistema;
grant update (vinculado_user_id) on jornada_cirurgica.convites to jornada_sistema;
grant update (versao, resumo, atualizado_em) on jornada_cirurgica.episodios to jornada_sistema;

grant execute on function
  jornada_cirurgica.ator_id(),
  jornada_cirurgica.sessao_atual(),
  jornada_cirurgica.aparelho_atual(),
  jornada_cirurgica.ator_papeis(),
  jornada_cirurgica.ator_ativo(),
  jornada_cirurgica.ator_tem_papel(text[]),
  jornada_cirurgica.papeis_do_evento(text, text),
  jornada_cirurgica.reivindicar_mensagens(int),
  jornada_cirurgica.inscrever_por_email(uuid, text)
to jornada_sistema;

-- =============================================================================
-- Revogações explícitas: PUBLIC, anon, authenticated e service_role não acessam
-- nada do schema (inclusive EXECUTE em funções, que o Postgres concede a PUBLIC
-- por padrão, e eventuais privilégios padrão globais do projeto).
-- =============================================================================
revoke all on all tables in schema jornada_cirurgica from public;
revoke all on all sequences in schema jornada_cirurgica from public;
revoke all on all functions in schema jornada_cirurgica from public;

do $$
declare
  v_papel text;
begin
  foreach v_papel in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_papel) then
      execute format('revoke all on schema jornada_cirurgica from %I', v_papel);
      execute format('revoke all on all tables in schema jornada_cirurgica from %I', v_papel);
      execute format('revoke all on all sequences in schema jornada_cirurgica from %I', v_papel);
      execute format('revoke all on all functions in schema jornada_cirurgica from %I', v_papel);
    end if;
  end loop;
end
$$;
