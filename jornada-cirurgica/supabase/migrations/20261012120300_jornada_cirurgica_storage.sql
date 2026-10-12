-- =============================================================================
-- Jornada Cirúrgica — Migration 4/4: bucket privado do Storage `jornada-cirurgica`
-- (foto do plano de LIO assinado).
--
-- * Só roda se `storage.buckets` existir (no Postgres local de teste não existe).
-- * Bucket privado (public = false), até 10 MB, só JPEG/PNG.
-- * Nenhuma política em storage.objects é criada ou alterada: anon/authenticated
--   não têm acesso ao bucket; a Edge Function usa a service role (que ignora RLS)
--   e entrega URLs assinadas de curta duração.
-- * Aviso (não altera nada): lista políticas de storage.objects para anon /
--   authenticated / public que não filtram por bucket_id — elas valeriam também
--   para este bucket e precisam ser revistas antes da produção.
-- =============================================================================

do $$
declare
  v_tem_limite boolean;
  v_tem_mime   boolean;
  v_politica   record;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'jornada_cirurgica: storage.buckets não existe; bucket não criado.';
    return;
  end if;

  select exists (
           select 1 from information_schema.columns
            where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit')
    into v_tem_limite;
  select exists (
           select 1 from information_schema.columns
            where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types')
    into v_tem_mime;

  if v_tem_limite and v_tem_mime then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('jornada-cirurgica', 'jornada-cirurgica', false, 10485760, array['image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  else
    insert into storage.buckets (id, name, public)
    values ('jornada-cirurgica', 'jornada-cirurgica', false)
    on conflict (id) do update set public = false;
  end if;

  if to_regclass('storage.objects') is not null then
    for v_politica in
      select p.policyname, p.cmd, p.roles
        from pg_catalog.pg_policies p
       where p.schemaname = 'storage'
         and p.tablename = 'objects'
         and p.permissive = 'PERMISSIVE'
         and p.roles && array['anon', 'authenticated', 'public']::name[]
         and coalesce(p.qual, '') not like '%bucket_id%'
         and coalesce(p.with_check, '') not like '%bucket_id%'
    loop
      raise warning 'jornada_cirurgica: a política "%" (%) em storage.objects para % não filtra bucket_id e também valeria para o bucket jornada-cirurgica. Revisar antes da produção.',
        v_politica.policyname, v_politica.cmd, v_politica.roles;
    end loop;
  end if;
end
$$;
