/** Opt-in signed-sale transport. Service owns every authorization decision. */
import { createAccessLimiter, isDirectTls } from './syncAccessRoutes.mjs';

export function createCentralSaleUploadHandler({service,enabled=false,allowedOrigin,
  limiter=createAccessLimiter({limit:30,windowMs:60000})}={}) {
  const ready=enabled===true&&typeof service?.ingest==='function'&&
    typeof allowedOrigin==='string'&&/^https:\/\/[^/\s?#]+$/.test(allowedOrigin);
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!ready){res.status(503).json({error:'Signed sale upload unavailable'});return;}
    const authorization=req.get('authorization');
    if(!isDirectTls(req)||req.get('origin')!==allowedOrigin||req.get('cookie')||
       req.is('application/json')!=='application/json'||
       typeof authorization!=='string'||!/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(authorization)){
      res.status(403).json({error:'Signed sale upload denied'});return;
    }
    const ip=String(req.socket?.remoteAddress??'unknown');
    if(typeof limiter?.allow!=='function'||!limiter.allow(ip)){
      res.status(429).json({error:'Rate limit exceeded'});return;
    }
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).sort().join(',')!=='envelope'){
      res.status(400).json({error:'Invalid upload'});return;
    }
    try {
      const receipt=await service.ingest({session:authorization.slice(7),envelope:req.body.envelope});
      res.status(200).json(receipt);
    } catch(error) {
      const conflict=typeof error?.message==='string'&&error.message.includes('conflicts with an existing event');
      res.status(conflict?409:403).json({error:conflict?'Signed sale conflicts':'Signed sale upload denied'});
    }
  };
}

export function mountCentralSaleUploadRoute(app,jsonParser,options) {
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')throw Error('Signed sale route host invalid');
  app.post('/api/central/sales',jsonParser({limit:'96kb',type:'application/json'}),
    createCentralSaleUploadHandler(options));
}
