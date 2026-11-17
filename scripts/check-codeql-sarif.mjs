/** Enforce security severity from actual CodeQL SARIF, without printing source snippets. */
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function assessCodeqlSarif(document){
 if(document?.version!=='2.1.0'||!Array.isArray(document.runs)||!document.runs.length)
  throw Error('Missing or unsupported CodeQL SARIF runs.');
 const findings=[];
 for(const run of document.runs){
  const driver=run?.tool?.driver;
  if(!/CodeQL/i.test(driver?.name??'')||!Array.isArray(driver.rules)||!Array.isArray(run.results))
   throw Error('Incomplete CodeQL analyzer output.');
  for(const result of run.results){
   const componentIndex=result.rule?.toolComponent?.index;
   const component=componentIndex===undefined?driver:run.tool.extensions?.[componentIndex];
   const rules=component?.rules;
   const id=result.ruleId??result.rule?.id??rules?.[result.ruleIndex??result.rule?.index]?.id;
   const matches=Array.isArray(rules)?rules.filter(rule=>rule.id===id):[];
   if(typeof id!=='string'||!/^[A-Za-z0-9/_.-]{1,200}$/.test(id)||matches.length!==1){
    findings.push({ruleId:'unclassified',severity:null,category:'unknown'});continue;
   }
   const properties=matches[0].properties??{},raw=properties['security-severity'];
   const security=Array.isArray(properties.tags)&&properties.tags.includes('security');
   if(raw===undefined&&!security){findings.push({ruleId:id,severity:null,category:'non-security'});continue;}
   const severity=(typeof raw==='string'&&raw.trim()!=='')||typeof raw==='number'?Number(raw):NaN;
   if(!Number.isFinite(severity)||severity<0||severity>10){findings.push({ruleId:id,severity:null,category:'unknown'});continue;}
   findings.push({ruleId:id,severity,category:severity>=9?'critical':severity>=7?'high':severity>=4?'moderate':'low'});
  }
 }
 const counts=Object.fromEntries(['critical','high','moderate','low','non-security','unknown'].map(key=>[key,findings.filter(f=>f.category===key).length]));
 return {allowed:counts.critical===0&&counts.high===0&&counts.unknown===0,counts,findings};
}
export function assessCodeqlDirectory(directory){
 const files=[];
 function walk(folder){
  for(const entry of readdirSync(folder,{withFileTypes:true})){
   const path=join(folder,entry.name),stat=lstatSync(path);
   if(stat.isSymbolicLink())throw Error('Unexpected analyzer output symlink.');
   if(entry.isDirectory())walk(path);
   else if(entry.isFile()&&entry.name.endsWith('.sarif'))files.push(path);
  }
 }
 walk(resolve(directory));
 if(!files.length)throw Error('No CodeQL SARIF files were produced.');
 const results=files.sort().map(path=>assessCodeqlSarif(JSON.parse(readFileSync(path,'utf8'))));
 return {allowed:results.every(result=>result.allowed),files:files.length,counts:Object.fromEntries(['critical','high','moderate','low','non-security','unknown'].map(key=>[key,results.reduce((n,result)=>n+result.counts[key],0)]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const result=assessCodeqlDirectory(process.argv[2]??'artifacts/release-v19/codeql-results');console.log(JSON.stringify(result,null,2));if(!result.allowed)process.exitCode=1;}
 catch{console.error('CodeQL SARIF gate could not verify analyzer output.');process.exitCode=1;}
}
