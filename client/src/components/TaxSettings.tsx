import { useState, type FormEvent } from "react";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { taxPolicySchema, type TaxPolicy } from "@/features/sales/tax";

/** Mounted with the company/update key so unsaved settings cannot cross businesses. */
export function TaxSettings() {
  const { profile, save } = useBusinessProfile();
  const previous = profile?.taxPolicy;
  const [enabled, setEnabled] = useState(previous?.enabled ?? false);
  const [registrationStatus, setStatus] = useState<TaxPolicy["registrationStatus"]>(previous?.registrationStatus ?? "unknown");
  const [registrationNumber, setNumber] = useState(previous?.registrationNumber ?? "");
  const [label, setLabel] = useState(previous?.label ?? "Tax");
  const [rate, setRate] = useState(previous ? String(previous.rateBasisPoints / 100) : "");
  const [mode, setMode] = useState<TaxPolicy["priceMode"] | "">(previous?.priceMode ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    setBusy(true); setMessage("");
    try {
      if (enabled && (!/^\d+(\.\d{1,2})?$/.test(rate) || !mode)) throw new Error("Supply a rate and choose inclusive or exclusive pricing before enabling tax.");
      const policy = taxPolicySchema.parse({enabled, registrationStatus, registrationNumber, label, rateBasisPoints: Math.round(Number(rate || "0") * 100), priceMode: mode || "exclusive"});
      await save({...profile, taxPolicy: policy});
      setMessage("Tax settings saved for future sales.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Tax settings could not be saved."); }
    finally { setBusy(false); }
  }
  if (!profile) return null;
  return <section className="business-form-shell tax-premium-shell" aria-labelledby="tax-settings-title">
    <div className="form-ledger-head"><div><p className="ledger-kicker">TRADING SETTINGS</p><h2 id="tax-settings-title">Tax settings</h2><p>Tax is off until you configure it. Use this only when one rate applies to every item. Tallybook does not select a country's tax rate.</p></div></div>
    <form className="business-form tax-premium-form" onSubmit={submit}>
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Apply tax to future sales</label>
      <label>Registration status<select aria-label="Tax registration status" value={registrationStatus} onChange={e => setStatus(e.target.value as TaxPolicy["registrationStatus"])}><option value="unknown">Not supplied</option><option value="not-registered">Not registered</option><option value="registered">Registered</option></select></label>
      <label>Registration number (optional)<input className="border p-2" value={registrationNumber} onChange={e => setNumber(e.target.value)} maxLength={80} /></label>
      <label>Tax name<input className="border p-2" value={label} onChange={e => setLabel(e.target.value)} maxLength={40} required /></label>
      <label>Rate (%)<input aria-label="Tax rate percent" className="border p-2" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="Enter your applicable rate" /></label>
      <label>Prices<select aria-label="Tax price mode" value={mode} onChange={e => setMode(e.target.value as TaxPolicy["priceMode"])}><option value="">Choose a pricing rule</option><option value="exclusive">Tax added to prices</option><option value="inclusive">Tax already included in prices</option></select></label>
      <p>Calculated after discounts, rounded once per receipt to the nearest minor currency unit (half up). Old receipts retain their saved amounts. Exempt items, compound levies and tax filing are not supported.</p>
      {message ? <p role="status">{message}</p> : null}
      <button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : "Save tax settings"}</button>
    </form>
  </section>;
}
