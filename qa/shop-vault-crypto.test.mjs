import test from "node:test";
import assert from "node:assert/strict";
import {
  createShopVault, unlockShopVault, encryptQueuedSale, decryptQueuedSale
} from "../client/src/cloud/shopVaultCrypto.mjs";

const scope = { userId: "u_owner", companyId: "company_a" };
const other = { userId: "u_other", companyId: "company_a" };
const changedCompany = { userId: "u_owner", companyId: "company_b" };
const key1 = "StageBDeliveryKey00000000000001";
const key2 = "StageBDeliveryKey00000000000002";
const secret = "long random example 25 words / use a real passphrase";
const sale = {sale: {submissionKey: key1, storeId: "s1", lines: [{productId: "p1",quantity: 2}],
    paymentMethod: "cash", amountTenderedMinor: 2500 },
  status: "pending", summary: "Two tins of milk", queuedAt: "2026-11-06T00:00:00.000Z"};

test("vault requires a strong passphrase and stores no plaintext or passphrase in its descriptor", async () => {
  await assert.rejects(createShopVault(scope, "too-short"), /at least 12 characters/);
  const {descriptor,key} = await createShopVault(scope, secret);
  const text = JSON.stringify(descriptor);
  assert.equal(descriptor.kind, "tallybook.shared-shop.vault.v1");
  assert.ok(!text.includes(secret));
  assert.ok(!text.includes("Two tins"));
  assert.equal(key.extractable,false);
  await assert.rejects(crypto.subtle.exportKey("raw",key), /extractable/i);
});
test("AES-GCM encrypted sale round-trips with the same scoped passphrase", async () => {
  const {descriptor,key} = await createShopVault(scope, secret);
  const sealed = await encryptQueuedSale(scope,key1,key,sale);
  const unlocked = await unlockShopVault(scope,secret,descriptor);
  assert.deepEqual(await decryptQueuedSale(scope,key1,unlocked,sealed),sale);
  assert.ok(!JSON.stringify(sealed).includes("Two tins"));
});
test("wrong password, account and company fail closed", async () => {
  const {descriptor,key} = await createShopVault(scope, secret);
  const sealed = await encryptQueuedSale(scope,key1,key,sale);
  await assert.rejects(unlockShopVault(scope,"different but long passphrase",descriptor),/verification failed/);
  await assert.rejects(unlockShopVault(other,secret,descriptor),/verification failed/);
  await assert.rejects(unlockShopVault(changedCompany,secret,descriptor),/verification failed/);
  await assert.rejects(decryptQueuedSale(other,key1,key,sealed),/verification failed/);
  await assert.rejects(decryptQueuedSale(changedCompany,key1,key,sealed),/verification failed/);
  await assert.rejects(decryptQueuedSale(scope,key2,key,sealed),/verification failed/);
});
test("ciphertext modifications and malformed envelope never yield partial data", async () => {
  const {key} = await createShopVault(scope,secret);
  const sealed = await encryptQueuedSale(scope,key1,key,sale);
  const modified = { ...sealed, data: sealed.data.slice(0,-2) + "AA" };
  await assert.rejects(decryptQueuedSale(scope,key1,key,modified),/verification failed/);
  await assert.rejects(decryptQueuedSale(scope,key1,key,{...sealed, version: 2}),/verification failed/);
  await assert.rejects(decryptQueuedSale(scope,key1,key,{...sealed, newField: "anything"}),/verification failed/);
  await assert.rejects(decryptQueuedSale(scope,"bad",key,sealed),/verification failed/);
});
test("each encrypted record gets a distinct random nonce and ciphertext", async () => {
  const {key} = await createShopVault(scope,secret);
  const first = await encryptQueuedSale(scope,key1,key,sale);
  const second = await encryptQueuedSale(scope,key1,key,sale);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
});
test("vault descriptor tampering and excessive KDF claims are rejected before derivation", async () => {
  const {descriptor} = await createShopVault(scope,secret);
  await assert.rejects(unlockShopVault(scope,secret,{...descriptor, iterations: 999999999}),/verification failed/);
  await assert.rejects(unlockShopVault(scope,secret,{...descriptor, salt: "AA="}),/verification failed/);
  await assert.rejects(unlockShopVault(scope,secret,{...descriptor, extra: "a"}),/verification failed/);
});
