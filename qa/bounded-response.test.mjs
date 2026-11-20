import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedResponseBytes,readBoundedResponseText} from '../client/src/lib/boundedResponse.mjs';
test('exact byte cap reconstructs UTF-8 characters split across real stream chunks',async()=>{
 const bytes=new TextEncoder().encode('A💰B');
 const stream=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}});
 const response=new Response(stream);
 assert.equal(await readBoundedResponseText(response,bytes.length),'A💰B');assert.equal(stream.locked,false);
});
test('oversized chunked bodies stop reading and cancel without trusting missing content length',async()=>{
 let cancelled=0,pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024));},cancel(){cancelled++;}});
 const response=new Response(stream);assert.equal(response.headers.get('content-length'),null);
 await assert.rejects(readBoundedResponseText(response,512,'receipt'),/Oversized receipt/);
 assert.equal(cancelled,1);assert.ok(pulls<=2);assert.equal(stream.locked,false);
});
test('a lying small content length cannot bypass actual decoded-byte limits',async()=>{
 const response=new Response('x'.repeat(4096),{headers:{'content-length':'1'}});
 await assert.rejects(readBoundedResponseBytes(response,2048),/Oversized/);
});
test('stream errors propagate and release the reader instead of manufacturing a receipt',async()=>{
 const stream=new ReadableStream({start(controller){controller.error(new Error('interrupted fixture transport'));}});
 await assert.rejects(readBoundedResponseText(new Response(stream),100),/interrupted fixture transport/);assert.equal(stream.locked,false);
});
test('invalid limits fail before consuming data',async()=>{
 for(const limit of [0,-1,1.5,Infinity,NaN,8*1024*1024+1]){
  const response=new Response('unchanged');await assert.rejects(readBoundedResponseText(response,limit),/byte limit/);assert.equal(response.bodyUsed,false);
 }
});
test('missing streams and invalid UTF-8 fail closed; empty responses remain empty',async()=>{
 await assert.rejects(readBoundedResponseText({},10),/byte stream/);
 await assert.rejects(readBoundedResponseText(new Response(Uint8Array.of(0xff)),10),/encoded data|encoding/i);
 assert.equal(await readBoundedResponseText(new Response(null),10),'');
});
test('peer cancellation that never resolves cannot prevent bounded rejection',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20));},cancel(){return new Promise(()=>{});}});
 await assert.rejects(readBoundedResponseBytes(new Response(stream),10),/Oversized/);assert.equal(stream.locked,false);
});
test('real cross-realm byte views are accepted without accepting string chunks',async()=>{
 const foreign=runInNewContext('Uint8Array.from([65,66])');
 const stream=new ReadableStream({start(controller){controller.enqueue(foreign);controller.close();}});
 assert.equal(await readBoundedResponseText(new Response(stream),2),'AB');
 const invalid=new ReadableStream({start(controller){controller.enqueue('not bytes');controller.close();}});
 await assert.rejects(readBoundedResponseText(new Response(invalid),100),/Invalid response byte chunk/);
});
