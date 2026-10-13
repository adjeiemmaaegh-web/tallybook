import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { selectServerTransport } from '../syncHttps.mjs';

const handler = (_req, res) => res.end('transport-ok');
test('development HTTP works only without sensitive routes', () => {
  const {server, scheme} = selectServerTransport({mode:'http'}, handler);
  assert.equal(scheme, 'http'); server.close();
  for (const options of [{production:true}, {accessEnabled:true}, {backupUploadEnabled:true}])
    assert.throws(() => selectServerTransport({mode:'http', ...options}, handler), /require(s|d)?/i);
});
test('unknown mode and missing certificate fail closed', () => {
  assert.throws(() => selectServerTransport({mode:'auto'}, handler), /Invalid/);
  assert.throws(() => selectServerTransport({mode:'https'}, handler));
});
test('HTTPS starts and serves an actual TLS request', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(),'tallybook-https-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const keyFile = path.join(dir,'key.pem'), certFile = path.join(dir,'cert.pem');
  try {execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});} catch {t.skip('openssl unavailable');return;}
  chmodSync(keyFile,0o600); chmodSync(certFile,0o600);
  const {server,scheme} = selectServerTransport({mode:'https',certFile,keyFile,production:true,accessEnabled:true},handler);
  assert.equal(scheme,'https');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const response = await new Promise((resolve,reject)=>{
    https.get({hostname:'127.0.0.1',port:server.address().port,path:'/',rejectUnauthorized:false},res=>{
      let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data}));
    }).on('error',reject);
  });
  assert.deepEqual(response,{status:200,data:'transport-ok'});
  const badKey = path.join(dir,'badkey.pem'); writeFileSync(badKey,readFileSync(keyFile));chmodSync(badKey,0o666);
  assert.throws(()=>selectServerTransport({mode:'https',certFile,keyFile:badKey},handler),/writable/);
});
