/** Owner panel for the OPTIONAL security key: add, list, remove, and require it for sensitive operations.
 *  A key never replaces the passphrase or recovery code, and it cannot be required unless a lockout is impossible. */
import { useState } from "react";
import { forgetSecurityKey, loadStepUpState, registerSecurityKey, setRequireSecurityKey, webauthnSupported } from "@/features/security/webauthnClient";
import { canRequireSecurityKey } from "@/features/security/webauthnStepUp.mjs";

export function SecurityKeysPanel({ businessId, ownerName, recoveryCodeConfigured = true }: { businessId: string; ownerName: string; recoveryCodeConfigured?: boolean }) {
  const [state, setState] = useState(() => loadStepUpState(businessId));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const refresh = () => setState(loadStepUpState(businessId));
  const run = async (f: () => Promise<void> | void) => { setBusy(true); setError(null); setNote(null); try { await f(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); refresh(); } };
  const supported = webauthnSupported();
  const can = canRequireSecurityKey({ ...state, recoveryCodeConfigured });
  return (
    <section className="space-y-3 rounded border p-3" aria-labelledby="security-keys-heading">
      <h3 id="security-keys-heading" className="text-base font-semibold">Security key (optional)</h3>
      <p className="text-sm">Add a hardware security key or phone/computer passkey to protect sensitive actions such as changing the encryption key or turning encryption off. Your passphrase and recovery code keep working, so losing a key never locks you out.</p>
      {!supported ? <p className="text-sm" role="status">This browser does not support security keys.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {note ? <p role="status" className="text-sm">{note}</p> : null}
      <ul className="space-y-2">
        {state.credentials.map(k => (
          <li key={k.credentialId} className="flex items-center justify-between gap-2 text-sm">
            <span>{k.label ?? "Security key"}{k.addedAt ? ` · added ${k.addedAt.slice(0, 10)}` : ""}</span>
            <button type="button" className="secondary-action min-h-11" disabled={busy} onClick={() => void run(() => {
              if (!window.confirm("Remove this security key?")) return;
              const r = forgetSecurityKey({ businessId }, k.credentialId);
              setNote(r.requirementDropped ? "Key removed. Because no other way remained to satisfy the requirement, “require a key” was switched off." : "Key removed.");
            })}>Remove</button>
          </li>
        ))}
        {!state.credentials.length ? <li className="text-sm">No security key added.</li> : null}
      </ul>
      <button type="button" className="secondary-action min-h-11" disabled={busy || !supported} onClick={() => void run(async () => {
        await registerSecurityKey({ businessId, ownerId: businessId, ownerName, label: `Security key ${state.credentials.length + 1}` }); setNote("Security key added.");
      })}>Add a security key</button>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={state.requireForSensitive} disabled={busy || (!state.requireForSensitive && !can.ok)}
          onChange={e => void run(() => { const r = setRequireSecurityKey({ businessId }, e.target.checked, recoveryCodeConfigured); if (!r.ok) throw new Error(r.reason); })} />
        <span>Require my security key (or recovery code) for sensitive actions{!state.requireForSensitive && !can.ok ? ` — ${can.reason}` : ""}</span>
      </label>
    </section>
  );
}
