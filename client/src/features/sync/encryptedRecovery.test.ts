import { describe, it, expect } from "vitest";
import { inspectRecoveryPackage, sealRecoveryBackup } from "./encryptedRecovery";
import { BACKUP_KIND, BACKUP_FORMAT_VERSION } from "@/features/backup/backup";

describe("Stage 8 connected recovery package", () => {
  it("does not permit unencrypted or structurally invalid backups", async () => {
    const invalid = { kind: BACKUP_KIND, formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date().toISOString(), databaseSchemaVersion: 20, records: {} } as never;
    await expect(sealRecoveryBackup(invalid, "long safe passphrase for testing")).rejects.toThrow();
    await expect(inspectRecoveryPackage(JSON.stringify(invalid), "long safe passphrase for testing")).rejects.toThrow();
  });
  it("rejects changed encrypted bytes before attempting recovery", async () => {
    const payload = JSON.stringify({ kind: "tallybook-connected-recovery-v1", version: 1, payload: JSON.stringify({kind:"tallybook-encrypted-v1"}), ciphertextSha256: "0".repeat(64) });
    await expect(inspectRecoveryPackage(payload, "long safe passphrase for testing")).rejects.toThrow(/modified|damaged/);
  });
  it("rejects oversized recovery input", async () => {
    await expect(inspectRecoveryPackage("a".repeat(100 * 1024 * 1024 + 1), "long safe passphrase for testing")).rejects.toThrow(/100 MB/);
  });
});
