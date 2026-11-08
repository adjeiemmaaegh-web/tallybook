/**
 * Shared shop: the owner-to-attendant workspace backed by the cloud ledger.
 * Owners set up stores, products, stock and their team. Attendants sell only
 * in stores they are assigned to. Every rule is enforced by the server; this
 * screen only presents it. Sales are queued write-ahead, so a dropped
 * connection never loses or duplicates a sale.
 */
import "./sharedShop.css";
import { TallybookWelcome } from "@/components/TallybookWelcome";
import { ArrowLeft, Check, CloudOff, Copy, Minus, Plus, ReceiptText, RefreshCw, Store, Trash2, Undo2, UserPlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { listVerifiedCloudBusinesses } from "@/cloud/cloudMembership";
import { Run18UpdateNotice } from "@/components/Run18UpdateNotice";
import { acceptCloudInvitation, revokeCloudAttendant, revokeCloudInvitation } from "@/cloud/run3MembershipClient";
import {
  adjustShopStock, assignShopStore, getShopReadiness, getShopOverview, inviteShopAttendant, listShopSales, newSubmissionKey,
  recordShopSale, refundShopSale, ShopUnreachableError, saveShopProduct, saveShopStore, setShopStoreStatus, setupShopLedger,
  getCustomerStatement, permissionsOf, recordShopRepayment, saveShopCustomer, setShopMemberPermissions, NO_PERMISSIONS,
  getShopRefundPolicy, setShopRefundPolicy, type ShopRefundPolicy,
  type CustomerStatement, type PaymentMethod, type SaleRequest, type ShopCustomer, type ShopOverview, type ShopPermissions, type ShopReceipt, type TenderInput,
} from "@/cloud/shopClient";
import { dismissQueuedSale, flushOutbox, readOutbox, submitSale, type OutboxScope, type QueuedSale } from "@/cloud/shopOutbox";
import { readSealedJson, removeSealedPrefix, writeSealedJson } from "@/cloud/secureStorage";
import { buildChecklist } from "@/cloud/shopOnboarding";
import { currencies } from "@/features/business/businessProfile";
import { currencyMinorDivisor, formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";

interface Business { id: string; name: string; role: "owner" | "attendant" }
type Tab = "dashboard" | "sell" | "stock" | "team" | "sales" | "customers";

const CACHE = "tallybook.shop.cache.v1:";
import { safeCache, type ShopCache } from "@/cloud/safeShopCache";
const emptyCache = (): ShopCache => ({ businesses: [], overviews: {} });
/** Cached business and shop data is sealed (AES-GCM, device key); plaintext localStorage is only read once to migrate. */
async function readCache(userId: string): Promise<ShopCache> {
  const sealed = await readSealedJson<ShopCache>(CACHE + userId);
  if (sealed) return safeCache(sealed);
  try {
    const legacy = localStorage.getItem(CACHE + userId);
    if (!legacy) return emptyCache();
    const parsed = safeCache(JSON.parse(legacy));
    await writeSealedJson(CACHE + userId, parsed);
    if (await readSealedJson<ShopCache>(CACHE + userId)) localStorage.removeItem(CACHE + userId); // only after it can be read back
    return parsed;
  } catch { return emptyCache(); }
}
async function writeCache(userId: string, change: (cache: ShopCache) => void) {
  try { const cache = await readCache(userId); change(cache); await writeSealedJson(CACHE + userId, safeCache(cache)); } catch { /* not essential */ }
}
async function clearShopCaches() {
  await removeSealedPrefix(CACHE);
  try { Object.keys(localStorage).filter(k => k.startsWith(CACHE)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}
const methodLabel = (m: string) => m === "mobile" ? "Mobile money" : m === "card" ? "Card" : m === "credit" ? "Credit" : m === "split" ? "Split payment" : "Cash";
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
  const identity = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setUserId(null); return; }
    const client = getSupabaseClient();
    let generation = 0;
    const load = async (request: number) => {
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id ?? null;
      if (request !== generation) return;
      if (identity.current !== id) { setBusinesses([]); setCompanyId(null); }
      identity.current = id;
      setUserId(id);
      if (!id) return;
      const list = online
        ? (await listVerifiedCloudBusinesses()).map(({id, name, role}) => ({id, name, role}))
        : (await readCache(id)).businesses;
      if (request !== generation) return;
      setBusinesses(list);
      setCompanyId(current => list.some(b => b.id === current) ? current : list[0]?.id ?? null);
      if (online) void writeCache(id, cache => { cache.businesses = list; });
    };
    const refreshIdentity = () => {
      const request = ++generation;
      setLoadError("");
      // Supabase auth callbacks must finish before another auth call starts.
      setTimeout(() => {
        if (generation === request) void load(request).catch(error => {
          if (generation === request) setLoadError(message(error));
        });
      }, 0);
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (session?.user.id !== identity.current) {
        setUserId(undefined); setBusinesses([]); setCompanyId(null);
      }
      if (event === "SIGNED_OUT") {
        ++generation; identity.current = null;
        setUserId(null); setBusinesses([]); setCompanyId(null); setLoadError("");
        void clearShopCaches();
      } else refreshIdentity();
    });
    refreshIdentity();
    return () => { ++generation; subscription.unsubscribe(); };
  }, [online]);

  const business = businesses.find(b => b.id === companyId) ?? null;

  if (loadError) return <main className="shop-page"><p role="alert">{loadError}</p><Link href="/signin">Return to account</Link></main>;
  if (userId === undefined) return <main className="shop-page"><Run18UpdateNotice /><p role="status">Opening your shop…</p></main>;
  if (!userId) return <main className="shop-page shop-landing">
    <Run18UpdateNotice />
    <TallybookWelcome variant="shop" />
  </main>;

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
      ? <ShopWorkspace key={userId + ":" + business.id} userId={userId} business={business} online={online} />
      : <JoinShop userId={userId} online={online} />}
  </main>;
}

