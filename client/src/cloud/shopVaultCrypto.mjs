/**
 * Stage B local encryption primitive for shared-shop queued sales.
 * This module does not persist a key or enable encryption by itself. The queue
 * must explicitly integrate it with safe migration and user-driven unlock.
 * AES-256-GCM with per-record random nonces and account/company/key-bound AAD.
 *
 * Threat model: accidental disk disclosure and cross-scope substitution.
 * No web application encryption can defeat active XSS or a compromised browser.
 * Lost passphrase = lost offline ciphertext; require recovery export before use.
 */
const KIND = "tallybook.shared-shop.vault.v1";
const PURPOSE = "tallybook.shared-shop.queue.v1";
const ITERATIONS = 310000;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const bytes = length => crypto.getRandomValues(new Uint8Array(length));
const encode = input => btoa(String.fromCharCode(...input));
const fail = () => { throw Error("Offline vault unlock or integrity verification failed."); };

function decode(text, size, max = size) {
  if (typeof text !== "string" || text.length > Math.ceil(max / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) fail();
  let result;
  try { result = Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
  catch { fail(); }
  if (result.length < size || result.length > max || encode(result) !== text) fail();
  return result;
}
function scopeKey(scope) {
  if (!scope || typeof scope !== "object" ||
      typeof scope.userId !== "string" || !scope.userId ||
      typeof scope.companyId !== "string" || !scope.companyId ||
      scope.userId.length > 128 || scope.companyId.length > 128) fail();
  return JSON.stringify([scope.userId, scope.companyId]);
}
function submissionKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value)) fail();
  return value;
}
function metadata(vault) {
  if (!vault || typeof vault !== "object" || Array.isArray(vault) ||
      Object.keys(vault).sort().join(",") !==
        ["check", "checkIv", "iterations", "kind", "salt"].sort().join(",") ||
      vault.kind !== KIND || vault.iterations !== ITERATIONS) fail();
  return { salt: decode(vault.salt, 16), iv: decode(vault.checkIv, 12),
    check: decode(vault.check, 16, 128) };
}
function aad(scope, key, part) {
  return encoder.encode(JSON.stringify([PURPOSE, scopeKey(scope), part, key]));
}
async function derive(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 1024) {
    throw Error("Use an offline vault passphrase of at least 12 characters.");
  }
  const base = await crypto.subtle.importKey(
    "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Caller must persist the descriptor, never the CryptoKey or passphrase. */
export async function createShopVault(scope, passphrase) {
  scopeKey(scope);
  const salt = bytes(16);
  const key = await derive(passphrase, salt);
  const iv = bytes(12);
  const check = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(scope, "check", "v1") },
    key, encoder.encode("TALLYBOOK_SHOP_VAULT_OK"));
  return {
    descriptor: {
      kind: KIND, iterations: ITERATIONS, salt: encode(salt),
      checkIv: encode(iv), check: encode(new Uint8Array(check))
    },
    key
  };
}

export async function unlockShopVault(scope, passphrase, descriptor) {
  const v = metadata(descriptor);
  const key = await derive(passphrase, v.salt);
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: v.iv, additionalData: aad(scope, "check", "v1") },
      key, v.check);
    if (decoder.decode(opened) !== "TALLYBOOK_SHOP_VAULT_OK") fail();
  } catch { fail(); }
  return key;
}

export async function encryptQueuedSale(scope, saleKey, key, payload) {
  submissionKey(saleKey);
  const data = encoder.encode(JSON.stringify(payload));
  if (data.length > 262144) throw Error("Queued sale is too large to encrypt safely.");
  const iv = bytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(scope, saleKey, "sale") },
    key, data);
  return { version: 1, iv: encode(iv), data: encode(new Uint8Array(encrypted)) };
}

export async function decryptQueuedSale(scope, saleKey, key, envelope) {
  submissionKey(saleKey);
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(",") !== ["data", "iv", "version"].join(",") ||
      envelope.version !== 1) fail();
  const iv = decode(envelope.iv, 12);
  const data = decode(envelope.data, 16, 262160);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad(scope, saleKey, "sale") },
      key, data);
    return JSON.parse(decoder.decode(plain));
  } catch { fail(); }
}
