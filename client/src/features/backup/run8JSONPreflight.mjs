/** V19 Run 8: bounded linear JSON lexical preflight BEFORE JSON.parse.
 * JSON.parse silently keeps the last duplicate key, which can hide a second
 * payment, amount or company identifier in an imported financial ledger.
 * Scan without allocating copies of long data strings. This is a validator,
 * not a replacement for the browser's standards-compliant JSON.parse.
 */
export const RUN8_MAX_JSON_DEPTH=48;
export const RUN8_MAX_JSON_VALUES=1_500_000;
const UNSAFE=new Set(['__proto__','constructor','prototype']);
export function assertRun8UnambiguousJSON(text){
 if(typeof text!=='string')throw Error('This file is not valid Tallybook backup JSON.');
 let at=0,count=0;
 const len=text.length;
 const fail=(message='This file is not valid Tallybook backup JSON.')=>{throw Error(message);};
 const white=()=>{while(at<len){
  const c=text.charCodeAt(at);
  if(c===32||c===10||c===13||c===9)at++;
  else break;
 }};
 function string(decode){
  const begin=at;
  if(text[at]!=='"')fail();
  at++;
  let closed=false;
  while(at<len){
   const c=text[at++];
   if(c==='"'){closed=true;break;}
   if(c==='\\'){
    if(at>=len)fail();
    const escape=text[at++];
    if(escape==='u'){if(at+4>len)fail();at+=4;}
    else if(!'"\\/bfnrt'.includes(escape))fail();
   }else if(c.charCodeAt(0)<32)fail();
  }
  if(!closed)fail();
  if(decode){
   try{return JSON.parse(text.slice(begin,at));}
   catch{fail();}
  }
 }
 const number=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
 function value(depth){
  if(++count>RUN8_MAX_JSON_VALUES)
   fail('Backup JSON has too many nested values. No records imported.');
  if(depth>RUN8_MAX_JSON_DEPTH)
   fail('Backup JSON nesting exceeds the local recovery limit.');
  white();
  const c=text[at];
  if(c==='"'){string(false);return;}
  if(c==='{'){
   at++;white();const seen=new Set();
   if(text[at]==='}'){at++;return;}
   while(true){
    white();if(text[at]!=='"')fail();
    const key=string(true);
    if(UNSAFE.has(key))fail('Backup contains unsafe JSON object keys. No records imported.');
    if(seen.has(key))fail('Backup contains duplicate JSON object keys. No records imported.');
    seen.add(key);white();
    if(text[at++]!==':')fail();
    value(depth+1);white();
    const sep=text[at++];
    if(sep==='}')return;
    if(sep!==',')fail();
   }
  }
  if(c==='['){
   at++;white();
   if(text[at]===']'){at++;return;}
   while(true){
    value(depth+1);white();
    const sep=text[at++];
    if(sep===']')return;
    if(sep!==',')fail();
   }
  }
  for(const word of ['true','false','null']){
   if(text.startsWith(word,at)){at+=word.length;return;}
  }
  number.lastIndex=at;
  const n=number.exec(text);
  if(n){at=number.lastIndex;return;}
  fail();
 }
 value(0);white();
 if(at!==len)fail();
 return true;
}
