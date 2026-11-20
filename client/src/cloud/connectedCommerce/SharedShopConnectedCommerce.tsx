/**
 * Owner settings for the Connected Commerce services (CC-X-01/02/08). Owner-only; the server decides everything.
 * Nothing on this screen publishes data, contacts a shopper, takes payment or posts to a ledger. Every service is
 * OFF until the owner reads the exact reviewed terms, accepts them, and then switches the service on.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CC_TRACKS, CcError, getCcStatus, grantCcConsent, nextTrackAction, revokeCcConsent, setCcFlag, submitCcVerification,
  type CcPlatformStatus, type CcTrack, type CcTrackState,
} from "./platform";
import { CONSENT_TEXTS, displayableConsent, type ConsentText } from "./consentTexts";

const COPY: Record<CcTrack, { name: string; summary: string }> = {
  discover: { name: "Tallybook Discover", summary: "Let nearby shoppers find the items you choose to list and send you a request. A request is not a sale and holds no stock." },
  network: { name: "Tallybook Business Network", summary: "Work with other verified shops when you are out of stock. Partners never see your stock, costs or customers." },
  supply: { name: "Tallybook Supply", summary: "Ask suppliers for quotes and compare the full landed cost. Accepting a quote does not buy or receive anything by itself." },
  clementia: { name: "Clementia 2.0", summary: "Explained, evidence-linked business suggestions. It can propose; only you approve, and it never posts money or stock." },
  passport: { name: "Tallybook Passport", summary: "Let customers keep receipts, returns and warranty claims, and earn your shop's own rewards, only if they choose to." },
};

export function SharedShopConnectedCommerce({ companyId, online, texts = CONSENT_TEXTS }: {
  companyId: string; online: boolean; texts?: Readonly<Partial<Record<CcTrack, readonly ConsentText[]>>>;
}) {
  const [status, setStatus] = useState<CcPlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [evidence, setEvidence] = useState("");
  const [shown, setShown] = useState<Partial<Record<CcTrack, ConsentText | null>>>({});
  const [reading, setReading] = useState<CcTrack | null>(null); const [agreed, setAgreed] = useState(false);

  const load = useCallback(async (keepError = false) => {
    try { setStatus(await getCcStatus(companyId)); if (!keepError) setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Connected Commerce settings."); }
  }, [companyId]);
  useEffect(() => { if (online) void load(); }, [load, online]);
  useEffect(() => {
    if (!status) return;
    let alive = true;
    void (async () => {
      const next: Partial<Record<CcTrack, ConsentText | null>> = {};
      for (const t of CC_TRACKS) next[t] = await displayableConsent(texts, t, status.tracks[t].currentConsentVersion, status.tracks[t].currentConsentSha256);
      if (alive) setShown(next);
    })();
    return () => { alive = false; };
  }, [status, texts]);

  const act = async (work: () => Promise<CcPlatformStatus>, ok: string) => {
    setBusy(true); setError(null); setNote(null);
    try { setStatus(await work()); setNote(ok); setReading(null); setAgreed(false); }
    catch (e) { setError(e instanceof CcError || e instanceof Error ? e.message : "That did not work. Nothing was changed."); await load(true); }
    finally { setBusy(false); }
  };

  if (!online) return <section className="shop-card" aria-labelledby="cc-title"><h2 id="cc-title">Connected Commerce</h2><p role="status">Connect to the internet to view or change these settings. They are stored on Tallybook's servers and cannot be changed offline.</p></section>;
  if (!status) return <section className="shop-card" aria-labelledby="cc-title"><h2 id="cc-title">Connected Commerce</h2>{error ? <p role="alert" className="shop-alert">{error}</p> : <p role="status">Loading…</p>}</section>;

  const v = status.verification;
  return (
    <section className="shop-card" aria-labelledby="cc-title">
      <h2 id="cc-title">Connected Commerce</h2>
      <p>Optional services that connect your shop to shoppers, other shops and suppliers. <strong>Everything is off</strong> until you choose otherwise, and you can turn any service off at any time.</p>
      {error ? <p role="alert" className="shop-alert">{error}</p> : null}
      {note ? <p role="status">{note}</p> : null}

      <div aria-labelledby="cc-verify-title">
        <h3 id="cc-verify-title">Business verification</h3>
        <p data-testid="cc-verification-label"><strong>{v.label}</strong></p>
        {!v.externallyVerified ? <p className="muted">Details you enter yourself are not checked by Tallybook. Other people will see this status, not a claim that you are verified.</p> : null}
        <form onSubmit={e => { e.preventDefault(); void act(() => submitCcVerification(companyId, name.trim(), evidence.trim() || undefined), "Saved. Your details are marked as not yet reviewed."); }}>
          <label>Registered or trading name<input aria-label="Business name for verification" value={name} onChange={e => setName(e.target.value)} maxLength={120} /></label>
          <label>Document reference (optional)<input aria-label="Document reference" value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={200} /></label>
          <button type="submit" className="secondary-action" disabled={busy || name.trim().length < 2}>Submit for review</button>
        </form>
      </div>

      {CC_TRACKS.map(track => {
        const s: CcTrackState = status.tracks[track]; const action = nextTrackAction(s); const text = shown[track] ?? null;
        return (
          <article key={track} className="shop-card" aria-labelledby={`cc-${track}`}>
            <h3 id={`cc-${track}`}>{COPY[track].name} <span data-testid={`cc-state-${track}`}>{s.effective ? "On" : "Off"}</span></h3>
            <p>{COPY[track].summary}</p>
            {action === "wait_for_terms" ? <p role="note">Not available yet. The terms for this service have not been published, so it stays off.</p> : null}
            {action === "unavailable" ? <p role="note">Temporarily switched off by Tallybook.</p> : null}
            {(action === "accept_terms" || action === "accept_new_terms") ? (
              text ? (
                <>
                  <button type="button" className="secondary-action" onClick={() => { setReading(reading === track ? null : track); setAgreed(false); }} disabled={busy}>
                    {action === "accept_new_terms" ? "Review the updated terms" : "Read the terms"}</button>
                  {reading === track ? (
                    <div>
                      <h4>{text.title}</h4>
                      <div data-testid={`cc-terms-${track}`} style={{ whiteSpace: "pre-wrap" }}>{text.body}</div>
                      <label><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /> I have read these terms and I accept them for my shop.</label>
                      <button type="button" className="primary-action" disabled={busy || !agreed}
                        onClick={() => void act(() => grantCcConsent(companyId, track, text.version, s.currentConsentSha256!), "Terms accepted. The service is still off until you turn it on.")}>Accept terms</button>
                    </div>
                  ) : null}
                </>
              ) : <p role="note">These terms cannot be shown in this version of the app, so they cannot be accepted here. Update the app or contact Tallybook support.</p>
            ) : null}
            {action === "turn_on" ? <button type="button" className="primary-action" disabled={busy}
              onClick={() => void act(() => setCcFlag(companyId, track, true, s.flagVersion), `${COPY[track].name} is on.`)}>Turn on</button> : null}
            {action === "turn_off" ? <button type="button" className="secondary-action" disabled={busy}
              onClick={() => void act(() => setCcFlag(companyId, track, false, s.flagVersion), `${COPY[track].name} is off.`)}>Turn off</button> : null}
            {s.consent === "granted" ? <button type="button" className="secondary-action" disabled={busy}
              onClick={() => void act(() => revokeCcConsent(companyId, track), "Consent withdrawn. The service is off.")}>Withdraw consent</button> : null}
          </article>
        );
      })}
    </section>
  );
}
