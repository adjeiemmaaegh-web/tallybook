/** Owner-only: money spent running the shop. Records are never edited; a mistake is cancelled with a reason. */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, listShopExpenses, recordShopExpense, voidShopExpense,
  type ExpenseCategory, type ExpenseMethod, type ShopExpense } from "./shopExpenses";
import type { ShopOverview } from "./shopClient";

const METHODS: Array<[ExpenseMethod, string]> = [["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"], ["bank", "Bank"]];
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const blank = () => ({ category: "transport" as ExpenseCategory, amount: "", method: "cash" as ExpenseMethod, date: today(), storeId: "", note: "" });

interface Props { companyId: string; overview: ShopOverview; online: boolean }
export function SharedShopExpenses({ companyId, overview, online }: Props) {
  const currency = overview.currency ?? "GHS";
  const [rows, setRows] = useState<ShopExpense[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The same id is reused until the server answers, so a dropped connection never records an expense twice.
  const pending = useRef<{ id: string; body: string } | null>(null);
  const load = useCallback(async () => {
    if (!online) return;
    try { setRows((await listShopExpenses(companyId)).expenses); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load expenses."); }
  }, [companyId, online]);
  useEffect(() => { void load(); }, [load]);
  const storeName = (id: string | null) => id ? overview.stores.find(s => s.id === id)?.name ?? "Store" : "Whole business";
  const money = (minor: string | number) => formatMinorAmount(Number(minor), currency);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    let amountMinor: number;
    try { amountMinor = parseAmountToMinor(form.amount, currency); } catch (cause) { setError(cause instanceof Error ? cause.message : "Enter the amount."); return; }
    if (amountMinor <= 0) { setError("Enter an amount above zero."); return; }
    const input = { category: form.category, amountMinor, method: form.method, expenseDate: form.date, ...(form.storeId ? { storeId: form.storeId } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}) };
    const body = JSON.stringify(input);
    if (pending.current?.body !== body) pending.current = { id: crypto.randomUUID(), body };
    setBusy(true);
    try {
      await recordShopExpense(companyId, { ...input, expenseId: pending.current.id });
      pending.current = null; setForm(blank()); setNotice("Expense recorded."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record the expense."); } finally { setBusy(false); }
  };
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const cancel = async (row: ShopExpense, reasonText: string) => {
    const reason = reasonText.trim();
    if (reason.length < 4) { setError("Say why this expense is being cancelled (at least 4 characters)."); return; }
    if (!(await confirmAction(`Cancel this ${EXPENSE_LABELS[row.category].toLowerCase()} expense of ${money(row.amountMinor)}? It stays on record, marked cancelled, and no longer counts in reports.`, { danger: true, confirmLabel: "Cancel expense" }))) return;
    setBusy(true); setError(""); setNotice("");
    try { await voidShopExpense(companyId, row.expenseId, reason); setVoiding(null); setNotice("Expense cancelled."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel the expense."); } finally { setBusy(false); }
  };
  const total = rows.filter(r => !r.voided).reduce((n, r) => n + Number(r.amountMinor), 0);
  return <div className="shop-grid shop-grid-two">
    <section className="shop-card">
      <h2>Record an expense</h2>
      <p className="shop-muted">Money you spent running the shop. Cash expenses count as cash that left the till in the daily report.</p>
      <form className="shop-edit" onSubmit={e => void submit(e)}>
        <label className="shop-field">What for
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>)}</select></label>
        <label className="shop-field">Amount ({currency})<input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></label>
        <div className="shop-segment" role="group" aria-label="Paid by">
          {METHODS.map(([id, label]) => <button key={id} type="button" aria-pressed={form.method === id} onClick={() => setForm({ ...form, method: id })}>{label}</button>)}</div>
        <label className="shop-field">Date<input type="date" value={form.date} max={today()} onChange={e => setForm({ ...form, date: e.target.value })} required /></label>
        {overview.stores.length > 0 && <label className="shop-field">Store <small>(optional)</small>
          <select value={form.storeId} onChange={e => setForm({ ...form, storeId: e.target.value })}>
            <option value="">Whole business</option>{overview.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <label className="shop-field">Note <small>(optional)</small><input value={form.note} maxLength={240} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
        <button className="primary-action" disabled={busy || !online || !form.amount.trim()}>{busy ? "Saving…" : "Record expense"}</button>
      </form>
      {notice && <p role="status" className="shop-muted">{notice}</p>}
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
    <section className="shop-card">
      <div className="shop-card-head"><h2>Recent expenses</h2>{rows.length > 0 && <p className="shop-muted">Counted: <strong>{money(total)}</strong></p>}</div>
      {!rows.length && <p className="shop-muted">{online ? "No expenses recorded yet." : "Connect to the internet to see expenses."}</p>}
      <ul className="shop-members">{rows.map(r => <li key={r.expenseId} className={r.voided ? "is-muted" : ""}>
        <div className="shop-member-head">
          <span><strong>{EXPENSE_LABELS[r.category]}</strong> · {money(r.amountMinor)}
            <small> {METHODS.find(([id]) => id === r.method)?.[1]} · {storeName(r.storeId)} · {new Date(r.expenseDate + "T00:00:00").toLocaleDateString()}{r.note ? ` · ${r.note}` : ""}</small></span>
          {r.voided ? <small>Cancelled: {r.voidReason}</small>
            : voiding?.id === r.expenseId ? null
            : <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => { setError(""); setVoiding({ id: r.expenseId, reason: "" }); }}>Cancel</button>}
        </div>
        {voiding?.id === r.expenseId && <div className="shop-inline-form">
          <label className="shop-field">Why is this being cancelled?
            <input value={voiding.reason} maxLength={200} onChange={e => setVoiding({ id: r.expenseId, reason: e.target.value })} /></label>
          <button type="button" className="secondary-action shop-danger" disabled={busy || !online} onClick={() => void cancel(r, voiding.reason)}>Cancel expense</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => setVoiding(null)}>Keep it</button>
        </div>}</li>)}</ul>
    </section>
  </div>;
}
