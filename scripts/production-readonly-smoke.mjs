import {readBoundedResponseBytes} from '../client/src/lib/boundedResponse.mjs';
/** Unauthenticated public-site check. GET only: never reads tenant data or changes any setting. */
import { pathToFileURL } from 'node:url';

export async function smoke({ baseURL='https://tallybook-eight.vercel.app', allowLocal=false, get=fetch }={}) {
  const base=new URL(baseURL);
  const local=base.protocol==='http:' && ['127.0.0.1','localhost'].includes(base.hostname);
  if ((base.protocol!=='https:' && !(allowLocal&&local)) || base.username || base.password ||
      base.search || base.hash || base.pathname!=='/') throw Error('Expected HTTPS origin without credentials or query');
  const checked=[];
  async function read(path,type,max=500000){
    if (!path.startsWith('/') || path.startsWith('//')) throw Error('Unsafe resource path');
    const url=new URL(path,base);
    if(url.origin!==base.origin || url.search || url.hash) throw Error('Unexpected resource origin or token');
    const r=await get(url.href,{method:'GET',credentials:'omit',redirect:'follow',
      signal:AbortSignal.timeout(15000),headers:{Accept:'*/*'}});
    if(new URL(r.url).origin!==base.origin) throw Error('Cross-origin redirect');
    if(r.status!==200) throw Error('HTTP '+r.status+' at '+path);
    const mime=r.headers.get('content-type')||'';
    const types={html:/text\/html/i,json:/(application\/manifest\+json|application\/json)/i,
      js:/(text|application)\/javascript/i,png:/image\/png/i};
    if(!types[type].test(mime)) throw Error('Wrong MIME at '+path);
    const length=Number(r.headers.get('content-length')||0);
    if(length>max) throw Error('Oversize at '+path);
    const bytes=await readBoundedResponseBytes(r,max,'public resource');
    if(!bytes.length || bytes.length>max) throw Error('Invalid size at '+path);
    checked.push(path);
    return {r,body:new TextDecoder().decode(bytes),bytes};
  }
  const page=await read('/welcome','html');
  if(!/<title>[^<]*Tallybook/i.test(page.body) ||
      !/<div\s+id=["']root["']\s*>/i.test(page.body)) throw Error('App shell missing');
  const headers=page.r.headers,csp=headers.get('content-security-policy')||'';
  for(const term of ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'"])
    if(!csp.includes(term)) throw Error('Missing enforced CSP: '+term);
  if((headers.get('x-frame-options')||'').toUpperCase()!=='DENY') throw Error('Frame protection missing');
  if((headers.get('x-content-type-options')||'').toLowerCase()!=='nosniff') throw Error('MIME protection missing');
  if((headers.get('referrer-policy')||'').toLowerCase()!=='no-referrer') throw Error('Referrer policy missing');
  const hsts=(headers.get('strict-transport-security')||'').match(/max-age=(\d+)/i);
  if(!hsts || Number(hsts[1])<31536000) throw Error('HSTS missing');
  await read('/signin','html');
  const manifest=JSON.parse((await read('/manifest.webmanifest','json')).body);
  if(!/Tallybook/i.test(manifest.name||'') || manifest.display!=='standalone' ||
      manifest.start_url!=='/' || !Array.isArray(manifest.icons) ||
      !manifest.icons.some(i=>i.sizes==='192x192')) throw Error('Invalid PWA manifest');
  for(const icon of manifest.icons.filter(i=>i.sizes==='192x192'||i.purpose==='maskable')){
    const png=(await read(icon.src,'png')).bytes;
    if(![137,80,78,71,13,10,26,10].every((x,i)=>png[i]===x)) throw Error('Invalid PNG icon');
  }
  const sw=await read('/sw.js','js');
  if(sw.body.length<100 || /<html/i.test(sw.body)) throw Error('Service worker missing');
  return {result:'PASS',origin:base.origin,checked,
    limit:'Public HTTP/PWA shell only; not login, shop, offline, backup, payment or device acceptance'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  smoke({baseURL:process.env.TALLYBOOK_SMOKE_BASE_URL||'https://tallybook-eight.vercel.app'})
   .then(x=>console.log(JSON.stringify(x,null,2)))
   .catch(e=>{console.error('Public production smoke failed: '+e.message);process.exitCode=1});
