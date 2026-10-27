import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { centralEventSigningBytes, verifyCentralSaleEvent } from '../centralEventTrust.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
function fixture() {
  const payload = { id: 'sale:s1', businessProfileId: 'biz1', operationId: 'sale:s1',
    entityId: 's1', kind: 'sale.completed', payloadVersion: 1, deliveryStatus: 'local_only',
    shopId: 'shop1', staffId: 'staff1', shiftId: 'shift1', deviceId: null,
    createdAt: '2026-10-24T12:00:00.000Z', payload: { sale: {
      id: 's1', businessProfileId: 'biz1', storeId: 'shop1', staffId: 'staff1',
      submissionKey: 'op1', receiptNumber: 'R1', totalMinor: 100, amountPaidMinor: 100, outstandingMinor: 0 },
      lines: [{ id: 'line1', saleId: 's1', businessProfileId: 'biz1', lineTotalMinor: 100 }],
      payment: { id: 'pay1', saleId: 's1', businessProfileId: 'biz1', amountMinor: 100 },
      receipt: { id: 'receipt1', saleId: 's1', businessProfileId: 'biz1', receiptNumber: 'R1' } } };
  const envelope = { version: 1, eventId: 'sale:s1', operationId: 'sale:s1',
    businessId: 'biz1', shopId: 'shop1', staffId: 'staff1', deviceId: 'device1',
    payloadBase64: Buffer.from(JSON.stringify(payload)).toString('base64url'), signature: '' };
  envelope.signature = sign(null, centralEventSigningBytes(envelope), privateKey).toString('base64url');
  const directory = {
    async getMembership(businessId, actorId) { return { businessId, actorId, staffId: 'staff1', role: 'attendant', active: true }; },
    async getDevice(businessId, id) { return { businessId, id, shopId: 'shop1', staffId:'staff1', actorId: 'user1', active: true, publicKeySpkiPem: pem }; },
    async getShop(businessId, id) { return { businessId, id, active: true }; },
    async getStaff(businessId, id) { return { businessId, id, active: true }; },
    async isAssigned() { return true; },
  };
  return { envelope, directory };
}
test('accepts only signed sale evidence bound to server membership, shop and device', async () => {
  const { envelope, directory } = fixture();
  const verified = await verifyCentralSaleEvent(envelope, 'user1', directory);
  assert.equal(verified.payloadSha256.length, 64);
  assert.equal(verified.actorId, 'user1');
  assert.equal(verified.financialPostingAllowed, false);
});
test('rejects forged shop, payload and unrelated authenticated user', async () => {
  const { envelope, directory } = fixture();
  await assert.rejects(verifyCentralSaleEvent({ ...envelope, shopId: 'shop2' }, 'user1', directory));
  const tampered = { ...envelope, payloadBase64: Buffer.from('{}').toString('base64url') };
  await assert.rejects(verifyCentralSaleEvent(tampered, 'user1', directory));
  await assert.rejects(verifyCentralSaleEvent(envelope, 'otherUser', directory));
});
test('rejects signed JSON with duplicate business keys', async () => {
  const { envelope, directory } = fixture();
  envelope.payloadBase64 = Buffer.from('{"businessProfileId":"biz1","businessProfileId":"biz2"}').toString('base64url');
  envelope.signature = sign(null, centralEventSigningBytes(envelope), privateKey).toString('base64url');
  await assert.rejects(verifyCentralSaleEvent(envelope, 'user1', directory));
});
test('rejects revoked device, removed membership and missing shop assignment', async () => {
  let x = fixture();
  x.directory.getDevice = async (businessId, id) => ({ businessId, id, shopId: 'shop1', actorId: 'user1', active: false, publicKeySpkiPem: pem });
  await assert.rejects(verifyCentralSaleEvent(x.envelope, 'user1', x.directory));
  x = fixture();
  x.directory.getMembership = async (businessId, actorId) => ({ businessId, actorId, staffId: 'staff1', role: 'attendant', active: false });
  await assert.rejects(verifyCentralSaleEvent(x.envelope, 'user1', x.directory));
  x = fixture(); x.directory.isAssigned = async () => false;
  await assert.rejects(verifyCentralSaleEvent(x.envelope, 'user1', x.directory));
  x = fixture();
  x.directory.getDevice=async(businessId,id)=>({businessId,id,shopId:'shop1',staffId:'staff2',
    actorId:'user1',active:true,publicKeySpkiPem:pem});
  await assert.rejects(verifyCentralSaleEvent(x.envelope,'user1',x.directory));
});
