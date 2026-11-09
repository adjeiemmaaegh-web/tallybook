import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {setup} from './helpers/public-commerce-db.mjs';
test('Customer catalogue reserves authoritative stock and consumes exactly one POS sale',async()=>{
 const t=await setup();
 const commerce=(who,action,input={})=>t.call(who,action,input,t.company,'tallybook_public_commerce');
 try{
  await assert.rejects(commerce('attendant','publish',{}),/Only the company owner/);
  await t.core('owner','setRefundPolicy',{expectedRevision:0,confirmed:true,refundsEnabled:true,allowVoid:true,allowPartial:true,maxAgeDays:10,reason:'Owner approved return terms'});
  const catalogue=await commerce('owner','publish',{expectedRevision:0,storeId:t.a,productIds:[t.product],privacyNotice:'Contact details are used only to fulfil your order.',retentionDays:30,confirmed:true,taxOffConfirmed:true});
  assert.equal(catalogue.items.length,1);assert.equal(catalogue.paymentEnabled,false);
  const orderId=id();
  const request={orderId,catalogueRevision:catalogue.revision,catalogueDigest:catalogue.digest,privacyAccepted:true,customerName:'Customer',customerContact:'customer@example.test',deliveryMethod:'pickup',items:[{productId:t.product,quantity:18}]};
  const order=await commerce('outsider','reserve',request);
  assert.equal(order.totalMinor,'27000');assert.equal(order.status,'reserved');
  assert.deepEqual(await commerce('outsider','reserve',request),order);
  await assert.rejects(commerce('rival','inspect',{orderId}),/Order unavailable/);
  await assert.rejects(t.core('owner','adjustStock',{storeId:t.a,productId:t.product,delta:-3,operationId:id()}),/reserved/);
  const sale={commerceOrderId:orderId,storeId:t.a,submissionKey:id().replaceAll('-',''),lines:[{productId:t.product,quantity:18}],tenders:[{method:'cash',amountMinor:27000,tenderedMinor:27000}]};
  const receipt=await t.core('owner','recordSale',sale);
  assert.equal((await t.core('owner','recordSale',sale)).saleId,receipt.saleId);
  assert.equal((await commerce('outsider','inspect',{orderId})).saleId,receipt.saleId);
  for(const kind of ['packed','delivered']) await commerce('owner','transition',{orderId,kind,note:'Handled in person'});
  assert.equal((await commerce('outsider','inspect',{orderId})).fulfillmentStatus,'delivered');
  assert.equal((await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product]))[0].quantity,2);
  const refund={saleId:receipt.saleId,refundKey:id().replaceAll('-',''),reason:'Customer returned collection',returnToStock:true};
  await t.core('owner','refundSale',refund);await t.core('owner','refundSale',refund);
  assert.equal((await commerce('outsider','inspect',{orderId})).refundedMinor,'27000');
  assert.equal((await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product]))[0].quantity,20);
 }finally{await t.db.close();}
});

test('Customer commerce rejects stale terms, replay tampering, expired sessions and direct-table access',async()=>{
 const t=await setup(); const c=(who,action,input={})=>t.call(who,action,input,t.company,'tallybook_public_commerce');
 try {
  const catalogue=await c('owner','publish',{expectedRevision:0,storeId:t.a,productIds:[t.product],privacyNotice:'Contact details are used only to fulfil your order.',retentionDays:7,confirmed:true,taxOffConfirmed:true});
  const request={orderId:id(),catalogueRevision:catalogue.revision,catalogueDigest:catalogue.digest,privacyAccepted:true,customerName:'Customer',customerContact:'private@example.test',deliveryMethod:'pickup',items:[{productId:t.product,quantity:2}]};
  await t.core('owner','saveProduct',{productId:t.product,name:'Rice 1kg',unitPriceMinor:1600});
  await assert.rejects(c('outsider','reserve',request),/Catalogue changed/);
  await t.core('owner','saveProduct',{productId:t.product,name:'Rice 1kg',unitPriceMinor:1500});
  const accepted=await c('outsider','reserve',request);
  await assert.rejects(c('outsider','reserve',{...request,items:[{productId:t.product,quantity:1}]}),/different details/);
  await assert.rejects(c('outsider','merchantOrders'),/access denied/i);
  await assert.rejects(c('attendant','merchantOrders'),/Only the company owner/);
  for(const table of ['shop_public_catalogues','shop_public_products','shop_customer_orders','shop_customer_order_lines','shop_customer_order_events'])
   await assert.rejects(t.db.query('select * from public.'+table),/permission denied/);
  await c('owner','unpublish',{expectedRevision:1});
  assert.deepEqual(await c('outsider','reserve',request),accepted);
  await assert.rejects(c('outsider','reserve',{...request,orderId:id()}),/Catalogue unavailable/);
  await c('outsider','cancel',{orderId:request.orderId});
  await c('outsider','cancel',{orderId:request.orderId});
  assert.equal((await t.admin("select count(*)::int n from public.shop_customer_order_events where kind='cancelled'"))[0].n,1);
  await t.admin("update auth.sessions set not_after=now()-interval '1 day' where id=$1",[t.users.outsider.session]);
  await assert.rejects(c('outsider','inspect',{orderId:request.orderId}),/Active customer session required/);
 }finally{await t.db.close();}
});

