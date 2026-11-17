import {chromium,firefox,webkit} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {release} from 'node:os';
const engines={edge:{engine:chromium,channel:'msedge'},chrome:{engine:chromium,channel:'chrome'},firefox:{engine:firefox},webkit:{engine:webkit}};
const project=process.argv[2];
if(!Object.hasOwn(engines,project))throw Error('Known browser project required');
const settings=engines[project],browser=await settings.engine.launch({headless:true,...(settings.channel?{channel:settings.channel}:{})});
try{
 const metadata={sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),project,
  browserVersion:browser.version(),platform:process.platform,osRelease:release(),architecture:process.arch,node:process.version,
  testScope:'Native IndexedDB migration, synthetic cash/credit/wallet conservation, retry/lock denial, two-tab storage, local account and public-entry regressions; provider/auth responses may be fixtures.',
  physicalDevice:false,realProviderVerified:false,realAuthenticationAccepted:false,
  safariApplicationTested:false,ownerAccepted:false,productionAuthorized:false,decision:'NO-GO'};
 const folder=resolve('artifacts/release-v19');mkdirSync(folder,{recursive:true});
 writeFileSync(resolve(folder,'device-'+project+'-metadata.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(metadata,null,2));
}finally{await browser.close();}
