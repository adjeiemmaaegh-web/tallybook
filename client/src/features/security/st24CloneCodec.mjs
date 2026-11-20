/**
 * ST24-05 lossless IndexedDB structured-clone subset codec.
 * Deterministic tagged encoding avoids JSON dropping undefined, NaN, -0,
 * Dates, BigInts, Maps, Sets or typed arrays. Unsupported types fail closed.
 * No implicit toJSON() invocation, accessors, prototypes or cyclic objects.
 * This codec never writes to a browser database by itself.
 */
const MAX_DEPTH=64,MAX_BINARY=1024*1024;
const TAG='tallybook-st24-tagged-v1';
const fail=(why)=>{throw Error('ST24 clone codec: '+why);};
function bytesTo64(bytes){
  let s='';
  for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function bytesFrom64(text,max=MAX_BINARY){
 if(typeof text!=='string'||text.length>Math.ceil(max*4/3)+4||!/^[a-zA-Z0-9_-]*$/.test(text))fail('invalid binary encoding');
 let raw;
 try {raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));}
 catch{fail('invalid binary encoding');}
 const out=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(out.length>max||bytesTo64(out)!==text)fail('noncanonical binary encoding');
 return out;
}
const typed={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,
 Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,
 DataView};
const BYTES_PER_ELEMENT={
 Int8Array:1,Uint8Array:1,Uint8ClampedArray:1,Int16Array:2,Uint16Array:2,
 Int32Array:4,Uint32Array:4,Float32Array:4,Float64Array:8,BigInt64Array:8,BigUint64Array:8,DataView:1
};
const forbidden=new Set(['__proto__','prototype','constructor']);
export function encodeSt24Clone(value){
 const seen=new WeakSet();
 function inner(x,depth){
  if(depth>MAX_DEPTH)fail('nested value exceeds depth limit');
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(x===undefined)return [TAG,'undefined'];
  if(typeof x==='number'){
   if(Number.isNaN(x))return [TAG,'nan'];
   if(x===Infinity)return [TAG,'infinity'];
   if(x===-Infinity)return [TAG,'negative-infinity'];
   if(Object.is(x,-0))return [TAG,'negative-zero'];
   return x;
  }
  if(typeof x==='bigint')return [TAG,'bigint',x.toString()];
  if(typeof x!=='object')fail('unsupported type: '+typeof x);
  if(seen.has(x))fail('cyclic data');
  seen.add(x);
  try{
   if(x instanceof Date){
    if(!Number.isFinite(x.getTime()))fail('invalid Date');
    return [TAG,'date',x.toISOString()];
   }
   if(x instanceof ArrayBuffer){
    if(x.byteLength>MAX_BINARY)fail('oversized binary field');
    return [TAG,'arraybuffer',bytesTo64(new Uint8Array(x))];
   }
   if(ArrayBuffer.isView(x)){
    const name=Object.getPrototypeOf(x)?.constructor?.name;
    if(!Object.hasOwn(typed,name)||!(x instanceof typed[name]))fail('unsupported typed array');
    if(x.byteLength>MAX_BINARY)fail('oversized typed array');
    return [TAG,'typed',name,bytesTo64(new Uint8Array(x.buffer,x.byteOffset,x.byteLength))];
   }
   if(x instanceof Map){
    if(x.size>100000)fail('oversized map');
    return [TAG,'map',Array.from(x,([k,v])=>[inner(k,depth+1),inner(v,depth+1)])];
   }
   if(x instanceof Set){
    if(x.size>100000)fail('oversized set');
    return [TAG,'set',Array.from(x,v=>inner(v,depth+1))];
   }
   if(Array.isArray(x)){
    const keys=Reflect.ownKeys(x);
    if(keys.length!==x.length+1)fail('array properties are not a structured-clone subset');
    const arr=[];
    for(let i=0;i<x.length;i++){
     if(!Object.hasOwn(x,i))fail('sparse array not supported');
     arr.push(inner(x[i],depth+1));
    }
    return [TAG,'array',arr];
   }
   const proto=Object.getPrototypeOf(x);
   if(proto!==Object.prototype&&proto!==null)fail('unsupported prototype');
   const entries=[];
   for(const key of Reflect.ownKeys(x)){
    if(typeof key!=='string'||forbidden.has(key))fail('unsafe object property');
    const descriptor=Object.getOwnPropertyDescriptor(x,key);
    if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))
     fail('accessors and hidden fields not supported');
    entries.push([key,inner(descriptor.value,depth+1)]);
   }
   entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
   return [TAG,'object',entries];
  }finally{seen.delete(x);}
 }
 return inner(value,0);
}
export function decodeSt24Clone(value){
 function inner(x,depth){
  if(depth>MAX_DEPTH)fail('encoded depth limit');
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'){
   if(!Number.isFinite(x))fail('invalid JSON number');
   return x;
  }
  if(!Array.isArray(x)||x[0]!==TAG||typeof x[1]!=='string')fail('invalid tagged data');
  const tag=x[1],arg=x[2];
  const exact=n=>{if(x.length!==n)fail('invalid '+tag+' structure');};
  switch(tag){
   case 'undefined':exact(2);return undefined;
   case 'nan':exact(2);return NaN;
   case 'infinity':exact(2);return Infinity;
   case 'negative-infinity':exact(2);return -Infinity;
   case 'negative-zero':exact(2);return -0;
   case 'bigint':
    exact(3);if(typeof arg!=='string'||!/^(0|-[1-9]\d*|[1-9]\d*)$/.test(arg)||arg.length>1024)fail('bad bigint');
    return BigInt(arg);
   case 'date':
    exact(3);
    if(typeof arg!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(arg))fail('bad date');
    const date=new Date(arg);
    if(!Number.isFinite(date.getTime())||date.toISOString()!==arg)fail('invalid date');
    return date;
   case 'arraybuffer':exact(3);return bytesFrom64(arg).buffer;
   case 'typed':{
    exact(4);
    const type=arg;
    if(typeof type!=='string'||!Object.hasOwn(typed,type))fail('unknown typed array');
    const bytes=bytesFrom64(x[3]);
    if(bytes.byteLength%BYTES_PER_ELEMENT[type]!==0)fail('invalid typed length');
    // Own buffer, so no typed view overlaps temporary scratch.
    const aligned=new Uint8Array(bytes);
    return type==='DataView' ? new DataView(aligned.buffer):
      new typed[type](aligned.buffer);
   }
   case 'array':
    exact(3);if(!Array.isArray(arg)||arg.length>100000)fail('bad array');
    return arg.map(v=>inner(v,depth+1));
   case 'object':{
    exact(3);if(!Array.isArray(arg)||arg.length>100000)fail('bad object');
    const out=Object.create(null);let last=null;
    for(const tuple of arg){
     if(!Array.isArray(tuple)||tuple.length!==2||typeof tuple[0]!=='string'||forbidden.has(tuple[0])||
        (last!==null&&tuple[0]<=last))fail('invalid object key ordering');
     last=tuple[0];out[last]=inner(tuple[1],depth+1);
    }
    return out;
   }
   case 'map':
    exact(3);if(!Array.isArray(arg)||arg.length>100000)fail('bad map');
    return new Map(arg.map(pair=>{
     if(!Array.isArray(pair)||pair.length!==2)fail('bad map pair');
     return [inner(pair[0],depth+1),inner(pair[1],depth+1)];
    }));
   case 'set':
    exact(3);if(!Array.isArray(arg)||arg.length>100000)fail('bad set');
    const vals=arg.map(v=>inner(v,depth+1));
    const result=new Set(vals);if(result.size!==vals.length)fail('duplicate set');
    return result;
   default:fail('unsupported tagged type');
  }
 }
 return inner(value,0);
}
export function canonicalSt24CloneJson(value){
 return JSON.stringify(encodeSt24Clone(value));
}
