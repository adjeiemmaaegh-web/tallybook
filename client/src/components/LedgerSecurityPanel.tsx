/** ST24-05: owner controls for at-rest encryption of this device's ledger. Off by default; every step is explicit. */
import { useCallback, useEffect, useState } from "react";
import { db } from "@/db/TallybookDB";
import {
  beginLedgerEncryption, changeLedgerPassphraseFor, disableLedgerEncryption, discardPreparedEncryption, exportRecoveryPackage,
  beginDataKeyRotation, discardPreparedRotation, lockLedger, prepareDataKeyRotation, prepareLedgerEncryption, prepareLedgerSecurity, rotateLedgerRecoveryCode,
  type LedgerStatus, type PreparedEncryption, type PreparedRotation,
} from "@/features/security/st24LedgerSecurity";
import { AUTO_LOCK_CHOICES, readAutoLockMinutes, saveAutoLockMinutes } from "@/features/security/ledgerAutoLock";

type Step = "idle" | "passphrase" | "code" | "confirm" | "working" | "done";

export function LedgerSecurityPanel({ onLocked }: { onLocked?: () => void }) {
  const [status, setStatus] = useState<LedgerStatus | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState("");
  const [prepared, setPrepared] = useState<PreparedEncryption | null>(null);
  const [typed, setTyped] = useState(""); const [saved, setSaved] = useState(false); const [backedUp, setBackedUp] = useState(false);
  const [otherCompanies, setOtherCompanies] = useState(false); const [companies, setCompanies] = useState(1);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [current, setCurrent] = useState(""); const [next, setNext] = useState("");
  const [autoLock, setAutoLock] = useState<number>(() => readAutoLockMinutes(db.name));
  // Data-key rotation (every record is re-encrypted under a brand-new key). Same careful steps as turning encryption on.
  const [rotation, setRotation] = useState<{ prepared: PreparedRotation; passphrase: string } | null>(null);
  const [rotTyped, setRotTyped] = useState(""); const [rotSaved, setRotSaved] = useState(false); const [rotBusy, setRotBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await prepareLedgerSecurity(db);
    setStatus(s); setCompanies(await db.businessProfiles.count().catch(() => 1));
  }, []);
  useEffect(() => { void refresh().catch(() => setError("Could not read the encryption status.")); }, [refresh]);

  const guard = async (fn: () => Promise<void>) => {
    setError(null); setNote(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work. Nothing was changed."); }
  };
  const cancel = () => { if (prepared) discardPreparedEncryption(prepared); setPrepared(null); setStep("idle"); setPass(""); setPass2(""); setTyped(""); setSaved(false); setBackedUp(false); };

  if (!status) return <section aria-label="Device encryption" className="rounded-xl border p-4"><p role="status">Checking encryption…</p></section>;
  const encrypted = status.state === "encrypted";

  return (
    <section aria-labelledby="ledger-security-title" className="rounded-xl border p-4 space-y-3">
      <h2 id="ledger-security-title" className="font-semibold">Encrypt this device</h2>
      <p className="text-sm">
        {encrypted
          ? "On. Your records are encrypted on this device and you unlock them with your passphrase when Tallybook opens."
          : "Off. Your records are stored on this device without encryption. Turn this on to protect customers, sales and stock if the phone is lost, stolen or shared."}
      </p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {note ? <p role="status" className="text-sm">{note}</p> : null}

      {!encrypted && step === "idle" && status.state === "plaintext" ? (
        <button type="button" className="primary-action min-h-11" onClick={() => setStep("passphrase")}>Turn on encryption</button>
      ) : null}
      {!encrypted && status.state !== "plaintext" ? <p className="text-sm" role="status">Encryption is mid-change ({status.state}). Reload to finish or unlock it.</p> : null}

      {step === "passphrase" ? (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void guard(async () => {
          if (pass !== pass2) throw new Error("The two passphrases do not match.");
          setPrepared(await prepareLedgerEncryption(db, pass)); setStep("code");
        }); }}>
          <p className="text-sm">Choose a passphrase of at least 12 characters (five random words is ideal). Tallybook cannot recover it for you.</p>
          <label className="block text-sm"><span>New passphrase</span><input aria-label="New passphrase" type="password" autoComplete="new-password" className="mt-1 w-full rounded border bg-background p-3 min-h-11" value={pass} onChange={e => setPass(e.target.value)} /></label>
          <label className="block text-sm"><span>Repeat passphrase</span><input aria-label="Repeat passphrase" type="password" autoComplete="new-password" className="mt-1 w-full rounded border bg-background p-3 min-h-11" value={pass2} onChange={e => setPass2(e.target.value)} /></label>
          <button type="submit" className="primary-action min-h-11" disabled={pass.length < 12}>Continue</button>{" "}
          <button type="button" className="secondary-action min-h-11" onClick={cancel}>Cancel</button>
        </form>
      ) : null}

      {step === "code" && prepared ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your recovery code. It is shown only once.</p>
          <p className="rounded border bg-muted p-3 font-mono text-sm break-all" aria-label="Recovery code" data-testid="recovery-code">{prepared.recoveryCode}</p>
          <p className="text-sm">If you forget your passphrase, this code unlocks your records. Write it down or store it in a password manager, away from this phone. Never share it.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved my recovery code somewhere safe.</label>
          <button type="button" className="primary-action min-h-11" disabled={!saved} onClick={() => setStep("confirm")}>Continue</button>{" "}
          <button type="button" className="secondary-action min-h-11" onClick={cancel}>Cancel</button>
        </div>
      ) : null}

      {step === "confirm" && prepared ? (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void guard(async () => {
          setStep("working");
          try {
            await beginLedgerEncryption(db, prepared, { typedRecoveryCode: typed, otherCompaniesBackedUp: otherCompanies, onProgress: (d, t) => setProgress(`${d} of ${t} records`) });
            setPrepared(null); setStep("done"); setNote("Encryption is on. Your records are now encrypted on this device."); await refresh();
          } catch (e) { setStep("confirm"); throw e; }
        }); }}>
          <label className="block text-sm"><span>Type your recovery code to prove you saved it</span><input aria-label="Type your recovery code" className="mt-1 w-full rounded border bg-background p-3 font-mono min-h-11" autoComplete="off" spellCheck={false} value={typed} onChange={e => setTyped(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} />I exported an encrypted backup and verified it on the Backup page.</label>
          {companies > 1 ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={otherCompanies} onChange={e => setOtherCompanies(e.target.checked)} />This phone has {companies} businesses. I backed up each one.</label> : null}
          <button type="submit" className="primary-action min-h-11" disabled={!backedUp || typed.length < 40 || (companies > 1 && !otherCompanies)}>Encrypt my records</button>{" "}
          <button type="button" className="secondary-action min-h-11" onClick={cancel}>Cancel</button>
        </form>
      ) : null}
      {step === "working" ? <p role="status" className="text-sm">Encrypting{progress ? `: ${progress}` : "…"}. Keep this page open. Your records stay readable throughout.</p> : null}

      {encrypted ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-action min-h-11" onClick={() => { lockLedger(db); onLocked?.(); }}>Lock now</button>
            <button type="button" className="secondary-action min-h-11" onClick={() => void guard(async () => {
              const text = await exportRecoveryPackage(db); const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
              const a = document.createElement("a"); a.href = url; a.download = "tallybook-recovery-package.json"; a.click(); URL.revokeObjectURL(url);
              setNote("Recovery package downloaded. It contains wrapped keys only and is useless without your passphrase or recovery code. Store it away from this phone.");
            })}>Download recovery package</button>
          </div>
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); void guard(async () => { await changeLedgerPassphraseFor(db, current, next); setCurrent(""); setNext(""); setNote("Passphrase changed. Your records were not re-encrypted; only the key lock changed."); }); }}>
            <label className="block text-sm"><span>Current passphrase</span><input aria-label="Current passphrase" type="password" autoComplete="current-password" className="mt-1 w-full rounded border bg-background p-3 min-h-11" value={current} onChange={e => setCurrent(e.target.value)} /></label>
            <label className="block text-sm"><span>New passphrase</span><input aria-label="Replacement passphrase" type="password" autoComplete="new-password" className="mt-1 w-full rounded border bg-background p-3 min-h-11" value={next} onChange={e => setNext(e.target.value)} /></label>
            <button type="submit" className="secondary-action min-h-11" disabled={!current || next.length < 12}>Change passphrase</button>{" "}
            <button type="button" className="secondary-action min-h-11" disabled={!current} onClick={() => void guard(async () => { setNewCode(await rotateLedgerRecoveryCode(db, current)); setNote("New recovery code created. The old code no longer works."); })}>Create a new recovery code</button>
          </form>
          {newCode ? <p className="rounded border bg-muted p-3 font-mono text-sm break-all" aria-label="New recovery code">{newCode}</p> : null}
          <label className="block text-sm"><span>Lock automatically after this much inactivity</span>
            <select aria-label="Lock automatically" className="mt-1 w-full rounded border bg-background p-3 min-h-11" value={autoLock}
              onChange={e => void guard(async () => { const m = Number(e.target.value); saveAutoLockMinutes(db.name, m); setAutoLock(m); setNote(m ? `Tallybook will lock after ${m} minute${m === 1 ? "" : "s"} without use.` : "Automatic locking is off. Use \"Lock now\" when you leave the device."); })}>
              {AUTO_LOCK_CHOICES.map(m => <option key={m} value={m}>{m === 0 ? "Never (not recommended)" : `${m} minute${m === 1 ? "" : "s"}`}</option>)}
            </select></label>
          <div className="space-y-2 rounded border p-3">
            <p className="text-sm font-medium">Change the encryption key</p>
            <p className="text-sm">Re-encrypts every record under a brand-new key and issues a new recovery code. Use it if you think a recovery code or an old copy of this phone's data was exposed. Your passphrase stays the same. The old recovery code stops working.</p>
            {!rotation ? (
              <button type="button" className="secondary-action min-h-11" disabled={!current} onClick={() => void guard(async () => {
                setRotation({ prepared: await prepareDataKeyRotation(db, current), passphrase: current }); setRotSaved(false); setRotTyped("");
              })}>Start key change (enter your current passphrase above)</button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Your NEW recovery code. It is shown only once.</p>
                <p className="rounded border bg-muted p-3 font-mono text-sm break-all" aria-label="New data key recovery code" data-testid="rotation-recovery-code">{rotation.prepared.recoveryCode}</p>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rotSaved} onChange={e => setRotSaved(e.target.checked)} />I saved the new recovery code. I understand the old one will stop working.</label>
                <label className="block text-sm"><span>Type the new recovery code</span><input aria-label="Type the new recovery code" className="mt-1 w-full rounded border bg-background p-3 font-mono min-h-11" autoComplete="off" spellCheck={false} value={rotTyped} onChange={e => setRotTyped(e.target.value)} /></label>
                <button type="button" className="primary-action min-h-11" disabled={!rotSaved || rotTyped.trim() !== rotation.prepared.recoveryCode || rotBusy} onClick={() => void guard(async () => {
                  setRotBusy(true);
                  try {
                    await beginDataKeyRotation(db, rotation.prepared, { passphrase: rotation.passphrase, typedRecoveryCode: rotTyped, onProgress: (d, t) => setProgress(`${d} of ${t} records`) });
                    setRotation(null); setCurrent(""); setProgress(null); setNote("Done. Every record is now encrypted under a new key and the new recovery code is active."); await refresh();
                  } finally { setRotBusy(false); }
                })}>Re-encrypt everything now</button>{" "}
                <button type="button" className="secondary-action min-h-11" disabled={rotBusy} onClick={() => { discardPreparedRotation(rotation.prepared); setRotation(null); }}>Cancel</button>
              </div>
            )}
          </div>
          <button type="button" className="danger-action min-h-11" onClick={() => void guard(async () => {
            if (!window.confirm("Turn encryption off? Your records will be stored without encryption on this phone.")) return;
            setProgress("starting"); await disableLedgerEncryption(db, { onProgress: (d, t) => setProgress(`${d} of ${t} records`) }); setProgress(null);
            setNote("Encryption is off. Your records are readable again."); await refresh();
          })}>Turn encryption off</button>
          {progress ? <p role="status" className="text-sm">Working: {progress}. Keep this page open.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
