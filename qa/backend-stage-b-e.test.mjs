// Stages B-E isolated PostgreSQL regression: no external service, no production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=()=>randomUUID();
const file=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter(name => name.endsWith('.sql')).sort();
test('migration identifiers are unique', () => {
  assert.equal(new Set(migrations.map(name => name.split('_')[0])).size, migrations.length);
});
async function setup({upgrade = true} = {}){
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
test('Stage C: owner readiness, restricted attendant summary, expired session and isolation',async()=>{
 const t=await setup();
 try{
   const owner=await t.call('owner','readiness');
   assert.equal(owner.role,'owner');assert.equal(owner.activeStoreCount,2);
   assert.equal(owner.staffCount,1);assert.equal(owner.stockedSkuCount,1);
   const att=await t.call('attendant','readiness');
   assert.equal(att.activeStoreCount,1);assert.equal(att.canConfigure,false);
   assert.equal(att.staffCount,null);
   assert.equal((await t.call('owner','salesSummary',{days:7})).grossMinor,'0');
   await assert.rejects(t.call('attendant','salesSummary',{storeId:t.b}),/Store access denied/);
   await assert.rejects(t.call('rival','readiness',{},t.company),/access denied/i);
   await assert.rejects(t.call('owner','salesSummary',{days:0}),/Invalid days/);
   await t.admin("update auth.sessions set not_after=now()-interval '1 day' where id=$1",[t.users.attendant.session]);
   await assert.rejects(t.call('attendant','readiness'),/Active Auth session required/);
 }finally{await t.db.close();}
});
test('Stage D: stale stock take never mutates stock, approved count posts once',async()=>{
 const t=await setup();
 try{
   const countId=id();
   assert.equal((await t.call('owner','startStockCount',{countId,storeId:t.a,productId:t.product})).expectedQuantity,20);
   assert.equal((await t.call('owner','startStockCount',{countId,storeId:t.a,productId:t.product})).replayed,true);
   await assert.rejects(t.call('attendant','applyStockCount',{countId,countedQuantity:19}),/Only the business owner/);
   await t.core('owner','adjustStock',{storeId:t.a,productId:t.product,delta:1,operationId:id()});
   await assert.rejects(t.call('owner','applyStockCount',{countId,countedQuantity:19}),/Stock changed/);
   await t.call('owner','cancelStockCount',{countId});
   await assert.rejects(t.call('owner','applyStockCount',{countId,countedQuantity:19}),/Cancelled/);
   const fresh=id();
   await t.call('owner','startStockCount',{countId:fresh,storeId:t.a,productId:t.product});
   assert.equal((await t.call('owner','applyStockCount',{countId:fresh,countedQuantity:18})).adjustment,-3);
   assert.equal((await t.call('owner','applyStockCount',{countId:fresh,countedQuantity:18})).replayed,true);
   await assert.rejects(t.call('owner','applyStockCount',{countId:fresh,countedQuantity:17}),/different quantity/);
   const rows=await t.admin("select reason,delta from public.shop_stock_movements where reason='stocktake'");
   assert.equal(rows.length,1);assert.equal(rows[0].delta,-3);
   await assert.rejects(t.db.query('select * from public.shop_stock_counts'),/permission denied/);
 }finally{await t.db.close();}
});
test('Stage D: inter-store transfer cannot lose or double-count units',async()=>{
 const t=await setup();
 try{
   const transferId=id(),request={transferId,fromStoreId:t.a,toStoreId:t.b,productId:t.product,quantity:6};
   await t.call('owner','requestTransfer',request);
   assert.equal((await t.call('owner','requestTransfer',request)).replayed,true);
   await assert.rejects(t.call('owner','requestTransfer',{...request,quantity:7}),/different details/);
   await assert.rejects(t.call('owner','receiveTransfer',{transferId}),/not been dispatched/);
   await t.call('owner','dispatchTransfer',{transferId});
   assert.equal((await t.call('owner','dispatchTransfer',{transferId})).replayed,true);
   await assert.rejects(t.call('owner','cancelTransfer',{transferId}),/Dispatched stock cannot be cancelled/);
   let stock=await t.admin('select quantity from public.shop_store_stock where business_id=$1',[t.company]);
   assert.equal(stock.reduce((a,b)=>a+b.quantity,0),14);
   await t.call('owner','receiveTransfer',{transferId});
   assert.equal((await t.call('owner','receiveTransfer',{transferId})).replayed,true);
   stock=await t.admin('select quantity from public.shop_store_stock where business_id=$1',[t.company]);
   assert.equal(stock.reduce((a,b)=>a+b.quantity,0),20);
   const audit=await t.admin("select delta from public.shop_stock_movements where reason like 'transfer_%'");
   assert.equal(audit.length,2);assert.equal(audit.reduce((a,b)=>a+b.delta,0),0);
   await assert.rejects(t.call('attendant','dispatchTransfer',{transferId}),/Only the business owner/);
 }finally{await t.db.close();}
});
test('Stage D: partial receiving, supplier payables and zero duplicate settlement',async()=>{
 const t=await setup();
 try{
   const supplierId=id(),orderId=id(),receiptId=id();
   await t.call('owner','saveSupplier',{supplierId,name:'Wholesale'});
   const order={orderId,supplierId,storeId:t.a,lines:[{productId:t.product,quantity:8,unitCostMinor:1000}]};
   await t.call('owner','createPurchaseOrder',order);
   assert.equal((await t.call('owner','createPurchaseOrder',order)).replayed,true);
   assert.equal((await t.call('owner','receivePurchase',{receiptId,orderId,lines:[{lineNo:1,quantity:3}]})).totalMinor,'3000');
   assert.equal((await t.call('owner','receivePurchase',{receiptId,orderId,lines:[{lineNo:1,quantity:3}]})).replayed,true);
   await assert.rejects(t.call('owner','receivePurchase',{receiptId:id(),orderId,lines:[{lineNo:1,quantity:6}]}),/exceed outstanding/);
   assert.equal((await t.call('owner','purchaseDetails',{orderId})).lines[0].receivedQuantity,3);
   assert.equal((await t.call('owner','supplierBalances')).suppliers[0].outstandingMinor,'3000');
   await assert.rejects(t.call('owner','settleSupplier',{settlementId:id(),supplierId,amountMinor:100,method:'cash'}),/Confirm the payment/);
   const payment={settlementId:id(),supplierId,amountMinor:1000,method:'cash',externalSettlementConfirmed:true};
   assert.equal((await t.call('owner','settleSupplier',payment)).outstandingMinor,'2000');
   assert.equal((await t.call('owner','settleSupplier',payment)).replayed,true);
   await assert.rejects(t.call('owner','settleSupplier',{...payment,settlementId:id(),amountMinor:2001}),/exceeds unpaid/);
   await t.call('owner','closePurchaseOrder',{orderId,reason:'Short delivery'});
   await assert.rejects(t.call('owner','receivePurchase',{receiptId:id(),orderId,lines:[{lineNo:1,quantity:1}]}),/closed/);
   await assert.rejects(t.db.query('select * from public.shop_supplier_settlements'),/permission denied/);
   await assert.rejects(t.admin('update public.shop_supplier_settlements set amount_minor=1'),/append-only/);
 }finally{await t.db.close();}
});

test('Stage D: online order does not reserve stock and can link only a matching posted sale once',async()=>{
 const t=await setup();
 try{
   const orderId=id(),base={orderId,storeId:t.a,customerReference:'Web-001',
     lines:[{productId:t.product,quantity:2}]};
   const created=await t.call('owner','createOnlineOrder',base);
   assert.equal(created.status,'new');assert.equal(created.stockReserved,false);
   assert.equal((await t.call('owner','createOnlineOrder',base)).replayed,true);
   await assert.rejects(t.call('owner','createOnlineOrder',{...base,lines:[
     {productId:t.product,quantity:3}]}),/different details/);
   await assert.rejects(t.call('attendant','listOnlineOrders'),/Only the owner/);
   await assert.rejects(t.call('owner','linkOnlineOrderSale',{orderId,saleId:id()}),/Accept this online order/);
   const accepted=await t.call('owner','acceptOnlineOrder',{orderId});
   assert.equal(accepted.stockReserved,false);
   assert.equal((await t.call('owner','acceptOnlineOrder',{orderId})).replayed,true);
   const before=await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product]);
   assert.equal(before[0].quantity,20);
   const receipt=await t.core('owner','recordSale',{
     storeId:t.a,submissionKey:id().replaceAll('-',''),lines:[{productId:t.product,quantity:2}],
     tenders:[{method:'cash',amountMinor:3000,tenderedMinor:3000}]
   });
   const posted=await t.call('owner','linkOnlineOrderSale',{orderId,saleId:receipt.saleId});
   assert.equal(posted.status,'sold');assert.equal(posted.stockAdjustedByLink,false);
   assert.equal((await t.call('owner','linkOnlineOrderSale',{orderId,saleId:receipt.saleId})).replayed,true);
   const after=await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product]);
   assert.equal(after[0].quantity,18);
   const state=await t.call('owner','listOnlineOrders');
   assert.equal(state.orders[0].status,'sold');assert.equal(state.orders[0].saleId,receipt.saleId);
   await assert.rejects(t.call('owner','closeOnlineOrder',{orderId,reason:'Customer cancelled'}),/Sold order/);
   const otherId=id();
   await t.call('owner','createOnlineOrder',{orderId:otherId,storeId:t.a,lines:[{productId:t.product,quantity:2}]});
   await t.call('owner','acceptOnlineOrder',{orderId:otherId});
   await assert.rejects(t.call('owner','linkOnlineOrderSale',{orderId:otherId,saleId:receipt.saleId}),/Sale is already linked/);
   const closedId=id();
   await t.call('owner','createOnlineOrder',{orderId:closedId,storeId:t.a,lines:[{productId:t.product,quantity:1}]});
   await t.call('owner','closeOnlineOrder',{orderId:closedId,reason:'Customer cancelled'});
   await assert.rejects(t.call('owner','acceptOnlineOrder',{orderId:closedId}),/Closed order/);
   await assert.rejects(t.db.query('select * from public.shop_online_orders'),/permission denied/);
   await assert.rejects(t.admin('delete from public.shop_online_order_fulfillments'),/append-only/);
 }finally{await t.db.close();}
});

