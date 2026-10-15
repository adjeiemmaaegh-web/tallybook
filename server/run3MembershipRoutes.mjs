/** Run 3 opt-in transport. App assembly passes trusted server objects only.
 * No cookies, proxy TLS assumptions, querystring credentials, or open redirects.
 */
import {isDirectTls} from './syncAccessRoutes.mjs';
const operations=Object.freeze({
  invite:['companyId','targetUserId'],
  accept:['inviteToken'],
  revokeMember:['companyId','targetUserId'],
  revokeInvite:['companyId','invitationId'],
  listMembers:['companyId']
});
export function createRun3MembershipHandler({service,enabled=false,allowedOrigin,clock=Date.now}={}){
  const counters=new Map();
  const ready=enabled===true&&service&&
    typeof allowedOrigin==='string'&&/^https:\/\/[^/\s?#]+$/.test(allowedOrigin);
  return async function handle(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!ready){res.status(503).json({error:'Membership service unavailable'});return;}
    const name=req.params?.operation,allowed=Object.hasOwn(operations,name)?operations[name]:null;
    if(!allowed){res.status(404).json({error:'Unknown operation'});return;}
    const origin=req.get('origin'),authorization=req.get('authorization');
    if(!isDirectTls(req)||origin!==allowedOrigin||!!req.get('cookie')||
      req.is('application/json')!== 'application/json'||
      typeof authorization!=='string'||!/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(authorization)){
      res.status(403).json({error:'Membership request denied'});return;
    }
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0){res.status(503).json({error:'Unavailable'});return;}
    const ip=String(req.socket?.remoteAddress??'unknown');
    const old=counters.get(ip);
    const slot=old&&now-old.start<60000?old:{start:now,count:0};
    slot.count++;counters.set(ip,slot);
    if(counters.size>2048)for(const [key,c] of counters){
      if(now-c.start>=60000)counters.delete(key);
    }
    if(slot.count>20){res.status(429).json({error:'Rate limit exceeded'});return;}
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!allowed.includes(k))||
      Object.values(body).some(v=>typeof v!=='string'||v.length>512)){
      res.status(400).json({error:'Invalid membership request'});return;
    }
    try{
      const result=await service[name]({...body,session:authorization.slice(7)});
      res.status(200).json(result);
    }catch{
      res.status(403).json({error:'Membership request denied'});
    }
  };
}
export function mountRun3MembershipRoutes(app,jsonParser,options){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Run 3 route host invalid');
  app.post('/api/run3/membership/:operation',
    jsonParser({limit:'4kb',type:'application/json'}),
    createRun3MembershipHandler(options));
}
