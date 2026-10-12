// Migrations: aplicam do zero, reaplicam sem erro (idempotência), estrutura de segurança
// (RLS em todas as tabelas, SECURITY DEFINER com search_path vazio, papéis sem LOGIN/BYPASSRLS)
// e nenhum acesso para PUBLIC / anon / authenticated / service_role.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arquivosMigration, criarBancoTeste, type BancoTeste } from '../apoio/banco.ts'
import { M, TABELAS, codigoErro, comoAtor, contar, semear } from './apoio-rls.ts'

let banco: BancoTeste

beforeAll(async () => {
  banco = await criarBancoTeste()
  await semear(banco.sql)
})

afterAll(async () => {
  await banco?.encerrar()
})

async function retratoDoSchema() {
  const sql = banco.sql
  const politicas = await sql`
    select tablename, policyname, cmd, roles::text[] as roles, qual, with_check
      from pg_policies where schemaname = 'jornada_cirurgica' order by 1, 2`
  const funcoes = await sql`
    select p.oid::regprocedure::text as assinatura, p.prosecdef, p.proconfig
      from pg_proc p where p.pronamespace = 'jornada_cirurgica'::regnamespace order by 1`
  const privilegios = await sql`
    select c.relname, c.relacl::text[] as acl
      from pg_class c where c.relnamespace = 'jornada_cirurgica'::regnamespace and c.relkind = 'r' order by 1`
  const colunas = await sql`
    select table_name, column_name, grantee, privilege_type
      from information_schema.column_privileges
     where table_schema = 'jornada_cirurgica' and grantee in ('jornada_api', 'jornada_sistema')
     order by 1, 2, 3, 4`
  const gatilhos = await sql`
    select tgrelid::regclass::text as tabela, tgname from pg_trigger
     where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'jornada_cirurgica'::regnamespace)
     order by 1, 2`
  return { politicas, funcoes, privilegios, colunas, gatilhos }
}

describe('aplicação do zero', () => {
  it('cria as 16 tabelas da ARQUITETURA §4.3', async () => {
    const linhas = await banco.sql`
      select relname from pg_class
       where relnamespace = 'jornada_cirurgica'::regnamespace and relkind = 'r' order by 1`
    expect(linhas.map(l => l.relname).sort()).toEqual([...TABELAS].sort())
  })

  it('RLS está habilitado em todas as tabelas e cada uma tem política para jornada_api ou jornada_sistema', async () => {
    const linhas = await banco.sql`
      select c.relname, c.relrowsecurity,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'jornada_cirurgica' and p.tablename = c.relname) as politicas,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'jornada_cirurgica' and p.tablename = c.relname
                 and not (p.roles <@ array['jornada_api', 'jornada_sistema']::name[])) as politicas_outros_papeis
        from pg_class c
       where c.relnamespace = 'jornada_cirurgica'::regnamespace and c.relkind = 'r'`
    for (const l of linhas) {
      expect(l.relrowsecurity, l.relname).toBe(true)
      expect(l.politicas, l.relname).toBeGreaterThan(0)
      expect(l.politicas_outros_papeis, l.relname).toBe(0)
    }
  })

  it('funções do schema fixam search_path vazio (inclusive as SECURITY DEFINER)', async () => {
    const linhas = await banco.sql`
      select p.oid::regprocedure::text as assinatura, p.prosecdef, coalesce(p.proconfig, '{}') as proconfig
        from pg_proc p where p.pronamespace = 'jornada_cirurgica'::regnamespace`
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.filter(l => l.prosecdef).map(l => l.assinatura).sort()).toEqual([
      'jornada_cirurgica.ator_ativo()',
      'jornada_cirurgica.ator_papeis()',
      'jornada_cirurgica.ator_tem_papel(text[])',
      'jornada_cirurgica.inscrever_por_email(uuid,text)',
      'jornada_cirurgica.papeis_do_evento(text,text)',
    ])
    for (const l of linhas) expect(l.proconfig, l.assinatura).toContain('search_path=""')
  })

  it('papéis jornada_api e jornada_sistema: NOLOGIN, sem BYPASSRLS, concedidos a postgres', async () => {
    const linhas = await banco.sql`
      select rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb,
             pg_has_role('postgres', oid, 'MEMBER') as postgres_membro
        from pg_roles where rolname in ('jornada_api', 'jornada_sistema') order by 1`
    expect(linhas.map(l => l.rolname)).toEqual(['jornada_api', 'jornada_sistema'])
    for (const l of linhas) {
      expect(l).toMatchObject({ rolcanlogin: false, rolbypassrls: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false, postgres_membro: true })
    }
    // A API (conectada como postgres) consegue trocar de papel.
    const [r] = await banco.sql.begin(async tx => {
      await tx`set local role jornada_api`
      return tx`select current_user::text as atual`
    })
    expect(r.atual).toBe('jornada_api')
  })

  it('o índice de episódios por data e as uniques de seq e idempotência existem', async () => {
    const idx = await banco.sql`
      select indexname, indexdef from pg_indexes where schemaname = 'jornada_cirurgica'`
    const nomes = idx.map(i => i.indexname)
    expect(nomes).toEqual(expect.arrayContaining([
      'episodios_data_cirurgia_idx',
      'eventos_episodio_seq_unico',
      'eventos_chave_idempotencia_unica',
      'acessos_ator_recurso_idx',
      'mensagens_saida_pendentes_idx',
    ]))
  })
})

