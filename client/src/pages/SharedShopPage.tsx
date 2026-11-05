/**
 * Shared shop: the owner-to-attendant workspace backed by the cloud ledger.
 * Owners set up stores, products, stock and their team. Attendants sell only
 * in stores they are assigned to. Every rule is enforced by the server; this
 * screen only presents it. Sales are queued write-ahead, so a dropped
 * connection never loses or duplicates a sale.
 */
import "./sharedShop.css";
import { ArrowLeft, Check, CloudOff, Copy, Minus, Plus, ReceiptText, RefreshCw, Store, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { listVerifiedCloudBusinesses } from "@/cloud/cloudMembership";
import { Run18UpdateNotice } from "@/components/Run18UpdateNotice";
import { acceptCloudInvitation, revokeCloudAttendant, revokeCloudInvitation } from "@/cloud/run3MembershipClient";
import {
  adjustShopStock, assignShopStore, getShopOverview, inviteShopAttendant, listShopSales, newSubmissionKey,
  recordShopSale, saveShopProduct, saveShopStore, setShopStoreStatus, setupShopLedger,
  type PaymentMethod, type ShopOverview, type ShopReceipt,
} from "@/cloud/shopClient";
import { dismissQueuedSale, flushOutbox, readOutbox, submitSale, type OutboxScope, type QueuedSale } from "@/cloud/shopOutbox";
import { currencies } from "@/features/business/businessProfile";
import { currencyMinorDivisor, formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";

interface Business { id: string; name: string; role: "owner" | "attendant" }
type Tab = "sell" | "stock" | "team" | "sales";

const CACHE = "tallybook.shop.cache.v1:";
function readCache(userId: string): { businesses: Business[]; overviews: Record<string, ShopOverview> } {
  try { return JSON.parse(localStorage.getItem(CACHE + userId) ?? "") ?? { businesses: [], overviews: {} }; }
  catch { return { businesses: [], overviews: {} }; }
}
function writeCache(userId: string, change: (cache: ReturnType<typeof readCache>) => void) {
  try { const cache = readCache(userId); change(cache); localStorage.setItem(CACHE + userId, JSON.stringify(cache)); } catch { /* not essential */ }
}
function clearShopCaches() {
  try { Object.keys(localStorage).filter(k => k.startsWith(CACHE)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}
const methodLabel = (m: PaymentMethod) => m === "mobile" ? "Mobile money" : m === "card" ? "Card" : "Cash";
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.";

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function SharedShopPage() {
  const online = useOnline();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) { setUserId(null); return; }
    const client = getSupabaseClient();
    let active = true;
    const load = async () => {
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id ?? null;
      if (!active) return;
      setUserId(id);
      if (!id) return;
      const cached = readCache(id);
      if (cached.businesses.length) { setBusinesses(cached.businesses); setCompanyId(c => c ?? cached.businesses[0]!.id); }
      if (!navigator.onLine) return;
      try {
        const list = (await listVerifiedCloudBusinesses()).map(b => ({ id: b.id, name: b.name, role: b.role }));
        if (!active) return;
        setBusinesses(list); setLoadError("");
        setCompanyId(c => list.some(b => b.id === c) ? c : list[0]?.id ?? null);
        writeCache(id, cache => { cache.businesses = list; });
      } catch (error) { if (active && !cached.businesses.length) setLoadError(message(error)); }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { clearShopCaches(); setBusinesses([]); setCompanyId(null); }
      setTimeout(() => { if (active) void load(); }, 0);
    });
    void load();
    return () => { active = false; subscription.unsubscribe(); };
  }, [online]);

  const business = businesses.find(b => b.id === companyId) ?? null;

  if (userId === undefined) return <main className="shop-page"><Run18UpdateNotice /><p role="status">Opening your shop…</p></main>;
  if (!userId) return <main className="shop-page"><Run18UpdateNotice /><section className="shop-card shop-empty">
    <h1>Shared shop</h1><p>Sign in to open the shop you own or work in.</p>
    <Link href="/signin" className="primary-action">Sign in</Link></section></main>;

  return <main className="shop-page">
    <Run18UpdateNotice />
    <header className="shop-head">
      <Link href="/signin" className="shop-back"><ArrowLeft aria-hidden="true" />Account</Link>
      <div>
        <p className="shop-eyebrow">Shared shop{business ? ` · ${business.role === "owner" ? "Owner" : "Attendant"}` : ""}</p>
        <h1>{business?.name ?? "Your shop"}</h1>
      </div>
      {!online && <p className="shop-offline" role="status"><CloudOff aria-hidden="true" />Offline — sales are saved and sent when you reconnect</p>}
      {businesses.length > 1 && <label className="shop-field shop-company">Business
        <select value={companyId ?? ""} onChange={e => setCompanyId(e.target.value)}>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>}
    </header>
    {loadError && <p role="alert" className="shop-alert">{loadError}</p>}
    {business
      ? <ShopWorkspace key={business.id} userId={userId} business={business} online={online} />
      : <JoinShop userId={userId} online={online} />}
  </main>;
}

