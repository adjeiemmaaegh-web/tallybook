import {useCallback, useEffect, useRef, useState, type FormEvent} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {callShop, listShopSales, type ShopOverview, type ShopReceipt} from "./shopClient";
import {purchaseRetry} from "./purchaseRetry";
import {formatMinorAmount} from "@/features/inventory/inventory";

type Props = {userId: string; companyId: string; overview: ShopOverview};
type Order = {
  orderId: string; storeId: string; customerReference: string | null; quotedTotalMinor: string;
  status: "new" | "accepted" | "sold" | "closed"; saleId: string | null;
};
type Line = {productId: string; name: string; quantity: number; unitPriceMinor: number};
const ops = "tallybook_shop_ops";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Order could not be confirmed.";

export function SharedShopOrders({userId, companyId, overview}: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("");
  const [storeId, setStore] = useState("");
  const [reference, setReference] = useState("");
  const [basket, setBasket] = useState([{productId:"", units:"1"}]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const seq = useRef(0);
  const stores = overview.stores.filter(s => s.status === "active");
  const products = overview.products.filter(p => p.active);
  const currency = overview.currency!;
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const result = await callShop<{orders: Order[]}>("listOnlineOrders", {companyId}, ops);
      if (n === seq.current) {setOrders(result.orders); setReady(true); setError("");}
    } catch (e) { if (n === seq.current) {setReady(false); setError(errorText(e));} }
  }, [companyId]);
  useEffect(() => { void reload(); return () => {seq.current++;}; }, [reload]);
  const save = async (work: () => Promise<void>) => {
    if (writing.current || !ready || !navigator.onLine) return;
    writing.current = true; setBusy(true); setError("");
    try {await work(); await reload();}
    catch (e) {setError(errorText(e));}
    finally {writing.current = false; setBusy(false);}
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || basket.some(line => !line.productId || !/^[1-9]\d*$/.test(line.units) || Number(line.units)>100000) ||
        new Set(basket.map(line => line.productId)).size !== basket.length) {
      setError("Choose a store, distinct items, and 1 to 100,000 units per item."); return;
    }
    const lines = basket.map(({productId, units}) => ({productId, quantity:Number(units)}));
    const input = {storeId, customerReference:reference.trim(), lines};
    void save(async () => {
      const retry = await purchaseRetry(userId, companyId, "createOnlineOrder", input, sessionStorage);
      const order = await callShop<{orderId:string}>("createOnlineOrder", {companyId, ...input, orderId:retry.id}, ops);
      retry.confirm(); setSelected(order.orderId); setReference(""); setBasket([{productId:"", units:"1"}]);
    });
  };
  const order = orders.find(o => o.orderId === selected);
  return <section className="shop-card space-y-3">
    <h2>Online orders</h2>
    <form onSubmit={create}><fieldset className="space-y-2" disabled={!ready || busy}>
      <legend>Record an order received outside Tallybook</legend>
      <label className="shop-field">Fulfilment store<select value={storeId} required onChange={e => setStore(e.target.value)}>
        <option value="">Choose store</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="shop-field">Order reference (optional)<input maxLength={120} value={reference} onChange={e => setReference(e.target.value)} /></label>
      {basket.map((line,i) => <div key={i} className="shop-actions">
        <label className="shop-field">Item {i+1}<select value={line.productId} required onChange={e => setBasket(rows =>
          rows.map((r,j) => j === i ? {...r, productId:e.target.value} : r))}>
          <option value="">Choose item</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="shop-field">Units {i+1}<input inputMode="numeric" required value={line.units} onChange={e => setBasket(rows =>
          rows.map((r,j) => j === i ? {...r, units:e.target.value} : r))} /></label>
        {basket.length > 1 && <button type="button" onClick={() => setBasket(rows => rows.filter((_,j) => j !== i))}>Remove item {i+1}</button>}
      </div>)}
      <button type="button" disabled={basket.length >= Math.min(products.length,100)} onClick={() => setBasket(rows => [...rows,{productId:"",units:"1"}])}>Add item</button>
      <button className="primary-action">Save order</button>
    </fieldset></form>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void reload()}>Refresh orders</button>
    {ready && !orders.length && <p>No online orders recorded.</p>}
    <label className="shop-field">Review order<select value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}>
      <option value="">Choose order</option>{orders.map(o => <option key={o.orderId} value={o.orderId}>
        {o.customerReference || o.orderId.slice(0,8)} · {formatMinorAmount(Number(o.quotedTotalMinor),currency)} · {o.status}
      </option>)}</select></label>
    {order && ready && <OrderReview key={order.orderId + order.status} companyId={companyId} order={order} currency={currency}
      store={overview.stores.find(s => s.id === order.storeId)?.name ?? order.storeId} busy={busy} save={save} />}
  </section>;
}

