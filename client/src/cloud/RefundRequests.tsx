/** Refund requests: a cashier asks (RequestRefundForm, MyRefundRequests), the owner decides (OwnerRefundRequests).
 * Nothing moves until the owner approves; approving posts the real refund on the server in one step. */
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { approveRefundRequest, cancelRefundRequest, declineRefundRequest, describeItems, getMyRefundRequests, getRefundRequests, requestShopRefund,
  type RefundRequest } from "./refundRequestData";
import type { ShopOverview, ShopReceipt } from "./shopClient";

const when = (iso: string) => new Date(iso).toLocaleString();
const fail = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

/** Shown under one of the cashier's own sales. */
export function RequestRefundForm({ companyId, receipt, online, onSent }: { companyId: string; receipt: ShopReceipt; online: boolean; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [whole, setWhole] = useState(true);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const left = receipt.lines.map(l => ({ ...l, left: l.quantity - (l.refundedQuantity ?? 0) })).filter(l => l.left > 0);
  if (!left.length) return null;
  if (sent) return <p role="status" className="shop-muted">Request sent. The owner will decide; you can follow it under My refund requests.</p>;
  if (!open) return <button type="button" className="secondary-action" onClick={() => setOpen(true)}>Ask the owner for a refund</button>;
  const submit = async () => {
    setError("");
    if (!reason.trim()) { setError("Say why this should be refunded."); return; }
    let lines: Array<{ lineNo: number; quantity: number }> | undefined;
    if (!whole) {
      lines = left.filter(l => Number(qty[l.lineNo]) > 0).map(l => ({ lineNo: l.lineNo, quantity: Number(qty[l.lineNo]) }));
      if (!lines.length) { setError("Choose how many of at least one item."); return; }
      if (lines.some(l => !Number.isInteger(l.quantity) || l.quantity > left.find(x => x.lineNo === l.lineNo)!.left)) { setError("Choose a whole number that is no more than what was sold and not yet refunded."); return; }
    }
    const input = { saleId: receipt.saleId, reason: reason.trim(), returnToStock: restock, ...(lines ? { lines } : {}) };
    const body = JSON.stringify(input);
    if (pending.current?.body !== body) pending.current = { id: crypto.randomUUID(), body };
    setBusy(true);
    try { await requestShopRefund(companyId, { ...input, requestId: pending.current.id }); pending.current = null; setSent(true); onSent(); }
    catch (cause) { setError(fail(cause, "Could not send the request.")); } finally { setBusy(false); }
  };
  return <div className="shop-edit" aria-label="Refund request">
    <h3>Ask the owner for a refund</h3>
    <p className="shop-muted">Nothing is refunded until the owner approves.</p>
    <div className="shop-segment" role="group" aria-label="What to refund">
      <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>Whole sale</button>
      <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)}>Some items</button>
    </div>
    {!whole && left.map(l => <label key={l.lineNo} className="shop-field">{l.name} (up to {l.left})
      <input inputMode="numeric" value={qty[l.lineNo] ?? ""} onChange={e => setQty({ ...qty, [l.lineNo]: e.target.value })} /></label>)}
    <label className="shop-field">Why?<input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></label>
    <label className="shop-check"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />The goods can go back in stock</label>
    {error && <p role="alert" className="shop-alert">{error}</p>}
    <div className="shop-actions">
      <button type="button" className="primary-action" disabled={busy || !online} onClick={() => void submit()}>{busy ? "Sending…" : "Send request"}</button>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => setOpen(false)}>Not now</button>
    </div>
  </div>;
}