function JoinShop({ userId, online }: { userId: string; online: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; void getSupabaseClient().auth.getUser().then(r => { if (live) setEmail(r.data.user?.email ?? ""); }); return () => { live = false; }; }, []);
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
    <p>Ask the owner to invite <strong>{email || "the email you signed in with"}</strong>. They'll give you a one-time code that works once, only for this account, and expires after 24 hours.</p>
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
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  useEffect(() => {
    let live = true;
    if (!online) void readCache(userId).then(cache => { const hit = cache.overviews[business.id]; if (live && hit) setOverview(current => current ?? hit); });
    return () => { live = false; };
  }, [userId, business.id, online]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(business.role === "owner" && new URLSearchParams(window.location.search).get("view") === "dashboard" ? "dashboard" : "sell");
  // null = not known yet (offline or still loading). The checklist never claims a sale it has not seen.
  const [hasSale, setHasSale] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const next = await getShopOverview(business.id);
      setOverview(next); setError("");
      void writeCache(userId, cache => { cache.overviews[business.id] = next; });
    } catch (cause) { setError(message(cause)); }
  }, [business.id, userId]);
  useEffect(() => { void refresh(); }, [refresh, online]);
  const isOwnerRole = overview?.role === "owner";
  useEffect(() => {
    if (!isOwnerRole || hasSale === true || !online) return;
    let live = true;
    void getShopReadiness(business.id).then(result => {
      if (live && result.companyId === business.id && Number.isSafeInteger(result.saleCount))
        setHasSale(result.saleCount > 0);
    }).catch(() => { /* Older servers cannot confirm checklist progress. */ });
    return () => { live = false; };
  }, [isOwnerRole, business.id, online, hasSale, overview]);

  if (!overview) return error ? <p role="alert" className="shop-alert">{error}</p> : <p role="status">Loading shop…</p>;
  const isOwner = overview.role === "owner";
  if (!overview.currency) return isOwner
    ? <SetupLedger companyId={business.id} onDone={refresh} />
    : <section className="shop-card shop-empty"><h2>Not open yet</h2><p>The owner hasn't finished setting up this shop. Check back soon.</p></section>;

  const canCredit = permissionsOf(overview).canCredit;
  const tabs: Array<[Tab, string]> = isOwner
    ? [["dashboard", "Dashboard"], ["sell", "Sell"], ["stock", "Stock"], ["customers", "Customers"], ["team", "Team"], ["sales", "Sales"]]
    : [["sell", "Sell"], ...(canCredit ? [["customers", "Customers"] as [Tab, string]] : []), ["sales", "My sales"]];
  const ctx = { companyId: business.id, overview, refresh, online, userId, goTo: setTab };
  return <>
    {error && <p role="alert" className="shop-alert">{error} <button type="button" className="secondary-action" onClick={() => void refresh()} disabled={!online}>Try again</button></p>}
    {isOwner && (tab === "sell" || tab === "stock") && <GetStartedCard overview={overview} hasSale={hasSale} goTo={setTab} />}
    <nav className="shop-tabs" aria-label="Shop sections">
      {tabs.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      <button type="button" className="shop-refresh" onClick={() => void refresh()} disabled={!online} aria-label="Refresh"><RefreshCw aria-hidden="true" /></button>
    </nav>
    {tab === "dashboard" && isOwner && <section className="shop-card">
      <h2>Owner dashboard</h2>
      <p>Records from {business.name}’s shared shop</p>
      <p>{overview.stores.length} stores · {overview.products.length} products</p>
      <button className="primary-action" type="button" onClick={() => setTab("sell")}>Open POS</button>
      <button className="secondary-action" type="button" onClick={() => setTab("sales")}>Review sales</button>
      <details><summary>Tools on this device</summary>
        <p>Reports and Clementia use the ledger saved in this browser.</p>
        <Link href="/">Device ledger</Link> · <Link href="/assistant">Clementia</Link>
      </details>
    </section>}
    {tab === "sell" && <SellPanel {...ctx} />}
    {tab === "stock" && isOwner && <StockPanel {...ctx} />}
    {tab === "team" && isOwner && <TeamPanel {...ctx} />}
    {tab === "customers" && canCredit && <CustomersPanel {...ctx} />}
    {tab === "sales" && <SalesPanel {...ctx} />}
  </>;
}

interface PanelProps { companyId: string; overview: ShopOverview; refresh: () => Promise<void>; online: boolean; userId: string; goTo?: (tab: Tab) => void }

function GetStartedCard({ overview, hasSale, goTo }: { overview: ShopOverview; hasSale: boolean | null; goTo: (tab: Tab) => void }) {
  const list = buildChecklist(overview, hasSale);
  if (list.complete) return null;
  return <section className="shop-card shop-checklist" aria-labelledby="shop-start-title">
    <h2 id="shop-start-title">Get started <small>{list.doneCount} of {list.steps.length} done</small></h2>
    <p className="shop-muted" role="status">{list.readyToSell
      ? "Your shop can sell now. Record a first sale to finish."
      : "Finish the first three steps before your shop can sell."}</p>
    <ol>{list.steps.map(step => <li key={step.id} className={step.done ? "is-done" : step === list.next ? "is-next" : ""}>
      <span className="shop-check-mark" aria-hidden="true">{step.done ? <Check /> : null}</span>
      <div><strong>{step.title}{step.done ? <span className="sr-only"> (done)</span> : null}</strong>
        {!step.done && <span>{step.unknown ? "Checking… connect to the internet to confirm." : step.hint}</span>}</div>
      {step === list.next && !step.unknown && <button type="button" className="primary-action" onClick={() => goTo(step.goTo)}>{step.id === "sale" ? "Open sales" : "Do this"}</button>}
    </li>)}</ol>
  </section>;
}

