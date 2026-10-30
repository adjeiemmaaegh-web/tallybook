/** QA-only signed sale read validation. Never mutates local IndexedDB. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const UTC=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|\+00:00)$/;
const deny=()=>{throw Error('QA sale page failed integrity validation.');};
function micros(s){
 if(typeof s!=='string')deny();
 const m=UTC.exec(s);
 if(!m)deny();
 const base=Date.parse(m[1]+'Z');
 if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,19)!==m[1])deny();
 return BigInt(base)*1000n+BigInt((m[2]??'').padEnd(6,'0')||'0');
}
function cmp(a,b){
 const x=micros(a.time),y=micros(b.time);
 // The QA RPC orders operation IDs with PostgreSQL's bytewise C collation.
 // IDs are restricted to ASCII, so JS code-unit order is the same order.
 return x<y?-1:x>y?1:a.operation<b.operation?-1:a.operation>b.operation?1:0;
}
export function validateQaSalePage(value,scope){
 if(!scope||!UUID.test(scope.companyId??'')||!ID.test(scope.deviceId??'')||
    typeof scope.afterUtc!=='string'||typeof scope.afterOperationId!=='string'||
    scope.afterOperationId.length>128)deny();
 const cursor={time:scope.afterUtc,operation:scope.afterOperationId};
 if(!value||typeof value!=='object'||Array.isArray(value)||
    value.companyId!==scope.companyId||value.deviceId!==scope.deviceId||
    !ID.test(value.storeId??'')||!Array.isArray(value.events)||
    value.events.length>10||typeof value.hasMore!=='boolean')deny();
 const known=new Set();
 let previous=cursor;
 for(const event of value.events){
  if(!event||typeof event!=='object'||Array.isArray(event)||
     !ID.test(event.operationId??'')||!ID.test(event.eventId??'')||
     !ID.test(event.storeId??'')||event.storeId!==value.storeId||
     !ID.test(event.staffId??'')||!UUID.test(event.actorId??'')||
     !/^[a-f0-9]{64}$/.test(event.payloadSha256??'')||
     event.evidenceStatus!=='upload_claim_only'||
     !event.payload||typeof event.payload!=='object'||Array.isArray(event.payload)||
     known.has(event.operationId))deny();
  known.add(event.operationId);
  const next={time:event.receivedAtUtc,operation:event.operationId};
  if(cmp(next,previous)<=0)deny();
  previous=next;
 }
 if(value.events.length===0){
  if(value.hasMore||value.nextReceivedAtUtc!==null||value.nextOperationId!==null)deny();
 }else{
  if(value.hasMore&&value.events.length!==10)deny();
  if(value.nextReceivedAtUtc!==previous.time||value.nextOperationId!==previous.operation)deny();
 }
 return Object.freeze({companyId:scope.companyId,deviceId:scope.deviceId,
   storeId:value.storeId,events:Object.freeze(value.events.map(e=>Object.freeze({...e}))),
   hasMore:value.hasMore,
   nextReceivedAtUtc:value.nextReceivedAtUtc,
   nextOperationId:value.nextOperationId});
}
