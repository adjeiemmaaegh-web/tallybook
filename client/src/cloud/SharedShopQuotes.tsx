/** Quotations: write one, share it, and turn it into a sale at the till. A quotation promises nothing and moves no stock or money. */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { openWhatsAppShare, shareBusinessText } from "@/features/sharing/businessSharing";
import { countryForCurrency } from "./shopReceiptText";
import { createShopQuotation, decideShopQuotation, formatQuotationText, isLive, listShopQuotations, STATUS_LABEL, type Quotation } from "./quotations";
import { permissionsOf, ShopRejectedError, type ShopOverview } from "./shopClient";
import {filterQuotations,type QuoteFilter} from "./shopReconciliationView";

export interface QuoteStart { quoteId: string; storeId: string | null; lines: Array<{ productId: string; quantity: number }>; customerName: string }
interface Props { companyId: string; overview: ShopOverview; online: boolean; shopName: string; userId: string; onStartSale: (start: QuoteStart) => void }
interface Line { productId: string; quantity: string }
const blankLine = (): Line => ({ productId: "", quantity: "1" });

export function SharedShopQuotes({ companyId, overview, online, shopName, userId, onStartSale }: Props) {
  const currency = overview.currency ?? "GHS";
  const owner = overview.role === "owner";
  const canUseCustomers = owner || permissionsOf(overview).canCredit;
  const stores = overview.stores.filter(s => s.status === "active");
  const products = overview.products.filter(p => p.active);
  const [rows, setRows] = useState<Quotation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<QuoteFilter>("all");
  const request=useRef(0);
  const [form, setForm] = useState({ customerId: "", customerName: "", storeId: stores[0]?.id ?? "", validDays: "14", note: "" });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const printRoot = useRef<HTMLDivElement>(null);
  const m = (v: number) => formatMinorAmount(v, currency);
  const load = useCallback(async () => {
    const mine=++request.current;
    setLoaded(false);
    if(!online){setRows([]);return;}
    try{
      const data=await listShopQuotations(companyId);
      if(mine!==request.current)return;
      setRows(data);setLoaded(true);setError("");
    }catch(cause){
      if(mine!==request.current)return;
      setRows([]);setError(cause instanceof Error ? cause.message : "Could not load quotations.");
    }
  }, [companyId, online]);
  useEffect(() => { void load(); return()=>{request.current++;}; }, [load]);

  const estimate = lines.reduce((n, l) => n + (products.find(p => p.id === l.productId)?.unitPriceMinor ?? 0) * (Number(l.quantity) || 0), 0);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    const chosen = lines.filter(l => l.productId);
    if (!chosen.length) { setError("Choose at least one item."); return; }
    if (new Set(chosen.map(l => l.productId)).size !== chosen.length) { setError("Each item can appear once. Change its quantity instead."); return; }
    const parsed = chosen.map(l => ({ productId: l.productId, quantity: Number(l.quantity) }));
    if (parsed.some(l => !/^[1-9][0-9]*$/.test(lines.find(item=>item.productId===l.productId)?.quantity??"") ||
        !Number.isSafeInteger(l.quantity) || l.quantity < 1 || l.quantity > 100000)) {
      setError("Quantities must be whole units from 1 to 100,000."); return;
    }
    if (!/^[1-9][0-9]*$/.test(form.validDays) || !Number.isSafeInteger(Number(form.validDays)) ||
        Number(form.validDays) > 90) {setError("Quotation validity must be between 1 and 90 whole days.");return;}
    if(!Number.isSafeInteger(estimate)){setError("Quotation estimate exceeds safe calculation precision.");return;}
    if (!form.customerId && !form.customerName.trim()) { setError("Say who the quotation is for."); return; }
    const input = { storeId: form.storeId || undefined, ...(form.customerId ? { customerId: form.customerId } : { customerName: form.customerName.trim() }),
      validDays: Number(form.validDays), ...(form.note.trim() ? { note: form.note.trim() } : {}), lines: parsed };
    const body = JSON.stringify(input);
    if(pending.current && pending.current.body!==body){
      setError("The previous quotation may already have been saved. Retry the exact same quotation or refresh the saved list before changing it.");return;
    }
    pending.current ??= {id:crypto.randomUUID(),body};
    setBusy(true);
    try {
      const r = await createShopQuotation(companyId, { ...input, quotationId: pending.current.id });
      pending.current = null; setLines([blankLine()]); setForm(f => ({ ...f, customerId: "", customerName: "", note: "" }));
      setNotice(`Quotation #${r.quoteNo} saved.`); await load();
    } catch (cause) {
      if(cause instanceof ShopRejectedError)pending.current=null;
      setError(cause instanceof Error ? cause.message : "Could not save the quotation.");
    } finally { setBusy(false); }
  };
  const decide = async (q: Quotation, decision: "accepted" | "declined" | "cancelled") => {
    if (decision !== "accepted" && !(await confirmAction(`${decision === "declined" ? "Mark" : "Cancel"} quotation #${q.quoteNo}${decision === "declined" ? " as declined" : ""}? It stays on record.`, { danger: true, confirmLabel: decision === "declined" ? "Declined" : "Cancel quotation" }))) return;
    setBusy(true); setError(""); setNotice("");
    try { await decideShopQuotation(companyId, q.quotationId, decision); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the quotation."); } finally { setBusy(false); }
  };
  const share = async (q: Quotation) => {
    const result = await shareBusinessText({ title: `Quotation #${q.quoteNo}`, text: formatQuotationText(shopName, q, currency) });
    setNotice(result === "shared" ? "Opened in your share options." : result === "copied" ? "Quotation copied. Paste it into a message." : result === "manual" ? "Could not share from this browser. Use Print." : "");
  };
  const whatsApp = (q: Quotation) => {
    const phone = overview.customers?.find(c => c.id === q.customerId)?.phone ?? null;
    setNotice(openWhatsAppShare(formatQuotationText(shopName, q, currency), phone, countryForCurrency(currency)) ? "Opened in WhatsApp. Press send there." : "WhatsApp could not open. Use Share instead.");
  };
  const print = (q: Quotation) => {
    setOpenId(q.quotationId);
    setTimeout(() => {
      const node = printRoot.current;
      if (!node || typeof window.print !== "function") { setNotice("Printing is not available in this browser. Use Share instead."); return; }
      node.setAttribute("data-printing", "true");
      const done = () => { node.removeAttribute("data-printing"); window.removeEventListener("afterprint", done); };
      window.addEventListener("afterprint", done);
      try { window.print(); } catch { done(); setNotice("The browser could not open printing. Use Share instead."); }
    }, 50);
  };
  const storeName = (id: string | null) => id ? overview.stores.find(s => s.id === id)?.name ?? "" : "";
  const startSale = (q: Quotation) => onStartSale({ quoteId: q.quotationId, storeId: q.storeId, customerName: q.customerName, lines: q.lines.map(l => ({ productId: l.productId, quantity: l.quantity })) });
  const filtered=loaded?filterQuotations(rows,statusFilter,search):[];
  const activeCount=rows.filter(q=>isLive(q)).length;
  const closedCount=rows.length-activeCount;

  return <div className="shop-grid shop-grid-two">
    <section className="shop-card">
      <h2>New quotation</h2>
      <p className="shop-muted">An offer of items and prices for a customer, good for a few days. It is not a sale: no stock is held and no money moves. Prices are today's prices.</p>
      <form className="shop-edit" onSubmit={e => void submit(e)}>
        {canUseCustomers && (overview.customers?.length ?? 0) > 0 && <label className="shop-field">Saved customer <small>(optional)</small>
          <select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}>
            <option value="">Someone else</option>{overview.customers!.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {!form.customerId && <label className="shop-field">Customer name<input value={form.customerName} maxLength={80} onChange={e => setForm({ ...form, customerName: e.target.value })} /></label>}
        {stores.length > 1 && <label className="shop-field">Store
          <select value={form.storeId} onChange={e => setForm({ ...form, storeId: e.target.value })}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        {lines.map((l, i) => <div key={i} className="shop-inline-form">
          <label className="shop-field">Item
            <select value={l.productId} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}>
              <option value="">Choose an item</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {m(p.unitPriceMinor)}</option>)}</select></label>
          <label className="shop-field">Qty<input inputMode="numeric" value={l.quantity} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></label>
          {lines.length > 1 && <button type="button" className="secondary-action" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>Remove</button>}
        </div>)}
        <button type="button" className="secondary-action" disabled={lines.length >= 50} onClick={() => setLines(ls => [...ls, blankLine()])}>Add another item</button>
        <label className="shop-field">Good for (days)<input inputMode="numeric" value={form.validDays} onChange={e => setForm({ ...form, validDays: e.target.value })} /></label>
        <label className="shop-field">Note <small>(optional)</small><input value={form.note} maxLength={240} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
        {estimate > 0 && Number.isSafeInteger(estimate) && <p className="shop-muted">About {m(estimate)} at today's prices. The saved quotation shows the exact total.</p>}
        <button className="primary-action" disabled={busy || !online}>{busy ? "Saving…" : "Save quotation"}</button>
      </form>
      {notice && <p role="status" className="shop-muted">{notice}</p>}
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
    <section className="shop-card">
      <h2>{owner ? "Quotations" : "My quotations"}</h2>
      {!online && <p role="status">Connect to the internet to see quotations.</p>}
      {!loaded&&online&&<p role="status">Quotation history is loading or unavailable; do not assume there are no offers.</p>}
      {loaded&&<div className="tb-ops-metrics" aria-label="Quotation summary">
        <div><span>Recent offers</span><strong>{rows.length}</strong></div>
        <div><span>Open or accepted</span><strong>{activeCount}</strong></div>
        <div><span>Closed or sold</span><strong>{closedCount}</strong></div>
      </div>}
      {loaded && !rows.length && <p className="shop-muted">No quotations yet.</p>}
      {loaded&&rows.length>0&&<div className="tb-ops-history-head">
        <label className="shop-field">Search quotations<input type="search" maxLength={80}
          value={search} placeholder="Customer, quotation # or status" onChange={e=>setSearch(e.target.value)}/></label>
        <div className="shop-chips" role="group" aria-label="Quotation status">
          {([["all","All"],["live","Open / accepted"],["closed","Closed / sold"]] as const)
           .map(([id,label])=><button type="button" className="shop-chip" key={id}
             aria-pressed={statusFilter===id} onClick={()=>setStatusFilter(id)}>{label}</button>)}
        </div>
        <p className="shop-muted">{filtered.length} of {rows.length} recent quotations shown. Server returns at most 50 recent records.</p>
      </div>}
      {loaded&&rows.length>0&&filtered.length===0&&<p role="status">No quotations match. <button type="button" className="shop-link" onClick={()=>{setSearch("");setStatusFilter("all");}}>Show all</button></p>}
      <ul className="shop-members">{filtered.map(q => <li key={q.quotationId}>
        <button type="button" className="shop-customer-row" aria-expanded={openId === q.quotationId} onClick={() => setOpenId(o => o === q.quotationId ? null : q.quotationId)}>
          <span><strong>#{q.quoteNo} · {q.customerName}</strong><small>{new Date(q.createdAt).toLocaleDateString()} · {STATUS_LABEL[q.status]}</small></span>
          <span>{m(q.totalMinor)}<small>until {new Date(q.validUntil + "T00:00:00").toLocaleDateString()}</small></span></button>
        {openId === q.quotationId && <div className="shop-quote" ref={printRoot} aria-label={`Quotation ${q.quoteNo}`}>
          <p className="shop-muted">{shopName}{storeName(q.storeId) ? ` · ${storeName(q.storeId)}` : ""} · for {q.customerName}</p>
          <ul>{q.lines.map(l => <li key={l.productId}><span>{l.quantity} × {l.name} @ {m(l.unitPriceMinor)}</span><span>{m(l.lineTotalMinor)}</span></li>)}</ul>
          <p className="shop-total"><span>Total</span><strong>{m(q.totalMinor)}</strong></p>
          {q.note && <p className="shop-muted">Note: {q.note}</p>}
          <div className="shop-actions shop-quote-actions">
            <button type="button" className="secondary-action" onClick={() => void share(q)}>Share</button>
            <button type="button" className="secondary-action" onClick={() => whatsApp(q)}>Send on WhatsApp</button>
            <button type="button" className="secondary-action" onClick={() => print(q)}>Print</button>
          </div>
          {isLive(q) && <div className="shop-actions shop-quote-actions">
            <button type="button" className="primary-action" disabled={busy} onClick={() => startSale(q)}>Start a sale from this</button>
            {q.status === "open" && <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => void decide(q, "accepted")}>Customer accepted</button>}
            {q.status === "open" && <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => void decide(q, "declined")}>Customer declined</button>}
            <button type="button" className="secondary-action shop-danger" disabled={busy || !online} onClick={() => void decide(q, "cancelled")}>Cancel</button>
          </div>}
          {owner && q.createdBy !== userId && <p className="shop-muted shop-quote-actions">Written by {overview.members.find(x => x.userId === q.createdBy)?.email ?? "a team member"}.</p>}
        </div>}
      </li>)}</ul>
    </section>
  </div>;
}