function SetupLedger({ companyId, onDone }: { companyId: string; onDone: () => Promise<void> }) {
  const [currency, setCurrency] = useState<string>("GHS");
  const [step, setStep] = useState<1 | 2>(1);
  const storeId = useRef(crypto.randomUUID());
  const [storeName, setStoreName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="shop-card shop-empty">
    <p className="shop-eyebrow">Step {step} of 2</p>
    <h2>Set up your shared shop</h2>
    {step === 1
      ? <form className="shop-inline-form" onSubmit={e => { e.preventDefault(); setStep(2); }}>
          <p>Your attendants will sell from this shop on their own phones. Choose the currency you sell in. It can't change after the first sale.</p>
          <label className="shop-field">Currency
            <select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></label>
          <button className="primary-action">Next</button>
        </form>
      : <form className="shop-inline-form" onSubmit={e => { e.preventDefault(); setBusy(true); setError("");
          // Both calls are safe to repeat: the ledger is set up once, and the store id is fixed per attempt.
          void setupShopLedger(companyId, currency)
            .then(() => storeName.trim() ? saveShopStore(companyId, storeId.current, storeName.trim()) : undefined)
            .then(onDone).catch(c => setError(message(c))).finally(() => setBusy(false)); }}>
          <p>Name the place you sell from. You can add more stores later under Team.</p>
          <label className="shop-field">Store name
            <input value={storeName} onChange={e => setStoreName(e.target.value)} maxLength={80} placeholder="e.g. Main shop" /></label>
          <p className="shop-muted">Currency: <strong>{currency}</strong> <button type="button" className="shop-link" onClick={() => setStep(1)} disabled={busy}>Change</button></p>
          <div className="shop-actions">
            <button type="button" className="secondary-action" onClick={() => setStep(1)} disabled={busy}>Back</button>
            <button className="primary-action" disabled={busy}>{busy ? "Saving…" : "Open shop"}</button></div>
        </form>}
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

type PayMode = PaymentMethod | "credit" | "split";
const payModeLabel: Record<PayMode, string> = { cash: "Cash", mobile: "Mobile money", card: "Card", credit: "Credit", split: "Split" };

/** Turns the checkout form into the tenders the server checks. Throws a plain-language error. */
export function buildTenders(input: {
  mode: PayMode; total: number; currency: string; tendered: string; reference: string;
  customerId: string; paidNow: string; paidNowMethod: PaymentMethod; paidNowReference: string;
  split: { cash: string; mobile: string; mobileReference: string; card: string };
}): TenderInput[] {
  const { mode, total, currency } = input;
  const amount = (text: string) => text.trim() ? parseAmountToMinor(text, currency) : 0;
  if (total === 0) return [];
  if (mode === "cash") {
    const received = input.tendered.trim() ? amount(input.tendered) : total;
    if (received < total) throw new Error("Amount received is less than the total.");
    return [{ method: "cash", amountMinor: total, tenderedMinor: received }];
  }
  if (mode === "mobile") {
    if (!input.reference.trim()) throw new Error("Enter the mobile money reference.");
    return [{ method: "mobile", amountMinor: total, reference: input.reference.trim() }];
  }
  if (mode === "card") return [{ method: "card", amountMinor: total }];
  if (mode === "credit") {
    if (!input.customerId) throw new Error("Choose the customer buying on credit.");
    const now = amount(input.paidNow);
    if (now >= total) throw new Error("They are paying it all now, so choose Cash, Mobile money or Card instead.");
    if (now > 0 && input.paidNowMethod === "mobile" && !input.paidNowReference.trim()) throw new Error("Enter the mobile money reference.");
    const paid: TenderInput[] = now > 0 ? [{ method: input.paidNowMethod, amountMinor: now,
      ...(input.paidNowMethod === "mobile" ? { reference: input.paidNowReference.trim() } : {}) }] : [];
    return [...paid, { method: "credit", amountMinor: total - now, customerId: input.customerId }];
  }
  const parts: TenderInput[] = [];
  const cash = amount(input.split.cash), mobile = amount(input.split.mobile), card = amount(input.split.card);
  if (cash) parts.push({ method: "cash", amountMinor: cash });
  if (mobile) {
    if (!input.split.mobileReference.trim()) throw new Error("Enter the mobile money reference.");
    parts.push({ method: "mobile", amountMinor: mobile, reference: input.split.mobileReference.trim() });
  }
  if (card) parts.push({ method: "card", amountMinor: card });
  const sum = cash + mobile + card;
  if (sum !== total) throw new Error(`The parts add up to ${formatMinorAmount(sum, currency)} but the total is ${formatMinorAmount(total, currency)}.`);
  return parts;
}

function SellPanel({ companyId, overview, refresh, online, userId, goTo }: PanelProps) {
  const currency = overview.currency!;
  const perms = permissionsOf(overview);
  const customers = overview.customers ?? [];
  const { active, storeId, choose } = useStoreChoice(overview);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<PayMode>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [paidNowMethod, setPaidNowMethod] = useState<PaymentMethod>("cash");
  const [paidNowReference, setPaidNowReference] = useState("");
  const [split, setSplit] = useState({ cash: "", mobile: "", mobileReference: "", card: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ShopReceipt | null>(null);
  const [queued, setQueued] = useState<QueuedSale[]>([]);
  const submissionKey = useRef<string | null>(null);
  const scope: OutboxScope = useMemo(() => ({ userId, companyId }), [userId, companyId]);
  const send = useCallback((sale: SaleRequest) => recordShopSale(companyId, sale), [companyId]);

  // The queue lives in async storage, so a read can finish after this panel is gone. Never set state then.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reloadQueue = useCallback(() => { void readOutbox(scope).then(list => { if (mounted.current) setQueued(list); }).catch(() => { /* keep the last list */ }); }, [scope]);
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
  const hasPending = queued.some(q => q.status === "queued" || q.status === "sending");
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
  const subtotal = lines.reduce((sum, [id, q]) => sum + q * (products.find(p => p.id === id)?.unitPriceMinor ?? 0), 0);
  let discountMinor = 0;
  try { discountMinor = discountOpen && discount.trim() ? parseAmountToMinor(discount, currency) : 0; } catch { discountMinor = -1; }
  const total = subtotal - Math.max(0, discountMinor);
  const customer = customers.find(c => c.id === customerId);
  const resetForm = () => { setCart({}); setTendered(""); setReference(""); setDiscount(""); setDiscountReason(""); setDiscountOpen(false);
    setPaidNow(""); setPaidNowReference(""); setSplit({ cash: "", mobile: "", mobileReference: "", card: "" }); submissionKey.current = null; };
  const touch = () => { setReceipt(null); setError(""); submissionKey.current = null; };
  const change = (delta: number, id: string) => { touch(); setCart(c => ({ ...c, [id]: Math.max(0, Math.min(stockOf(id), (c[id] ?? 0) + delta)) })); };
  const modes: PayMode[] = ["cash", "mobile", "card", ...(perms.canCredit ? ["credit" as const] : []), "split"];

  if (!active.length) return <section className="shop-card shop-empty"><h2>No store yet</h2>
    <p>{overview.role === "owner" ? "Add a store under Team, then add stock under Stock." : "The owner hasn't assigned you to a store yet. Ask them to add you to the store you work in."}</p></section>;

  const record = async () => {
    setError("");
    let tenders: TenderInput[];
    try {
      if (discountMinor < 0) throw new Error("Enter the discount as an amount, for example 5 or 2.50.");
      if (discountMinor > subtotal) throw new Error("The discount is more than the sale.");
      if (discountMinor * 10000 > subtotal * perms.maxDiscountBps) throw new Error(`You can give up to ${perms.maxDiscountBps / 100}% off.`);
      if (discountMinor > 0 && !discountReason.trim()) throw new Error("Say why you are giving this discount.");
      tenders = buildTenders({ mode, total, currency, tendered, reference, customerId, paidNow, paidNowMethod, paidNowReference, split });
      const credit = tenders.find(t => t.method === "credit");
      if (credit && customer && customer.balanceMinor + credit.amountMinor > customer.creditLimitMinor)
        throw new Error(`${customer.name} can owe up to ${formatMinorAmount(customer.creditLimitMinor, currency)} and already owes ${formatMinorAmount(customer.balanceMinor, currency)}. Take more payment now or ask the owner to raise the limit.`);
    } catch (cause) { setError(message(cause)); return; }
    submissionKey.current ??= newSubmissionKey();
    const sale: SaleRequest = { storeId, submissionKey: submissionKey.current, clientRecordedAt: new Date().toISOString(),
      lines: lines.map(([productId, quantity]) => ({ productId, quantity })), tenders,
      ...(discountMinor > 0 ? { discountMinor, discountReason: discountReason.trim() } : {}) };
    const summary = lines.map(([id, q]) => `${q} × ${products.find(p => p.id === id)?.name ?? "item"}`).join(", ")
      + (customer && tenders.some(t => t.method === "credit") ? ` · credit to ${customer.name}` : "");
    setBusy(true);
    try {
      const result = await submitSale(scope, sale, summary, send);
      if (result.state === "recorded") { setReceipt(result.receipt); resetForm(); void refresh(); }
      else if (result.state === "queued") { resetForm(); setError("No connection. The sale is saved on this phone and will be sent automatically."); }
      else if (result.state === "already-confirmed") { resetForm(); void refresh(); }
      else { submissionKey.current = null; setError(result.error); }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); reloadQueue(); }
  };

  const splitSum = (["cash", "mobile", "card"] as const).reduce((n, k) => { try { return n + (split[k].trim() ? parseAmountToMinor(split[k], currency) : 0); } catch { return n; } }, 0);
  return <div className="shop-sell">
    <section className="shop-card">
      <div className="shop-card-head"><h2>Products</h2><StorePicker stores={active} storeId={storeId} choose={id => { choose(id); setCart({}); }} /></div>
      {!products.length && (overview.role === "owner"
        ? <p className="shop-muted">No products yet. <button type="button" className="shop-link" onClick={() => goTo?.("stock")}>Add your first product</button></p>
        : <p className="shop-muted">No products are available to sell yet. Ask the owner to add them.</p>)}
      {products.length > 0 && products.every(p => stockOf(p.id) <= 0) && <p className="shop-muted" role="status">Everything is out of stock in this store{overview.role === "owner" ? ". Add stock under Stock to start selling." : ". Tell the owner."}</p>}
      {!online && products.length > 0 && <p className="shop-muted" role="status">Offline: this list is from the last time you were connected. Stock may have changed.</p>}
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
        {discountMinor > 0 && <p className="shop-total shop-subtotal"><span>Before discount</span><span>{formatMinorAmount(subtotal, currency)}</span></p>}
        <p className="shop-total"><span>Total</span><strong>{formatMinorAmount(Math.max(0, total), currency)}</strong></p>
        {perms.canDiscount && (discountOpen
          ? <div className="shop-discount">
              <label className="shop-field">Discount ({currency}){overview.role !== "owner" && <small> up to {perms.maxDiscountBps / 100}%</small>}
                <input inputMode="decimal" value={discount} onChange={e => { touch(); setDiscount(e.target.value); }} /></label>
              <label className="shop-field">Reason<input value={discountReason} onChange={e => { touch(); setDiscountReason(e.target.value); }} maxLength={120} placeholder="e.g. regular customer, bulk buy" /></label>
              <button type="button" className="secondary-action" onClick={() => { touch(); setDiscountOpen(false); setDiscount(""); setDiscountReason(""); }}>No discount</button>
            </div>
          : <button type="button" className="secondary-action shop-discount-open" disabled={!lines.length} onClick={() => setDiscountOpen(true)}>Add discount</button>)}
        <div className="shop-segment shop-segment-wrap" role="group" aria-label="Payment method">
          {modes.map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { touch(); setMode(m); }}>{payModeLabel[m]}</button>)}
        </div>
        {mode === "cash" && <label className="shop-field">Amount received <small>(leave empty if exact)</small>
          <input inputMode="decimal" value={tendered} onChange={e => { touch(); setTendered(e.target.value); }} placeholder={formatMinorAmount(Math.max(0, total), currency)} /></label>}
        {mode === "mobile" && <label className="shop-field">Mobile money reference
          <input value={reference} onChange={e => { touch(); setReference(e.target.value); }} autoComplete="off" maxLength={80} /></label>}
        {mode === "credit" && <div className="shop-credit">
          {customers.length
            ? <label className="shop-field">Customer
                <select value={customerId} onChange={e => { touch(); setCustomerId(e.target.value); }}>
                  <option value="">Choose a customer…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </select></label>
            : <p className="shop-muted">No customers yet. Add one under Customers; the owner sets how much they can owe.</p>}
          {customer && <p className="shop-muted">Owes {formatMinorAmount(customer.balanceMinor, currency)} of {formatMinorAmount(customer.creditLimitMinor, currency)} allowed.</p>}
          <label className="shop-field">Paid now <small>(optional)</small>
            <input inputMode="decimal" value={paidNow} onChange={e => { touch(); setPaidNow(e.target.value); }} placeholder="0" /></label>
          {paidNow.trim() && <div className="shop-segment" role="group" aria-label="Paid now by">
            {(["cash", "mobile", "card"] as const).map(m => <button key={m} type="button" aria-pressed={paidNowMethod === m} onClick={() => { touch(); setPaidNowMethod(m); }}>{payModeLabel[m]}</button>)}
          </div>}
          {paidNow.trim() && paidNowMethod === "mobile" && <label className="shop-field">Mobile money reference
            <input value={paidNowReference} onChange={e => { touch(); setPaidNowReference(e.target.value); }} autoComplete="off" maxLength={80} /></label>}
        </div>}
        {mode === "split" && <div className="shop-split">
          <label className="shop-field">Cash<input inputMode="decimal" value={split.cash} onChange={e => { touch(); setSplit(s => ({ ...s, cash: e.target.value })); }} placeholder="0" /></label>
          <label className="shop-field">Mobile money<input inputMode="decimal" value={split.mobile} onChange={e => { touch(); setSplit(s => ({ ...s, mobile: e.target.value })); }} placeholder="0" /></label>
          {split.mobile.trim() && <label className="shop-field">Mobile money reference<input value={split.mobileReference} onChange={e => { touch(); setSplit(s => ({ ...s, mobileReference: e.target.value })); }} autoComplete="off" maxLength={80} /></label>}
          <label className="shop-field">Card<input inputMode="decimal" value={split.card} onChange={e => { touch(); setSplit(s => ({ ...s, card: e.target.value })); }} placeholder="0" /></label>
          <p className="shop-muted" role="status">{splitSum === total ? "Parts add up to the total." : `Still to cover: ${formatMinorAmount(total - splitSum, currency)}`}</p>
        </div>}
        <button type="button" className="primary-action shop-record" disabled={busy || !lines.length} onClick={() => void record()}>
          <ReceiptText aria-hidden="true" />{busy ? "Recording…" : online ? "Record sale" : "Save sale (offline)"}</button>
        {error && <p role="alert" className="shop-alert">{error}</p>}
      </>}
      {queued.length > 0 && <div className="shop-queue">
        <h3>Waiting to send</h3>
        <ul>{queued.map(q => <li key={q.id} className={q.status === "rejected" || q.status === "needs-review" ? "is-rejected" : ""}>
          <span>{q.summary}</span>
          {q.status === "queued" || q.status === "sending"
            ? <small>{q.status === "sending" ? "Sending…" : q.ambiguous ? "Not confirmed yet. Checking with the server when online." : "Will send when online"}</small>
            : <>
              <small>{q.status === "needs-review" ? `Needs review: ${q.error}` : `Not recorded: ${q.error}`}</small>
              <button type="button" className="secondary-action"
                onClick={() => { void dismissQueuedSale(scope, q.id, { force: !!q.unreadable }).then(reloadQueue); }}>{q.unreadable ? "Remove unreadable sale" : "Dismiss"}</button></>}
        </li>)}</ul>
      </div>}
    </section>
  </div>;
}

