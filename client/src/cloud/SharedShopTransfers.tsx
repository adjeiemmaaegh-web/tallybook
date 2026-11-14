import {useCallback, useEffect, useRef, useState, type FormEvent} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {callShop, type ShopOverview} from "./shopClient";
import {tracksStock} from "./productTracking";
import {purchaseRetry} from "./purchaseRetry";
import {summarizeTransfers, type TransferStatus} from "./shopOperationalReports";

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
  const [historyStatus, setHistoryStatus] = useState<TransferStatus | "all">("all");
  const [historyQuery, setHistoryQuery] = useState("");
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
  const products = overview.products.filter(item => item.active && tracksStock(item));
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
      // A multi-step action may have completed its first step; show what the
      // server really holds, then the reason it stopped (reload clears errors).
      await reload();
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
  /**
   * One-step transfer for owners moving stock they already hold at both ends
   * (for example, a delivery they just carried over). It uses the same two
   * server actions as the separate steps, in order, so the ledger, audit
   * trail and replay protection are identical. If the second step fails, the
   * transfer is left "in transit" and Confirm receipt finishes it.
   */
  const moveNow = async (row: Transfer) => {
    const item = overview.products.find(p => p.id === row.productId)?.name ?? "these items";
    const ok = await confirmAction(
      `Move ${row.quantity} × ${item} from ${storeName(row.fromStoreId)} to ${storeName(row.toStoreId)} now? Use this only when the units are already at ${storeName(row.toStoreId)}. It records them leaving and arriving in one step.`,
      { confirmLabel: "Move now" });
    if (!ok) return;
    void save(async () => {
      await callShop("dispatchTransfer", {companyId, transferId: row.transferId}, "tallybook_shop_ops");
      await callShop("receiveTransfer", {companyId, transferId: row.transferId}, "tallybook_shop_ops");
    }, "Transfer completed. Stock moved from source to destination.");
  };
  const storeName = (id: string) => overview.stores.find(store => store.id === id)?.name ?? id;
  const productName = (id: string) => overview.products.find(item => item.id === id)?.name ?? id;
  const transferSummary = summarizeTransfers(rows);
  const search = historyQuery.trim().toLocaleLowerCase();
  const visible = loaded ? rows.filter(row =>
    (historyStatus === "all" || row.status === historyStatus) &&
    (!search || [row.transferId, storeName(row.fromStoreId), storeName(row.toStoreId), productName(row.productId)]
      .some(value => value.toLocaleLowerCase().includes(search)))) : [];

  return <div className="space-y-3">
    <h2>Inter-store transfers</h2>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loaded && <div className="tb-ops-metrics" aria-label="Transfer summary">
      <div><span>Transfers</span><strong>{transferSummary.total}</strong></div>
      <div><span>Requested</span><strong>{transferSummary.requested}</strong></div>
      <div><span>In transit</span><strong>{transferSummary.inTransit}</strong></div>
      <div><span>Received</span><strong>{transferSummary.received}</strong></div>
      <div><span>Units received</span><strong>{transferSummary.unitsReceived}</strong></div>
    </div>}
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
        {from && product && <p className="shop-muted" role="note">Last loaded source quantity: {overview.stock.find(s=>s.storeId===from && s.productId===product)?.quantity ?? "not available"}. The server checks live stock again when dispatching.</p>}
        <label className="shop-field">Units to transfer<input value={quantity} inputMode="numeric" required onChange={event => setQuantity(event.target.value)} /></label>
        <button className="primary-action">Request transfer</button>
      </fieldset></form>}
    <div className="tb-ops-history-head">
      <h3>Transfer history</h3>
      <label className="shop-field">Search transfers<input type="search" maxLength={80}
        placeholder="Transfer ID, product or store" value={historyQuery}
        onChange={event => setHistoryQuery(event.target.value)} /></label>
      <div className="shop-chips" role="group" aria-label="Transfer status filter">
        {([["all","All"],["requested","Requested"],["in_transit","In transit"],["received","Received"],["cancelled","Cancelled"]] as const)
          .map(([value,label])=><button key={value} type="button" className="shop-chip"
            aria-pressed={historyStatus===value} onClick={()=>setHistoryStatus(value)}>{label}</button>)}
      </div>
      <p className="shop-muted">{loaded ? visible.length+" of "+rows.length+" transfer records shown" : "Transfer records are unavailable until verified by the server."}</p>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => void reload()}>Refresh transfer history</button>
    </div>
    {loaded && !rows.length && <p>No transfers recorded.</p>}
    {loaded && rows.length>0 && visible.length===0 && <p role="status">No transfers match these filters. <button type="button" className="shop-link" onClick={()=>{setHistoryQuery("");setHistoryStatus("all");}}>Show all</button></p>}
    {visible.map(row => <article className="rounded border p-3 tb-ops-transfer-row" key={row.transferId}>
      <strong>{productName(row.productId)} · {row.quantity} units</strong>
      <small className="shop-muted">Transfer ID {row.transferId}</small>
      <p>{storeName(row.fromStoreId)} → {storeName(row.toStoreId)} · {row.status.replace("_", " ")}</p>
      <fieldset disabled={busy || !loaded} className="shop-actions">
        {row.status === "requested" && <>
          <button type="button" onClick={() => transition(row, "dispatchTransfer", "Confirm these units have left the source store?")}>Confirm dispatch</button>
          <button type="button" onClick={() => void moveNow(row)}>Dispatch and receive now</button>
          <button type="button" onClick={() => transition(row, "cancelTransfer", "Cancel this transfer before dispatch?")}>Cancel transfer</button>
        </>}
        {row.status === "in_transit" && <button type="button" onClick={() => transition(row, "receiveTransfer", "Confirm these units arrived at the destination store?")}>Confirm receipt</button>}
      </fieldset>
    </article>)}
  </div>;
}