test('Customer checkout rolls back on tender failure and enforces expiry, isolation and return terms',async()=>{
 const t=await setup(); const c=(who,action,input={})=>t.call(who,action,input,t.company,'tallybook_public_commerce');
 try{
  const catalogue=await c('owner','publish',{expectedRevision:0,storeId:t.a,productIds:[t.product],privacyNotice:'Contact details are used only to fulfil your order.',retentionDays:7,confirmed:true,taxOffConfirmed:true});
  const request={orderId:id(),catalogueRevision:catalogue.revision,catalogueDigest:catalogue.digest,privacyAccepted:true,customerName:'Customer',customerContact:'private@example.test',deliveryMethod:'pickup',items:[{productId:t.product,quantity:2}]};
  await c('outsider','reserve',request);
  const sale={commerceOrderId:request.orderId,storeId:t.a,submissionKey:id().replaceAll('-',''),lines:request.items,tenders:[{method:'cash',amountMinor:1,tenderedMinor:1}]};
  await assert.rejects(t.core('owner','recordSale',sale),/tender|payment|total/i);
  assert.equal((await c('outsider','inspect',{orderId:request.orderId})).status,'reserved');
  assert.equal((await t.admin('select count(*)::int n from public.shop_sales'))[0].n,0);
  sale.tenders=[{method:'cash',amountMinor:3000,tenderedMinor:3000}];
  await assert.rejects(t.core('rival','recordSale',sale,t.otherCompany),/unavailable/i);
  await t.core('owner','setRefundPolicy',{expectedRevision:0,confirmed:true,refundsEnabled:true,allowVoid:true,allowPartial:true,maxAgeDays:10,reason:'Owner approved returns'});
  await assert.rejects(t.core('owner','recordSale',sale),/Return terms changed/);
  await t.admin("update public.shop_customer_orders set created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute',retention_until=now()-interval '1 minute' where id=$1",[request.orderId]);
  await assert.rejects(t.core('owner','recordSale',sale),/expired/);
  const redacted=await c('outsider','inspect',{orderId:request.orderId});assert.equal(redacted.status,'expired');assert.equal(redacted.customerContact,null);
  await c('owner','redact');await c('owner','redact');
  assert.equal((await t.admin('select customer_contact from public.shop_customer_orders'))[0].customer_contact,null);
 }finally{await t.db.close();}
});

test('Public projection excludes private data; bounded holds expire and cannot be bypassed',async()=>{
 const t=await setup();const c=(who,action,input={})=>t.call(who,action,input,t.company,'tallybook_public_commerce');
 try{
  const cat=await c('owner','publish',{expectedRevision:0,storeId:t.a,productIds:[t.product],privacyNotice:'Contact details are used only to fulfil your order.',retentionDays:7,confirmed:true,taxOffConfirmed:true});
  await t.db.exec('set role anon');
  const publicView=(await t.db.query('select public.tallybook_catalogue($1) r',[t.company])).rows[0].r;
  assert.equal(publicView.items[0].priceMinor,'1500');assert.equal(publicView.items[0].available,true);
  assert.deepEqual(Object.keys(publicView.items[0]).sort(),['available','id','name','priceMinor']);
  await assert.rejects(t.db.query("select public.tallybook_public_commerce('myOrders',$1)",[{companyId:t.company}]),/permission denied/);
  await t.db.exec('set role authenticated');
  const request={catalogueRevision:cat.revision,catalogueDigest:cat.digest,privacyAccepted:true,customerName:'Customer',customerContact:'private@example.test',deliveryMethod:'pickup',items:[{productId:t.product,quantity:1}]};
  const ids=[];for(let i=0;i<3;i++){const orderId=id();ids.push(orderId);await c('outsider','reserve',{...request,orderId});}
  await assert.rejects(c('outsider','reserve',{...request,orderId:id()}),/order limit/);
  await c('outsider','cancel',{orderId:ids[0]});
  await c('outsider','reserve',{...request,orderId:id()});
  await assert.rejects(t.core('owner','recordSale',{storeId:t.a,submissionKey:id().replaceAll('-',''),lines:[{productId:t.product,quantity:18}],tenders:[{method:'cash',amountMinor:27000,tenderedMinor:27000}]}),/reserved/);
  await t.admin("update public.shop_customer_orders set created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute'");
  await t.core('owner','adjustStock',{storeId:t.a,productId:t.product,delta:-20,operationId:id()});
  await assert.rejects(c('outsider','reserve',{...request,orderId:id()}),/stock is unavailable/);
  const privilege=await t.admin("select has_function_privilege('authenticated','private.shop_public_commerce_action(text,uuid,uuid,jsonb)','execute') allowed");
  assert.equal(privilege[0].allowed,false);
 }finally{await t.db.close();}
});
