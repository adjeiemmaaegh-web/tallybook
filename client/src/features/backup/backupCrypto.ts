import { MAX_BACKUP_JSON_BYTES, MAX_ENCRYPTED_BACKUP_BYTES, MAX_ENCRYPTED_BACKUP_DATA_CHARS, assertPlainBackupSize, assertEncryptedBackupSize } from "./backupResourceLimits.mjs";
/** Optional passphrase encryption. Format uses PBKDF2-SHA256 and AES-256-GCM. */
const encoder = new TextEncoder();
// Never silently replace invalid UTF-8 inside authenticated financial backups.
const decoder = new TextDecoder("utf-8", { fatal: true });
const prefix = "tallybook-encrypted-v1";
function base64(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
function unbase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
/** Reject malformed metadata before atob() or PBKDF2 allocations. The salt and
 * nonce sizes have been fixed since encrypted-v1; changing them requires a new
 * authenticated envelope format, not a permissive decode of attacker input.
 */
function assertEnvelopeBase64(salt: string, iv: string, data: string): void {
  if (!/^[A-Za-z0-9+/]{22}==$/.test(salt) || !/^[A-Za-z0-9+/]{16}$/.test(iv))
    throw new Error("Invalid encrypted backup salt or IV encoding.");
  if (data.length < 24 || data.length % 4 !== 0)
    throw new Error("Invalid encrypted backup ciphertext encoding.");
  // Check the ciphertext in O(1) extra memory. Avoid potentially expensive
  // regex backtracking on an up-to-85 MiB attacker-controlled base64 string.
  const last = data.length - 1;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    const base64Char = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) || c === 43 || c === 47;
    if (!base64Char && !(c === 61 && i >= last - 1))
      throw new Error("Invalid encrypted backup ciphertext encoding.");
  }
  if (data[last - 2] === '=' || (data[last - 1] === '=' && data[last] !== '='))
    throw new Error("Invalid encrypted backup ciphertext encoding.");
  const padding = (data[last] === '=' ? 1 : 0) + (data[last - 1] === '=' ? 1 : 0);
  const decodedLength = (data.length / 4) * 3 - padding;
  if (decodedLength < 16 || decodedLength > MAX_BACKUP_JSON_BYTES + 16)
    throw new Error("Encrypted backup ciphertext exceeds the local backup limit or lacks an authentication tag.");
}
async function deriveKey(passphrase: string, salt: Uint8Array) {
  const raw = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 310000, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export function isEncryptedBackup(text: string): boolean {
  if (typeof text !== "string" || text.length > MAX_ENCRYPTED_BACKUP_BYTES) return false;
  // This helper also handles connected recovery payloads, not only File inputs.
  try { assertEncryptedBackupSize(text); return JSON.parse(text)?.kind === prefix; } catch { return false; }
}
export async function encryptBackupText(text: string, passphrase: string): Promise<string> {
  assertPlainBackupSize(text); // Before deriving a key or allocating ciphertext.
  if (passphrase.length < 12) throw new Error("Use a backup passphrase of at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text)));
  return assertEncryptedBackupSize(JSON.stringify({ kind: prefix, salt: base64(salt), iv: base64(iv), data: base64(cipher) }));
}
export async function decryptBackupText(text: string, passphrase: string): Promise<string> {
  assertEncryptedBackupSize(text); // Reject before JSON parse or base64 allocation.
  let wrapped: unknown;
  try { wrapped = JSON.parse(text); } catch { throw new Error("Invalid encrypted backup JSON."); }
  if (!wrapped || typeof wrapped !== "object" || Array.isArray(wrapped)) throw new Error("Not a supported encrypted backup.");
  const envelope = wrapped as Record<string, unknown>;
  if (envelope.kind !== prefix || typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.data !== "string") throw new Error("Not a supported encrypted backup.");
  if (envelope.data.length > MAX_ENCRYPTED_BACKUP_DATA_CHARS) throw new Error("Encrypted backup ciphertext exceeds the local backup limit.");
  assertEnvelopeBase64(envelope.salt, envelope.iv, envelope.data);
  let plaintext: ArrayBuffer;
  try {
    const salt = unbase64(envelope.salt), iv = unbase64(envelope.iv);
    if (base64(salt) !== envelope.salt || base64(iv) !== envelope.iv) throw new Error("Noncanonical encryption parameters.");
    const key = await deriveKey(passphrase, salt);
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, unbase64(envelope.data));
  } catch { throw new Error("Could not decrypt backup. Check the passphrase and file integrity."); }
  if (plaintext.byteLength > MAX_BACKUP_JSON_BYTES) throw new Error("Decrypted backup exceeds the 64 MiB JSON safety limit.");
  try { return decoder.decode(plaintext); }
  catch { throw new Error("Decrypted backup contains invalid UTF-8. No records were imported."); }
}