describe('PUBLIC, anon, authenticated e service_role não acessam nada do schema', () => {
  const papeisExternos = ['public', 'anon', 'authenticated', 'service_role']

  it('sem USAGE no schema e sem privilégio em tabela, coluna, sequência ou função', async () => {
    const sql = banco.sql
    for (const papel of papeisExternos) {
      if (papel !== 'public') {
        const [s] = await sql`select has_schema_privilege(${papel}, 'jornada_cirurgica', 'USAGE') as u,
                                     has_schema_privilege(${papel}, 'jornada_cirurgica', 'CREATE') as c`
        expect(s, papel).toEqual({ u: false, c: false })
      }
    }
    // ACLs: nenhuma entrada para esses papéis (PUBLIC aparece como "=" no aclitem).
    const acl = await sql`
      select 'schema' as tipo, nspname as nome, a.grantee
        from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
       where n.nspname = 'jornada_cirurgica'
      union all
      select 'relacao', c.relname, a.grantee
        from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       where c.relnamespace = 'jornada_cirurgica'::regnamespace
      union all
      select 'coluna', c.relname || '.' || at.attname, a.grantee
        from pg_attribute at join pg_class c on c.oid = at.attrelid, aclexplode(at.attacl) a
       where c.relnamespace = 'jornada_cirurgica'::regnamespace and at.attacl is not null
      union all
      select 'funcao', p.proname, a.grantee
        from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.pronamespace = 'jornada_cirurgica'::regnamespace`
    const proibidos = await sql`select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')`
    const oidsProibidos = new Set([0, ...proibidos.map(r => Number(r.oid))]) // 0 = PUBLIC
    const vazamentos = acl.filter(a => oidsProibidos.has(Number(a.grantee)))
    expect(vazamentos).toEqual([])
  })

  it('consultas como anon e authenticated falham com "permission denied"', async () => {
    for (const papel of ['anon', 'authenticated']) {
      for (const tabela of TABELAS) {
        const codigo = await codigoErro(banco.sql.begin(async tx => {
          await tx.unsafe(`set local role ${papel}`)
          await tx.unsafe(`select * from jornada_cirurgica.${tabela} limit 1`)
        }))
        expect(codigo, `${papel} lendo ${tabela}`).toBe('42501')
      }
      const codigoFuncao = await codigoErro(banco.sql.begin(async tx => {
        await tx.unsafe(`set local role ${papel}`)
        await tx`select jornada_cirurgica.ator_papeis()`
      }))
      expect(codigoFuncao).toBe('42501')
    }
  })

  it('só postgres é membro de jornada_api e jornada_sistema', async () => {
    const linhas = await banco.sql`
      select r.rolname as papel, m.rolname as membro
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
       where r.rolname in ('jornada_api', 'jornada_sistema')
       order by 1, 2`
    expect(linhas.map(l => `${l.papel}:${l.membro}`)).toEqual(['jornada_api:postgres', 'jornada_sistema:postgres'])
  })

  it('uma sessão do PostgREST (authenticator -> anon/authenticated) não assume jornada_api nem jornada_sistema', async () => {
    // SET ROLE é conferido contra o usuário da SESSÃO; por isso o teste conecta como um
    // papel de login equivalente ao `authenticator` do Supabase (membro de anon e authenticated).
    await banco.sql.unsafe(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'jc_teste_autenticador') then
          begin
            create role jc_teste_autenticador login noinherit;
          exception when duplicate_object or unique_violation then null;
          end;
        end if;
        begin
          grant anon, authenticated to jc_teste_autenticador;
        exception when unique_violation then null;
        end;
      end $$;`)
    const url = banco.url.replace('postgres://postgres@', 'postgres://jc_teste_autenticador@')
    const sessao = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
    try {
      for (const papel of ['anon', 'authenticated']) {
        for (const alvo of ['jornada_api', 'jornada_sistema']) {
          const codigo = await codigoErro(sessao.begin(async tx => {
            await tx.unsafe(`set local role ${papel}`)
            await tx.unsafe(`set local role ${alvo}`)
          }))
          expect(codigo, `${papel} -> ${alvo}`).toBe('42501')
        }
        const leitura = await codigoErro(sessao.begin(async tx => {
          await tx.unsafe(`set local role ${papel}`)
          await tx`select count(*) from jornada_cirurgica.eventos`
        }))
        expect(leitura, papel).toBe('42501')
      }
    } finally {
      await sessao.end({ timeout: 5 })
    }
  })
})

describe('idempotência', () => {
  it('reaplicar todas as migrations não falha, não altera a estrutura e preserva os dados', async () => {
    const antes = await retratoDoSchema()
    const contagensAntes = await comoAtor(banco.sql, M.gestora, async tx =>
      Promise.all(TABELAS.map(t => contar(tx, t))))

    for (let i = 0; i < 2; i++) {
      for (const arq of arquivosMigration()) await banco.sql.unsafe(readFileSync(arq, 'utf8'))
    }

    const depois = await retratoDoSchema()
    expect(depois).toEqual(antes)
    const contagensDepois = await comoAtor(banco.sql, M.gestora, async tx =>
      Promise.all(TABELAS.map(t => contar(tx, t))))
    expect(contagensDepois).toEqual(contagensAntes)
    const [{ n }] = await banco.sql`select count(*)::int as n from jornada_cirurgica.permissoes_evento`
    expect(n).toBe(57)
  })
})

describe('bucket do Storage', () => {
  it('sem storage.buckets (Postgres local) a migration não faz nada', async () => {
    const [r] = await banco.sql`select to_regclass('storage.buckets') as t`
    expect(r.t).toBeNull()
  })

  it('com storage.buckets simulado: cria o bucket privado, é reaplicável e avisa sobre política sem bucket_id', async () => {
    const outro = await criarBancoTeste()
    const avisos: string[] = []
    const sql = postgres(outro.url, { max: 1, prepare: false, onnotice: n => avisos.push(String(n.message)) })
    try {
      await sql.unsafe(`
        create table storage.buckets (
          id text primary key, name text not null, public boolean default false,
          file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
        alter table storage.objects enable row level security;
        create policy leitura_generica on storage.objects for select to authenticated using (true);
        create policy leitura_por_bucket on storage.objects for select to authenticated using (bucket_id = 'outro');
        insert into storage.buckets (id, name, public) values ('jornada-cirurgica', 'jornada-cirurgica', true);`)
      const arquivo = arquivosMigration().find(a => a.endsWith('_jornada_cirurgica_storage.sql'))
      expect(arquivo).toBeDefined()
      await sql.unsafe(readFileSync(arquivo!, 'utf8'))
      await sql.unsafe(readFileSync(arquivo!, 'utf8'))
      const linhas = await sql`select id, public, file_size_limit, allowed_mime_types from storage.buckets`
      expect(linhas).toEqual([
        { id: 'jornada-cirurgica', public: false, file_size_limit: '10485760', allowed_mime_types: ['image/jpeg', 'image/png'] },
      ])
      expect(avisos.some(a => a.includes('leitura_generica'))).toBe(true)
      expect(avisos.some(a => a.includes('leitura_por_bucket'))).toBe(false)
      // Nenhuma política foi criada ou alterada em storage.objects.
      const politicas = await sql`select policyname from pg_policies where schemaname = 'storage' order by 1`
      expect(politicas.map(p => p.policyname)).toEqual(['leitura_generica', 'leitura_por_bucket'])
    } finally {
      await sql.end({ timeout: 5 })
      await outro.encerrar()
    }
  })
})
