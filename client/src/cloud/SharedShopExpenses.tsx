/** Owner-only: money spent running the shop. Records are never edited; a mistake is cancelled with a reason. */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, listShopExpenses, recordShopExpense, voidShopExpense,
  type ExpenseCategory, type ExpenseMethod, type ShopExpense } from "./shopExpenses";
import {ShopRejectedError,type ShopOverview} from "./shopClient";
import {summarizeExpenses,formatExactExpenseMinor} from "./shopReconciliationView";

const METHODS: Array<[ExpenseMethod, string]> = [["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"], ["bank", "Bank"]];
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const blank = () => ({ category: "transport" as ExpenseCategory, amount: "", method: "cash" as ExpenseMethod, date: today(), storeId: "", note: "" });

interface Props { companyId: string; overview: ShopOverview; online: boolean }
export function SharedShopExpenses({ companyId, overview, online }: Props) {
  const currency = overview.currency ?? "GHS";
  const [rows, setRows] = useState<ShopExpense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [historyQuery,setHistoryQuery]=useState("");
  const [historyFilter,setHistoryFilter]=useState<"all"|"active"|"cancelled">("all");
  const readGeneration=useRef(0);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The same id is reused until the server answers, so a dropped connection never records an expense twice.
  const pending = useRef<{ id: string; body: string } | null>(null);
  const load = useCallback(async () => {
    const mine=++readGeneration.current;
    setLoaded(false);
    if (!online){setRows([]);return;}
    try{
      const data=await listShopExpenses(companyId);
      if(mine!==readGeneration.current)return;
      setRows(data.expenses);setLoaded(true);setError("");
    }catch(cause){
      if(mine!==readGeneration.current)return;
      setRows([]);setError(cause instanceof Error ? cause.message : "Could not load expenses.");
    }
  }, [companyId, online]);
  useEffect(() => { void load(); return()=>{readGeneration.current++;}; }, [load]);
  const storeName = (id: string | null) => id ? overview.stores.find(s => s.id === id)?.name ?? "Store" : "Whole business";
  const money = (minor: string | number) => formatExactExpenseMinor(String(minor),currency);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    let amountMinor: number;
    try { amountMinor = parseAmountToMinor(form.amount, currency); } catch (cause) { setError(cause instanceof Error ? cause.message : "Enter the amount."); return; }
    if (amountMinor <= 0) { setError("Enter an amount above zero."); return; }
    const input = { category: form.category, amountMinor, method: form.method, expenseDate: form.date, ...(form.storeId ? { storeId: form.storeId } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}) };
    const body = JSON.stringify(input);
    if(pending.current && pending.current.body!==body){
      setError("An earlier expense may have been recorded. Retry the exact same details or reconcile the server ledger before entering a different expense.");return;
    }
    pending.current??={id:crypto.randomUUID(),body};
    setBusy(true);
    try {
      await recordShopExpense(companyId, { ...input, expenseId: pending.current.id });
      pending.current = null; setForm(blank()); setNotice("Expense recorded."); await load();
    } catch (cause) {
      if(cause instanceof ShopRejectedError)pending.current=null;
      setError(cause instanceof Error ? cause.message : "Could not record the expense.");
    } finally { setBusy(false); }
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
  const summary=summarizeExpenses(rows);
  const needle=historyQuery.trim().toLocaleLowerCase();
  const found=rows.filter(r=>(historyFilter==="all"||(historyFilter==="cancelled"?r.voided:!r.voided))&&
    (!needle||[r.expenseId,EXPENSE_LABELS[r.category],r.method,r.note??"",r.expenseDate,storeName(r.storeId)]
      .some(value=>value.toLocaleLowerCase().includes(needle))));
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
      <div className="shop-card-head"><h2>Recent expenses</h2>{loaded&&rows.length>0&&<p className="shop-muted">Counted: <strong>{summary.totalMinor===null?"Unavailable":money(summary.totalMinor)}</strong></p>}</div>
      {!online && <p className="shop-muted">Connect to the internet to see expenses.</p>}
      {!loaded&&online&&<p role="status" className="shop-muted">Expense history unavailable or loading. No zero-balance conclusion can be drawn.</p>}
      {loaded&&<div className="tb-ops-metrics" aria-label="Loaded expense summary">
        <div><span>Records loaded</span><strong>{summary.loaded}</strong></div>
        <div><span>Recorded</span><strong>{summary.active}</strong></div>
        <div><span>Cancelled</span><strong>{summary.voided}</strong></div>
        <div><span>Active total</span><strong>{summary.totalMinor===null?"Unavailable":money(summary.totalMinor)}</strong></div>
      </div>}
      {loaded&&rows.length===0&&<p className="shop-muted">No expenses recorded yet.</p>}
      {loaded&&rows.length>0&&<>
        <label className="shop-field">Search expenses<input type="search" maxLength={100} value={historyQuery}
          placeholder="Category, reference, note or store" onChange={e=>setHistoryQuery(e.target.value)}/></label>
        <div className="shop-chips" role="group" aria-label="Expense status">
          {([["all","All"],["active","Recorded"],["cancelled","Cancelled"]] as const).map(([id,label])=>
            <button type="button" className="shop-chip" key={id} aria-pressed={historyFilter===id}
              onClick={()=>setHistoryFilter(id)}>{label}</button>)}
        </div>
        <p className="shop-muted">{found.length} of {rows.length} loaded expense records shown. Totals reflect loaded records only.</p>
      </>}
      {loaded&&rows.length>0&&found.length===0&&<p role="status" className="shop-muted">No expenses match these filters. <button type="button" className="shop-link" onClick={()=>{setHistoryQuery("");setHistoryFilter("all");}}>Show all</button></p>}
      <ul className="shop-members">{loaded&&found.map(r => <li key={r.expenseId} className={r.voided ? "is-muted" : ""}>
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
