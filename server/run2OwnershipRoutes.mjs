import {isDirectTls} from './syncAccessRoutes.mjs';
const operations={
  request:['evidence','request','session'],
  verify:['evidence','verify','reviewSession'],
  revoke:['evidence','revoke','session'],
  approve:['coordinator','issueRecoveryApproval','reviewSession'],
  bind:['coordinator','bindExistingCompany','session'],
  transfer:['coordinator','transferOwner','session']
};
const permitted={
  request:['companyId','reviewerId','kind','localCompanyId','recipientId','backupArtifactId'],
  verify:['evidenceId'],revoke:['evidenceId'],
  approve:['evidenceId','companyId','kind','recipientId','localCompanyId'],
  bind:['cloudCompanyId','localCompanyId','recoveryId'],
  transfer:['companyId','newOwnerId','recoveryId']
};
/** Inject real server-only coordinator/pool explicitly; all routes default OFF. */
export function makeRun2OwnershipHandler({coordinator,evidence,enabled=false,allowedOrigin}={}){
  const counter=new Map();
  return async function(req,res){
    res.setHeader('Cache-Control','no-store');
    if(!enabled||!coordinator||!evidence){res.status(503).json({error:'Run 2 unavailable'});return;}
    const operation=operations[req.params?.action];
    if(!operation){res.status(404).json({error:'Unknown operation'});return;}
    if(!isDirectTls(req)||!allowedOrigin||!allowedOrigin.startsWith('https://')||
       req.headers.origin!==allowedOrigin||!req.is('application/json')){
      res.status(403).json({error:'Request denied'});return;
    }
    const address=String(req.socket.remoteAddress||'unknown'),now=Date.now();
    const last=counter.get(address),item=last&&now-last.at<60000?last:{at:now,n:0};
    item.n++;counter.set(address,item);
    if(counter.size>2048)counter.clear();
    if(item.n>15){res.status(429).json({error:'Rate limited'});return;}
    const token=req.get('authorization');
    if(typeof token!=='string'||!token.startsWith('Bearer ')||token.length>16400){
      res.status(403).json({error:'Request denied'});return;
    }
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).some(k=>!permitted[req.params.action].includes(k))||
       Object.values(body).some(v=>v!==null&&(typeof v!=='string'||v.length>128))){
      res.status(400).json({error:'Invalid body'});return;
    }
    try{
      const [service,fn,authKey]=operation;
      const args={...body,[authKey]:token.slice(7)};
      res.status(200).json(await ({coordinator,evidence}[service])[fn](args));
    }catch{res.status(403).json({error:'Operation denied'});}
  };
}
export function mountRun2OwnershipRoutes(app,jsonParser,config){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')throw Error('Invalid route host');
  app.post('/api/run2/ownership/:action',jsonParser({limit:'4kb',type:'application/json'}),
    makeRun2OwnershipHandler(config));
}
