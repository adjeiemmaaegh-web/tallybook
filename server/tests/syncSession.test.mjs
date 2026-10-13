import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySyncSession, authorizeActiveSyncSession, disabledSyncSessionStore } from '../syncSession.mjs';
const now = 1770000000000;
const secret = 'development-test-secret-not-for-production-123456789';
const claims = { v: 1, aud: 'tallybook-sync-session', actorId: 'user-a', sessionId: 'session-a', iat: now / 1000 - 10, exp: now / 1000 + 120 };
function token(value = claims, key = secret) { const body = Buffer.from(JSON.stringify(value)).toString('base64url'); return `Bearer ${body}.${createHmac('sha256', key).update(body).digest('base64url')}`; }
test('valid signed session identity', () => assert.deepEqual(verifySyncSession(token(), secret, now), {actorId:'user-a', sessionId:'session-a'}));
test('tampering is rejected', () => assert.throws(() => verifySyncSession(token().replace('Bearer ', 'Bearer X'), secret, now)));
test('wrong secret is rejected', () => assert.throws(() => verifySyncSession(token(), 'another-test-secret-at-least-32-chars-000', now)));
test('missing server secret denies closed', () => assert.throws(() => verifySyncSession(token(), '', now)));
test('expired session rejected', () => assert.throws(() => verifySyncSession(token({...claims, exp: now/1000-1}), secret, now)));
test('long-lived session rejected', () => assert.throws(() => verifySyncSession(token({...claims, exp: now/1000+3600}), secret, now)));
test('invalid identity rejected', () => assert.throws(() => verifySyncSession(token({...claims, actorId: '../escape'}), secret, now)));
test('server session revocation enforced', async () => { const verified = verifySyncSession(token(), secret, now); const store = {async getSession(id) {return {id, actorId:'user-a', status:'active'};}}; assert.equal(await authorizeActiveSyncSession(verified, store), 'user-a'); store.getSession = async id => ({id, actorId:'user-a', status:'revoked'}); await assert.rejects(authorizeActiveSyncSession(verified, store)); });
test('mismatched session owner denied', async () => assert.rejects(authorizeActiveSyncSession({actorId:'a',sessionId:'s'}, {async getSession(){return {id:'s',actorId:'b',status:'active'};}})));
test('unconfigured session store denies', async () => assert.rejects(authorizeActiveSyncSession({actorId:'a',sessionId:'s'}, disabledSyncSessionStore)));