function JoinShop({ userId, online }: { userId: string; online: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void getSupabaseClient().auth.getUser().then(r => setEmail(r.data.user?.email ?? "")); }, []);
  const accept = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const receipt = await acceptCloudInvitation(code.trim());
      if (receipt.userId !== userId) throw new Error("This code was accepted by a different account.");
      window.location.reload();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  return <section className="shop-card shop-empty">
    <h2>Join your employer's shop</h2>
    <p>Ask the owner to invite <strong>{email || "the email you signed in with"}</strong>. They'll give you a one-time code that works only for this account and expires after 15 minutes.</p>
    <form onSubmit={accept} className="shop-inline-form">
      <label className="shop-field">Invitation code
        <input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="v1.…" /></label>
      <button className="primary-action" disabled={busy || !online || !code.trim()}>{busy ? "Joining…" : "Join shop"}</button>
    </form>
    {error && <p role="alert" className="shop-alert">{error}</p>}
    <p className="shop-muted">Own a business instead? <Link href="/signin">Create it from your account page</Link>.</p>
  </section>;
}

function ShopWorkspace({ userId, business, online }: { userId: string; business: Business; online: boolean }) {
  const [overview, setOverview] = useState<ShopOverview | null>(() => readCache(userId).overviews[business.id] ?? null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("sell");
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const next = await getShopOverview(business.id);
      setOverview(next); setError("");
      writeCache(userId, cache => { cache.overviews[business.id] = next; });
    } catch (cause) { setError(message(cause)); }
  }, [business.id, userId]);
  useEffect(() => { void refresh(); }, [refresh, online]);

  if (!overview) return error ? <p role="alert" className="shop-alert">{error}</p> : <p role="status">Loading shop…</p>;
  const isOwner = overview.role === "owner";
  if (!overview.currency) return isOwner
    ? <SetupLedger companyId={business.id} onDone={refresh} />
    : <section className="shop-card shop-empty"><h2>Not open yet</h2><p>The owner hasn't finished setting up this shop. Check back soon.</p></section>;

  const tabs: Array<[Tab, string]> = isOwner
    ? [["sell", "Sell"], ["stock", "Stock"], ["team", "Team"], ["sales", "Sales"]]
    : [["sell", "Sell"], ["sales", "My sales"]];
  const ctx = { companyId: business.id, overview, refresh, online, userId };
  return <>
    {error && <p role="alert" className="shop-alert">{error}</p>}
    <nav className="shop-tabs" aria-label="Shop sections">
      {tabs.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      <button type="button" className="shop-refresh" onClick={() => void refresh()} disabled={!online} aria-label="Refresh"><RefreshCw aria-hidden="true" /></button>
    </nav>
    {tab === "sell" && <SellPanel {...ctx} />}
    {tab === "stock" && isOwner && <StockPanel {...ctx} />}
    {tab === "team" && isOwner && <TeamPanel {...ctx} />}
    {tab === "sales" && <SalesPanel {...ctx} />}
  </>;
}

