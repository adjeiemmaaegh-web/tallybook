/** Read-only backup manifest preflight; checksum comparisons use caller-provided digests. */
export type BackupEntry={path:string;sha256:string;bytes:number};
export type RestoreFinding={code:string;path?:string;detail:string};
const digest=/^[a-f0-9]{64}$/i;
function safePath(path:unknown):path is string {
 return typeof path==='string'&&path.length>0&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes('\0')&&!/^[A-Za-z]:/.test(path)&&
  !path.split('/').some(part=>part===''||part==='.'||part==='..')&&!/[\x00-\x1f\x7f]/.test(path);
}
export function validateBackupManifest(expected:readonly BackupEntry[],actual:readonly BackupEntry[]):RestoreFinding[]{
 const out:RestoreFinding[]=[];const seen=new Set<string>();const map=new Map<string,BackupEntry>();
 for(const a of actual){if(!safePath(a.path))out.push({code:'UNSAFE_PATH',path:a.path,detail:'Unsafe archive entry path'});
  if(seen.has(a.path))out.push({code:'DUPLICATE_PATH',path:a.path,detail:'Duplicate archive entry'});seen.add(a.path);map.set(a.path,a);
  if(!digest.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<0)out.push({code:'INVALID_METADATA',path:a.path,detail:'Invalid checksum or size'});
 }
 const expectedNames=new Set<string>();for(const e of expected){
  if(!safePath(e.path))out.push({code:'UNSAFE_PATH',path:e.path,detail:'Unsafe expected manifest entry'});
  if(!digest.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<0)out.push({code:'INVALID_EXPECTED_METADATA',path:e.path,detail:'Invalid expected checksum or size'});
  if(expectedNames.has(e.path))out.push({code:'DUPLICATE_EXPECTED',path:e.path,detail:'Manifest duplicated a path'});expectedNames.add(e.path);
  const a=map.get(e.path);if(!a)out.push({code:'MISSING_ENTRY',path:e.path,detail:'Expected entry absent'});
  else if(a.sha256.toLowerCase()!==e.sha256.toLowerCase()||a.bytes!==e.bytes)out.push({code:'MISMATCH',path:e.path,detail:'Checksum or size mismatch'});
 }for(const a of actual)if(!expectedNames.has(a.path))out.push({code:'UNEXPECTED_ENTRY',path:a.path,detail:'Unexpected backup entry'});
 return out;
}
