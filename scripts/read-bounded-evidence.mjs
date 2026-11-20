import {open,constants} from 'node:fs/promises';
/** One descriptor owns both validation and bounded reads. Reject symlinks on
 * platforms providing O_NOFOLLOW; no check-then-reopen pathname race. */
export async function readBoundedEvidence(filename,{minBytes=0,maxBytes}={}) {
 if(!Number.isSafeInteger(minBytes)||!Number.isSafeInteger(maxBytes)||minBytes<0||maxBytes<minBytes)throw Error('Invalid evidence size limit');
 const file=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const info=await file.stat();
  if(!info.isFile()||info.size<minBytes||info.size>maxBytes)throw Error('Missing, nonregular or oversized evidence');
  const chunks=[];let total=0;
  while(true){
   const buffer=Buffer.alloc(Math.min(64*1024,maxBytes+1-total));
   const {bytesRead}=await file.read(buffer,0,buffer.length,null);
   if(bytesRead===0)break;
   total+=bytesRead;if(total>maxBytes)throw Error('Evidence grew beyond size limit');
   chunks.push(buffer.subarray(0,bytesRead));
  }
  if(total<minBytes)throw Error('Evidence shorter than minimum');
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total));
 }finally{await file.close();}
}