/** The cashier's own requests and what the owner decided. */
export function MyRefundRequests({ companyId, online, reloadKey }: { companyId: string; online: boolean; reloadKey?: number }) {
  const [rows, setRows] = useState<RefundRequest[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!online) return;
    try { setRows((await getMyRefundRequests(companyId)).requests); setError(""); } catch (cause) { setError(fail(cause, "Could not load your refund requests.")); }
  }, [companyId, online]);
  useEffect(() => { void load(); }, [load, reloadKey]);
  const cancel = async (id: string) => { try { await cancelRefundRequest(companyId, id); await load(); } catch (cause) { setError(fail(cause, "Could not cancel the request.")); } };
  if (!rows.length && !error) return null;
  const label = { pending: "Waiting for the owner", approved: "Refunded", declined: "Declined", cancelled: "Cancelled" } as const;
  return <section className="shop-card" aria-label="My refund requests">
    <h2>My refund requests</h2>
    <ul className="shop-members">{rows.slice(0, 10).map(r => <li key={r.requestId}>
      <div className="shop-member-head"><span><strong>Receipt #{r.receiptNumber}</strong> · {label[r.status]}
        <small> {describeItems(r)} · {r.reason}{r.decisionNote ? ` · Owner: ${r.decisionNote}` : ""}</small></span>
        {r.status === "pending" && <button type="button" className="secondary-action" disabled={!online} onClick={() => void cancel(r.requestId)}>Withdraw</button>}</div></li>)}</ul>
    {error && <p role="alert" className="shop-alert">{error}</p>}
  </section>;
}

/** The owner's decisions. */
export function OwnerRefundRequests({ companyId, overview, online, refresh, onChanged }: { companyId: string; overview: ShopOverview; online: boolean; refresh: () => Promise<void>; onChanged: () => void }) {
  const [rows, setRows] = useState<RefundRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const currency = overview.currency ?? "GHS";
  const who = (id?: string) => overview.members.find(m => m.userId === id)?.email ?? "An attendant";
  const load = useCallback(async () => {
    if (!online) return;
    try { setRows((await getRefundRequests(companyId)).requests); setLoaded(true); setError(""); } catch (cause) { setError(fail(cause, "Could not load refund requests.")); }
  }, [companyId, online]);
  useEffect(() => { void load(); }, [load]);
  const approve = async (r: RefundRequest) => {
    if (!(await confirmAction(`Refund ${describeItems(r).toLowerCase()} on receipt #${r.receiptNumber}? The refund is posted now${r.returnToStock ? " and the goods go back in stock" : ""}.`, { danger: true, confirmLabel: "Refund" }))) return;
    setBusy(r.requestId); setError(""); setDone("");
    try {
      const res = await approveRefundRequest(companyId, r.requestId);
      setDone(res.receipt ? `Refunded. Receipt #${r.receiptNumber} now shows ${formatMinorAmount(res.receipt.refundedMinor, currency)} refunded.` : "Refunded.");
      await load(); onChanged(); await refresh();
    } catch (cause) { setError(fail(cause, "Could not refund. The request is still waiting.")); } finally { setBusy(""); }
  };
  const decline = async (r: RefundRequest) => {
    setBusy(r.requestId); setError(""); setDone("");
    try { await declineRefundRequest(companyId, r.requestId, note[r.requestId] ?? ""); setDone("Request declined."); await load(); onChanged(); }
    catch (cause) { setError(fail(cause, "Could not decline the request.")); } finally { setBusy(""); }
  };
  return <section className="shop-card" aria-label="Refund requests">
    <h2>Refund requests</h2>
    <p className="shop-muted">Cashiers ask here; nothing is refunded until you approve. Your refund policy still applies.</p>
    {!online && <p role="status">Connect to the internet to see refund requests.</p>}
    {loaded && !rows.length && <p className="shop-muted">No requests are waiting.</p>}
    <ul className="shop-members">{rows.map(r => <li key={r.requestId}>
      <p><strong>Receipt #{r.receiptNumber}</strong> · {who(r.requestedBy)} · {when(r.createdAt)}</p>
      <p>{describeItems(r)} <small className="shop-muted">(sale total {formatMinorAmount(Number(r.totalMinor ?? 0), currency)}) · {r.returnToStock ? "back in stock" : "not restocked"}</small></p>
      <p className="shop-muted">“{r.reason}”</p>
      <label className="shop-field">Note to the cashier <small>(optional, if declining)</small>
        <input value={note[r.requestId] ?? ""} maxLength={200} onChange={e => setNote({ ...note, [r.requestId]: e.target.value })} /></label>
      <div className="shop-actions">
        <button type="button" className="primary-action" disabled={!!busy || !online} onClick={() => void approve(r)}>Approve and refund</button>
        <button type="button" className="secondary-action" disabled={!!busy || !online} onClick={() => void decline(r)}>Decline</button>
      </div></li>)}</ul>
    {done && <p role="status" className="shop-muted">{done}</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
  </section>;
}