function tenderText(t: NonNullable<ShopReceipt["tenders"]>[number], money: (v: number) => string) {
  if (t.method === "cash") return t.tenderedMinor > t.amountMinor ? `Cash ${money(t.amountMinor)} (received ${money(t.tenderedMinor)})` : `Cash ${money(t.amountMinor)}`;
  if (t.method === "mobile") return `Mobile money ${money(t.amountMinor)} · ${t.reference ?? ""}`;
  if (t.method === "card") return `Card ${money(t.amountMinor)}`;
  return `On credit ${money(t.amountMinor)}`;
}

function Receipt({ receipt, onNext }: { receipt: ShopReceipt; onNext?: () => void }) {
  const money = (v: number) => formatMinorAmount(v, receipt.currency);
  const discount = receipt.discountMinor ?? 0;
  const tenders = receipt.tenders ?? [];
  return <div className="shop-receipt" aria-label={`Receipt ${receipt.receiptNumber}`}>
    <p className="shop-receipt-ok"><Check aria-hidden="true" />Sale recorded</p>
    <p className="shop-muted">Receipt #{receipt.receiptNumber} · {receipt.storeName} · {new Date(receipt.recordedAt).toLocaleString()}</p>
    <ul>{receipt.lines.map(l => <li key={l.productId}><span>{l.quantity} × {l.name}</span><span>{money(l.lineTotalMinor)}</span></li>)}</ul>
    {discount > 0 && <p className="shop-total shop-subtotal"><span>Discount · {receipt.discountReason}</span><span>−{money(discount)}</span></p>}
    <p className="shop-total"><span>Total</span><strong>{money(receipt.totalMinor)}</strong></p>
    {tenders.length
      ? <ul className="shop-tenders">{tenders.map((t, i) => <li key={i}><span>{tenderText(t, money)}</span></li>)}</ul>
      : <p className="shop-muted">{receipt.payment.method === "mobile" ? `Mobile money · ${receipt.payment.reference}` : receipt.payment.method === "card" ? "Card" : `Cash received ${money(receipt.payment.amountTenderedMinor)}`}</p>}
    {receipt.payment.changeMinor > 0 && <p className="shop-muted">Change {money(receipt.payment.changeMinor)}</p>}
    {receipt.customer && <p className="shop-muted">Customer: {receipt.customer.name} · now owes {money(receipt.customer.balanceMinor)}</p>}
    {(receipt.refunds ?? []).length > 0 && <div className="shop-refunds">
      {receipt.refunds.map(r => <p key={r.refundId}><Undo2 aria-hidden="true" />Refund {r.refundNo}: {money(r.amountMinor)}{(r.creditMinor ?? 0) > 0 ? ` (${money(r.creditMinor!)} off what they owe${r.amountMinor > r.creditMinor! ? `, ${money(r.amountMinor - r.creditMinor!)} by ${methodLabel(r.method).toLowerCase()}` : ""})` : ` by ${methodLabel(r.method).toLowerCase()}`} · {r.reason}{r.returnedToStock ? " · back in stock" : " · not restocked"} · {new Date(r.recordedAt).toLocaleString()}</p>)}
      <p className="shop-total"><span>Kept after refunds</span><strong>{money(receipt.totalMinor - receipt.refundedMinor)}</strong></p>
    </div>}
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
        <p>Send this one-time code to <strong>{issued.email}</strong>. It works once, only for their account, and expires in 24 hours.</p>
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
        <MemberPermissions key={JSON.stringify(overview.memberPermissions?.[m.userId] ?? NO_PERMISSIONS)} companyId={companyId} member={m}
          current={overview.memberPermissions?.[m.userId] ?? NO_PERMISSIONS} online={online} refresh={refresh} />
        <fieldset><legend>Can sell in</legend>
          {overview.stores.filter(s => s.status === "active").map(s => <label key={s.id} className="shop-check">
            <input type="checkbox" checked={m.storeIds.includes(s.id)} disabled={busy || !online}
              onChange={e => void run(() => assignShopStore(companyId, s.id, m.userId, e.target.checked))} />{s.name}</label>)}
        </fieldset></li>)}</ul>
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
    <RefundPolicyCard companyId={companyId} online={online} />
  </div>;
}

