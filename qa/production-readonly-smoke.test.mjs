import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { smoke } from '../scripts/production-readonly-smoke.mjs';

const security={
 'content-security-policy':"default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
 'x-frame-options':'DENY','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer','strict-transport-security':'max-age=31536000; includeSubDomains'
};
const icon=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const shell='<html><head><title>Tallybook Business Ledger</title></head><body><div id="root"></div></body></html>';
const manifest=JSON.stringify({name:'Tallybook',display:'standalone',start_url:'/',
 icons:[{src:'/tallybook-icon-192.png',sizes:'192x192'},{src:'/tallybook-icon-maskable-512.png',sizes:'512x512',purpose:'maskable'}]});

async function fixture(changes={}){
 const routes={
 '/welcome':{mime:'text/html',body:shell,headers:security},
 '/signin':{mime:'text/html',body:shell},
 '/manifest.webmanifest':{mime:'application/manifest+json',body:manifest},
 '/tallybook-icon-192.png':{mime:'image/png',body:icon},
 '/tallybook-icon-maskable-512.png':{mime:'image/png',body:icon},
 '/sw.js':{mime:'text/javascript',body:'/* compiled service worker */'+'a'.repeat(140)}
 };
 Object.assign(routes,changes);
 const hits=[];
 const server=createServer((req,res)=>{
  hits.push({method:req.method,authorization:req.headers.authorization,path:req.url});
  const r=routes[req.url];if(!r){res.writeHead(404);res.end('missing');return;}
  res.writeHead(r.status||200,{'content-type':r.mime,...r.headers});res.end(r.body);
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 return {url:'http://127.0.0.1:'+server.address().port+'/',hits,
  close:()=>new Promise(done=>server.close(done))};
}

test('safe public GET checks pass with no credentials, tenant routes, or mutations',async()=>{
 const f=await fixture();
 try{
  const result=await smoke({baseURL:f.url,allowLocal:true});
  assert.equal(result.result,'PASS');
  assert.ok(result.checked.includes('/sw.js'));
  assert.ok(f.hits.every(x=>x.method==='GET'&&!x.authorization));
  assert.ok(f.hits.every(x=>!x.path.startsWith('/api/')&&x.path!=='/shop'));
 } finally{await f.close()}
});

test('rejects an insecure public origin or credentials',async()=>{
 await assert.rejects(smoke({baseURL:'http://evil.example/'}),/HTTPS origin/);
 await assert.rejects(smoke({baseURL:'https://admin:secret@example.com/'}),/HTTPS origin/);
 await assert.rejects(smoke({baseURL:'https://example.com/?token=x'}),/HTTPS origin/);
});

test('rejects missing CSP',async()=>{
 const f=await fixture({'/welcome':{mime:'text/html',body:shell}});
 try{await assert.rejects(smoke({baseURL:f.url,allowLocal:true}),/Missing enforced CSP/)}
 finally{await f.close()}
});

test('rejects wrong service worker MIME instead of accepting SPA HTML fallback',async()=>{
 const f=await fixture({'/sw.js':{mime:'text/html',body:shell}});
 try{await assert.rejects(smoke({baseURL:f.url,allowLocal:true}),/Wrong MIME/)}
 finally{await f.close()}
});

test('rejects incorrect manifest and missing public route',async()=>{
 const f=await fixture({'/manifest.webmanifest':{mime:'application/manifest+json',body:'{"name":"Wrong"}'}});
 try{await assert.rejects(smoke({baseURL:f.url,allowLocal:true}),/Invalid PWA manifest/)}
 finally{await f.close()}
 const g=await fixture({'/signin':{status:503,mime:'text/html',body:shell}});
 try{await assert.rejects(smoke({baseURL:g.url,allowLocal:true}),/HTTP 503/)}
 finally{await g.close()}
});
