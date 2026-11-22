import { test, expect } from '@playwright/test';

async function virtualAuthenticator(page, opts = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'usb', hasResidentKey: false, hasUserVerification: true, isUserVerified: true,
    automaticPresenceSimulation: true, ...opts } });
  return { cdp, authenticatorId };
}
const run = (page, fn, arg) => page.evaluate(fn, arg);

test('security key: register, confirm, wrong authenticator, lockout-proof policy (simulated authenticator, not a physical key)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const { cdp, authenticatorId } = await virtualAuthenticator(page);

  const out = await run(page, async () => {
    const c = await import('/src/features/security/webauthnClient.ts');
    const biz = 'webauthn-' + crypto.randomUUID(); localStorage.removeItem('tallybook:security-keys:v1:' + biz);
    const log = {};
    log.supported = c.webauthnSupported();
    const reg = await c.registerSecurityKey({ businessId: biz, ownerId: 'owner-1', ownerName: 'Owner', label: 'Test key' });
    log.registered = !!reg.credentialId;
    log.confirm1 = await c.confirmWithSecurityKey({ businessId: biz });
    log.countAfter1 = c.loadStepUpState(biz).credentials[0].signCount;
    log.confirm2 = await c.confirmWithSecurityKey({ businessId: biz });
    log.countAfter2 = c.loadStepUpState(biz).credentials[0].signCount;
    try { await c.registerSecurityKey({ businessId: biz, ownerId: 'owner-1', ownerName: 'Owner' }); log.duplicate = 'allowed'; } catch (e) { log.duplicate = e.code ?? e.name; }
    log.requireOneKeyNoRecovery = c.setRequireSecurityKey({ businessId: biz }, true, false).ok;
    log.requireOneKeyWithRecovery = c.setRequireSecurityKey({ businessId: biz }, true, true).ok;
    const removed = c.forgetSecurityKey({ businessId: biz }, reg.credentialId);
    log.afterRemove = { count: c.loadStepUpState(biz).credentials.length, requireDropped: removed.requirementDropped === true, require: c.loadStepUpState(biz).requireForSensitive };
    try { await c.confirmWithSecurityKey({ businessId: biz }); log.noKeyConfirm = 'allowed'; } catch (e) { log.noKeyConfirm = e.code; }
    return { biz, log };
  });
  expect(out.log.supported).toBe(true);
  expect(out.log.registered).toBe(true);
  expect(out.log.confirm1).toBe(true);
  expect(out.log.confirm2).toBe(true);
  expect(out.log.countAfter2).toBeGreaterThanOrEqual(out.log.countAfter1);
  expect(out.log.duplicate).not.toBe('allowed');
  expect(out.log.requireOneKeyNoRecovery).toBe(false);   // one key and no recovery code would risk a lockout
  expect(out.log.requireOneKeyWithRecovery).toBe(true);
  expect(out.log.afterRemove).toEqual({ count: 0, requireDropped: true, require: false });
  expect(out.log.noKeyConfirm).toBe('no-credentials');

  // A different authenticator (the enrolled key is gone) cannot satisfy the step-up.
  const wrong = await run(page, async () => {
    const c = await import('/src/features/security/webauthnClient.ts');
    const biz = 'webauthn-' + crypto.randomUUID();
    await c.registerSecurityKey({ businessId: biz, ownerId: 'owner-1', ownerName: 'Owner' });
    return biz;
  });
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await virtualAuthenticator(page); // fresh authenticator with no credentials
  const denied = await run(page, async biz => {
    const c = await import('/src/features/security/webauthnClient.ts');
    try { await c.confirmWithSecurityKey({ businessId: biz }); return 'allowed'; } catch (e) { return e.code ?? e.name; }
  }, wrong);
  expect(denied).not.toBe('allowed');
});

test('a key without user verification is refused for sensitive operations', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await virtualAuthenticator(page, { hasUserVerification: false, isUserVerified: false });
  const r = await run(page, async () => {
    const c = await import('/src/features/security/webauthnClient.ts');
    try { await c.registerSecurityKey({ businessId: 'wa-' + crypto.randomUUID(), ownerId: 'o', ownerName: 'O' }); return 'allowed'; } catch (e) { return e.code ?? e.name; }
  });
  expect(r).not.toBe('allowed');
});
