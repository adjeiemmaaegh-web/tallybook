/**
 * Moves this phone's catalogue and current stock into the shared shop as an
 * opening balance, so the owner and attendants start from the same numbers.
 * Past sales stay here as history. The server applies it all-or-nothing and
 * never overwrites what the shared shop already has.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CloudUpload } from "lucide-react";
import type { TallybookDB } from "@/db/TallybookDB";
import { isSupabaseConfigured, getSupabaseClient } from "@/lib/supabase";
import { listVerifiedCloudBusinesses } from "./cloudMembership";
import { getShopOverview, importShopOpening, type OpeningImportResult, type ShopOverview } from "./shopClient";
import { readLocalBooks, type LocalBooksSnapshot } from "./localBooksExport";

type Target = { id: string; name: string; overview: ShopOverview };
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.";

export function MoveToSharedShopPanel({ database, profileId }: { database: TallybookDB; profileId: string }) {
  const [open, setOpen] = useState(false);
  return <details className="shop-move rounded border p-4" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary className="flex cursor-pointer items-center gap-2 font-semibold"><CloudUpload className="h-4 w-4" aria-hidden="true" />Move to the shared shop</summary>
    {open && <MoveBody database={database} profileId={profileId} />}
  </details>;
}

function MoveBody({ database, profileId }: { database: TallybookDB; profileId: string }) {
  const [state, setState] = useState<"loading" | "signed-out" | "no-business" | "ready">("loading");
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetId, setTargetId] = useState("");
  const [snapshot, setSnapshot] = useState<LocalBooksSnapshot | null>(null);
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OpeningImportResult | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const local = await readLocalBooks(database, profileId);
        if (!live) return;
        setSnapshot(local);
        if (!isSupabaseConfigured || !(await getSupabaseClient().auth.getSession()).data.session) { if (live) setState("signed-out"); return; }
        const owned = (await listVerifiedCloudBusinesses()).filter(b => b.role === "owner");
        const withShops = await Promise.all(owned.map(async b => ({ id: b.id, name: b.name, overview: await getShopOverview(b.id) })));
        if (!live) return;
        setTargets(withShops);
        setTargetId(withShops[0]?.id ?? "");
        setState(withShops.length ? "ready" : "no-business");
      } catch (cause) { if (live) { setError(message(cause)); setState("ready"); } }
    })();
    return () => { live = false; };
  }, [database, profileId]);

  const target = targets.find(t => t.id === targetId);
  const openStores = target?.overview.stores.filter(s => s.status === "active") ?? [];
  useEffect(() => { setStoreId(s => openStores.some(o => o.id === s) ? s : openStores[0]?.id ?? ""); }, [targetId, openStores.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading") return <p role="status" className="mt-3 text-sm">Reading this phone's books…</p>;
  if (error && !snapshot) return <p role="alert" className="mt-3 text-sm">{error}</p>;
  if (state === "signed-out") return <p className="mt-3 text-sm">Sign in to the account that owns your shared shop first. <Link href="/signin">Sign in</Link></p>;
  if (state === "no-business") return <p className="mt-3 text-sm">You don't own a shared shop yet. <Link href="/signin">Create your business</Link>, then open the shared shop and choose its currency.</p>;
  if (!snapshot || !target) return error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null;

  const units = snapshot.books.stock.reduce((n, s) => n + s.quantity, 0);
  const notSetUp = !target.overview.currency;
  const wrongCurrency = !notSetUp && target.overview.currency !== snapshot.books.currency;
  const needsStore = !snapshot.hasStores && snapshot.books.stock.length > 0;
  const blocked = notSetUp || wrongCurrency || (needsStore && !storeId) || !snapshot.books.products.length;

  const move = async () => {
    setBusy(true); setError("");
    try {
      setResult(await importShopOpening(target.id, { ...snapshot.books, ...(needsStore ? { defaultStoreId: storeId } : {}) }));
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };

  return <div className="mt-3 space-y-3 text-sm">
    <p>Copies <strong>{snapshot.books.products.length} products</strong> with their prices{snapshot.hasStores ? <>, <strong>{snapshot.books.stores.length} stores</strong></> : null} and the <strong>{units} units</strong> on hand from “{snapshot.businessName}” into your shared shop, so you and your attendants start from the same stock.</p>
    <p>Past sales stay on this phone as history. From now on, record sales in the shared shop. Products and stock already in the shared shop are never overwritten, and running this again adds nothing twice.</p>
    {(snapshot.skipped.services > 0 || snapshot.skipped.archived > 0) && <p className="text-xs">Left out: {snapshot.skipped.services} services and {snapshot.skipped.archived} archived products (the shared shop sells stocked items only).</p>}
    {targets.length > 1 && <label className="block">Shared shop
      <select className="ml-2" value={targetId} onChange={e => { setTargetId(e.target.value); setResult(null); }}>{targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    {notSetUp && <p role="alert">Open the <Link href="/shop">shared shop</Link> and choose its currency first.</p>}
    {wrongCurrency && <p role="alert">This phone's books are in {snapshot.books.currency} but “{target.name}” sells in {target.overview.currency}, so prices can't be copied.</p>}
    {needsStore && !notSetUp && (openStores.length
      ? <label className="block">Put the stock in
        <select className="ml-2" value={storeId} onChange={e => setStoreId(e.target.value)}>{openStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      : <p role="alert">Add a store in the <Link href="/shop">shared shop</Link> (Team tab) to receive this stock.</p>)}
    {result
      ? <div role="status" className="space-y-1">
          <p><strong>Done.</strong> {result.productsCreated} products added ({result.productsReused} already there), {result.storesCreated} stores added, {result.unitsOpened} units of stock opened{result.stockSkipped ? ` (${result.stockSkipped} items skipped because the shared shop already had stock for them)` : ""}.</p>
          <Link href="/shop" className="primary-action">Open shared shop</Link>
        </div>
      : <button type="button" className="primary-action" disabled={busy || blocked} onClick={() => void move()}>{busy ? "Moving…" : "Move to shared shop"}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
