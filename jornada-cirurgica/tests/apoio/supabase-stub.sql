-- Simulação mínima do ambiente Supabase para testes locais (NÃO é aplicada em produção).
-- Papéis são do cluster: a criação tolera corrida entre arquivos de teste em paralelo.
do $$
declare
  v_papel text;
begin
  foreach v_papel in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_papel) then
      begin
        if v_papel = 'service_role' then
          execute format('create role %I nologin bypassrls', v_papel);
        else
          execute format('create role %I nologin', v_papel);
        end if;
      exception when duplicate_object or unique_violation then
        null;
      end;
    end if;
  end loop;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  email_confirmed_at timestamptz,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema if not exists storage;
