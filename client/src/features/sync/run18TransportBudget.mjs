/** Run 18 — hard request deadline and response admission.
 * A timeout leaves remote delivery outcome UNKNOWN; callers must preserve
 * pending local ciphertext. This never retries or changes financial records.
 */
const deny=reason=>{throw Error("Encrypted relay transport: "+reason);};
export const RUN18_RELAY_REQUEST_DEADLINE_MS=15000;
export async function requestRun18WithDeadline(transport,url,init,deadline=RUN18_RELAY_REQUEST_DEADLINE_MS) {
 if(typeof transport!=="function"||typeof url!=="string"||
    !url.startsWith("https://")||!Number.isSafeInteger(deadline)||
    deadline<1000||deadline>30000||!init||typeof init!=="object")
   deny("invalid bounded transport request");
 const controller=new AbortController();
 let timeout;
 const timed=new Promise((_,reject)=>{
   timeout=setTimeout(()=>{controller.abort();
     reject(Error("Encrypted relay timed out. Outcome unknown; queued evidence remains pending."));},deadline);
 });
 try{
   return await Promise.race([Promise.resolve().then(()=>transport(url,{...init,signal:controller.signal})),timed]);
 }finally{
   clearTimeout(timeout);
 }
}
export async function readRun18BoundedJson(response,maxBytes) {
 if(!response||!Number.isSafeInteger(maxBytes)||maxBytes<128||maxBytes>2_000_000)
   deny("invalid response budget");
 const declared=response.headers?.get?.("content-length");
 if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||
     Number(declared)>maxBytes))deny("untrusted server response length");
 // Read at most budget + 1 bytes even if server omits Content-Length.
 const reader=response.body?.getReader?.();
 if(!reader){
   const text=await response.text();
   if(new TextEncoder().encode(text).byteLength>maxBytes)deny("oversized response");
   let result;try{result=JSON.parse(text);}catch{deny("malformed JSON");}
   return result;
 }
 const chunks=[];let total=0;
 const started=Date.now();
 try{
   while(true){
     const remaining=RUN18_RELAY_REQUEST_DEADLINE_MS-(Date.now()-started);
     if(remaining<=0)deny("response stream timed out; local pending state is unchanged");
     let timer;
     let part;
     try {
       part=await Promise.race([
         reader.read(),
         new Promise((_,reject)=>{
           timer=setTimeout(()=>reject(Error("Encrypted relay response timed out; local pending state is unchanged.")),remaining);
         })
       ]);
     }finally{clearTimeout(timer);}
     if(part.done)break;
     if(!(part.value instanceof Uint8Array))deny("invalid stream chunk");
     total+=part.value.byteLength;
     if(total>maxBytes)deny("oversized response");
     chunks.push(part.value);
   }
 }catch(e){try{await reader.cancel();}catch{}throw e;}
 finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(total);let offset=0;
 for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 let result;try{result=JSON.parse(text);}catch{deny("malformed JSON");}
 return result;
}