/** Owner-only: whether this business allows refunds, which kinds, and for how long. Enforced by the server. */
function RefundPolicyCard({ companyId, online }: { companyId: string; online: boolean }) {
  const [policy, setPolicy] = useState<ShopRefundPolicy | null>(null);
  const [form, setForm] = useState({ enabled: false, allowVoid: true, allowPartial: true, days: "30", reason: "", confirmed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const adopt = useCallback((p: ShopRefundPolicy) => {
    setPolicy(p);
    setForm(f => ({ ...f, enabled: p.refundsEnabled, allowVoid: p.refundsEnabled ? p.allowVoid : true,
      allowPartial: p.refundsEnabled ? p.allowPartial : true, days: String(p.maxAgeDays), reason: "", confirmed: false }));
  }, []);
  useEffect(() => {
    if (!online) return;
    let live = true;
    getShopRefundPolicy(companyId).then(p => { if (live) adopt(p); }).catch(c => { if (live) setError(message(c)); });
    return () => { live = false; };
  }, [companyId, online, adopt]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    const days = Number(form.days);
    if (form.enabled && (!Number.isInteger(days) || days < 1 || days > 3650)) { setError("Enter the refund window as a whole number of days from 1 to 3650."); return; }
    if (form.enabled && !form.allowVoid && !form.allowPartial) { setError("Choose which refunds are allowed."); return; }
    setBusy(true); setError(""); setSaved(false);
    try {
      adopt(await setShopRefundPolicy(companyId, { refundsEnabled: form.enabled, allowVoid: form.enabled && form.allowVoid,
        allowPartial: form.enabled && form.allowPartial, maxAgeDays: form.enabled ? days : policy.maxAgeDays,
        reason: form.reason.trim(), expectedRevision: policy.revision, confirmed: true }));
      setSaved(true);
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  return <section className="shop-card" aria-labelledby="refund-policy-title">
    <h2 id="refund-policy-title">Refund policy</h2>
    {!policy ? <p className="shop-muted" role="status">{online ? "Loading…" : "Connect to the internet to see or change the refund policy."}</p> : <form onSubmit={e => void submit(e)}>
      <p className="shop-muted">Refunds are off until you turn them on. A change applies to sales made after it; earlier sales keep the rules they were sold under. Customers may have legal rights that this setting cannot remove.</p>
      <label className="shop-check"><input type="checkbox" checked={form.enabled} disabled={busy || !online}
        onChange={e => { setSaved(false); setForm(f => ({ ...f, enabled: e.target.checked, confirmed: false })); }} />Allow refunds</label>
      {form.enabled && <>
        <label className="shop-check"><input type="checkbox" checked={form.allowVoid} disabled={busy || !online}
          onChange={e => setForm(f => ({ ...f, allowVoid: e.target.checked }))} />Whole-sale refunds</label>
        <label className="shop-check"><input type="checkbox" checked={form.allowPartial} disabled={busy || !online}
          onChange={e => setForm(f => ({ ...f, allowPartial: e.target.checked }))} />Refund some items</label>
        <label className="shop-field">Refund window (days)
          <input inputMode="numeric" value={form.days} disabled={busy || !online} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} /></label>
      </>}
      <label className="shop-field">Why are you changing this?
        <input value={form.reason} maxLength={200} required disabled={busy || !online} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></label>
      <label className="shop-check"><input type="checkbox" checked={form.confirmed} disabled={busy || !online}
        onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} />I understand this applies to new sales</label>
      <button className="primary-action" disabled={busy || !online || !form.confirmed || !form.reason.trim()}>Save policy</button>
      {saved && <p role="status" className="shop-muted">Saved as version {policy.revision}.</p>}
      {policy.history.length > 0 && <details><summary>History ({policy.history.length})</summary>
        <ul className="shop-list">{policy.history.slice(0, 5).map(h => <li key={h.revision}>
          <span>v{h.revision}: {h.refundsEnabled ? `${[h.allowVoid && "whole sale", h.allowPartial && "some items"].filter(Boolean).join(" and ")}, ${h.maxAgeDays} days` : "refunds off"}</span>
          <small>{new Date(h.effectiveAt).toLocaleDateString()} · {h.reason}</small></li>)}</ul></details>}
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </form>}
  </section>;
}

function SalesPanel({ companyId, overview, online }: PanelProps) {
  const [sales, setSales] = useState<ShopReceipt[] | null>(null);
  const [storeFilter, setStoreFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!online) return; setError("");
    void listShopSales(companyId, storeFilter || undefined).then(setSales).catch(c => setError(message(c))); }, [companyId, storeFilter, online]);
  const emailOf = (id: string) => overview.members.find(m => m.userId === id)?.email;
  const total = (sales ?? []).reduce((s, r) => s + r.totalMinor - (r.refundedMinor ?? 0), 0);
  const replace = (next: ShopReceipt) => setSales(list => (list ?? []).map(r => r.saleId === next.saleId ? next : r));
  return <section className="shop-card">
    <div className="shop-card-head"><h2>{overview.role === "owner" ? "Recent sales" : "My recent sales"}</h2>
      {overview.role === "owner" && overview.stores.length > 1 && <label className="shop-field shop-store-select">Store
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}><option value="">All stores</option>
          {overview.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>
    {!online && <p className="shop-muted">Connect to see sales.</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
    {sales && !sales.length && <p className="shop-muted">No sales yet.</p>}
    {sales && sales.length > 0 && <p className="shop-total"><span>Total of last {sales.length} sale{sales.length === 1 ? "" : "s"}, after refunds</span><strong>{formatMinorAmount(total, overview.currency!)}</strong></p>}
    <ul className="shop-sales">{(sales ?? []).map(r => <li key={r.saleId}>
      <button type="button" aria-expanded={open === r.saleId} onClick={() => setOpen(o => o === r.saleId ? null : r.saleId)}>
        <span>#{r.receiptNumber} · {new Date(r.recordedAt).toLocaleString()}<small>{r.storeName}{overview.role === "owner" && emailOf(r.cashierId) ? ` · ${emailOf(r.cashierId)}` : ""} · {methodLabel(r.payment.method)}</small></span>
        <strong>{r.refundedMinor ? <><s>{formatMinorAmount(r.totalMinor, r.currency)}</s> {formatMinorAmount(r.totalMinor - r.refundedMinor, r.currency)}</> : formatMinorAmount(r.totalMinor, r.currency)}</strong></button>
      {open === r.saleId && <><Receipt receipt={r} />
        {overview.role === "owner" && r.refundedMinor < r.totalMinor && <RefundForm companyId={companyId} receipt={r} online={online} onDone={replace} />}</>}
    </li>)}</ul>
  </section>;
}

/** Customers who buy on credit. Attendants allowed to give credit can add a
 * customer and take repayments; only the owner sets how much someone may owe. */
function CustomersPanel({ companyId, overview, refresh, online }: PanelProps) {
  const currency = overview.currency!;
  const isOwner = overview.role === "owner";
  const customers = overview.customers ?? [];
  const owed = customers.reduce((n, c) => n + c.balanceMinor, 0);
  const [form, setForm] = useState({ name: "", phone: "", limit: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await saveShopCustomer(companyId, { customerId: crypto.randomUUID(), name: form.name, ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(isOwner ? { creditLimitMinor: form.limit.trim() ? parseAmountToMinor(form.limit, currency) : 0 } : {}) });
      setForm({ name: "", phone: "", limit: "" }); await refresh();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  return <div className="shop-grid shop-grid-two">
    <section className="shop-card">
      <div className="shop-card-head"><h2>Customers</h2>{customers.length > 0 && <p className="shop-muted">Owed to you: <strong>{formatMinorAmount(owed, currency)}</strong></p>}</div>
      {!customers.length && <p className="shop-muted">No customers yet.</p>}
      <ul className="shop-members">{customers.map(c => <li key={c.id}>
        <button type="button" className="shop-customer-row" aria-expanded={open === c.id} onClick={() => setOpen(o => o === c.id ? null : c.id)}>
          <span><strong>{c.name}</strong>{c.phone && <small>{c.phone}</small>}</span>
          <span className={c.balanceMinor ? "shop-owes" : "shop-muted"}>{c.balanceMinor ? `Owes ${formatMinorAmount(c.balanceMinor, currency)}` : "Owes nothing"}<small>Limit {formatMinorAmount(c.creditLimitMinor, currency)}</small></span>
        </button>
        {open === c.id && <CustomerDetail companyId={companyId} customer={c} currency={currency} isOwner={isOwner} online={online} refresh={refresh} />}
      </li>)}</ul>
    </section>
    <section className="shop-card">
      <h2>Add a customer</h2>
      <form className="shop-edit" onSubmit={add}>
        <label className="shop-field">Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} required /></label>
        <label className="shop-field">Phone <small>(optional)</small><input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} maxLength={20} /></label>
        {isOwner
          ? <label className="shop-field">Can owe up to ({currency})<input inputMode="decimal" value={form.limit} onChange={e => setForm({ ...form, limit: e.target.value })} placeholder="0" /></label>
          : <p className="shop-muted">The owner decides how much a new customer can owe. Until then they can't buy on credit.</p>}
        <button className="primary-action" disabled={busy || !online || !form.name.trim()}>{busy ? "Saving…" : "Add customer"}</button>
      </form>
      {error && <p role="alert" className="shop-alert">{error}</p>}
    </section>
  </div>;
}

function CustomerDetail({ companyId, customer, currency, isOwner, online, refresh }: {
  companyId: string; customer: ShopCustomer; currency: string; isOwner: boolean; online: boolean; refresh: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [limit, setLimit] = useState((customer.creditLimitMinor / currencyMinorDivisor(currency)).toString());
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // Kept across a failed send so a retry can never record the payment twice.
  const pending = useRef<{ key: string; body: string } | null>(null);
  const money = (v: number) => formatMinorAmount(v, currency);
  const loadStatement = useCallback(() => { void getCustomerStatement(companyId, customer.id).then(setStatement).catch(c => setError(message(c))); }, [companyId, customer.id]);
  useEffect(() => { if (online) loadStatement(); }, [online, loadStatement, customer.balanceMinor]);

  const repay = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setDone("");
    let amountMinor: number;
    try { amountMinor = parseAmountToMinor(amount, currency); } catch (cause) { setError(message(cause)); return; }
    if (amountMinor > customer.balanceMinor) { setError(`${customer.name} only owes ${money(customer.balanceMinor)}.`); return; }
    if (method === "mobile" && !reference.trim()) { setError("Enter the mobile money reference."); return; }
    const request = { customerId: customer.id, amountMinor, method, ...(method === "mobile" ? { reference: reference.trim() } : {}) };
    const body = JSON.stringify(request);
    if (pending.current?.body !== body) pending.current = { key: newSubmissionKey(), body };
    setBusy(true);
    try {
      const result = await recordShopRepayment(companyId, { ...request, repaymentKey: pending.current.key });
      pending.current = null; setAmount(""); setReference("");
      setDone(`Recorded ${money(amountMinor)}. ${customer.name} now owes ${money(result.balanceMinor)}.`);
      await refresh();
    } catch (cause) {
      const unreachable = cause instanceof ShopUnreachableError;
      if (!unreachable) pending.current = null;
      setError(unreachable ? "No connection. Nothing was recorded yet. Try again when you're online." : message(cause));
    } finally { setBusy(false); }
  };
  const saveLimit = async () => {
    setBusy(true); setError(""); setDone("");
    try {
      await saveShopCustomer(companyId, { customerId: customer.id, name: customer.name, ...(customer.phone ? { phone: customer.phone } : {}),
        creditLimitMinor: limit.trim() ? parseAmountToMinor(limit, currency) : 0 });
      setDone("Limit saved."); await refresh();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  const kind = { credit_sale: "Bought on credit", repayment: "Paid", refund: "Refund taken off" } as const;
  return <div className="shop-customer-detail">
    {customer.balanceMinor > 0 && <form className="shop-edit" onSubmit={repay}>
      <h3>Record a payment</h3>
      <label className="shop-field">Amount ({currency})<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={money(customer.balanceMinor)} required /></label>
      <div className="shop-segment" role="group" aria-label="Paid by">
        {(["cash", "mobile", "card"] as const).map(m => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>{methodLabel(m)}</button>)}
      </div>
      {method === "mobile" && <label className="shop-field">Mobile money reference<input value={reference} onChange={e => setReference(e.target.value)} autoComplete="off" maxLength={80} /></label>}
      <button className="primary-action" disabled={busy || !online}>{busy ? "Recording…" : "Record payment"}</button>
    </form>}
    {isOwner && <div className="shop-inline-form">
      <label className="shop-field">Can owe up to ({currency})<input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} /></label>
      <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => void saveLimit()}>Save limit</button>
    </div>}
    {done && <p role="status" className="shop-muted">{done}</p>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
    {statement && statement.entries.length > 0 && <div className="shop-statement">
      <h3>History</h3>
      <ul>{statement.entries.map((e, i) => <li key={i}>
        <span>{kind[e.kind]}{e.receiptNumber ? ` · receipt #${e.receiptNumber}` : ""}{e.method ? ` · ${methodLabel(e.method).toLowerCase()}` : ""}<small>{new Date(e.recordedAt).toLocaleString()}</small></span>
        <span>{e.amountMinor > 0 ? "+" : "−"}{money(Math.abs(e.amountMinor))}<small>owes {money(e.balanceAfterMinor)}</small></span>
      </li>)}</ul>
    </div>}
  </div>;
}

/** Owner sets what each attendant may do at the till. */
function MemberPermissions({ companyId, member, current, online, refresh }: {
  companyId: string; member: ShopOverview["members"][number]; current: ShopPermissions; online: boolean; refresh: () => Promise<void>;
}) {
  const [canDiscount, setCanDiscount] = useState(current.canDiscount);
  const [percent, setPercent] = useState(String(current.maxDiscountBps / 100 || 10));
  const [canCredit, setCanCredit] = useState(current.canCredit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = canDiscount !== current.canDiscount || canCredit !== current.canCredit
    || (canDiscount && Math.round(Number(percent) * 100) !== current.maxDiscountBps);
  const save = async () => {
    const bps = Math.round(Number(percent) * 100);
    if (canDiscount && (!Number.isFinite(bps) || bps < 1 || bps > 10000)) { setError("Enter a discount limit between 0.01% and 100%."); return; }
    setBusy(true); setError(""); setSaved(false);
    try { await setShopMemberPermissions(companyId, member.userId, { canDiscount, maxDiscountBps: canDiscount ? bps : 0, canCredit }); setSaved(true); await refresh(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  return <fieldset className="shop-permissions"><legend>At the till</legend>
    <label className="shop-check"><input type="checkbox" checked={canDiscount} disabled={busy || !online} onChange={e => { setSaved(false); setCanDiscount(e.target.checked); }} />Can give discounts</label>
    {canDiscount && <label className="shop-field shop-percent">Up to (%)<input inputMode="decimal" value={percent} onChange={e => { setSaved(false); setPercent(e.target.value); }} disabled={busy || !online} /></label>}
    <label className="shop-check"><input type="checkbox" checked={canCredit} disabled={busy || !online} onChange={e => { setSaved(false); setCanCredit(e.target.checked); }} />Can sell on credit and take repayments</label>
    {(dirty || saved) && <button type="button" className="secondary-action" disabled={busy || !online || !dirty} onClick={() => void save()}>{saved && !dirty ? "Saved" : busy ? "Saving…" : "Save"}</button>}
    {error && <p role="alert" className="shop-alert">{error}</p>}
  </fieldset>;
}

/** Owner-only. Refunds never change the sale: they are new records that return
 * the money by the sale's own payment method and, optionally, the stock. */
function RefundForm({ companyId, receipt, online, onDone }: { companyId: string; receipt: ShopReceipt; online: boolean; onDone: (r: ShopReceipt) => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Kept across a failed send so a retry can never refund twice.
  const pending = useRef<{ key: string; body: string } | null>(null);
  const money = (v: number) => formatMinorAmount(v, receipt.currency);
  const left = receipt.lines.map(l => ({ ...l, left: l.quantity - (l.refundedQuantity ?? 0) })).filter(l => l.left > 0);
  const chosen = left.filter(l => (qty[l.lineNo] ?? 0) > 0);
  // Same rule as the server: the first n units of a line are worth floor(n * paid / quantity).
  const worth = (l: ShopReceipt["lines"][number], n: number) => Math.floor((n * (l.lineTotalMinor - (l.lineDiscountMinor ?? 0))) / l.quantity);
  const chosenMinor = chosen.reduce((n, l) => n + worth(l, (l.refundedQuantity ?? 0) + qty[l.lineNo]!) - worth(l, l.refundedQuantity ?? 0), 0);
  const leftMinor = receipt.totalMinor - receipt.refundedMinor;
  const how = methodLabel(receipt.payment.method).toLowerCase();
  const onCredit = Boolean(receipt.customer) && (receipt.tenders ?? []).some(t => t.method === "credit");
  const route = onCredit
    ? `It first reduces what ${receipt.customer!.name} still owes on this sale; anything more goes back as money (cash first).`
    : receipt.payment.method === "split" ? "The money goes back as cash first, from the till."
    : `The money goes back by ${how}${receipt.payment.method === "mobile" ? ": send it from your mobile money wallet." : receipt.payment.method === "card" ? ": reverse it on your card machine." : " from the till."}`;

  const send = async (whole: boolean) => {
    if (!reason.trim()) { setError("Say why this is being refunded."); return; }
    const amount = whole ? leftMinor : chosenMinor;
    if (!window.confirm(`Refund ${money(amount)}? ${route} This can't be undone.`)) return;
    const request = { saleId: receipt.saleId, reason: reason.trim(), returnToStock: restock,
      ...(whole ? {} : { lines: chosen.map(l => ({ lineNo: l.lineNo, quantity: qty[l.lineNo]! })) }) };
    const body = JSON.stringify(request);
    if (pending.current?.body !== body) pending.current = { key: newSubmissionKey(), body };
    setBusy(true); setError("");
    try {
      const next = await refundShopSale(companyId, { ...request, refundKey: pending.current.key });
      pending.current = null; setQty({}); setReason(""); setOpen(false); onDone(next);
    } catch (cause) {
      const unreachable = cause instanceof ShopUnreachableError;
      if (!unreachable) pending.current = null;
      setError(unreachable ? "No connection. Nothing was refunded yet. Try again when you're online." : message(cause));
    } finally { setBusy(false); }
  };

  if (!open) return <button type="button" className="secondary-action shop-refund-open" disabled={!online} onClick={() => setOpen(true)}><Undo2 aria-hidden="true" />Refund or void</button>;
  return <form className="shop-refund" onSubmit={e => { e.preventDefault(); void send(false); }}>
    <h3>Refund from receipt #{receipt.receiptNumber}</h3>
    <ul className="shop-product-list">{left.map(l => <li key={l.lineNo}>
      <div><strong>{l.name}</strong><span>{l.left} can be refunded · {money(l.unitPriceMinor)} each{l.lineDiscountMinor ? " before discount" : ""}</span></div>
      <div className="shop-stepper">
        <button type="button" className="secondary-action" aria-label={`Refund one less ${l.name}`} disabled={!qty[l.lineNo]} onClick={() => setQty(q => ({ ...q, [l.lineNo]: (q[l.lineNo] ?? 0) - 1 }))}><Minus aria-hidden="true" /></button>
        <output aria-label={`${l.name} to refund`}>{qty[l.lineNo] ?? 0}</output>
        <button type="button" className="secondary-action" aria-label={`Refund one more ${l.name}`} disabled={(qty[l.lineNo] ?? 0) >= l.left} onClick={() => setQty(q => ({ ...q, [l.lineNo]: (q[l.lineNo] ?? 0) + 1 }))}><Plus aria-hidden="true" /></button>
      </div></li>)}</ul>
    <label className="shop-field">Reason<input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="e.g. customer returned it, keyed by mistake" /></label>
    <label className="shop-check"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />Put the items back in stock (untick if damaged)</label>
    <p className="shop-muted">{route}</p>
    <div className="shop-actions">
      <button className="primary-action" disabled={busy || !online || !chosen.length}>{busy ? "Refunding…" : `Refund ${money(chosenMinor)}`}</button>
      <button type="button" className="secondary-action shop-void" disabled={busy || !online} onClick={() => void send(true)}>Void whole sale ({money(leftMinor)})</button>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
    </div>
    {error && <p role="alert" className="shop-alert">{error}</p>}
  </form>;
}