interface PanelProps { companyId: string; overview: ShopOverview; refresh: () => Promise<void>; online: boolean; userId: string }

function SetupLedger({ companyId, onDone }: { companyId: string; onDone: () => Promise<void> }) {
  const [currency, setCurrency] = useState<string>("GHS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="shop-card shop-empty">
    <h2>Set up your shared shop</h2>
    <p>Your attendants will sell from this shop on their own phones. Choose the currency you sell in. It can't change after the first sale.</p>
    <form className="shop-inline-form" onSubmit={e => { e.preventDefault(); setBusy(true); setError("");
      void setupShopLedger(companyId, currency).then(onDone).catch(c => setError(message(c))).finally(() => setBusy(false)); }}>
      <label className="shop-field">Currency
        <select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></label>
      <button className="primary-action" disabled={busy}>{busy ? "Saving…" : "Open shop"}</button>
    </form>
    {error && <p role="alert" className="shop-alert">{error}</p>}
  </section>;
}

function useStoreChoice(overview: ShopOverview) {
  const active = overview.stores.filter(s => s.status === "active");
  const [storeId, setStoreId] = useState(() => {
    try { const saved = localStorage.getItem("tallybook.shop.store:" + overview.companyId); if (saved && active.some(s => s.id === saved)) return saved; } catch { /* ignore */ }
    return active[0]?.id ?? "";
  });
  useEffect(() => { if (!active.some(s => s.id === storeId)) setStoreId(active[0]?.id ?? ""); }, [active, storeId]);
  const choose = (id: string) => { setStoreId(id); try { localStorage.setItem("tallybook.shop.store:" + overview.companyId, id); } catch { /* ignore */ } };
  return { active, storeId, choose };
}

function StorePicker({ stores, storeId, choose }: { stores: ShopOverview["stores"]; storeId: string; choose: (id: string) => void }) {
  if (stores.length < 2) return stores[0] ? <p className="shop-store-name"><Store aria-hidden="true" />{stores[0].name}</p> : null;
  return <label className="shop-field shop-store-select">Store
    <select value={storeId} onChange={e => choose(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>;
}

function SellPanel({ companyId, overview, refresh, online, userId }: PanelProps) {
  const currency = overview.currency!;
  const { active, storeId, choose } = useStoreChoice(overview);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ShopReceipt | null>(null);
  const [queued, setQueued] = useState<QueuedSale[]>([]);
  const submissionKey = useRef<string | null>(null);
  const scope: OutboxScope = useMemo(() => ({ userId, companyId }), [userId, companyId]);
  const send = useCallback((sale: Parameters<typeof recordShopSale>[1]) => recordShopSale(companyId, sale), [companyId]);

  const reloadQueue = useCallback(() => setQueued(readOutbox(scope)), [scope]);
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      const results = await flushOutbox(scope, send);
      reloadQueue();
      if (results.some(r => r.state === "recorded")) void refresh();
    } finally { flushing.current = false; }
  }, [scope, send, refresh, reloadQueue]);
  useEffect(() => { reloadQueue(); if (online) void flush(); }, [online, flush, reloadQueue]);
  // A flaky connection can fail a request while the phone still reports
  // "online", so keep retrying while anything is waiting, and on return to the app.
  const hasPending = queued.some(q => q.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void flush(), 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") void flush(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [hasPending, flush]);

  useEffect(() => { if (receipt) document.getElementById("shop-checkout")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [receipt]);
  const stockOf = (productId: string) => overview.stock.find(s => s.storeId === storeId && s.productId === productId)?.quantity ?? 0;
  const products = overview.products.filter(p => p.active);
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((sum, [id, q]) => sum + q * (products.find(p => p.id === id)?.unitPriceMinor ?? 0), 0);
  const change = (delta: number, id: string) => { setReceipt(null); setError(""); submissionKey.current = null;
    setCart(c => ({ ...c, [id]: Math.max(0, Math.min(stockOf(id), (c[id] ?? 0) + delta)) })); };

  if (!active.length) return <section className="shop-card shop-empty"><h2>No store yet</h2>
    <p>{overview.role === "owner" ? "Add a store under Team, then add stock under Stock." : "The owner hasn't assigned you to a store yet. Ask them to add you to the store you work in."}</p></section>;

  const record = async () => {
    setError("");
    let tenderedMinor = total;
    try { if (method === "cash") tenderedMinor = tendered.trim() ? parseAmountToMinor(tendered, currency) : total; }
    catch (cause) { setError(message(cause)); return; }
    if (tenderedMinor < total) { setError("Amount received is less than the total."); return; }
    if (method === "mobile" && !reference.trim()) { setError("Enter the mobile money reference."); return; }
    submissionKey.current ??= newSubmissionKey();
    const sale = { storeId, submissionKey: submissionKey.current, paymentMethod: method, amountTenderedMinor: tenderedMinor,
      ...(method === "mobile" ? { paymentReference: reference.trim() } : {}), clientRecordedAt: new Date().toISOString(),
      lines: lines.map(([productId, quantity]) => ({ productId, quantity })) };
    const summary = lines.map(([id, q]) => `${q} × ${products.find(p => p.id === id)?.name ?? "item"}`).join(", ");
    setBusy(true);
    try {
      const result = await submitSale(scope, sale, summary, send);
      if (result.state === "recorded") { setReceipt(result.receipt); setCart({}); setTendered(""); setReference(""); submissionKey.current = null; void refresh(); }
      else if (result.state === "queued") { setCart({}); setTendered(""); setReference(""); submissionKey.current = null;
        setError("No connection. The sale is saved on this phone and will be sent automatically."); }
      else { submissionKey.current = null; setError(result.error); }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); reloadQueue(); }
  };

  return <div className="shop-sell">
    <section className="shop-card">
      <div className="shop-card-head"><h2>Products</h2><StorePicker stores={active} storeId={storeId} choose={id => { choose(id); setCart({}); }} /></div>
      {!products.length && <p className="shop-muted">No products yet.</p>}
      <ul className="shop-product-list">{[...products].sort((a, b) => Number(stockOf(b.id) > 0) - Number(stockOf(a.id) > 0)).map(p => { const left = stockOf(p.id), inCart = cart[p.id] ?? 0; return <li key={p.id} className={left ? "" : "is-out"}>
        <div><strong>{p.name}</strong><span>{formatMinorAmount(p.unitPriceMinor, currency)} · {left ? `${left} in stock` : "Out of stock"}</span></div>
        <div className="shop-stepper">
          <button type="button" className="secondary-action" aria-label={`Remove one ${p.name}`} disabled={!inCart} onClick={() => change(-1, p.id)}><Minus aria-hidden="true" /></button>
          <output aria-label={`${p.name} in cart`}>{inCart}</output>
          <button type="button" className="secondary-action" aria-label={`Add one ${p.name}`} disabled={inCart >= left} onClick={() => change(1, p.id)}><Plus aria-hidden="true" /></button>
        </div></li>; })}</ul>
    </section>
    {lines.length > 0 && !receipt && <a href="#shop-checkout" className="shop-cart-bar">
      <span>{lines.reduce((n, [, q]) => n + q, 0)} item{lines.reduce((n, [, q]) => n + q, 0) === 1 ? "" : "s"}</span>
      <strong>{formatMinorAmount(total, currency)}</strong><span>Checkout ↓</span></a>}
    <section className="shop-card shop-checkout" id="shop-checkout">
      {receipt ? <Receipt receipt={receipt} onNext={() => setReceipt(null)} /> : <>
        <h2>Checkout</h2>
        <p className="shop-total"><span>Total</span><strong>{formatMinorAmount(total, currency)}</strong></p>
        <div className="shop-segment" role="group" aria-label="Payment method">
          {(["cash", "mobile", "card"] as const).map(m => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>{m === "mobile" ? "Mobile money" : m[0]!.toUpperCase() + m.slice(1)}</button>)}
        </div>
        {method === "cash" && <label className="shop-field">Amount received <small>(leave empty if exact)</small>
          <input inputMode="decimal" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={formatMinorAmount(total, currency)} /></label>}
        {method === "mobile" && <label className="shop-field">Mobile money reference
          <input value={reference} onChange={e => setReference(e.target.value)} autoComplete="off" maxLength={80} /></label>}
        <button type="button" className="primary-action shop-record" disabled={busy || !lines.length} onClick={() => void record()}>
          <ReceiptText aria-hidden="true" />{busy ? "Recording…" : online ? "Record sale" : "Save sale (offline)"}</button>
        {error && <p role="alert" className="shop-alert">{error}</p>}
      </>}
      {queued.length > 0 && <div className="shop-queue">
        <h3>Waiting to send</h3>
        <ul>{queued.map(q => <li key={q.sale.submissionKey} className={q.status === "rejected" ? "is-rejected" : ""}>
          <span>{q.summary}</span>
          {q.status === "pending" ? <small>Will send when online</small> : <>
            <small>Not recorded: {q.error}</small>
            <button type="button" className="secondary-action" onClick={() => { dismissQueuedSale(scope, q.sale.submissionKey); reloadQueue(); }}>Dismiss</button></>}
        </li>)}</ul>
      </div>}
    </section>
  </div>;
}

function Receipt({ receipt, onNext }: { receipt: ShopReceipt; onNext?: () => void }) {
  const money = (v: number) => formatMinorAmount(v, receipt.currency);
  return <div className="shop-receipt" aria-label={`Receipt ${receipt.receiptNumber}`}>
    <p className="shop-receipt-ok"><Check aria-hidden="true" />Sale recorded</p>
    <p className="shop-muted">Receipt #{receipt.receiptNumber} · {receipt.storeName} · {new Date(receipt.recordedAt).toLocaleString()}</p>
    <ul>{receipt.lines.map(l => <li key={l.productId}><span>{l.quantity} × {l.name}</span><span>{money(l.lineTotalMinor)}</span></li>)}</ul>
    <p className="shop-total"><span>Total</span><strong>{money(receipt.totalMinor)}</strong></p>
    <p className="shop-muted">{receipt.payment.method === "mobile" ? `Mobile money · ${receipt.payment.reference}` : receipt.payment.method === "card" ? "Card" : `Cash received ${money(receipt.payment.amountTenderedMinor)} · Change ${money(receipt.payment.changeMinor)}`}</p>
    {onNext && <button type="button" className="primary-action" onClick={onNext}>New sale</button>}
  </div>;
}

function StockPanel({ companyId, overview, refresh, online }: PanelProps) {
  const currency = overview.currency!;
  const { active, storeId, choose } = useStoreChoice(overview);
  const [edit, setEdit] = useState<{ productId: string; name: string; price: string; active: boolean } | null>(null);
  const [adds, setAdds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setError(""); try { await task(); await refresh(); } catch (c) { setError(message(c)); } finally { setBusy(false); } };
  const stockOf = (productId: string) => overview.stock.find(s => s.storeId === storeId && s.productId === productId)?.quantity ?? 0;
  const saveProduct = (event: FormEvent) => { event.preventDefault(); if (!edit) return;
    void run(async () => { await saveShopProduct(companyId, { productId: edit.productId, name: edit.name, unitPriceMinor: parseAmountToMinor(edit.price, currency), active: edit.active }); setEdit(null); }); };
  const addStock = (productId: string, sign: 1 | -1) => { const n = Number(adds[productId]);
    if (!Number.isInteger(n) || n <= 0) { setError("Enter a whole number of units."); return; }
    void run(async () => { await adjustShopStock(companyId, { storeId, productId, delta: sign * n, operationId: crypto.randomUUID() }); setAdds(a => ({ ...a, [productId]: "" })); }); };

  return <div className="shop-grid">
    <section className="shop-card">
      <div className="shop-card-head"><h2>Products</h2>
        <button type="button" className="secondary-action" disabled={!online} onClick={() => setEdit({ productId: crypto.randomUUID(), name: "", price: "", active: true })}><Plus aria-hidden="true" />Add product</button></div>
      {edit && <form className="shop-edit" onSubmit={saveProduct}>
        <label className="shop-field">Name<input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} maxLength={120} required /></label>
        <label className="shop-field">Price ({currency})<input inputMode="decimal" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} required /></label>
        <label className="shop-check"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} />Available for sale</label>
        <div className="shop-actions"><button className="primary-action" disabled={busy}>Save product</button><button type="button" className="secondary-action" onClick={() => setEdit(null)}>Cancel</button></div>
      </form>}
      {!active.length ? <p className="shop-muted">Add a store under Team to track stock.</p> : <StorePicker stores={active} storeId={storeId} choose={choose} />}
      <ul className="shop-product-list shop-stock-list">{overview.products.map(p => <li key={p.id}>
        <div className={p.active ? "" : "is-muted"}><strong>{p.name}</strong><span>{formatMinorAmount(p.unitPriceMinor, currency)}{p.active ? "" : " · hidden from sale"}{active.length ? ` · ${stockOf(p.id)} in stock` : ""}</span></div>
        <div className="shop-stock-controls">
          {active.length > 0 && <><input aria-label={`Units of ${p.name}`} inputMode="numeric" value={adds[p.id] ?? ""} onChange={e => setAdds(a => ({ ...a, [p.id]: e.target.value }))} placeholder="Qty" />
            <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => addStock(p.id, 1)}>Add</button>
            <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => addStock(p.id, -1)}>Remove</button></>}
          <button type="button" className="secondary-action" disabled={!online} onClick={() => setEdit({ productId: p.id, name: p.name, price: (p.unitPriceMinor / currencyMinorDivisor(currency)).toFixed(currencyMinorDivisor(currency) === 1 ? 0 : 2), active: p.active })}>Edit</button>
        </div></li>)}</ul>
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
  </div>;
}

