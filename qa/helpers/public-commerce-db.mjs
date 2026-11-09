// Stages B-E isolated PostgreSQL regression: no external service, no production data.
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=()=>randomUUID();
const file=name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter(name => name.endsWith('.sql')).sort();
export async function setup({upgrade = true} = {}){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql as 'select null::uuid';");
 await db.exec(file(migrations[0]));
 await db.exec("create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$; create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;");
 for(const migration of migrations.slice(1).filter(name => name < '20261108')){
   try{await db.exec(file(migration));}catch(e){await db.close();throw new Error('Migration '+migration+' failed: '+e.message,{cause:e});}
 }
 const users={};
 for(const name of ['owner','attendant','rival','outsider']){
   users[name]={id:id(),session:id()};
   await db.query('insert into auth.users values($1,$2)',[users[name].id,name+'@demo.tallybook.test']);
   await db.query('insert into auth.sessions values($1,$2,null)',[users[name].session,users[name].id]);
 }
 const company=id(),otherCompany=id();
 for(const [cid,name] of [[company,'owner'],[otherCompany,'rival']]){
   await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,$4)',
     [cid,name+' business',users[name].id,id()]);
   await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[cid,users[name].id]);
 }
 await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')",[company,users.attendant.id]);
 await db.exec('set role authenticated');
 const call=async (who,action,input={},cid=company,fn='tallybook_shop_ops')=>{
   const u=users[who];
   await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.session})]);
   return (await db.query('select public.'+fn+'($1,$2) as r',[action,{companyId:cid,...input}])).rows[0].r;
 };
 const core=(who,action,input,cid=company)=>call(who,action,input,cid,'tallybook_shop');
 const admin=async(query,params=[])=>{
   await db.exec('reset role');
   try{return (await db.query(query,params)).rows;}finally{await db.exec('set role authenticated');}
 };
 const a=id(),b=id(),product=id();
 await core('owner','setupLedger',{currency:'GHS'});
 await core('owner','saveStore',{storeId:a,name:'North'});
 await core('owner','saveStore',{storeId:b,name:'South'});
 await core('owner','saveProduct',{productId:product,name:'Rice 1kg',unitPriceMinor:1500});
 await core('owner','adjustStock',{storeId:a,productId:product,delta:20,operationId:id()});
 await core('owner','assignStore',{storeId:a,userId:users.attendant.id});
 const applyUpgrade = async () => {
   await db.exec('reset role');
   for (const name of migrations.filter(name => name >= '20261108')) await db.exec(file(name));
   await db.exec('set role authenticated');
 };
 if (upgrade) await applyUpgrade();
 return {db,call,core,admin,users,company,otherCompany,a,b,product,applyUpgrade};
}
