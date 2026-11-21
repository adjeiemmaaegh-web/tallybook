// Exercise the actual complete migration catalog, not a hand-maintained RPC list.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const directory=new URL('../supabase/migrations/',import.meta.url);
const migrations=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort();
const sql=name=>readFileSync(new URL(name,directory),'utf8');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const argument=type=>{
  const values={text:"'__invalid_action__'::text",jsonb:"'{}'::jsonb",uuid:'null::uuid',
    integer:'0::integer',bigint:'0::bigint',boolean:'false::boolean'};
  assert.ok(Object.hasOwn(values,type),'New RPC argument type needs an explicit negative fixture: '+type);
  return values[type];
};

test('privileged RPCs reject absent or forged sessions; only audited invoker delegates are reachable',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(sql(migrations[0]));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as
    $$select (current_setting('test.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as
    $$select current_setting('test.claims',true)::jsonb$$;`);
  for(const name of migrations.slice(1))await db.exec(sql(name));
  const user=randomUUID();await db.query('insert into auth.users values($1,$2)',[user,'catalog-negative@example.invalid']);
  const catalog=(await db.query(`select p.proname,pg_catalog.oidvectortypes(p.proargtypes) as types,
    has_function_privilege('anon',p.oid,'execute') as anonymous,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef order by p.proname,types`)).rows;
  assert.ok(catalog.length>0,'No privileged RPCs were inspected');
  const privateReachable=(await db.query(`select p.proname,pg_catalog.oidvectortypes(p.proargtypes) as types from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and (
      (has_schema_privilege('anon',n.oid,'usage') and has_function_privilege('anon',p.oid,'execute')) or
      (has_schema_privilege('authenticated',n.oid,'usage') and has_function_privilege('authenticated',p.oid,'execute')))`)).rows;
  assert.deepEqual(privateReachable.map(r=>r.proname+'('+r.types.replaceAll(' ','')+')').sort(),
    ['create_owned_business(text,uuid)','set_cloud_business_type(uuid,text)'],
    'Only the two session-checked SECURITY INVOKER delegates may be directly reachable');
  for(const row of catalog){
    assert.ok(!row.anonymous||['tallybook_guest_order','tallybook_cc_discover_public'].includes(row.proname),'Unexpected anonymous privileged endpoint '+row.proname);
    const args=row.types?row.types.split(',').map(type=>argument(type.trim())).join(','):'';
    for(const claims of [{},{sub:user,session_id:randomUUID(),exp:Math.floor(Date.now()/1000)+3600}]){
      await db.query("select set_config('test.claims',$1,false)",[JSON.stringify(claims)]);
      for(const role of ['anon','authenticated']){
        await db.exec('set role '+role);
        try {
          await assert.rejects(db.query(`select public.${quote(row.proname)}(${args})`),
            undefined,`${row.proname} accepted absent/forged ${role} identity`);
        } finally {await db.exec('reset role');}
      }
    }
  }
  // These two private functions intentionally back public SECURITY INVOKER wrappers.
  // Exercise both names with valid parameter types and invalid session claims.
  for(const claims of [{},{sub:user,session_id:randomUUID(),exp:Math.floor(Date.now()/1000)+3600}]){
    await db.query("select set_config('test.claims',$1,false)",[JSON.stringify(claims)]);
    for(const namespace of ['public','private']){
      await db.exec('set role authenticated');
      try {
        await assert.rejects(db.query(`select ${namespace}.create_owned_business($1,$2)`,['Rejected fixture',randomUUID()]));
        await assert.rejects(db.query(`select ${namespace}.set_cloud_business_type($1,$2)`,[randomUUID(),'Retail shop']));
      } finally {await db.exec('reset role');}
    }
  }
  const tables=(await db.query("select tablename from pg_tables where schemaname='public'")).rows;
  for(const {tablename} of tables){
    const [{count}]=(await db.query(`select count(*)::integer as count from public.${quote(tablename)}`)).rows;
    assert.equal(count,0,'Rejected calls left business data in '+tablename);
  }
  t.diagnostic(`Inspected ${catalog.length} privileged public signatures; ${catalog.length*4} catalog negative calls plus 8 invoker-delegate negative calls; ${tables.length} empty business tables conserved.`);
});
