/** Run 5 cloud-only route authorization. Disabled until private operations
 * and an isolated test runtime are independently reviewed and wired.
 * Existing offline IndexedDB and separate legacy sync routes are untouched.
 */
import {isDirectTls} from './syncAccessRoutes.mjs';
const MAP=Object.freeze({
  companyRead:'company:read',
  membershipRead:'membership:read',
  reportsRead:'reports:read',
  backupRead:'backup:read',
  backupWrite:'backup:write',
  importsWrite:'imports:write',
  exportsRead:'exports:read',
  assistantRead:'assistant:read',
  financeRead:'finance:read',
  financeWrite:'finance:write',
  syncRead:'sync:read',
  syncWrite:'sync:write'
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createRun5TenantRoute({authorizer,operations={},enabled=false,
  origin,clock=Date.now}={}){
  const limits=new Map();
  const available=enabled===true&&typeof authorizer?.authorize==='function'&&
    typeof origin==='string'&&/^https:\/\/[^/\s?#]+$/.test(origin);
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!available){res.status(503).json({error:'Cloud data access unavailable'});return;}
    const kind=req.params?.operation;
    if(!Object.hasOwn(MAP,kind)){res.status(404).json({error:'Unknown cloud operation'});return;}
    if(typeof operations[kind]!=='function'){
      res.status(503).json({error:'Cloud data operation not configured'});return;
    }
    const bearer=req.get('authorization');
    if(!isDirectTls(req)||req.get('origin')!==origin||
       !!req.get('cookie')||!req.is('application/json')||
       typeof bearer!=='string'||!/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(bearer)){
      res.status(403).json({error:'Cloud data access denied'});return;
    }
    const time=clock(),address=String(req.socket?.remoteAddress??'unknown');
    if(!Number.isSafeInteger(time)||time<=0){res.status(503).json({error:'Unavailable'});return;}
    const old=limits.get(address),rate=old&&time-old.at<60000?old:{at:time,count:0};
    rate.count++;limits.set(address,rate);
    if(rate.count>20){res.status(429).json({error:'Too many requests'});return;}
    if(limits.size>2048)for(const[k,v]of limits)if(time-v.at>=60000)limits.delete(k);
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).some(k=>k!=='companyId'&&k!=='input')||
       !UUID.test(body.companyId??'')||
       (body.input!==undefined&&
         (!body.input||typeof body.input!=='object'||Array.isArray(body.input)))){
      res.status(400).json({error:'Invalid cloud data request'});return;
    }
    try{
      const result=await authorizer.authorize({
        accessToken:bearer.slice(7),companyId:body.companyId,
        action:MAP[kind]
      },(tx,ctx)=>operations[kind]({tx,ctx,input:body.input??{}}));
      res.status(200).json(result);
    }catch{
      res.status(403).json({error:'Cloud data access denied'});
    }
  };
}
export function mountRun5TenantRoutes(app,jsonParser,options={}){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Run 5 route host invalid');
  app.post('/api/run5/cloud/:operation',
    jsonParser({limit:'4kb',type:'application/json'}),
    createRun5TenantRoute(options));
}
