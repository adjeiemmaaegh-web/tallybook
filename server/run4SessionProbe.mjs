/** Run 4 protected read-only session lookup. OFF by default. */
import {isDirectTls} from './syncAccessRoutes.mjs';
import {createSupabaseOwnershipSessionResolver,createPostgresAuthSessionReader} from './supabaseOwnershipSession.mjs';
export function makeRun4SessionProbe({resolver,enabled=false,allowedOrigin,clock=Date.now}={}){
  const attempts=new Map();
  const ready=enabled===true&&typeof resolver==='function'&&
    typeof allowedOrigin==='string'&&allowedOrigin.startsWith('https://');
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!ready){res.status(503).json({error:'Session probe unavailable'});return;}
    const authorization=req.get('authorization');
    if(!isDirectTls(req)||req.get('origin')!==allowedOrigin||
       typeof authorization!=='string'||
       !/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(authorization)||
       !!req.get('cookie')){
      res.status(403).json({error:'Session not verified'});return;
    }
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0){res.status(503).json({error:'Probe unavailable'});return;}
    const address=String(req.socket?.remoteAddress??'unknown');
    const previous=attempts.get(address);
    const cell=previous&&now-previous.start<60000?previous:{start:now,count:0};
    cell.count++;attempts.set(address,cell);
    if(attempts.size>2048)for(const [key,value] of attempts){
      if(now-value.start>=60000)attempts.delete(key);
    }
    if(cell.count>30){res.status(429).json({error:'Too many session checks'});return;}
    try{
      const actor=await resolver(authorization.slice(7));
      if(actor?.active!==true||typeof actor.userId!=='string'||
         !Number.isSafeInteger(actor.expiresAtEpochMs))throw Error('denied');
      res.status(200).json({active:true,userId:actor.userId,
        expiresAtEpochMs:actor.expiresAtEpochMs});
    }catch{
      res.status(403).json({error:'Session not verified'});
    }
  };
}
export function installRun4SessionProbe({app,authClient,privatePool,
  enabled=false,allowedOrigin,clock=Date.now}={}){
  if(typeof app?.post!=='function')throw Error('Probe host required');
  if(!enabled){
    app.post('/api/run4/session/verify',makeRun4SessionProbe());
    return Object.freeze({enabled:false});
  }
  if(typeof authClient?.auth?.getUser!=='function'||
     typeof privatePool?.query!=='function'||typeof privatePool?.connect!=='function'||
     typeof allowedOrigin!=='string'||!allowedOrigin.startsWith('https://'))
    throw Error('Private session probe not configured');
  const resolver=createSupabaseOwnershipSessionResolver({
    authClient,sessionReader:createPostgresAuthSessionReader(privatePool),clock});
  app.post('/api/run4/session/verify',
    makeRun4SessionProbe({resolver,enabled:true,allowedOrigin,clock}));
  return Object.freeze({enabled:true});
}
