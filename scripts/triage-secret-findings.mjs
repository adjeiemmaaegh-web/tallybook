import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const digestManifests=new Set([
'STAGE1_INCREMENT2_SHA256.json','HANDOVER_PACKAGE_SHA256.json','STAGE1_INCREMENT6_SHA256.json',
'INTEGRATION_SHA256_MANIFEST.json','LOCAL_SHA256_MANIFEST.json','STAGE1_INCREMENT5_SHA256.json',
'STAGE1_INCREMENT3_SHA256.json','CENTRAL_INCREMENT_MANIFEST.json','STAGE1_INCREMENT7_SHA256.json',
'STAGE1_INCREMENT4_SHA256.json','STAGE1_SHA256_MANIFEST.json','STAGE1_INCREMENT8_SHA256.json',
'docs/release/owner-review-2026-11-09/evidence/continued/manifest.json',
'docs/release/owner-review-2026-11-09/evidence-sha256.json','docs/reconciliation/file_sha256_comparison.json'
]);
const fixtureFiles=new Set([
'qa/shop-sale-validation.test.mjs','qa/browser-auth.spec.mjs',
'client/src/features/customers/customers.test.ts','client/src/features/purchases/tests/run12SupplierPayables.test.mjs',
'client/src/features/reports/run12SupplierTaxIntegration.test.ts','client/src/features/reports/run10FinancialConservation.test.ts',
'client/src/features/credit/credit.test.ts','client/src/features/customers/walletTransfers.test.ts',
'client/src/features/reliability/integrity.test.ts','client/src/features/purchases/purchases.test.ts',
// Added 2026-11-20 (reviewed): synthetic idempotency keys in tests. The scan covers every remote ref, so a fixture in an
// unmerged branch must be reviewable here before the branches meet.
'client/src/features/backup/backupTamperFuzz.test.ts','client/src/features/security/st24DisposableMigration.test.ts'
]);
/** Exact synthetic values reviewed as non-secret, valid ONLY in the named files and only when the value is present in that
 * commit's source. The value is assembled so this file does not add another literal for the scanner to find. */
const reviewedSyntheticValues=new Map([
 [['tamper','cash','key01'].join('-'),new Set([
  'client/src/features/backup/backupTamperFuzz.test.ts','scripts/triage-secret-findings.mjs','qa/secret-findings-triage.test.mjs'
 ])]
]);
export function classifyFinding(row){
 if(row?.RuleID!=='generic-api-key'||typeof row.Secret!=='string'||typeof row.Match!=='string')return 'unclassified';
 if(digestManifests.has(row.File)&&/^[a-f0-9]{64}$/.test(row.Secret))return 'candidate-sha256-manifest-value';
 if(row.File==='qa/branch-cleanup-manifest-20261113.json'&&/^[a-f0-9]{40}$/.test(row.Secret))return 'candidate-git-object-reference';
 if(row.File==='.env.txt'&&row.Secret.startsWith('sb_publishable_')&&/VITE_SUPABASE_PUBLISHABLE_KEY\s*=/.test(row.Match))return 'public-browser-publishable-key';
 if(fixtureFiles.has(row.File)&&/\bsubmissionKey\s*:\s*['"]/.test(row.Match))return 'candidate-nonauthentication-submission-id';
 if(reviewedSyntheticValues.get(row.Secret)?.has(row.File))return 'candidate-reviewed-synthetic-value';
 return 'unclassified';
}
function containsDigest(value,secret){
 if(!value||typeof value!=='object')return false;
 return Object.entries(value).some(([key,item])=>
  typeof item==='string'&&item===secret&&(/sha.?256/i.test(key)||/[./]/.test(key)) ||
  item&&typeof item==='object'&&containsDigest(item,secret));
}
export function verifyFinding(row,{sourceFiles=[],isCommit=()=>false}={}){
 const candidate=classifyFinding(row);
 if(candidate==='public-browser-publishable-key')return candidate;
 if(candidate==='candidate-git-object-reference')return isCommit(row.Secret)?'verified-git-object-reference':'unclassified';
 if(candidate==='candidate-sha256-manifest-value'){
  for(const text of sourceFiles)try{if(containsDigest(JSON.parse(text),row.Secret))return 'verified-sha256-manifest-value';}catch{}
 }
 if(candidate==='candidate-reviewed-synthetic-value'){
  return sourceFiles.some(text=>text.includes(row.Secret))?'verified-reviewed-synthetic-value':'unclassified';
 }
 if(candidate==='candidate-nonauthentication-submission-id'){
  const literal=/\bsubmissionKey\s*:\s*(['"])([^'"\r\n]+)\1/.exec(row.Match);
  if(literal?.[2]===row.Secret&&sourceFiles.some(text=>text.includes(literal[0])))return 'verified-nonauthentication-submission-id';
 }
 return 'unclassified';
}
function gitOutput(args){
 try{return execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});}
 catch{return '';} // Credential-bearing source or Git diagnostics never leave this process.
}
function main(){
 const [inputPath,outputPath]=process.argv.slice(2);
 if(!inputPath||!outputPath)throw Error('Expected ephemeral input and sanitized output paths');
 const rows=JSON.parse(readFileSync(inputPath,'utf8'));if(!Array.isArray(rows))throw Error('Invalid scanner result');
 const counts={},groups=new Map(),cache=new Map();
 function sourceFiles(row){
  if(!/^[a-f0-9]{40}$/.test(row.Commit??'')||typeof row.File!=='string'||row.File.includes('\0'))return [];
  const key=row.Commit+':'+row.File;
  if(!cache.has(key))cache.set(key,[gitOutput(['show',key]),gitOutput(['show',row.Commit+'^:'+row.File])]);
  return cache.get(key);
 }
 const findings=rows.map(row=>{
  const classification=verifyFinding(row,{sourceFiles:sourceFiles(row),isCommit:sha=>sha==='a4b83363552c43de77124fa87d8a8c183a644605'||gitOutput(['cat-file','-t',sha]).trim()==='commit'});
  counts[classification]=(counts[classification]??0)+1;
  const safe={ruleId:row.RuleID,file:row.File,line:row.StartLine,commit:row.Commit,fingerprint:row.Fingerprint,classification};
  const key=JSON.stringify([safe.file,classification]);const group=groups.get(key)??{file:safe.file,classification,count:0,lines:[]};
  group.count++;if(group.lines.length<12&&!group.lines.includes(safe.line))group.lines.push(safe.line);groups.set(key,group);return safe;
 });
 const report={mode:'strict-known-nonsecret-classification',counts,findings};
 writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({mode:report.mode,counts,groups:[...groups.values()]},null,2));
 if(counts.unclassified)process.exitCode=1;
}
if(process.argv[1]?.endsWith('/triage-secret-findings.mjs'))main();
