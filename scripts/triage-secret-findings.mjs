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
'client/src/features/reliability/integrity.test.ts','client/src/features/purchases/purchases.test.ts'
]);
export function classifyFinding(row){
 if(row?.RuleID!=='generic-api-key'||typeof row.Secret!=='string'||typeof row.Match!=='string')return 'unclassified';
 if(digestManifests.has(row.File)&&/^[a-f0-9]{64}$/.test(row.Secret))return 'candidate-sha256-manifest-value';
 if(row.File==='qa/branch-cleanup-manifest-20261113.json'&&/^[a-f0-9]{40}$/.test(row.Secret))return 'candidate-git-object-reference';
 if(row.File==='.env.txt'&&row.Secret.startsWith('sb_publishable_')&&/VITE_SUPABASE_PUBLISHABLE_KEY\s*=/.test(row.Match))return 'public-browser-publishable-key';
 if(fixtureFiles.has(row.File)&&/\bsubmissionKey\s*:\s*['"]/.test(row.Match))return 'candidate-nonauthentication-submission-id';
 return 'unclassified';
}
function main(){
 const [inputPath,outputPath]=process.argv.slice(2);
 if(!inputPath||!outputPath)throw Error('Expected ephemeral input and sanitized output paths');
 const rows=JSON.parse(readFileSync(inputPath,'utf8'));if(!Array.isArray(rows))throw Error('Invalid scanner result');
 const counts={},groups=new Map();
 const findings=rows.map(row=>{
  const classification=classifyFinding(row);counts[classification]=(counts[classification]??0)+1;
  const safe={ruleId:row.RuleID,file:row.File,line:row.StartLine,commit:row.Commit,fingerprint:row.Fingerprint,classification};
  const key=JSON.stringify([safe.file,classification]);const group=groups.get(key)??{file:safe.file,classification,count:0,lines:[]};
  group.count++;if(group.lines.length<12&&!group.lines.includes(safe.line))group.lines.push(safe.line);groups.set(key,group);return safe;
 });
 const report={mode:'observation-only-no-waivers',counts,findings};writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({mode:report.mode,counts,groups:[...groups.values()]},null,2));
 // Findings still fail the security gate, including candidate nonsecrets.
 if(rows.length)process.exitCode=1;
}
if(process.argv[1]?.endsWith('/triage-secret-findings.mjs'))main();
