/** Stage 8: portable encrypted recovery package. No network, automatic upload or restore writes. */
import type { TallybookDB } from "@/db/TallybookDB";
import { createBackup, parseBackup, stringifyBackup, getBackupSummary, type BackupSummary, type TallybookBackup } from "@/features/backup/backup";
import { encryptBackupText, decryptBackupText, isEncryptedBackup } from "@/features/backup/backupCrypto";

const PACKAGE_KIND = "tallybook-connected-recovery-v1";
const encoder = new TextEncoder();
const LIMIT_BYTES = 100 * 1024 * 1024;
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2,"0")).join(""); }
async function digest(payload: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(payload)))); }
function assertLimit(text: string) { if (encoder.encode(text).byteLength > LIMIT_BYTES) throw new Error("Recovery package exceeds the 100 MB safety limit."); }

/** Encryption is mandatory for connected-recovery packages; users retain their own passphrase. */
export async function sealRecoveryBackup(backup: TallybookBackup, passphrase: string): Promise<string> {
  const validated = parseBackup(stringifyBackup(backup));
  const encryptedPayload = await encryptBackupText(stringifyBackup(validated), passphrase);
  assertLimit(encryptedPayload);
  return JSON.stringify({ kind: PACKAGE_KIND, version: 1, ciphertextSha256: await digest(encryptedPayload), payload: encryptedPayload });
}

/** Strictly validates authenticity and backup structure but NEVER mutates the local database. */
export async function inspectRecoveryPackage(serialized: string, passphrase: string): Promise<{backup: TallybookBackup; summary: BackupSummary}> {
  assertLimit(serialized);
  let wrapped: unknown;
  try { wrapped = JSON.parse(serialized); } catch { throw new Error("Invalid connected recovery package."); }
  if (!isObject(wrapped) || wrapped.kind !== PACKAGE_KIND || wrapped.version !== 1 || typeof wrapped.payload !== "string" || typeof wrapped.ciphertextSha256 !== "string" || !/^[a-f0-9]{64}$/.test(wrapped.ciphertextSha256)) throw new Error("Unsupported or damaged connected recovery package.");
  if (!isEncryptedBackup(wrapped.payload) || await digest(wrapped.payload) !== wrapped.ciphertextSha256) throw new Error("The encrypted recovery package was modified or damaged.");
  const plainText = await decryptBackupText(wrapped.payload, passphrase);
  assertLimit(plainText);
  const backup = parseBackup(plainText);
  return { backup, summary: getBackupSummary(backup) };
}

/** Explicit preparation requires company consent and an active local registration. */
export async function prepareConnectedRecovery(database: TallybookDB, businessId: string, deviceId: string, passphrase: string): Promise<string> {
  const [consent, device] = await Promise.all([database.syncConsents.get(businessId), database.syncDevices.get(deviceId)]);
  if (consent?.enabled !== true || !device || device.businessProfileId !== businessId || device.status !== "active") throw new Error("Connected recovery requires consent and an active registered device.");
  const backup = await createBackup(database);
  if (backup.records.businessProfiles.length !== 1 || backup.records.businessProfiles[0].id !== businessId) throw new Error("Active business changed during recovery preparation.");
  return sealRecoveryBackup(backup, passphrase);
}
