import { useState, type FormEvent } from "react";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { taxPolicySchema, type TaxPolicy } from "@/features/sales/tax";

/** Tax policy is company opt-in; original sale snapshots never change when it is edited. */
export function TaxSettings() {
  const { profile, save } = useBusinessProfile();
  const previous = profile?.taxPolicy;
  const canUseGhana = profile?.country.trim().toLowerCase() === "ghana" && profile?.currency === "GHS";
  const [enabled, setEnabled] = useState(previous?.enabled ?? false);
  const [registrationStatus, setStatus] = useState<TaxPolicy["registrationStatus"]>(previous?.registrationStatus ?? "unknown");
  const [registrationNumber, setNumber] = useState(previous?.registrationNumber ?? "");
  const [scheme, setScheme] = useState<"single-rate" | "ghana-vat-2026">(previous?.scheme ?? "single-rate");
  const [label, setLabel] = useState(previous?.label ?? "Tax");
  const [rate, setRate] = useState(previous ? String(previous.rateBasisPoints / 100) : "");
  const [mode, setMode] = useState<TaxPolicy["priceMode"] | "">(previous?.priceMode ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ghana = scheme === "ghana-vat-2026";
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    setBusy(true); setMessage("");
    try {
      if (ghana && !canUseGhana) throw new Error("Ghana VAT is available only to businesses registered in Ghana using GHS.");
      if (enabled && (!mode || (!ghana && !/^[0-9]+([.][0-9]{1,2})?$/.test(rate))))
        throw new Error("Supply a valid tax rate and choose inclusive or exclusive pricing.");
      const policy = taxPolicySchema.parse({
        enabled, registrationStatus, registrationNumber,
        label: ghana ? "Ghana VAT and levies (2026)" : label,
        rateBasisPoints: ghana ? 2000 : Math.round(Number(rate || "0") * 100),
        priceMode: mode || "exclusive",
        ...(ghana ? { scheme: "ghana-vat-2026" as const } : {})
      });
      await save({ ...profile, taxPolicy: policy }, profile.id);
      setMessage("Future-sale tax policy saved. Previously issued receipts are unchanged.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Tax settings could not be saved."); }
    finally { setBusy(false); }
  }
  if (!profile) return null;
  return <section className="business-form-shell" aria-labelledby="tax-settings-title">
    <div className="form-ledger-head"><div><h2 id="tax-settings-title">Tax settings</h2><p>Tax is off until enabled by an authorized registered business. Select the applicable regime explicitly.</p></div></div>
    <form className="business-form" onSubmit={submit}>
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Apply tax to future sales</label>
      <label>Tax calculation method
        <select aria-label="Tax calculation method" value={scheme} onChange={e => setScheme(e.target.value as "single-rate" | "ghana-vat-2026")}>
          <option value="single-rate">Generic single-rate tax</option>
          {canUseGhana && <option value="ghana-vat-2026">Ghana Act 1151 (effective 2026): 15% VAT + 2.5% NHIL + 2.5% GETFund</option>}
        </select>
      </label>
      <label>Registration status<select aria-label="Tax registration status" value={registrationStatus} onChange={e => setStatus(e.target.value as TaxPolicy["registrationStatus"])}><option value="unknown">Not supplied</option><option value="not-registered">Not registered</option><option value="registered">Registered</option></select></label>
      <label>{ghana ? "Ghana tax registration identifier" : "Registration number (optional)"}<input className="border p-2" value={registrationNumber} onChange={e => setNumber(e.target.value)} maxLength={80} required={enabled && ghana} /></label>
      {ghana ? <p>Fixed standard rates: VAT 15%, NHIL 2.5%, GETFund 2.5%, each calculated on the same applicable taxable value. Classify each item as standard, zero-rated or exempt in Inventory before checkout. Tallybook does not determine legal exemption eligibility for you.</p> : <>
        <label>Tax name<input className="border p-2" value={label} onChange={e => setLabel(e.target.value)} maxLength={40} required /></label>
        <label>Rate (%)<input aria-label="Tax rate percent" className="border p-2" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="Enter your applicable rate" /></label>
      </>}
      <label>Prices<select aria-label="Tax price mode" value={mode} onChange={e => setMode(e.target.value as TaxPolicy["priceMode"])}><option value="">Choose a pricing rule</option><option value="exclusive">Tax added to prices</option><option value="inclusive">Tax already included in prices</option></select></label>
      <p>Tax is calculated after discounts, with rates and product classifications saved at the time of sale. Later settings do not rewrite existing receipts. Historical unverified tax evidence remains unverified.</p>
      <p><strong>Not a GRA-certified e-VAT system.</strong> No official QR code, GRA signature, certified invoice number, statutory filing, or payment-to-GRA integration is provided. Arrange certification/integration with GRA before treating electronic receipts as official VAT tax invoices.</p>
      {message ? <p role="status">{message}</p> : null}
      <button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : "Save tax settings"}</button>
    </form>
  </section>;
}
