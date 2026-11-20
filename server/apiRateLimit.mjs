import {rateLimit,ipKeyGenerator} from 'express-rate-limit';
/** Process-local outer shield, before parsing and private I/O. Per-operation
 * authentication limits remain mandatory. No proxy headers establish identity.
 * Multiple server replicas require an independently approved shared store. */
export function createApiRateLimit({limit=120,windowMs=60_000}={}){
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1000)throw Error('Invalid API rate limit');
 return rateLimit({
  limit,windowMs,standardHeaders:'draft-8',legacyHeaders:false,
  keyGenerator:req=>ipKeyGenerator(req.socket?.remoteAddress??'unknown'),
  handler:(_req,res)=>{
   res.setHeader('Cache-Control','no-store');
   res.status(429).json({error:'Too many requests'});
  }
 });
}
