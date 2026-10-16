import { STAGE9_RELEASE_SCOPE } from "@/features/stores/stage9ReleaseScope";
import { requestStoreTransfer, listStoreTransferRequests, cancelStoreTransfer, dispatchStoreTransfer, completeStoreTransfer, returnUndeliveredDispatch, requestStoreTransferReversal, type StoreTransferRequest } from "@/features/stores/storeTransfers";
import { activateStoreInventory, getCompanyStoreInventory, type OpeningStoreQuantity } from "@/features/stores/storeStockLedger";
import { getLocalStoreReport } from "@/features/stores/storeReport";
import { getRun13StoreTransactionActivity } from "@/features/stores/run13StoreTransactionActivity";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { db } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { listStaff, type StaffDirectoryEntry } from "@/features/staff/staff";
import { recordStoreStockObservation, listStoreStockObservations, type StoreStockObservation } from "@/features/stores/storeStockCounts";
import { createStore, assignStore, listStoreAssignments, listStores, type StoreAssignment, type StoreLocation } from "@/features/stores/storeDirectory";
export default function StoresPage() {
  const { activeCompanyId } = useBusinessProfile();
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [assignments, setAssignments] = useState<StoreAssignment[]>([]);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [countStoreId, setCountStoreId] = useState("");
  const [countProductId, setCountProductId] = useState("");
  const [countQuantity, setCountQuantity] = useState("");
  const [products, setProducts] = useState<Array<{id: string; name: string; stockQuantity:number}>>([]);
  const [storeBalances,setStoreBalances]=useState<Awaited<ReturnType<typeof getCompanyStoreInventory>> | null>(null);
  const [openingAllocations,setOpeningAllocations]=useState<Record<string,string>>({});
  const [openingConfirmed,setOpeningConfirmed]=useState(false);
  const [transfers, setTransfers] = useState<StoreTransferRequest[]>([]);
  const [report, setReport] = useState<Array<{storeId:string;name:string;assignedStaff:number;physicalObservations:number;openTransferRequests:number}>>([]);
  const [transactionActivity,setTransactionActivity]=useState<Awaited<ReturnType<typeof getRun13StoreTransactionActivity>>|null>(null);
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [counts, setCounts] = useState<StoreStockObservation[]>([]);
  const refresh = useCallback(async () => {
    setError(""); setStores([]); setAssignments([]); setStaff([]); setCounts([]); setProducts([]); setTransfers([]); setReport([]); setStoreBalances(null); setTransactionActivity(null);
    const company = activeCompanyId;
    try { const [locations, users, entries, stockProducts] = await Promise.all([listStores(db), listStaff(db), listStoreAssignments(db), db.products.where("businessProfileId").equals(company).toArray()]);
      if (company === getActiveBusinessProfileId()) { setTransfers(await listStoreTransferRequests(db)); try {setReport(await getLocalStoreReport(db));} catch {setReport([]);} try {setTransactionActivity(await getRun13StoreTransactionActivity(db));} catch {setTransactionActivity(null);} setStores(locations); setStaff(users); setAssignments(entries); setProducts(stockProducts.filter(p=>!p.archivedAt && p.itemKind!=="service").map(p=>({id:p.id,name:p.name,stockQuantity:p.stockQuantity}))); try {setStoreBalances(await getCompanyStoreInventory(db));} catch {setStoreBalances(null);} }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cannot load store directory."); }
  }, [activeCompanyId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { let active = true; setCounts([]); if (!countStoreId) return; void listStoreStockObservations(countStoreId, db).then(rows => { if (active) setCounts(rows); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Cannot load store counts."); }); return () => { active=false; }; }, [countStoreId, activeCompanyId]);
  const perform = async (action: () => Promise<unknown>) => { setWorking(true); setError(""); try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); } finally { setWorking(false); } };
  return <section className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <header><p className="text-sm font-semibold uppercase">Stage 9 · Multi-store</p><h1 className="text-3xl font-bold">Store directory</h1><p className="text-sm">Local company stores and staff assignments. This device does not yet synchronize sales or stock across stores.</p></header>
    <aside role="status" className="rounded border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Stage 9 release limitations">
      <strong>Local store management only — not multi-device checkout.</strong>
      <p className="mt-1">Store assignments, physical observations and transfer requests remain on this device. Requests do not reserve or move stock. Do not use these records as authoritative stock or consolidated financial totals.</p>
      <ul className="mt-2 list-disc pl-5">
        {!STAGE9_RELEASE_SCOPE.multiDeviceAttendantCheckout && <li>Attendant sales from separate phones: unavailable</li>}
        {!STAGE9_RELEASE_SCOPE.executeStoreTransfer && <li>Execute inter-store inventory transfer: unavailable</li>}
        {!STAGE9_RELEASE_SCOPE.remoteEventReplication && <li>Remote synchronization: unavailable</li>}
      </ul>
    </aside>
    {error && <p role="alert" className="rounded border p-3">{error}</p>}
    <form className="flex flex-wrap gap-2" onSubmit={e => {e.preventDefault(); void perform(async()=> {await createStore(name,db); setName("");});}}>
      <label className="flex-1">New store name<input className="block w-full rounded border p-3" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required /></label><button className="rounded border px-4" disabled={working}>Create store</button>
    </form>
    <ul className="space-y-2">{stores.map(store=><li key={store.id} className="rounded border p-3"><strong>{store.name}</strong> · {store.status}<p className="text-xs">Assigned staff: {assignments.filter(a=>a.storeId===store.id).length}</p></li>)}</ul>
    <form className="space-y-3 rounded border p-4" onSubmit={e=>{e.preventDefault(); void perform(()=>assignStore(storeId,staffId,db));}}>
      <h2 className="text-lg font-semibold">Assign attendant to store</h2><label className="block">Store<select required className="block w-full rounded border p-3" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">Select store</option>{stores.filter(s=>s.status==='active').map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
      <label className="block">Staff member<select required className="block w-full rounded border p-3" value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">Select staff</option>{staff.filter(s=>!s.disabledAt).map(s=><option value={s.id} key={s.id}>{s.name} ({s.role})</option>)}</select></label>
      <button disabled={working} className="rounded border px-4 py-3">Assign staff</button>
    </form>
    <section className="space-y-3 rounded border p-4" aria-label="Physical stock observations">
      <h2 className="text-lg font-semibold">Physical stock observations</h2>
      <p className="text-sm">Record observed quantities per store for reconciliation. These are not available-to-sell balances. They do not change stock, sales, purchases, transfers, or accounting.</p>
      <form className="space-y-3" onSubmit={e=>{ e.preventDefault(); const selectedStore=countStoreId; void perform(async()=>{ await recordStoreStockObservation(selectedStore,countProductId,Number(countQuantity),"",db); setCountQuantity(""); setCounts(await listStoreStockObservations(selectedStore,db)); }); }}>
        <label className="block">Store<select required className="block w-full rounded border p-3" value={countStoreId} onChange={e=>setCountStoreId(e.target.value)}><option value="">Select store</option>{stores.filter(s=>s.status==="active").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block">Product<select required className="block w-full rounded border p-3" value={countProductId} onChange={e=>setCountProductId(e.target.value)}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="block">Observed quantity<input required className="block w-full rounded border p-3" type="number" min="0" max="9999999" step="1" value={countQuantity} onChange={e=>setCountQuantity(e.target.value)} /></label>
        <button className="rounded border px-4 py-3" disabled={working || !countStoreId || !countProductId}>Save observation</button>
      </form>
      <p className="text-sm font-semibold">Recent observations ({counts.length})</p>
      <ul className="space-y-1 text-sm">{counts.slice(0,10).map(c=><li key={c.id}>{products.find(p=>p.id===c.productId)?.name ?? "Product"}: {c.observedQuantity} observed · {new Date(c.observedAt).toLocaleString()}</li>)}</ul>
    </section>
    <section className="space-y-3 rounded border p-4" aria-label="Store stock allocation and totals">
      <h2 className="text-lg font-semibold">Store inventory allocation</h2>
      <p className="text-sm">Store stock must be assigned explicitly from physical counts and equal the company's saved quantity for each product. Observations do not allocate stock. This capability stays disabled until integration acceptance.</p>
      {storeBalances?.active ? <div>
        <strong>Recorded local store balances</strong>
        <ul className="text-sm">{storeBalances.balances.map(row=><li key={row.storeId+":"+row.productId}>{stores.find(s=>s.id===row.storeId)?.name ?? "Store"} / {products.find(p=>p.id===row.productId)?.name ?? row.productId}: {row.quantity} units</li>)}</ul>
      </div> : <>
        <div className="max-h-64 space-y-2 overflow-y-auto">{products.filter(p=>p.stockQuantity>0).flatMap(product=>stores.filter(s=>s.status==="active").map(store=><label key={product.id+":"+store.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{product.name} ({product.stockQuantity} company units) / {store.name}</span><input className="w-32 rounded border p-2" type="number" min="0" max={product.stockQuantity} step="1" value={openingAllocations[JSON.stringify([store.id,product.id])]??""} onChange={e=>setOpeningAllocations(prev=>({...prev,[JSON.stringify([store.id,product.id])]:e.target.value}))} /></label>))}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openingConfirmed} onChange={e=>setOpeningConfirmed(e.target.checked)}/>I confirm the physical opening quantities and exact company-stock reconciliation.</label>
        <button type="button" className="rounded border px-4 py-3" disabled={working||!openingConfirmed||!STAGE9_RELEASE_SCOPE.authoritativeStoreStock} onClick={()=>void perform(async()=>{
          const allocations:OpeningStoreQuantity[]=Object.entries(openingAllocations).filter(([,amount])=>amount!==""&&Number(amount)>0).map(([key,amount])=>{const [storeId,productId]=JSON.parse(key) as [string,string];return {storeId,productId,quantity:Number(amount)};});
          await activateStoreInventory(allocations,db);setOpeningConfirmed(false);
        })}>Activate reviewed opening stock (disabled pending acceptance)</button>
      </>}
    </section>
    <section className="space-y-3 rounded border p-4" aria-label="Store transfer requests">
      <h2 className="text-lg font-semibold">Transfer requests (no inventory movement)</h2>
      <p className="text-sm">Requests are planning records only. They do not reserve or transfer stock, change prices or post accounting entries.</p>
      <form className="grid gap-2" onSubmit={e=>{e.preventDefault(); void perform(async()=>{await requestStoreTransfer(countStoreId,destinationStoreId,countProductId,Number(transferQty),db);setTransferQty("");});}}>
        <label>From store<select required className="block w-full rounded border p-3" value={countStoreId} onChange={e=>setCountStoreId(e.target.value)}><option value="">Select</option>{stores.filter(s=>s.status==="active").map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>To store<select required className="block w-full rounded border p-3" value={destinationStoreId} onChange={e=>setDestinationStoreId(e.target.value)}><option value="">Select</option>{stores.filter(s=>s.status==="active" && s.id!==countStoreId).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>Product<select required className="block w-full rounded border p-3" value={countProductId} onChange={e=>setCountProductId(e.target.value)}><option value="">Select</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>Requested quantity<input required type="number" min="1" max="9999999" step="1" className="block w-full rounded border p-3" value={transferQty} onChange={e=>setTransferQty(e.target.value)}/></label>
        <button disabled={working} className="rounded border px-4 py-3">Create request</button>
      </form>
      <ul className="space-y-2 text-sm">{transfers.slice(0,20).map(t=><li key={t.id} className="rounded border p-2">{stores.find(s=>s.id===t.sourceStoreId)?.name ?? "Store"} → {stores.find(s=>s.id===t.destinationStoreId)?.name ?? "Store"}: {t.quantity} units · {t.status} {t.status==="requested" && <button className="underline ml-2" disabled={working} onClick={()=>void perform(()=>cancelStoreTransfer(t.id,db))}>Cancel request</button>} {t.status==="requested" && <button className="underline ml-2" disabled={working||!STAGE9_RELEASE_SCOPE.executeStoreTransfer} onClick={()=>{if(window.confirm("Confirm stock was physically dispatched? Units will be reserved until receipt or return."))void perform(()=>dispatchStoreTransfer(t.id,crypto.randomUUID(),db));}}>Dispatch (disabled pending acceptance)</button>}
      {t.status==="dispatched" && <button className="underline ml-2" disabled={working||!STAGE9_RELEASE_SCOPE.executeStoreTransfer} onClick={()=>{if(window.confirm("Confirm physical receipt at destination? This will atomically transfer the store units."))void perform(()=>completeStoreTransfer(t.id,crypto.randomUUID(),db));}}>Confirm receipt (disabled pending acceptance)</button>}
      {t.status==="dispatched" && <button className="underline ml-2" disabled={working||!STAGE9_RELEASE_SCOPE.executeStoreTransfer} onClick={()=>{if(window.confirm("Confirm the entire dispatched quantity was physically returned to the original store?"))void perform(()=>returnUndeliveredDispatch(t.id,crypto.randomUUID(),true,db));}}>Confirm returned undelivered (disabled pending acceptance)</button>}
      {t.status==="completed" && <button className="underline ml-2" disabled={working||!STAGE9_RELEASE_SCOPE.executeStoreTransfer} onClick={()=>{if(window.confirm("Create a new reverse-direction transfer request? The original history will remain unchanged."))void perform(()=>requestStoreTransferReversal(t.id,crypto.randomUUID(),db));}}>Request reverse transfer (disabled pending acceptance)</button>}</li>)}</ul>
    </section>
    <section className="space-y-2 rounded border p-4" aria-label="Local store activity report"><h2 className="text-lg font-semibold">Local store activity</h2><p className="text-sm">Counts and requests only; not consolidated sales or authoritative stock.</p><ul>{report.map(r=><li key={r.storeId} className="border-b py-2">{r.name}: {r.assignedStaff} staff, {r.physicalObservations} observations, {r.openTransferRequests} open transfer requests</li>)}</ul></section>
    <section className="rounded border p-4 space-y-2" aria-label="Store transaction activity">
      <h2 className="text-lg font-semibold">Store-linked invoice and procurement activity</h2>
      <p className="text-sm">Read-only saved invoice totals, supplier purchase costs, and return counts. This is not cash settlement, profit, tax remittance or cross-device financial consolidation.</p>
      {transactionActivity?<><ul className="text-sm">{transactionActivity.rows.map(r=><li key={r.storeId} className="border-b py-2">{r.storeName}: {r.saleCount} sales ({r.grossSaleInvoiceMinor} invoice minor units), {r.purchaseCount} purchases ({r.grossPurchaseCostMinor} cost minor units), {r.fullSaleReversalCount} full reversals, {r.cashPartialReturnCount} partial returns · {r.currency??"Currency unverified"}</li>)}</ul><p className="text-sm">Historical transactions without store attribution: {transactionActivity.unattributedHistoricalSales} sales and {transactionActivity.unattributedHistoricalPurchases} purchases.</p></>:<p className="text-sm">Invoice activity unavailable or not authorized for this staff session.</p>}
    </section>
    <p className="text-sm">Assignments are stored only on this device. <Link href="/staff" className="underline">Manage staff</Link>. Remote attendant sales, transfers and owner-wide dashboards require Stage 8 sync completion and cross-device verification.</p>
  </section>;
}
