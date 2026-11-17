import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createApiRateLimit} from '../apiRateLimit.mjs';
test('API limiter rejects retries before parsing or private operations, ignoring forged proxy IPs',async t=>{
 const app=express();let parsed=0,writes=0;
 app.use('/api',createApiRateLimit({limit:2}));
 app.post('/api/write',(_req,_res,next)=>{parsed++;next();},express.json(),(_req,res)=>{writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/write';
 for(let i=0;i<4;i++){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+(i+1)},body:i<2?'{}':'invalid json'});
  assert.equal(res.status,i<2?200:429);
  if(i>=2){assert.equal(res.headers.get('cache-control'),'no-store');assert.ok(Number(res.headers.get('retry-after'))>0);}
  await res.text();
 }
 assert.equal(parsed,2);assert.equal(writes,2);
});
test('invalid limiter settings fail closed',()=>{
 for(const options of [{limit:0},{limit:NaN},{windowMs:1}])assert.throws(()=>createApiRateLimit(options),/Invalid/);
});
