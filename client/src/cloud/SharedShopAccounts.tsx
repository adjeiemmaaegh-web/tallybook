/** Owner's accounts: where the money is, whether it matches what was counted, and what is owed each way. */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";
import { dayRange, type DatePreset } from "./salesFilters";
import { ACCOUNTS, ACCOUNT_HINT, ACCOUNT_LABEL, accountsCsv, describeDifference, getAccountTransfers, getAccountsOverview, getReconciliations, reconcileShopAccount,
  recordAccountTransfer, voidAccountTransfer, type AccountId, type AccountTransfer, type AccountsOverview, type Reconciliation } from "./accounts";
import type { ShopOverview } from "./shopClient";

const PERIODS: ReadonlyArray<{ id: Exclude<DatePreset, "all">; label: string }> = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "week", label: "Last 7 days" }, { id: "month", label: "This month" },
];
const fail = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

interface Props { companyId: string; overview: ShopOverview; online: boolean; shopName: string }
export function SharedShopAccounts({ companyId, overview, online, shopName }: Props) {
  const currency = overview.currency ?? "GHS";
  const m = (v: number) => formatMinorAmount(v, currency);
  const [period, setPeriod] = useState<Exclude<DatePreset, "all">>("today");
  const [data, setData] = useState<AccountsOverview | null>(null);
  const [counts, setCounts] = useState<Reconciliation[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [countNote, setCountNote] = useState<Record<string, string>>({});
  const [transfer, setTransfer] = useState({ from: "cash" as AccountId, to: "bank" as AccountId, amount: "", note: "" });
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const pending = useRef<Record<string, { id: string; body: string }>>({});

  const load = useCallback(async () => {
    if (!online) return;
    setError("");
    try {
      const [o, c, t] = await Promise.all([getAccountsOverview(companyId, dayRange(period) as { from: string; to: string }), getReconciliations(companyId), getAccountTransfers(companyId)]);
      setData(o); setCounts(c); setTransfers(t);
    } catch (cause) { setData(null); setError(fail(cause, "Could not load the accounts.")); }
  }, [companyId, period, online]);
  useEffect(() => { void load(); }, [load]);

  const submitCount = async (account: AccountId) => {
    setError(""); setNotice("");
    let actualMinor: number;
    try { actualMinor = parseAmountToMinor(counted[account] ?? "", currency); } catch (cause) { setError(fail(cause, "Enter the amount you counted.")); return; }
    if (actualMinor < 0) { setError("Enter the amount you counted, zero or more."); return; }
    const note = (countNote[account] ?? "").trim();
    const input = { account, actualMinor, ...(note ? { note } : {}) };
    const body = JSON.stringify(input);
    if (pending.current[account]?.body !== body) pending.current[account] = { id: crypto.randomUUID(), body };
    setBusy(true);
    try {
      const r = await reconcileShopAccount(companyId, { ...input, reconciliationId: pending.current[account].id });
      delete pending.current[account];
      setCounted(c => ({ ...c, [account]: "" })); setCountNote(c => ({ ...c, [account]: "" }));
      setNotice(r.opening ? `${ACCOUNT_LABEL[account]}: opening balance set to ${m(actualMinor)}. Later counts are checked against it.` : `${ACCOUNT_LABEL[account]}: ${describeDifference(Number(r.differenceMinor), currency)} (the records said ${m(Number(r.expectedMinor))}).`);
      await load();
    } catch (cause) { setError(fail(cause, "Could not save the count.")); } finally { setBusy(false); }
  };
  const submitTransfer = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    let amountMinor: number;
    try { amountMinor = parseAmountToMinor(transfer.amount, currency); } catch (cause) { setError(fail(cause, "Enter the amount.")); return; }
    if (amountMinor <= 0) { setError("Enter an amount above zero."); return; }
    if (transfer.from === transfer.to) { setError("Choose two different accounts."); return; }
    const input = { from: transfer.from, to: transfer.to, amountMinor, ...(transfer.note.trim() ? { note: transfer.note.trim() } : {}) };
    const body = JSON.stringify(input);
    if (pending.current.transfer?.body !== body) pending.current.transfer = { id: crypto.randomUUID(), body };
    setBusy(true);
    try {
      await recordAccountTransfer(companyId, { ...input, transferId: pending.current.transfer.id });
      delete pending.current.transfer; setTransfer(t => ({ ...t, amount: "", note: "" })); setNotice("Transfer recorded."); await load();
    } catch (cause) { setError(fail(cause, "Could not record the transfer.")); } finally { setBusy(false); }
  };
  const cancelTransfer = async (t: AccountTransfer, reasonText: string) => {
    const reason = reasonText.trim();
    if (reason.length < 4) { setError("Say why this transfer is being cancelled (at least 4 characters)."); return; }
    if (!(await confirmAction(`Cancel the ${m(t.amountMinor)} transfer from ${ACCOUNT_LABEL[t.from].toLowerCase()} to ${ACCOUNT_LABEL[t.to].toLowerCase()}? It stays on record and stops counting.`, { danger: true, confirmLabel: "Cancel transfer" }))) return;
    setBusy(true); setError("");
    try { await voidAccountTransfer(companyId, t.transferId, reason); setVoiding(null); await load(); }
    catch (cause) { setError(fail(cause, "Could not cancel the transfer.")); } finally { setBusy(false); }
  };
  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob(["﻿", accountsCsv(data, { shopName, periodLabel: PERIODS.find(p => p.id === period)!.label, currency })], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `tallybook-accounts-${period}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Spreadsheet downloaded.");
  };

  return <div className="shop-grid shop-grid-two">
    <section className="shop-card">
      <h2>Money by account</h2>
      <p className="shop-muted">What came in and went out of each account, from the records you already keep. Credit that customers have not paid yet is not money in any account.</p>
      <div className="shop-chips" role="group" aria-label="Period">
        {PERIODS.map(p => <button key={p.id} type="button" className="shop-chip" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div>
      {!online && <p role="status">Connect to the internet to see the accounts.</p>}
      {data && ACCOUNTS.map(id => { const a = data.accounts[id], c = a.components; return <div key={id} className="shop-account" aria-label={ACCOUNT_LABEL[id]}>
        <div className="shop-card-head"><h3>{ACCOUNT_LABEL[id]}</h3><strong>{a.netMinor >= 0 ? "+" : "−"}{m(Math.abs(a.netMinor))}</strong></div>
        <ul className="shop-report-list">
          <li><span>In: {m(a.inMinor)}</span><span /></li>
          {c.sales > 0 && <li><span>Sales</span><span>{m(c.sales)}</span></li>}
          {c.repayments > 0 && <li><span>Customer payments</span><span>{m(c.repayments)}</span></li>}
          {c.transfersIn > 0 && <li><span>Moved in</span><span>{m(c.transfersIn)}</span></li>}
          <li><span>Out: {m(a.outMinor)}</span><span /></li>
          {c.refunds > 0 && <li><span>Refunds</span><span>{m(c.refunds)}</span></li>}
          {c.suppliers > 0 && <li><span>Suppliers</span><span>{m(c.suppliers)}</span></li>}
          {c.expenses > 0 && <li><span>Expenses</span><span>{m(c.expenses)}</span></li>}
          {c.transfersOut > 0 && <li><span>Moved out</span><span>{m(c.transfersOut)}</span></li>}
        </ul>
        <p className="shop-muted">{a.lastReconciliation
          ? <>Last counted {new Date(a.lastReconciliation.asOf).toLocaleDateString()}: {m(a.lastReconciliation.actualMinor)} ({describeDifference(a.lastReconciliation.differenceMinor, currency)}). Should be about <strong>{m(a.expectedNowMinor ?? 0)}</strong> now.</>
          : "Not counted yet. Count it once to set its starting balance."}</p>
        <div className="shop-inline-form">
          <label className="shop-field">Counted now ({currency}) <small>({ACCOUNT_HINT[id]})</small>
            <input inputMode="decimal" value={counted[id] ?? ""} onChange={e => setCounted(c => ({ ...c, [id]: e.target.value }))} /></label>
          <button type="button" className="secondary-action" disabled={busy || !online || !(counted[id] ?? "").trim()} onClick={() => void submitCount(id)}>Save count</button>
        </div>
        {(counted[id] ?? "").trim() !== "" && <label className="shop-field">Note <small>(optional)</small><input value={countNote[id] ?? ""} maxLength={240} onChange={e => setCountNote(c => ({ ...c, [id]: e.target.value }))} /></label>}
      </div>; })}
      {notice && <p role="status" className="shop-muted">{notice}</p>}
      {error && <p role="alert" className="shop-alert">{error}</p>}
      {data && <div className="shop-actions"><button type="button" className="secondary-action" onClick={download}>Download spreadsheet</button></div>}
    </section>
    <section className="shop-card">
      <h2>What is owed, and stock</h2>
      {data ? <ul className="shop-report-list" aria-label="Position">
        <li><span>Customers owe you</span><strong>{m(data.position.customersOweMinor)}</strong></li>
        <li><span>You owe suppliers</span><strong>{m(data.position.oweSuppliersMinor)}</strong></li>
        <li><span>Stock at cost</span><strong>{m(data.position.stockAtCostMinor)}</strong></li></ul> : <p className="shop-muted">{online ? "Loading…" : ""}</p>}
      {data && data.position.stockLinesWithoutCost > 0 && <p className="shop-muted" role="note">{data.position.stockLinesWithoutCost} stock line{data.position.stockLinesWithoutCost === 1 ? " has" : "s have"} no cost recorded, so {data.position.stockLinesWithoutCost === 1 ? "it is" : "they are"} not in stock at cost. Add costs under Stock.</p>}
      <h2>Move money between accounts</h2>
      <p className="shop-muted">For example cash you took to the bank, or card payments that were paid into your bank.</p>
      <form className="shop-edit" onSubmit={e => void submitTransfer(e)}>
        <div className="shop-inline-form">
          <label className="shop-field">From<select value={transfer.from} onChange={e => setTransfer({ ...transfer, from: e.target.value as AccountId })}>{ACCOUNTS.map(a => <option key={a} value={a}>{ACCOUNT_LABEL[a]}</option>)}</select></label>
          <label className="shop-field">To<select value={transfer.to} onChange={e => setTransfer({ ...transfer, to: e.target.value as AccountId })}>{ACCOUNTS.map(a => <option key={a} value={a}>{ACCOUNT_LABEL[a]}</option>)}</select></label>
        </div>
        <label className="shop-field">Amount ({currency})<input inputMode="decimal" value={transfer.amount} onChange={e => setTransfer({ ...transfer, amount: e.target.value })} /></label>
        <label className="shop-field">Note <small>(optional)</small><input value={transfer.note} maxLength={240} onChange={e => setTransfer({ ...transfer, note: e.target.value })} /></label>
        <button className="primary-action" disabled={busy || !online || !transfer.amount.trim()}>Record transfer</button>
      </form>
      <ul className="shop-members">{transfers.slice(0, 8).map(t => <li key={t.transferId} className={t.voided ? "is-muted" : ""}>
        <div className="shop-member-head"><span><strong>{m(t.amountMinor)}</strong> · {ACCOUNT_LABEL[t.from]} → {ACCOUNT_LABEL[t.to]}
          <small> {new Date(t.recordedAt).toLocaleDateString()}{t.note ? ` · ${t.note}` : ""}</small></span>
          {t.voided ? <small>Cancelled: {t.voidReason}</small> : voiding?.id === t.transferId ? null
            : <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => { setError(""); setVoiding({ id: t.transferId, reason: "" }); }}>Cancel</button>}</div>
        {voiding?.id === t.transferId && <div className="shop-inline-form">
          <label className="shop-field">Why is this being cancelled?<input value={voiding.reason} maxLength={200} onChange={e => setVoiding({ id: t.transferId, reason: e.target.value })} /></label>
          <button type="button" className="secondary-action shop-danger" disabled={busy || !online} onClick={() => void cancelTransfer(t, voiding.reason)}>Cancel transfer</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => setVoiding(null)}>Keep it</button></div>}
      </li>)}</ul>
      {counts.length > 0 && <>
        <h2>Recent counts</h2>
        <ul className="shop-report-list" aria-label="Recent counts">{counts.slice(0, 6).map(c => <li key={c.reconciliationId}>
          <span>{ACCOUNT_LABEL[c.account]} · {new Date(c.asOf).toLocaleDateString()}{c.note ? ` · ${c.note}` : ""}</span><span>{m(c.actualMinor)} · {describeDifference(c.differenceMinor, currency)}</span></li>)}</ul></>}
    </section>
  </div>;
}
