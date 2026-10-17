/** Developer regression source: backup import may never exceed the
 * admitted device-specific byte budget, including actual file contents.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
 run18ImportMemoryLimit,assertRun18ImportAdmission,readRun18BoundedBackupFile
} from "../client/src/features/backup/run18ImportAdmission.mjs";
test("pre-read admission is stricter on reported low-memory systems",()=>{
 assert.equal(run18ImportMemoryLimit(1),12*1024*1024);
 assert.equal(run18ImportMemoryLimit(2),24*1024*1024);
 assert.equal(run18ImportMemoryLimit(4),48*1024*1024);
 assert.equal(run18ImportMemoryLimit(8),96*1024*1024);
 assert.throws(()=>assertRun18ImportAdmission(48*1024*1024+1,4),/limited available memory/i);
});
test("actual content cannot bypass a smaller reported device budget via forged File.size",async()=>{
 const large="x".repeat(12*1024*1024+1);
 await assert.rejects(()=>readRun18BoundedBackupFile({
  size:1,text:async()=>large
 },1),/actual backup bytes exceed/i);
});
test("rejected file is not opened or interpreted as financial data",async()=>{
 let called=false;
 await assert.rejects(()=>readRun18BoundedBackupFile({
  size:48*1024*1024+1,text:async()=>{called=true;return "safe";}
 },4),/limited available memory/i);
 assert.equal(called,false);
});
test("ordinary local file passes unchanged through the strict budget",async()=>{
 const expected='{"kind":"local-disposable-fixture"}';
 assert.equal(await readRun18BoundedBackupFile({
  size:expected.length,text:async()=>expected
 },2),expected);
});
