import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../client/src/App.tsx',import.meta.url),'utf8');
const shell = readFileSync(new URL('../client/src/components/AppShell.tsx',import.meta.url),'utf8');
const auth = readFileSync(new URL('../client/src/auth/AuthGate.tsx',import.meta.url),'utf8');

test('premium shell account button opens real /account route, not local staff PIN',()=>{
 assert.match(shell, /href="\/account"\s+className="premium-header-account"/);
 assert.doesNotMatch(shell,/href="\/staff"\s+className="premium-header-account"/);
 assert.match(app,/<Route path="\/account" component=/);
});
test('auth boundary wraps providers before local ledger mounts',()=>{
 const gate=app.indexOf('<AuthGate '), db=app.indexOf('<DatabaseProvider>');
 assert.ok(gate>=0 && db>gate);
 assert.doesNotMatch(auth,/location!==['"]\/cloud-account['"]/);
 assert.match(auth,/useRun4CloudSession\(true\)/);
 assert.match(auth,/workspaceSnapshot/);
});
test('stage 9 account UI does not imply completed cloud synchronization',()=>{
 assert.match(app, /isSupabaseAuthPreviewEnabled\s*\?\s*SupabaseSignInPage\s*:\s*GoogleSignInPage/);
 assert.match(shell, /Records stay on this device/);
});

test('locked staff gate preserves account access without unlocking sales',()=>{
 assert.match(shell, /staffGate !== "open" && location !== "\/staff" && location !== "\/account"/);
 assert.match(shell, /aria-label="Open Tallybook account"/);
 assert.match(shell, /if \(staffGate !== "open"/);
 assert.match(app, /<Route path="\/sales" component=\{SalesPage\}/);
});
