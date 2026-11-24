/** ST24-05: shown INSTEAD of the app while the ledger is encrypted and locked. Nothing is read until it is unlocked. */
import { useState } from "react";
import { db } from "@/db/TallybookDB";
import {
  disableLedgerEncryption, importRecoveryPackage, resumeDataKeyRotation, resumeLedgerEncryption, unlockLedger, upgradeEncryptedLedger, type Credential, type LedgerStatus,
} from "@/features/security/st24LedgerSecurity";

type Mode = "passphrase" | "recovery";

export function LedgerUnlockScreen({ security, onChanged }: { security: LedgerStatus; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>("passphrase");
  const [secret, setSecret] = useState("");
  const [pkg, setPkg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const credential = (): Credential => (mode === "passphrase" ? { passphrase: secret } : { recoveryCode: secret.trim() });
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); setSecret(""); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not work. Nothing was changed."); }
    finally { setBusy(false); setProgress(null); }
  }
  const onProgress = (done: number, total: number) => setProgress(`${done} of ${total} records`);

  if (security.state === "schema-mismatch") return (
    <main className="mx-auto max-w-xl p-6" role="alert">
      <h1 className="text-xl font-semibold">This encrypted ledger needs the previous version</h1>
      <p className="mt-2 text-sm">{security.message}</p>
      <p className="mt-2 text-sm">Your records are safe and unchanged. Nothing was opened or modified.</p>
    </main>
  );

  const title = security.state === "orphaned" ? "Recover your encrypted ledger"
    : security.state === "migrating" ? "Finish turning on encryption"
    : security.state === "decrypting" ? "Finish turning off encryption"
    : security.state === "rekeying" ? "Finish changing the encryption key"
    : security.state === "schema-upgrade" ? "Update your encrypted records" : "Unlock Tallybook";
  const interrupted = security.state === "migrating" || security.state === "decrypting" || security.state === "rekeying";

  return (
    <main className="mx-auto max-w-xl p-6" aria-labelledby="ledger-unlock-title">
      <h1 id="ledger-unlock-title" className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm">
        {security.state === "orphaned" || security.state === "schema-upgrade"
          ? security.message
          : interrupted
          ? "A previous change was interrupted. Your records are intact and still readable. Enter your passphrase to finish it."
          : "Your records are encrypted on this device. Enter your passphrase to open them. Nothing is sent anywhere."}
      </p>

      {security.state === "orphaned" ? (
        <div className="mt-4 space-y-2">
          <label className="block text-sm"><span>Recovery package (the file you saved earlier)</span>
            <textarea aria-label="Recovery package" className="mt-1 w-full rounded border bg-background p-2 font-mono text-xs" rows={6} value={pkg} onChange={e => setPkg(e.target.value)} /></label>
          <button type="button" className="secondary-action min-h-11" disabled={busy || !pkg.trim()} onClick={() => void run(() => importRecoveryPackage(db, pkg))}>Use this recovery package</button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
          if (security.state === "migrating") await resumeLedgerEncryption(db, credential(), { onProgress });
          else if (security.state === "rekeying") await resumeDataKeyRotation(db, credential(), { onProgress });
          else if (security.state === "schema-upgrade") await upgradeEncryptedLedger(db, credential(), { onProgress });
          else if (security.state === "decrypting") { await unlockLedger(db, credential()); await disableLedgerEncryption(db, { onProgress }); }
          else await unlockLedger(db, credential());
        }); }}>
          <label className="block text-sm">
            <span>{mode === "passphrase" ? "Passphrase" : "Recovery code"}</span>
            <input aria-label={mode === "passphrase" ? "Passphrase" : "Recovery code"} className="mt-1 w-full rounded border bg-background p-3 min-h-11"
              type={mode === "passphrase" ? "password" : "text"} autoComplete="off" autoCapitalize="off" spellCheck={false}
              value={secret} onChange={e => setSecret(e.target.value)} />
          </label>
          <button type="submit" className="primary-action min-h-11" disabled={busy || secret.length === 0}>{busy ? "Working…" : interrupted ? "Finish" : security.state === "schema-upgrade" ? "Update and unlock" : "Unlock"}</button>
          <button type="button" className="secondary-action min-h-11 ml-2" disabled={busy} onClick={() => { setMode(mode === "passphrase" ? "recovery" : "passphrase"); setSecret(""); setError(null); }}>
            {mode === "passphrase" ? "I forgot my passphrase" : "Use my passphrase"}
          </button>
        </form>
      )}
      {progress ? <p className="mt-3 text-sm" role="status">Working: {progress}. Keep this page open.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <p className="mt-6 text-xs text-muted-foreground">
        Tallybook cannot reset a lost passphrase. If you also lost your recovery code, restore your most recent verified backup on a fresh install.
      </p>
    </main>
  );
}
