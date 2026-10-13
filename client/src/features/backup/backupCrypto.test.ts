import { describe, expect, it } from "vitest";
import { decryptBackupText, encryptBackupText, isEncryptedBackup } from "./backupCrypto";
import { MAX_BACKUP_JSON_BYTES, MAX_ENCRYPTED_BACKUP_BYTES } from "./backupResourceLimits.mjs";

describe("passphrase-encrypted backups", () => {
  it("round trips confidential JSON and rejects wrong passphrases", async () => {
    const plain = JSON.stringify({ customers: [{ name: "Private customer" }] });
    const encrypted = await encryptBackupText(plain, "a reasonably strong backup passphrase");
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(encrypted).not.toContain("Private customer");
    expect(await decryptBackupText(encrypted, "a reasonably strong backup passphrase")).toBe(plain);
    await expect(decryptBackupText(encrypted, "an incorrect backup passphrase")).rejects.toThrow();
  });
  it("rejects oversized plaintext before key derivation and oversized encrypted wrappers before parsing", async () => {
    const tooLarge = "é".repeat(MAX_BACKUP_JSON_BYTES / 2 + 1);
    await expect(encryptBackupText(tooLarge, "a reasonably strong backup passphrase")).rejects.toThrow(/64 MiB/);
    const bigEnvelope = "x".repeat(MAX_ENCRYPTED_BACKUP_BYTES + 1);
    await expect(decryptBackupText(bigEnvelope, "a reasonably strong backup passphrase")).rejects.toThrow(/96 MiB/);
  });
  it("preflights malformed envelope parameters before large base64 allocations", async () => {
    const base = {kind: "tallybook-encrypted-v1", salt: "A".repeat(1_000_000), iv: "AAAAAAAAAAAAAAAA", data: "AAAAAAAAAAAAAAAAAAAAAA=="};
    await expect(decryptBackupText(JSON.stringify(base), "a reasonably strong backup passphrase"))
      .rejects.toThrow(/salt or IV encoding/);
    await expect(decryptBackupText(JSON.stringify({...base, salt: "AAAAAAAAAAAAAAAAAAAAAA==", data: "AAAA"}), "a reasonably strong backup passphrase"))
      .rejects.toThrow(/ciphertext encoding/);
  });
  it("rejects authenticated invalid UTF-8 instead of silently changing a backup", async () => {
    const passphrase = "a reasonably strong backup passphrase";
    const salt = new Uint8Array(16).fill(3);
    const iv = new Uint8Array(12).fill(5);
    const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256"}, raw,
      {name: "AES-GCM", length: 256}, false, ["encrypt"]);
    const badJsonBytes = Uint8Array.from([123,34,120,34,58,34,255,34,125]);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, badJsonBytes));
    const to64 = (bytes: Uint8Array) => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(""));
    const envelope = JSON.stringify({kind: "tallybook-encrypted-v1",salt: to64(salt),iv: to64(iv),data: to64(cipher)});
    await expect(decryptBackupText(envelope,passphrase)).rejects.toThrow(/invalid UTF-8/);
  });

});
