import {useCallback, useEffect, useRef, useState, type FormEvent} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {callShop, type ShopOverview} from "./shopClient";
import {purchaseRetry} from "./purchaseRetry";

type Transfer = {
  transferId: string;
  fromStoreId: string;
  toStoreId: string;
  productId: string;
  quantity: number;
  status: "requested" | "in_transit" | "received" | "cancelled";
};
type Props = {companyId: string; userId: string; overview: ShopOverview; refresh: () => Promise<void>};

export function SharedShopTransfers(props: Props & {online: boolean}) {
  const [expanded, setExpanded] = useState(false);
  return <section className="shop-card">
    <button type="button" className="secondary-action" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>Inter-store transfers</button>
    {expanded && (props.online ? <TransferLedger {...props} /> : <p role="status">Reconnect to view or change transfers.</p>)}
  </section>;
}

function TransferLedger({companyId, userId, overview, refresh}: Props) {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sending = useRef(false);
  const generation = useRef(0);
  const stores = overview.stores.filter(store => store.status === "active");
  const products = overview.products.filter(item => item.active);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await callShop<{transfers: Transfer[]}>("listTransfers", {companyId}, "tallybook_shop_ops");
      if (current === generation.current) { setRows(result.transfers); setLoaded(true); setError(""); }
    } catch (cause) {
      if (current === generation.current) { setLoaded(false); setError(cause instanceof Error ? cause.message : "Transfer history unavailable."); }
    }
  }, [companyId]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);

  const save = async (work: () => Promise<void>, confirmation: string) => {
    if (sending.current || !navigator.onLine || !loaded) return;
    sending.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      await work();
      setNotice(confirmation);
      await Promise.all([reload(), refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transfer could not be confirmed.");
    } finally { sending.current = false; setBusy(false); }
  };

  const request = (event: FormEvent) => {
    event.preventDefault();
    const units = Number(quantity);
    if (!from || !to || from === to || !product || !/^[1-9]\d*$/.test(quantity) || units > 100000) {
      setError("Choose different stores, an item and a whole quantity from 1 to 100,000."); return;
    }
    const input = {fromStoreId: from, toStoreId: to, productId: product, quantity: units};
    void save(async () => {
      const retry = await purchaseRetry(userId, companyId, "requestTransfer", input, sessionStorage);
      await callShop("requestTransfer", {companyId, ...input, transferId: retry.id}, "tallybook_shop_ops");
      retry.confirm(); setQuantity("");
    }, "Transfer requested. Stock will leave the source store at dispatch.");
  };

  const transition = async (row: Transfer, action: "dispatchTransfer" | "receiveTransfer" | "cancelTransfer", prompt: string) => {
    if (!(await confirmAction(prompt))) return;
    void save(async () => {
      await callShop(action, {companyId, transferId: row.transferId}, "tallybook_shop_ops");
    }, "Transfer updated.");
  };
  const storeName = (id: string) => overview.stores.find(store => store.id === id)?.name ?? id;

  return <div className="space-y-3">
    <h2>Inter-store transfers</h2>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {stores.length < 2 ? <p>Add two active stores to request a transfer.</p> :
      <form onSubmit={request}><fieldset disabled={busy || !loaded} className="space-y-2">
        <label className="shop-field">From store<select value={from} required onChange={event => {
          setFrom(event.target.value); if (event.target.value === to) setTo("");
        }}><option value="">Choose source</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label className="shop-field">To store<select value={to} required onChange={event => setTo(event.target.value)}>
          <option value="">Choose destination</option>{stores.filter(store => store.id !== from).map(store =>
            <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label className="shop-field">Transfer item<select value={product} required onChange={event => setProduct(event.target.value)}>
          <option value="">Choose item</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="shop-field">Units to transfer<input value={quantity} inputMode="numeric" required onChange={event => setQuantity(event.target.value)} /></label>
        <button className="primary-action">Request transfer</button>
      </fieldset></form>}
    <button type="button" className="secondary-action" disabled={busy} onClick={() => void reload()}>Refresh transfer history</button>
    {loaded && !rows.length && <p>No transfers recorded.</p>}
    {rows.map(row => <article className="rounded border p-3" key={row.transferId}>
      <strong>{overview.products.find(item => item.id === row.productId)?.name ?? row.productId} · {row.quantity} units</strong>
      <p>{storeName(row.fromStoreId)} → {storeName(row.toStoreId)} · {row.status.replace("_", " ")}</p>
      <fieldset disabled={busy || !loaded} className="shop-actions">
        {row.status === "requested" && <>
          <button type="button" onClick={() => transition(row, "dispatchTransfer", "Confirm these units have left the source store?")}>Confirm dispatch</button>
          <button type="button" onClick={() => transition(row, "cancelTransfer", "Cancel this transfer before dispatch?")}>Cancel transfer</button>
        </>}
        {row.status === "in_transit" && <button type="button" onClick={() => transition(row, "receiveTransfer", "Confirm these units arrived at the destination store?")}>Confirm receipt</button>}
      </fieldset>
    </article>)}
  </div>;
}
