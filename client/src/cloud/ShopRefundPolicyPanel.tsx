import { useEffect, useState, type FormEvent } from "react";
import {
  getShopRefundPolicyHistory, setShopRefundPolicy,
  type ShopRefundPolicy, type ShopRefundPolicyHistory
} from "./shopClient";

/** Owner-only settings. The server is the source of truth and authorizes
 * every change in the same business transaction as sales and refunds.
 */
export function ShopRefundPolicyPanel({
  companyId, current, online, onDone
}: {
  companyId: string; current?: ShopRefundPolicy; online: boolean; onDone: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(current?.enabled ?? false);
  const [full, setFull] = useState(current?.allowFullReversal ?? false);
  const [partial, setPartial] = useState(current?.allowPartialReturn ?? false);
  const [days, setDays] = useState(String(current?.maxAgeDays ?? 30));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<ShopRefundPolicyHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(current?.enabled ?? false);
    setFull(current?.allowFullReversal ?? false);
    setPartial(current?.allowPartialReturn ?? false);
    setDays(String(current?.maxAgeDays ?? 30));
    setHistory(null); setReason(""); setError(""); setSaved(false);
  }, [companyId, current?.revision, current?.enabled, current?.allowFullReversal,
      current?.allowPartialReturn, current?.maxAgeDays]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const maxAgeDays = Number(days);
    if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 3650) {
      setError("Choose a return window between 1 and 3650 days."); return;
    }
    if (reason.trim().length < 5 || reason.trim().length > 200) {
      setError("Explain the policy change in 5–200 characters."); return;
    }
    if (enabled && !full && !partial) {
      setError("Allow at least one return type, or disable refunds."); return;
    }
    if (!window.confirm("Save this business's new return policy? It applies to NEW sales, not older sales.")) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const updated = await setShopRefundPolicy(companyId, {
        enabled, allowFullReversal: enabled && full,
        allowPartialReturn: enabled && partial, maxAgeDays, reason: reason.trim()
      });
      setHistory(updated); setReason(""); setSaved(true);
      await onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the return policy.");
    } finally { setBusy(false); }
  };
  const loadHistory = async () => {
    setLoading(true); setError("");
    try { setHistory(await getShopRefundPolicyHistory(companyId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read policy history."); }
    finally { setLoading(false); }
  };

  return <section className="shop-card" aria-label="Return and refund policy">
    <h2>Returns and refunds</h2>
    <p className="shop-muted">
      Each business controls its own policy. Refunds are OFF unless the owner enables them.
      Changes are recorded as permanent revisions. New settings do not authorize an older sale
      that was sold under a different policy.
    </p>
    <form className="shop-edit" onSubmit={event => void save(event)}>
      <label className="shop-check">
        <input type="checkbox" checked={enabled} disabled={busy || !online}
          onChange={event => {
            const value = event.target.checked; setEnabled(value);
            if (!value) { setFull(false); setPartial(false); }
          }}/>
        Permit returns for eligible new sales
      </label>
      {enabled && <>
        <label className="shop-check">
          <input type="checkbox" checked={full} disabled={busy || !online}
            onChange={event => setFull(event.target.checked)} />
          Allow full sale reversal
        </label>
        <label className="shop-check">
          <input type="checkbox" checked={partial} disabled={busy || !online}
            onChange={event => setPartial(event.target.checked)} />
          Allow partial item returns
        </label>
      </>}
      <label className="shop-field">Maximum age of a return, in days
        <input type="number" min={1} max={3650} step={1} value={days}
          disabled={busy || !online} onChange={event => setDays(event.target.value)} required />
      </label>
      <label className="shop-field">Why is the owner changing this policy?
        <input value={reason} maxLength={200} required disabled={busy || !online}
          onChange={event => setReason(event.target.value)} />
      </label>
      <button className="primary-action" disabled={busy || !online}>
        {busy ? "Saving policy…" : "Save return policy"}
      </button>
    </form>
    <p className="shop-muted">Current revision: {current?.revision ?? 0}.
      Policies do not waive statutory consumer rights.
      A recorded card or mobile-money refund is NOT proof that a payment provider sent money.</p>
    <button type="button" className="secondary-action" disabled={loading || !online}
      onClick={() => void loadHistory()}>{loading ? "Loading…" : "View policy history"}</button>
    {saved && <p role="status">Business refund policy saved.</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
    {history && <ul className="shop-list">
      {history.history.map(row => <li key={row.revision}>
        Revision {row.revision} · {row.enabled ? "Returns allowed" : "No refunds"} ·
        {row.maxAgeDays} days · {row.reason} · {row.effectiveAt ? new Date(row.effectiveAt).toLocaleString() : ""}
      </li>)}
      {!history.history.length && <li>No policy revisions recorded.</li>}
    </ul>}
  </section>;
}
