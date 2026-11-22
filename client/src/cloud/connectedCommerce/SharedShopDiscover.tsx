/**
 * Owner screen for Tallybook Discover. Owner-only. Nothing is public until the owner has accepted the reviewed terms, turned Discover on
 * (Connected Commerce settings), saved a profile and published it. Accepting a shopper request records NO sale, takes NO payment and holds NO stock.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AVAILABILITY, AVAILABILITY_LABEL, DISCOVER_CATEGORIES, availabilityText, confirmDiscoverAvailability, decideDiscoverRequest, formatDiscoverPrice,
  getDiscoverProfile, listDiscoverListings, listDiscoverRequests, publishDiscoverProfile, saveDiscoverListing, saveDiscoverProfile, setDiscoverListingStatus,
  type Availability, type DiscoverCategory, type DiscoverProfile, type OwnerListing, type OwnerRequest,
} from "./discover";

export function SharedShopDiscover({ companyId, online }: { companyId: string; online: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [requests, setRequests] = useState<OwnerRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pf, setPf] = useState({ displayName: "", category: "groceries" as DiscoverCategory, areaLabel: "", contactLabel: "" });
  const [lf, setLf] = useState({ title: "", description: "", kind: "good" as "good" | "service", price: "", availability: "unknown" as Availability });
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});

  const load = useCallback(async (keepError = false) => {
    try {
      const p = await getDiscoverProfile(companyId);
      setEnabled(p.enabled); setProfile(p.profile);
      if (p.profile) setPf({ displayName: p.profile.displayName, category: p.profile.category, areaLabel: p.profile.areaLabel, contactLabel: p.profile.contactLabel ?? "" });
      if (p.enabled || p.profile) {
        setListings(await listDiscoverListings(companyId)); setRequests(await listDiscoverRequests(companyId));
      }
      if (!keepError) setError(null);
      setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Discover."); setLoaded(true); }
  }, [companyId]);
  useEffect(() => { if (online) void load(); }, [load, online]);

  const act = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null); setNote(null);
    try { await work(); setNote(ok); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not work. Nothing was changed."); await load(true); }
    finally { setBusy(false); }
  };

  if (!online) return <section className="shop-card" aria-labelledby="dc-title"><h2 id="dc-title">Tallybook Discover</h2><p role="status">Connect to the internet to manage Discover.</p></section>;
  if (!loaded) return <section className="shop-card" aria-labelledby="dc-title"><h2 id="dc-title">Tallybook Discover</h2><p role="status">Loading…</p></section>;

  const price = lf.price.trim() === "" ? null : Math.round(Number(lf.price) * 100);
  const priceBad = lf.price.trim() !== "" && (!Number.isFinite(Number(lf.price)) || Number(lf.price) < 0 || price === null || !Number.isSafeInteger(price));
  const open = requests.filter(r => r.status === "new");

  return (
    <section className="shop-card" aria-labelledby="dc-title">
      <h2 id="dc-title">Tallybook Discover</h2>
      <p>Choose which items nearby shoppers can find. A shopper sends you a <strong>request</strong>. It is <strong>not a sale</strong>: no payment is taken and no stock is held.</p>
      {error ? <p role="alert" className="shop-alert">{error}</p> : null}
      {note ? <p role="status">{note}</p> : null}
      {!enabled ? <p role="note" data-testid="dc-off">Discover is off. Accept the current terms and turn it on in <strong>Connected Commerce</strong> first. Nothing is public while it is off.</p> : null}

      <form onSubmit={e => { e.preventDefault(); void act(() => saveDiscoverProfile(companyId, { displayName: pf.displayName.trim(), category: pf.category, areaLabel: pf.areaLabel.trim(), ...(pf.contactLabel.trim() ? { contactLabel: pf.contactLabel.trim() } : {}), ...(profile ? { expectedVersion: profile.version } : {}) }), "Shop details saved. They are not public until you publish."); }}>
        <h3>Your shop on Discover</h3>
        <label>Shop name<input aria-label="Shop name" value={pf.displayName} onChange={e => setPf({ ...pf, displayName: e.target.value })} maxLength={80} /></label>
        <label>Category<select aria-label="Category" value={pf.category} onChange={e => setPf({ ...pf, category: e.target.value as DiscoverCategory })}>{DISCOVER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Area (town or neighbourhood, not coordinates)<input aria-label="Area" value={pf.areaLabel} onChange={e => setPf({ ...pf, areaLabel: e.target.value })} maxLength={80} /></label>
        <label>Public contact (optional)<input aria-label="Public contact" value={pf.contactLabel} onChange={e => setPf({ ...pf, contactLabel: e.target.value })} maxLength={60} /></label>
        <button type="submit" className="secondary-action" disabled={busy || !enabled || pf.displayName.trim().length < 2 || pf.areaLabel.trim().length < 2}>Save shop details</button>
      </form>
      {profile ? (
        <p data-testid="dc-status">Status: <strong>{profile.status === "published" ? "Published (shoppers can find your listed items)" : "Not published"}</strong>{" "}
          <button type="button" className={profile.status === "published" ? "secondary-action" : "primary-action"} disabled={busy || (profile.status !== "published" && !enabled)}
            onClick={() => void act(() => publishDiscoverProfile(companyId, profile.status !== "published"), profile.status === "published" ? "Unpublished. Shoppers can no longer find your shop." : "Published.")}>
            {profile.status === "published" ? "Unpublish" : "Publish"}</button></p>
      ) : <p role="note">Save your shop details to publish.</p>}

      <h3>Items you list</h3>
      <p className="muted">Availability is a label you confirm. Tallybook never publishes your stock count, costs, customers or staff.</p>
      <form onSubmit={e => { e.preventDefault(); void act(() => saveDiscoverListing(companyId, { title: lf.title.trim(), description: lf.description.trim(), kind: lf.kind, priceMinor: price, currency: "GHS", availability: lf.availability }), "Item listed."); setLf({ ...lf, title: "", description: "", price: "" }); }}>
        <label>Item<input aria-label="Item title" value={lf.title} onChange={e => setLf({ ...lf, title: e.target.value })} maxLength={80} /></label>
        <label>Description (optional)<input aria-label="Item description" value={lf.description} onChange={e => setLf({ ...lf, description: e.target.value })} maxLength={280} /></label>
        <label>Type<select aria-label="Item type" value={lf.kind} onChange={e => setLf({ ...lf, kind: e.target.value as "good" | "service" })}><option value="good">Item</option><option value="service">Service</option></select></label>
        <label>Price in GHS (optional)<input aria-label="Item price" inputMode="decimal" value={lf.price} onChange={e => setLf({ ...lf, price: e.target.value })} /></label>
        {priceBad ? <p role="alert" className="shop-alert">Enter a valid price or leave it empty.</p> : null}
        <label>Availability<select aria-label="Availability" value={lf.availability} onChange={e => setLf({ ...lf, availability: e.target.value as Availability })}>{AVAILABILITY.map(a => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}</select></label>
        <button type="submit" className="secondary-action" disabled={busy || !enabled || lf.title.trim().length < 2 || priceBad}>Add item</button>
      </form>
      <ul aria-label="Your listed items">
        {listings.map(l => (
          <li key={l.listingId} data-testid={`dc-listing-${l.listingId}`}>
            <strong>{l.title}</strong> · {formatDiscoverPrice(l.priceMinor, l.currency)} · {availabilityText(l.availability, l.availabilityAsOf)} · {l.status === "published" ? "Listed" : "Hidden"}
            <select aria-label={`Availability for ${l.title}`} value={l.availability} disabled={busy || !enabled}
              onChange={e => void act(() => confirmDiscoverAvailability(companyId, l.listingId, e.target.value as Availability), "Availability confirmed.")}>
              {AVAILABILITY.map(a => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}</select>
            <button type="button" className="secondary-action" disabled={busy || (l.status !== "published" && !enabled)}
              onClick={() => void act(() => setDiscoverListingStatus(companyId, l.listingId, l.status === "published" ? "unpublished" : "published"), l.status === "published" ? "Item hidden." : "Item listed.")}>{l.status === "published" ? "Hide" : "List again"}</button>
            <button type="button" className="secondary-action" disabled={busy}
              onClick={() => void act(() => setDiscoverListingStatus(companyId, l.listingId, "removed"), "Item removed.")}>Remove</button>
          </li>))}
      </ul>

      <h3>Shopper requests {open.length ? <span aria-label={`${open.length} open`}>({open.length})</span> : null}</h3>
      <p className="muted">Accepting only tells the shopper you will serve them. Take payment and record the sale in your normal checkout; nothing is reserved here.</p>
      {requests.length === 0 ? <p role="note">No requests yet.</p> : (
        <ul aria-label="Shopper requests">
          {requests.map(r => (
            <li key={r.requestId} data-testid={`dc-request-${r.requestId}`}>
              <strong>{r.quantity} × {r.listingTitle}</strong> · {r.buyerName} · <a href={`tel:${r.buyerContact.replace(/[^+0-9]/g, "")}`}>{r.buyerContact}</a> · <span data-testid={`dc-request-status-${r.requestId}`}>{r.status}</span>
              {r.note ? <> · “{r.note}”</> : null}
              {r.status === "new" ? (
                <>
                  <input aria-label={`Note to ${r.buyerName}`} value={decisionNote[r.requestId] ?? ""} maxLength={200} onChange={e => setDecisionNote({ ...decisionNote, [r.requestId]: e.target.value })} />
                  <button type="button" className="primary-action" disabled={busy || !enabled} onClick={() => void act(() => decideDiscoverRequest(companyId, r.requestId, "accept", decisionNote[r.requestId]), "Accepted. No payment was taken and no stock was held.")}>Accept</button>
                  <button type="button" className="secondary-action" disabled={busy} onClick={() => void act(() => decideDiscoverRequest(companyId, r.requestId, "decline", decisionNote[r.requestId]), "Declined.")}>Decline</button>
                </>) : null}
            </li>))}
        </ul>)}
    </section>
  );
}