function TeamPanel({ companyId, overview, refresh, online }: PanelProps) {
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<{ code: string; email: string; invitationId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setError(""); try { await task(); await refresh(); } catch (c) { setError(message(c)); } finally { setBusy(false); } };
  const attendants = overview.members.filter(m => m.role === "attendant");
  return <div className="shop-grid shop-grid-two">
    <section className="shop-card">
      <h2>Stores</h2>
      <form className="shop-inline-form" onSubmit={e => { e.preventDefault(); void run(async () => { await saveShopStore(companyId, crypto.randomUUID(), storeName); setStoreName(""); }); }}>
        <label className="shop-field">New store<input value={storeName} onChange={e => setStoreName(e.target.value)} maxLength={80} placeholder="e.g. Madina branch" required /></label>
        <button className="primary-action" disabled={busy || !online}><Plus aria-hidden="true" />Add</button>
      </form>
      <ul className="shop-list">{overview.stores.map(s => <li key={s.id} className={s.status === "archived" ? "is-muted" : ""}>
        <span><Store aria-hidden="true" />{s.name}{s.status === "archived" ? " (closed)" : ""}</span>
        <button type="button" className="secondary-action" disabled={busy || !online}
          onClick={() => void run(() => setShopStoreStatus(companyId, s.id, s.status === "active" ? "archived" : "active"))}>{s.status === "active" ? "Close store" : "Reopen"}</button>
      </li>)}</ul>
    </section>
    <section className="shop-card">
      <h2>Team</h2>
      <form className="shop-inline-form" onSubmit={e => { e.preventDefault(); void run(async () => {
        const r = await inviteShopAttendant(companyId, email); setIssued({ code: r.inviteToken, email: r.email, invitationId: r.invitationId }); setCopied(false); setEmail(""); }); }}>
        <label className="shop-field">Invite attendant by email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="their sign-in email" required /></label>
        <button className="primary-action" disabled={busy || !online}><UserPlus aria-hidden="true" />Invite</button>
      </form>
      {issued && <div className="shop-invite" role="status">
        <p>Send this one-time code to <strong>{issued.email}</strong>. It works only for their account and expires in 15 minutes.</p>
        <code>{issued.code}</code>
        <div className="shop-actions">
          <button type="button" className="secondary-action" onClick={() => void navigator.clipboard?.writeText(issued.code).then(() => setCopied(true))}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy code"}</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(async () => { await revokeCloudInvitation(companyId, issued.invitationId); setIssued(null); })}>Cancel invitation</button>
        </div></div>}
      {overview.pendingInvites.length > 0 && <p className="shop-muted">Waiting for: {overview.pendingInvites.map(i => i.email).join(", ")}</p>}
      {!attendants.length && <p className="shop-muted">No attendants yet. They need a Tallybook account first, then you invite their email here.</p>}
      <ul className="shop-members">{attendants.map(m => <li key={m.userId}>
        <div className="shop-member-head"><strong>{m.email ?? "Attendant"}</strong>
          <button type="button" className="secondary-action shop-danger" disabled={busy || !online} aria-label={`Remove ${m.email ?? "attendant"}`}
            onClick={() => { if (window.confirm(`Remove ${m.email ?? "this attendant"} from the shop? They will lose access immediately.`)) void run(() => revokeCloudAttendant(companyId, m.userId)); }}><Trash2 aria-hidden="true" /></button></div>
        <fieldset><legend>Can sell in</legend>
          {overview.stores.filter(s => s.status === "active").map(s => <label key={s.id} className="shop-check">
            <input type="checkbox" checked={m.storeIds.includes(s.id)} disabled={busy || !online}
              onChange={e => void run(() => assignShopStore(companyId, s.id, m.userId, e.target.checked))} />{s.name}</label>)}
        </fieldset></li>)}</ul>
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
  </div>;
}

