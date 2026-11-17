import {createHash} from 'node:crypto';
import {openSync,readSync,writeFileSync,fstatSync,closeSync,constants,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,join,sep,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function inside(root,path){const rel=relative(root,path);return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep);}
function readRegular(path,maxBytes=64*1024*1024){
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maxBytes)throw Error('Invalid or oversized package file');
  const buffer=Buffer.alloc(stat.size+1);let total=0,count;
  while(total<buffer.length&&(count=readSync(fd,buffer,total,buffer.length-total,null))>0)total+=count;
  if(total!==stat.size)throw Error('Package source changed during read');
  return buffer.subarray(0,total);
 }finally{closeSync(fd);}
}
function walk(root,prefix=''){
 const entries=[];
 for(const item of readdirSync(join(root,prefix),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  const name=prefix?prefix+'/'+item.name:item.name;
  if(item.isSymbolicLink())throw Error('Package symlinks are forbidden');
  if(item.isDirectory())entries.push(...walk(root,name));
  else if(item.isFile())entries.push(name);
  else throw Error('Package contains a nonregular entry');
 }
 return entries.sort();
}
function safeName(name){return typeof name==='string'&&name.length>0&&!/[\x00-\x1f:]/.test(name)&&!name.includes('\\')&&!name.startsWith('/')&&!name.split('/').some(x=>x==='..'||x==='.'||!x);}
/** Package-declared license and exact top-level notice bytes. This neither
 * infers legal rights nor certifies that bundled assets have complete notices. */
export function inspectDependencyPackage(packageDirectory){
 const metadata=JSON.parse(readRegular(join(packageDirectory,'package.json'),1024*1024).toString('utf8'));
 const license=typeof metadata.license==='string'&&metadata.license.trim()?metadata.license:
  typeof metadata.license?.type==='string'&&metadata.license.type.trim()?metadata.license.type:'UNKNOWN';
 const notices=[];
 for(const entry of readdirSync(packageDirectory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  if(!/^(?:licen[sc]e|copying|notice|ofl)(?:[._-][a-z0-9_-]+)*$/i.test(entry.name))continue;
  if(!entry.isFile()||entry.isSymbolicLink())throw Error('Dependency notice must be a regular file');
  notices.push({name:entry.name,bytes:readRegular(join(packageDirectory,entry.name),1024*1024)});
 }
 return {license,notices};
}
function validateDependencyNotices(dependencies,names){
 if(!Array.isArray(dependencies))throw Error('Dependency inventory must be an array');
 const seen=new Set();
 for(const item of dependencies){
  if(!item||typeof item.name!=='string'||!item.name||typeof item.version!=='string'||!item.version||
    typeof item.license!=='string'||!item.license||!Array.isArray(item.noticeFiles))throw Error('Invalid declared dependency metadata');
  const key=item.name+'@'+item.version;if(seen.has(key))throw Error('Duplicate dependency identity');seen.add(key);
  for(const file of item.noticeFiles)if(!safeName(file)||!file.startsWith('notices/')||!names.has(file))throw Error('Missing or unsafe dependency notice reference');
 }
}
export function writeCheckpoint({output,source,files,dispositions,dependencies=[]}){
 if(existsSync(output))throw Error('Checkpoint output must not already exist');
 if(!/^[a-f0-9]{40}$/.test(source.sha)||!/^[a-f0-9]{40}$/.test(source.tree))throw Error('Exact source identity required');
 const seen=new Set(),entries=[];
 for(const file of files){
  if(!safeName(file.path)||seen.has(file.path)||file.path==='manifest.json')throw Error('Unsafe or duplicate package path');
  if(!/^(web\/|schema\/|requirements\/|toolchain\/|notices\/)/.test(file.path))throw Error('Unapproved package category');
  seen.add(file.path);
  if(!Buffer.isBuffer(file.bytes))throw Error('Package payload must be bytes');
  entries.push({path:file.path,bytes:file.bytes.length,sha256:hash(file.bytes)});
 }
 if(!seen.has('web/index.html')||!seen.has('web/sw.js'))throw Error('Built web application and service worker required');
 validateDependencyNotices(dependencies,seen);
 entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 mkdirSync(output,{recursive:false,mode:0o700});
 for(const file of files){
  const target=join(output,file.path);mkdirSync(dirname(target),{recursive:true,mode:0o700});
  writeFileSync(target,file.bytes,{flag:'wx',mode:0o600});
 }
 const manifest={
  formatVersion:1,kind:'tallybook-development-checkpoint',source,
  payload:'standalone-web-build-and-unapplied-schema-source',
  decision:'NO-GO',productionAuthorized:false,ownerAccepted:false,realDeviceTested:false,
  security:'Not certified by this packager; separate exact-SHA security evidence is mandatory.',
  reproducibility:'Hashes describe file contents; no human signature or provider/hardware acceptance.',
  licenseReview:'Declared package metadata and top-level notice files only; no legal approval or complete asset-rights audit.',
  dispositions,dependencies,files:entries
 };
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return manifest;
}
export function verifyCheckpoint(output){
 const manifest=JSON.parse(readRegular(join(output,'manifest.json')).toString('utf8'));
 if(manifest.formatVersion!==1||manifest.kind!=='tallybook-development-checkpoint'||manifest.decision!=='NO-GO'||
    manifest.productionAuthorized!==false||manifest.ownerAccepted!==false||manifest.realDeviceTested!==false||
    !Array.isArray(manifest.files)||!/^[a-f0-9]{40}$/.test(manifest.source?.sha??''))throw Error('Invalid checkpoint identity or approval claim');
 const names=new Set();
 for(const file of manifest.files){
  if(!safeName(file.path)||names.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256??'')||
    !Number.isSafeInteger(file.bytes)||file.bytes<0)throw Error('Invalid manifest file entry');
  names.add(file.path);const bytes=readRegular(join(output,file.path));
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Checkpoint checksum mismatch');
 }
 if(!names.has('web/index.html')||!names.has('web/sw.js'))throw Error('Incomplete web build');
 validateDependencyNotices(manifest.dependencies,names);
 const actual=walk(output);
 if(JSON.stringify(actual)!==JSON.stringify(['manifest.json',...names].sort()))throw Error('Unlisted checkpoint files');
 return manifest;
}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim();}
function cli(){
 const args=process.argv.slice(2),root=resolve('.');
 if(args[0]==='--verify'&&args.length===2){const m=verifyCheckpoint(resolve(args[1]));console.log(JSON.stringify({verified:true,sha:m.source.sha,files:m.files.length,decision:m.decision}));return;}
 if(args.length!==4||args[0]!=='--sha'||args[2]!=='--out')throw Error('Use --sha exact40 --out a-new-development-output-directory, or --verify directory');
 const sha=args[1],output=resolve(args[3]),allowed=resolve(root,'artifacts/release-v19');
 if(!inside(allowed,output))throw Error('Checkpoint output must be inside artifacts/release-v19');
 if(git(root,['rev-parse','HEAD'])!==sha||git(root,['status','--porcelain']))throw Error('Clean exact source checkout required');
 const source={sha,tree:git(root,['rev-parse','HEAD^{tree}']),committedAt:git(root,['show','-s','--format=%cI','HEAD']),
  node:process.version,pnpm:execFileSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['--version'],{encoding:'utf8'}).trim()};
 if(source.node!=='v24.19.0'||source.pnpm!=='10.34.0')throw Error('Pinned toolchain required');
 const files=[];
 const add=(path,sourcePath)=>files.push({path,bytes:readRegular(sourcePath)});
 for(const path of walk(join(root,'dist/public')))add('web/'+path,join(root,'dist/public',path));
 for(const path of walk(join(root,'supabase/migrations'))){
  if(!/^\d{14}_[A-Za-z0-9_]+\.sql$/.test(path))throw Error('Unexpected migration entry');
  add('schema/'+path,join(root,'supabase/migrations',path));
 }
 for(const path of ['road-to-complete.md','docs/release/ROAD_TO_COMPLETE_PROGRESS.json'])add('requirements/'+path.split('/').at(-1),join(root,path));
 for(const path of ['package.json','pnpm-lock.yaml','.node-version'])add('toolchain/'+path,join(root,path));
 const register=JSON.parse(readRegular(join(root,'docs/release/ROAD_TO_COMPLETE_PROGRESS.json')).toString('utf8'));
 if(register.tasks?.length!==119||new Set(register.tasks.map(x=>x.id)).size!==119)throw Error('Complete 119-task register required');
 const dispositions={};for(const task of register.tasks)dispositions[task.status]=(dispositions[task.status]??0)+1;
 const listed=JSON.parse(execFileSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['list','--prod','--depth','Infinity','--json'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}));
 const modules=new Map();
 function collect(item){
  for(const field of ['dependencies','optionalDependencies'])for(const [name,value]of Object.entries(item[field]??{})){
   if(typeof value.version!=='string')throw Error('Invalid dependency inventory');
   const key=name+'@'+value.version;
   if(!modules.has(key)){
    if(typeof value.path!=='string'||!inside(resolve(root,'node_modules'),resolve(value.path)))throw Error('Dependency package path is not in the frozen installation');
    const inspected=inspectDependencyPackage(value.path),noticeFiles=[];
    for(const notice of inspected.notices){
     const path='notices/'+encodeURIComponent(key)+'/'+notice.name;
     files.push({path,bytes:notice.bytes});noticeFiles.push(path);
    }
    modules.set(key,{name,version:value.version,license:inspected.license,noticeFiles});
   }
   collect(value);
  }
 }
 for(const item of listed)collect(item);
 const dependencies=[...modules.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version,'en'));
 if(!dependencies.length)throw Error('Production dependency inventory is empty');
 mkdirSync(dirname(output),{recursive:true});
 const manifest=writeCheckpoint({output,source,files,dispositions,dependencies});
 verifyCheckpoint(output);
 if(git(root,['rev-parse','HEAD'])!==sha||git(root,['status','--porcelain']))throw Error('Source changed while freezing checkpoint');
 console.log(JSON.stringify({sha,files:manifest.files.length,dependencies:dependencies.length,decision:'NO-GO',manifestSha256:hash(readRegular(join(output,'manifest.json')))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{cli();}catch(error){console.error('Checkpoint rejected: '+error.message);process.exitCode=1;}
