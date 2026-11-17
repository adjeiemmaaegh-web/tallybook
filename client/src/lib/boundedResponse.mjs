/** Bound decoded HTTP response bytes while streaming, before materializing text/JSON. */
export async function readBoundedResponseBytes(response,limitBytes,label='response') {
 if(!Number.isSafeInteger(limitBytes)||limitBytes<1||limitBytes>8*1024*1024)
  throw new Error('Invalid response byte limit.');
 if(response?.body===null)return new Uint8Array(0);
 if(!response?.body||typeof response.body.getReader!=='function')
  throw new Error('Invalid response byte stream.');
 const reader=response.body.getReader(),chunks=[];
 let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!ArrayBuffer.isView(value)||Object.prototype.toString.call(value)!=='[object Uint8Array]')throw new Error('Invalid response byte chunk.');
   if(value.byteLength>limitBytes-total)throw new Error(`Oversized ${label}.`);
   total+=value.byteLength;chunks.push(new Uint8Array(value));
  }
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
 }catch(error){
  // A peer cannot hold rejection hostage with a hanging cancellation hook.
  try{void Promise.resolve(reader.cancel(error)).catch(()=>{});}catch{}
  throw error;
 }finally{reader.releaseLock();}
}
export async function readBoundedResponseText(response,limitBytes,label='response'){
 const bytes=await readBoundedResponseBytes(response,limitBytes,label);
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