function SalesPanel({ companyId, overview, online }: PanelProps) {
  const [sales, setSales] = useState<ShopReceipt[] | null>(null);
  const [storeFilter, setStoreFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!online) return; setError("");
    void listShopSales(companyId, storeFilter || undefined).then(setSales).catch(c => setError(message(c))); }, [companyId, storeFilter, online]);
  const emailOf = (id: string) => overview.members.find(m => m.userId === id)?.email;
  const total = (sales ?? []).reduce((s, r) => s + r.totalMinor, 0);
  return <section className="shop-card">
    <div className="shop-card-head"><h2>{overview.role === "owner" ? "Recent sales" : "My recent sales"}</h2>
      {overview.role === "owner" && overview.stores.length > 1 && <label className="shop-field shop-store-select">Store
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}><option value="">All stores</option>
          {overview.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>
    {!online && <p className="shop-muted">Connect to see sales.</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
    {sales && !sales.length && <p className="shop-muted">No sales yet.</p>}
    {sales && sales.length > 0 && <p className="shop-total"><span>Total of last {sales.length} sale{sales.length === 1 ? "" : "s"}</span><strong>{formatMinorAmount(total, overview.currency!)}</strong></p>}
    <ul className="shop-sales">{(sales ?? []).map(r => <li key={r.saleId}>
      <button type="button" aria-expanded={open === r.saleId} onClick={() => setOpen(o => o === r.saleId ? null : r.saleId)}>
        <span>#{r.receiptNumber} · {new Date(r.recordedAt).toLocaleString()}<small>{r.storeName}{overview.role === "owner" && emailOf(r.cashierId) ? ` · ${emailOf(r.cashierId)}` : ""} · {methodLabel(r.payment.method)}</small></span>
        <strong>{formatMinorAmount(r.totalMinor, r.currency)}</strong></button>
      {open === r.saleId && <Receipt receipt={r} />}
    </li>)}</ul>
  </section>;
}
