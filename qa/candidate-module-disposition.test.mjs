import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import ts from 'typescript';

const root=process.cwd();
const registry=JSON.parse(readFileSync('docs/release/ROAD_TO_COMPLETE_CANDIDATES.json','utf8'));
const candidates=Array.from({length:5},(_,i)=>`candidate_modules/batch${i+1}`).flatMap(dir=>
  readdirSync(dir).filter(p=>/\.tsx?$/.test(p)).map(p=>`${dir}/${p}`)).sort();
test('every legacy candidate has an explicit disposition, surviving source and current authority',()=>{
  assert.deepEqual(registry.modules.map(m=>m.candidate).sort(),candidates);
  assert.equal(new Set(registry.modules.map(m=>m.candidate)).size,26);
  for(const row of registry.modules){
    assert.ok(existsSync(row.candidate),row.candidate);
    assert.ok(existsSync(row.authoritativeBoundary),row.authoritativeBoundary);
    assert.match(row.productionIntegrationDisposition,/retired-from-production-integration/);
    assert.match(row.remainingRequirement,/^ST(?:2[1-9]|3[0-2])-\d\d$/);
  }
});
test('production modules cannot silently import retired standalone candidate authorities',()=>{
  function scan(dir){
    for(const item of readdirSync(dir,{withFileTypes:true})){
      const path=resolve(dir,item.name);
      if(item.isDirectory()){scan(path);continue;}
      if(!/\.(?:[cm]?js|tsx?|[cm]ts)$/.test(item.name)||/\.(?:test|spec|d)\./.test(item.name)||path.includes('/test/'))continue;
      const imports=ts.preProcessFile(readFileSync(path,'utf8'),true,true).importedFiles;
      for(const {fileName} of imports){
        const target=fileName.startsWith('.')?resolve(dirname(path),fileName):
          fileName.startsWith('@/')?resolve('client/src',fileName.slice(2)):resolve(root,fileName);
        assert.ok(!target.startsWith(resolve('candidate_modules')+'/'),`${path} imports retired ${fileName}`);
      }
    }
  }
  for(const dir of ['client/src','server','shared'])if(existsSync(dir))scan(dir);
});
