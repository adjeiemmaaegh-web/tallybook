/** Public Discover page: anonymous search and a bounded REQUEST. Never mounts a ledger or signs anyone in.
 *  A request is not an order: nothing is paid, reserved or sold. Availability shown is the shop's own statement and its time. */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  DISCOVER_CATEGORIES, availabilityText, cancelDiscoverRequest, discoverRequestStatus, formatDiscoverPrice, searchDiscover, sendDiscoverRequest, validateRequestDraft,
  type DiscoverCategory, type PublicListing, type RequestReceipt,
} from "@/cloud/connectedCommerce/discover";

const STORE = "tallybook.discover.requests";
type Saved = { requestId: string; cancelToken: string; title: string };
const readSaved = (): Saved[] => { try { const v = JSON.parse(localStorage.getItem(STORE) ?? "[]"); return Array.isArray(v) ? v.slice(0, 20) : []; } catch { return []; } };
const writeSaved = (v: Saved[]) => { try { localStorage.setItem(STORE, JSON.stringify(v.slice(0, 20))); } catch { /* storage unavailable: the receipt is still shown on screen */ } };

export default function DiscoverShopperPage() {
  const [q, setQ] = useState(""); const [category, setCategory] = useState<DiscoverCategory | "">(""); const [area, setArea] = useState("");
  const [results, setResults] = useState<PublicListing[] | null>(null); const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<PublicListing | null>(null);
  const [form, setForm] = useState({ quantity: "1", buyerName: "", buyerContact: "", note: "", consent: false });
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);
  const [saved, setSaved] = useState<Saved[]>(readSaved);
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const search = useCallback(async (e?: FormEvent) => {
    e?.preventDefault(); setBusy(true); setError("");
    try { const r = await searchDiscover({ q: q.trim() || undefined, category: category || undefined, area: area.trim() || undefined }); setResults(r.results); setNote(r.note); }
    catch (err) { setError(err instanceof Error ? err.message : "Search failed."); }
    finally { setBusy(false); }
  }, [q, category, area]);
  useEffect(() => { void search(); /* initial listing */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!chosen) return;
    const draft = { listingId: chosen.listingId, quantity: Number(form.quantity), buyerName: form.buyerName, buyerContact: form.buyerContact, note: form.note, consent: form.consent, operationKey };
    const problem = validateRequestDraft(draft); if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const r = await sendDiscoverRequest(draft); setReceipt(r);
      if (r.cancelToken) { const next = [{ requestId: r.requestId, cancelToken: r.cancelToken, title: chosen.title }, ...saved]; setSaved(next); writeSaved(next); }
      setChosen(null); setForm({ quantity: "1", buyerName: "", buyerContact: "", note: "", consent: false }); setOperationKey(crypto.randomUUID());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send the request."); }  // same operationKey is kept so a retry is safe
    finally { setBusy(false); }
  };
  const refresh = async (s: Saved) => { try { const r = await discoverRequestStatus(s.requestId, s.cancelToken); setStatuses(x => ({ ...x, [s.requestId]: r.status + (r.decisionNote ? ` — “${r.decisionNote}”` : "") })); } catch (err) { setError(err instanceof Error ? err.message : "Could not check."); } };
  const cancel = async (s: Saved) => { try { const r = await cancelDiscoverRequest(s.requestId, s.cancelToken); setStatuses(x => ({ ...x, [s.requestId]: r.status })); } catch (err) { setError(err instanceof Error ? err.message : "Could not cancel."); } };

  return (
    <main className="shop-page" aria-labelledby="dp-title">
      <h1 id="dp-title">Find items nearby</h1>
      <p>Shops choose what to list. Sending a request does <strong>not</strong> buy anything: no payment is taken and nothing is reserved. The shop will contact you.</p>
      <form onSubmit={e => void search(e)} role="search">
        <label>What are you looking for?<input aria-label="Search" value={q} onChange={e => setQ(e.target.value)} maxLength={60} /></label>
        <label>Category<select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value as DiscoverCategory | "")}><option value="">Any</option>{DISCOVER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Area<input aria-label="Filter area" value={area} onChange={e => setArea(e.target.value)} maxLength={40} /></label>
        <button type="submit" className="primary-action" disabled={busy}>Search</button>
      </form>
      {error ? <p role="alert" className="shop-alert">{error}</p> : null}
      {receipt ? <p role="status" data-testid="dp-receipt">{receipt.message ?? "Request sent."} Status: {receipt.status}. {receipt.paymentCollected ? "" : "Nothing was paid."} {receipt.stockReserved ? "" : "Nothing is reserved."}</p> : null}
      {results === null ? <p role="status">Searching…</p> : results.length === 0 ? <p role="note">No listed items match. Shops only appear after they choose to publish.</p> : (
        <ul aria-label="Results">{results.map(l => (
          <li key={l.listingId} data-testid={`dp-result-${l.listingId}`}>
            <strong>{l.title}</strong> · {formatDiscoverPrice(l.priceMinor, l.currency)} · {availabilityText(l.availability, l.availabilityAsOf)}<br />
            {l.shop.name} · {l.shop.area} · <span>{l.shop.externallyVerified ? "Verified by Tallybook" : l.shop.verification}</span>
            <button type="button" className="secondary-action" onClick={() => { setChosen(l); setReceipt(null); setError(""); }}>Send a request</button>
          </li>))}</ul>)}
      {note ? <p className="muted">{note}</p> : null}
      {chosen ? (
        <form onSubmit={e => void submit(e)} aria-label="Request form">
          <h2>Request: {chosen.title}</h2>
          <label>How many<input aria-label="Quantity" inputMode="numeric" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Your name<input aria-label="Your name" value={form.buyerName} onChange={e => setForm({ ...form, buyerName: e.target.value })} maxLength={60} /></label>
          <label>Phone number<input aria-label="Phone number" inputMode="tel" value={form.buyerContact} onChange={e => setForm({ ...form, buyerContact: e.target.value })} maxLength={40} /></label>
          <label>Note (optional)<input aria-label="Note" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} maxLength={200} /></label>
          <label><input type="checkbox" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} /> I agree that {chosen.shop.name} may contact me about this request.</label>
          <button type="submit" className="primary-action" disabled={busy}>Send request</button>
          <button type="button" className="secondary-action" onClick={() => setChosen(null)}>Cancel</button>
        </form>) : null}
      {saved.length ? (
        <section aria-label="Your requests"><h2>Your requests on this device</h2>
          <ul>{saved.map(s => <li key={s.requestId}>{s.title} · <span data-testid={`dp-status-${s.requestId}`}>{statuses[s.requestId] ?? "not checked"}</span>
            <button type="button" className="secondary-action" onClick={() => void refresh(s)}>Check status</button>
            <button type="button" className="secondary-action" onClick={() => void cancel(s)}>Cancel request</button></li>)}</ul></section>) : null}
    </main>
  );
}
