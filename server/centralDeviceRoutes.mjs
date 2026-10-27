/** Private identity/device administration boundary. Shipped server mounts it
 * disabled until a reviewed private PostgreSQL and Supabase Auth runtime exists.
 */
import {createAccessLimiter,isDirectTls} from './syncAccessRoutes.mjs';

const paths=Object.freeze({
  '/api/central/staff/provision':{service:'staff',method:'provision',keys:['companyId','localCompanyId','staffId','storeId','targetUserId']},
  '/api/central/devices/invite':{service:'device',method:'issueInvite',keys:['companyId','storeId','targetUserId']},
  '/api/central/devices/redeem':{service:'device',method:'redeemKeyInvite',keys:['deviceId','proofSignature','publicKeySpkiPem','staffId','token']},
  '/api/central/devices/revoke':{service:'device',method:'revokeDeviceKey',keys:['companyId','deviceId']},
});
const ids=Object.keys(paths);
const bearer=/^Bearer [A-Za-z0-9._~-]{20,16384}$/;

export function createCentralDeviceHandler({enabled=false,allowedOrigin,staffService,deviceService,
  limiter=createAccessLimiter({limit:20,windowMs:60000})}={}) {
  const ready=enabled===true&&typeof allowedOrigin==='string'&&
    /^https:\/\/[^/\s?#]+$/.test(allowedOrigin)&&
    typeof staffService?.provision==='function'&&
    ['issueInvite','redeemKeyInvite','revokeDeviceKey'].every(method=>typeof deviceService?.[method]==='function')&&
    typeof limiter?.allow==='function';
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!ready){res.status(503).json({error:'Device administration unavailable'});return;}
    const action=paths[req.path];
    if(!action){res.status(404).json({error:'Unknown device action'});return;}
    const authorization=req.get('authorization');
    if(!isDirectTls(req)||req.get('origin')!==allowedOrigin||req.get('cookie')||
       req.is('application/json')!=='application/json'||
       typeof authorization!=='string'||!bearer.test(authorization)){
      res.status(403).json({error:'Device administration denied'});return;
    }
    const ip=String(req.socket?.remoteAddress??'unknown');
    if(!limiter.allow(ip)){res.status(429).json({error:'Rate limit exceeded'});return;}
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).sort().join(',')!==action.keys.join(',')){
      res.status(400).json({error:'Invalid device action'});return;
    }
    try {
      const service=action.service==='staff'?staffService:deviceService;
      const result=await service[action.method]({...req.body,session:authorization.slice(7)});
      res.status(200).json(result);
    } catch {
      res.status(403).json({error:'Device administration denied'});
    }
  };
}

export function mountCentralDeviceRoutes(app,jsonParser,options) {
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Device administration route host invalid');
  const handler=createCentralDeviceHandler(options);
  for(const path of ids)app.post(path,jsonParser({limit:'4kb',type:'application/json'}),handler);
}