function OrderReview({order, companyId, currency, store, busy, save}: {
  order: Order; companyId: string; currency: string; store: string; busy: boolean; save: (work: () => Promise<void>) => Promise<void>;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [sales, setSales] = useState<ShopReceipt[]>([]);
  const [saleId, setSale] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const {orderId, storeId, status} = order;
  useEffect(() => {
    let live = true;
    setError("");
    void (async () => {
      const details = await callShop<{lines:Line[]}>("orderLines",{companyId,orderId},"tallybook_shop_order_lines");
      if (!live) return;
      setLines(details.lines);
      if (status === "accepted") {
        const receipts = await listShopSales(companyId, storeId);
        if (!live) return;
        setSales(receipts.filter(receipt => receipt.storeId === storeId && receipt.lines.length === details.lines.length &&
          details.lines.every(line => receipt.lines.some(s => s.productId === line.productId &&
            s.quantity === line.quantity && s.refundedQuantity === 0))));
      }
    })().catch(e => {if (live) setError(errorText(e));});
    return () => {live = false;};
  }, [companyId, orderId, storeId, status, attempt]);
  const post = (action: string, extra = {}) => void save(async () => {await callShop(action,{companyId,orderId,...extra},ops);});
  return <article className="rounded border p-3 space-y-2">
    <h3>{store} · {status}</h3>
    {error && <p role="alert">{error} <button onClick={() => setAttempt(n => n+1)}>Retry order details</button></p>}
    <ul>{lines.map(line => <li key={line.productId}>{line.name} · {line.quantity} × {formatMinorAmount(line.unitPriceMinor,currency)}</li>)}</ul>
    <fieldset className="space-y-2" disabled={busy || !lines.length}>
      {status === "new" && <><p>Acceptance checks availability. Stock moves when the till records a sale.</p>
        <button type="button" onClick={() => post("acceptOnlineOrder")}>Accept order</button></>}
      {status === "accepted" && <>
        <label className="shop-field">Matching recorded receipt<select value={saleId} onChange={e => setSale(e.target.value)}>
          <option value="">Choose receipt</option>{sales.map(s => <option key={s.saleId} value={s.saleId}>
            #{s.receiptNumber} · {new Date(s.recordedAt).toLocaleString()} · {formatMinorAmount(s.totalMinor,currency)}
          </option>)}</select></label>
        <button type="button" disabled={!saleId} onClick={async () => {
          if (await confirmAction("Confirm this recorded receipt fulfilled the selected order?")) post("linkOnlineOrderSale",{saleId});
        }}>Link receipt</button></>}
      {(status === "accepted" || status === "new") && <>
        <label className="shop-field">Reason for closing unfulfilled<input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></label>
        <button type="button" disabled={reason.trim().length<3} onClick={async () => {
          if (await confirmAction("Close this order as unfulfilled?", { danger: true })) post("closeOnlineOrder",{reason:reason.trim()});
        }}>Close unfulfilled</button></>}
    </fieldset>
  </article>;
}
