// Hosted Vite deployment must not misrepresent disabled/unmounted /api routes
// as successful 200 HTML app-shell responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const rewrites=config.rewrites??[];
const matches=(route,source)=>new RegExp('^'+source+'$').test(route);

test('unmounted API endpoints are never caught by SPA HTML rewrites',()=>{
  assert.ok(rewrites.length>0,'SPA navigation still needs a catch-all');
  const target=path=>rewrites.find(r=>matches(path,r.source))?.destination??null;
  for(const path of ['/api','/api/','/api/sync/status','/api/run4/session/verify',
    '/api/central/sales','/api/run5/cloud/readiness']){
    assert.notEqual(target(path),'/index.html',path+' was falsely served as successful HTML');
  }
  for(const path of ['/','/welcome','/signin','/sales','/settings','/shop','/apiculture']){
    assert.equal(target(path),'/index.html',path+' lost the SPA fallback');
  }
});
test('production Vercel cannot silently auto-deploy the unaccepted QA branch',()=>{
  assert.equal(config.git?.deploymentEnabled,false);
});
