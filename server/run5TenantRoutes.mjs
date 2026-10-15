/** Run 5 cloud-data HTTP facade. REVIEW-ONLY; disabled by default.
 * Never routes local POS records or client-chosen company data to cloud by
 * default. Every permitted action is re-authorized by the service in SQL tx.
 */
import {isDirectTls} from './syncAccessRoutes.mjs';
const operations=Object.freeze({
 get:['companyId','collection','id'],
 list:['companyId','collection','limit','after'],
 put:['companyId','collection','id','payload','expectedRevision'],
 remove:['companyId','collection','id','expectedRevision'],
 exportRows:['companyId','collection','limit','after'],
 importRows:['companyId','collection','rows'],
 report:['companyId','limit','after'],
 assistant:['companyId','limit','after'],
 syncInspect:['companyId','limit','after']
});
const deny=(res,code=403)=>res.status(code).json({error:'Tenant data request denied'});
export function createRun5TenantRoutes({service,enabled=false,allowedOrigin,clock=Date.now}={}){
  const ready=enabled===true&&service&&
    typeof allowedOrigin==='string'&&/^https:\/\/[^/?#\s]+$/.test(allowedOrigin);
  const counts=new Map();
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Pragma','no-cache');
    if(!ready)return deny(res,503);
    const name=req.params?.action;
    const allowed=Object.hasOwn(operations,name)?operations[name]:null;
    if(!allowed)return deny(res,404);
    const token=req.get('authorization');
    if(!isDirectTls(req)||req.get('origin')!==allowedOrigin||
       !!req.get('cookie')||req.is('application/json')!=='application/json'||
       typeof token!=='string'||!/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(token))
      return deny(res);
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0)return deny(res,503);
    const key=String(req.socket?.remoteAddress??'unknown');
    const prior=counts.get(key);
    const cell=prior&&now-prior.at<60000?prior:{at:now,count:0};
    cell.count++;counts.set(key,cell);
    if(counts.size>2048)for(const [id,v] of counts)if(now-v.at>=60000)counts.delete(id);
    if(cell.count>25)return deny(res,429);
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length>6||
       Object.keys(body).some(k=>!allowed.includes(k)))
      return deny(res,400);
    try{
      const result=await service[name]({...body,session:token.slice(7)});
      // HTTP output is a consequence of successfully authorized service
      // execution only; generic error never echoes any tenant identifier.
      return res.status(200).json(result);
    }catch{return deny(res);}
  };
}
export function mountRun5TenantRoutes(app,jsonParser,options){
  if(typeof app?.post!=='function'||typeof jsonParser!=='function')
    throw Error('Run 5 routing unavailable');
  app.post('/api/run5/data/:action',
    jsonParser({limit:'48kb',type:'application/json'}),
    createRun5TenantRoutes(options));
}