test('upgrade preserves existing sale policy evidence and keeps other cashiers out of summaries', async () => {
 const t = await setup({upgrade:false});
 try {
   await t.core('owner','setRefundPolicy',{refundsEnabled:true,allowVoid:true,allowPartial:true,
     maxAgeDays:30,confirmed:true,reason:'Prior shop terms',expectedRevision:0});
   const sale = await t.core('owner','recordSale',{storeId:t.a,submissionKey:id().replaceAll('-',''),
     lines:[{productId:t.product,quantity:1}],tenders:[{method:'cash',amountMinor:1500,tenderedMinor:1500}]});
   const snapshot = () => t.admin('select refund_policy_revision, refund_policy_snapshot from public.shop_sales where id=$1',[sale.saleId]);
   const before = await snapshot();
   assert.equal(before[0].refund_policy_revision,1);
   await t.applyUpgrade();
   assert.deepEqual(await snapshot(),before);
   assert.equal((await t.call('owner','salesSummary')).grossMinor,'1500');
   assert.equal((await t.call('attendant','salesSummary')).grossMinor,'0');
   assert.equal((await t.call('attendant','readiness')).saleCount,0);
 } finally {await t.db.close();}
});

test('an ambiguous preview policy schema stops the upgrade before installing the operations RPC', async () => {
 const t = await setup({upgrade:false});
 try {
   await t.admin('create table public.shop_return_policy_revisions (revision integer)');
   await assert.rejects(t.applyUpgrade(), /Incompatible preview schema/);
   await t.db.exec('rollback');
   assert.equal((await t.db.query("select to_regprocedure('public.tallybook_shop_ops(text,jsonb)') as rpc")).rows[0].rpc,null);
 } finally {await t.db.close();}
});

test('a rejected second purchase line rolls back the entire receipt and the request ID is reusable', async () => {
 const t = await setup();
 try {
   const supplierId=id(), orderId=id(), receiptId=id(), second=id();
   await t.core('owner','saveProduct',{productId:second,name:'Oil',unitPriceMinor:900});
   await t.call('owner','saveSupplier',{supplierId,name:'Supplier'});
   await t.call('owner','createPurchaseOrder',{orderId,supplierId,storeId:t.a,lines:[
     {productId:t.product,quantity:2,unitCostMinor:100},{productId:second,quantity:1,unitCostMinor:200}]});
   const receive = (who,qty) => t.call(who,'receivePurchase',{orderId,receiptId,
     lines:[{lineNo:1,quantity:2},{lineNo:2,quantity:qty}]});
   await assert.rejects(receive('attendant',1),/owner/i);
   await assert.rejects(receive('owner',2),/exceed outstanding/i);
   assert.equal((await t.call('owner','supplierBalances')).suppliers[0].outstandingMinor,'0');
   const stock = () => t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product]);
   assert.equal((await stock())[0].quantity,20);
   assert.equal((await receive('owner',1)).totalMinor,'400');
   assert.equal((await receive('owner',1)).replayed,true);
   assert.equal((await stock())[0].quantity,22);
 } finally {await t.db.close();}
});
