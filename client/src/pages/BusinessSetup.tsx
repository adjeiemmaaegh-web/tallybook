/** Tallybook Africa design reminder: setup is a compact cobalt record card—one business, clear labels, solid readable surfaces, and no unnecessary account step. */
import { TaxSettings } from "@/components/TaxSettings";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleAlert, PencilLine, Plus, Save, Smartphone, Store, ToggleLeft, ToggleRight } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { businessProfileSchema, businessTypes, countries, currencies, toBusinessProfileFormValues, type BusinessProfileInput } from "@/features/business/businessProfile";
import { addMobileMoneyProvider, getMobileMoneyProviders, setMobileMoneyProviderActive, type MobileMoneyProvider } from "@/features/payments/mobileMoney";

function CompaniesWorkspace() {
  const { profile, companies, activeCompanyId, lastBackupCompanyId, createCompany, switchCompany, clearCompany } = useBusinessProfile();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string>(countries[0]?.value ?? "Ghana");
  const [currency, setCurrency] = useState<string>(countries[0]?.currency ?? "GHS");
  const [businessType, setBusinessType] = useState<string>(businessTypes[0] ?? "Retail");
  const [clearName, setClearName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const addCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      const created = await createCompany({ name, country, currency, businessType, phone: "", email: "", address: "" });
      setName(""); setNotice(`${created.name} is ready on this device and is now active.`); toast.success(`${created.name} is ready on this device.`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "We could not create that company."); }
    finally { setBusy(false); }
  };

  const changeCountry = (value: string) => { setCountry(value); const match = countries.find((item) => item.value === value); if (match) setCurrency(match.currency); };
  const clearActive = async () => {
    if (!profile || clearName.trim() !== profile.name.trim()) { toast.error("Type the active company name exactly to confirm."); return; }
    setBusy(true); setNotice(null);
    try { await clearCompany(profile.id, clearName); setClearName(""); setNotice("The company was cleared from this device. Other companies were not changed."); toast.success("Company cleared from this device."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "We could not clear this company."); }
    finally { setBusy(false); }
  };

  return <div className="business-setup-page company-management-page">
    <section className="setup-hero"><p className="eyebrow"><span className="eyebrow-dot" />Local companies</p><h1>Choose the company you are working in.</h1><p>Each company has its own customers, sales, stock, purchases, expenses, and reports on this phone.</p><div className="setup-hero-meta"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />On this device</span><span>No cloud account or automatic upload.</span></div></section>
    <section className="business-form-shell company-list-shell" aria-labelledby="company-list-title"><div className="form-ledger-head"><div><p className="ledger-kicker">Your companies</p><h2 id="company-list-title">Switch without mixing records.</h2></div><div className="form-ledger-stamp"><span className="workspace-marker">CO</span><span>{companies.length} saved</span></div></div><ul className="company-list" aria-label="Local companies">{companies.map((company) => <li key={company.id} className={company.id === activeCompanyId ? "company-list-item company-list-item-active" : "company-list-item"}><div><strong>{company.name}</strong><span>{company.country} · {company.currency} · {company.businessType}</span></div>{company.id === activeCompanyId ? <span className="stamp stamp-ready">Active</span> : <button className="link-action" type="button" onClick={() => void switchCompany(company.id)} disabled={busy}>Use this company</button>}</li>)}</ul></section>
    <section className="business-form-shell" aria-labelledby="add-company-title"><div className="form-ledger-head"><div><p className="ledger-kicker">New local workspace</p><h2 id="add-company-title">Add another company.</h2></div><div className="form-ledger-stamp"><span className="workspace-marker">NEW</span><span>Local only</span></div></div><form className="business-form company-create-form" onSubmit={addCompany} noValidate><label><span>Company name</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Ama’s Catering" minLength={2} maxLength={120} required /></label><label><span>Business type</span><select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>{businessTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div className="form-grid-two"><label><span>Country</span><select value={country} onChange={(event) => changeCountry(event.target.value)}>{countries.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}</select></label><label><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="form-save-row"><p className="form-save-note" role="status" aria-live="polite">{notice ?? "The new company starts with an empty local ledger."}</p><button className="primary-action" type="submit" disabled={busy || name.trim().length < 2}><Plus className="h-4 w-4" aria-hidden="true" />Add company</button></div></form></section>
    {profile ? <section className="business-form-shell company-clear-shell" aria-labelledby="clear-company-title"><div className="form-ledger-head"><div><p className="ledger-kicker">Danger zone</p><h2 id="clear-company-title">Clear this company from this phone.</h2><p>This permanently removes only the active company’s local records from this device. Make a fresh Backup first if you may need them later.</p></div><div className="form-ledger-stamp"><span className="workspace-marker">CLEAR</span><span>Cannot undo</span></div></div><p className="clear-backup-status" role="status">{lastBackupCompanyId === profile.id ? "Fresh backup recorded for this company." : <>A fresh backup for this company is required first. <Link href="/backup">Open Backup</Link></>}</p><label><span>Type “{profile.name}” to confirm</span><Input value={clearName} onChange={(event) => setClearName(event.target.value)} placeholder={profile.name} autoComplete="off" disabled={busy} /></label><button className="danger-action" type="button" onClick={() => void clearActive()} disabled={busy || lastBackupCompanyId !== profile.id || clearName.trim() !== profile.name.trim()}>Clear {profile.name} from this phone</button></section> : null}
    <Link className="back-link" href="/business">Back to business details</Link>
  </div>;
}

export default function BusinessSetup() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" && window.location.search ? window.location.search : `?${location.split("?")[1] ?? ""}`;
  const isCompaniesView = new URLSearchParams(search).get("view") === "companies";
  const { profile, status, error, save } = useBusinessProfile();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [providers, setProviders] = useState<MobileMoneyProvider[]>([]);
  const [providerName, setProviderName] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const form = useForm<BusinessProfileInput>({ resolver: zodResolver(businessProfileSchema), defaultValues: toBusinessProfileFormValues(profile) });

  useEffect(() => { if (status === "ready") form.reset(toBusinessProfileFormValues(profile)); }, [form, profile, status]);
  useEffect(() => {
    let subscribed = true;
    if (!profile) { setProviders([]); return () => { subscribed = false; }; }
    void getMobileMoneyProviders().then((savedProviders) => { if (subscribed) setProviders(savedProviders); }).catch((cause) => { if (subscribed) toast.error(cause instanceof Error ? cause.message : "We could not read your Mobile Money providers."); });
    return () => { subscribed = false; };
  }, [profile]);

  const title = profile ? "Your business record" : "Set up your business";
  const subtitle = profile ? "Keep the details you use every day clear and up to date." : "Add the essentials once. They stay on this device and can be changed whenever you need.";
  const countryOptions = useMemo(() => countries, []);

  if (isCompaniesView) return <CompaniesWorkspace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setSavedMessage(null);
    try {
      const saved = await save(values);
      const message = `${saved.name} is saved on this device.`;
      setSavedMessage(message);
      toast.success(message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We could not save your business details.";
      setSavedMessage(null);
      toast.error(message);
    }
  });

  const addProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProviderBusy(true);
    try {
      const provider = await addMobileMoneyProvider({ name: providerName });
      setProviderName("");
      setProviders(await getMobileMoneyProviders());
      toast.success(`${provider.name} is ready for Mobile Money sales.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We could not save that Mobile Money provider.");
    } finally {
      setProviderBusy(false);
    }
  };

  const changeProviderAvailability = async (provider: MobileMoneyProvider) => {
    setProviderBusy(true);
    try {
      const updated = await setMobileMoneyProviderActive(provider.id, !provider.active);
      setProviders((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(updated.active ? `${updated.name} is available at checkout.` : `${updated.name} is no longer shown at checkout. Existing payment history is unchanged.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We could not update that provider.");
    } finally {
      setProviderBusy(false);
    }
  };

  return (
    <div className="business-setup-page">
      <section className="setup-hero">
        <div className="setup-hero-tally" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow"><span className="eyebrow-dot" />Your business record</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="setup-hero-meta"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />On this device</span><span>One simple profile for your daily ledger.</span></div>
        <div className="setup-progress" aria-label="Business setup record has three sections"><span className="tally-status"><i /><i /><i />Three record sections</span><span>Business · Trading · Contact</span></div>
      </section>

      {status === "error" ? <div className="attention-note setup-attention" role="alert"><div><strong>We could not read your business details.</strong><p>{error ?? "Try reloading the page before adding details."}</p></div></div> : null}

      <section className="business-form-shell" aria-labelledby="business-details-title">
        <div className="form-ledger-head"><div><p className="ledger-kicker">Business details</p><h2 id="business-details-title">The details that belong on every record.</h2></div><div className="form-ledger-stamp"><span className="workspace-marker">BIZ</span><span>Record 01</span></div></div>
        <Form {...form}>
          <form className="business-form" onSubmit={onSubmit} noValidate>
            <div className="form-section"><div className="form-section-title"><span>01</span><div><h3>About your business</h3><p>Use the name your customers know.</p></div></div>
              <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Business name</FormLabel><FormControl><Input autoComplete="organization" placeholder="For example, Ama’s Shop" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="businessType" render={({ field }) => <FormItem><FormLabel>Business type</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Choose a business type" /></SelectTrigger></FormControl><SelectContent>{businessTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
            </div>

            <div className="form-section"><div className="form-section-title"><span>02</span><div><h3>Where and how you trade</h3><p>This keeps future prices and reports easy to read.</p></div></div>
              <div className="form-grid-two"><FormField control={form.control} name="country" render={({ field }) => <FormItem><FormLabel>Country</FormLabel><Select value={field.value} onValueChange={(value) => { field.onChange(value); const match = countryOptions.find((country) => country.value === value); if (match && !form.getFieldState("currency").isDirty) form.setValue("currency", match.currency, { shouldDirty: true, shouldValidate: true }); }}><FormControl><SelectTrigger><SelectValue placeholder="Choose country" /></SelectTrigger></FormControl><SelectContent>{countryOptions.map((country) => <SelectItem key={country.value} value={country.value}>{country.value}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="currency" render={({ field }) => <FormItem><FormLabel>Currency</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Choose currency" /></SelectTrigger></FormControl><SelectContent>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} /></div>
              <FormField control={form.control} name="preferredPaymentMethod" render={({ field }) => <FormItem><FormLabel>Usual payment method</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="mobile">Mobile Money (MoMo)</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
              <div className="form-grid-two">
                <FormField control={form.control} name="mobileMoneyProviderName" render={({ field }) => <FormItem><FormLabel>Mobile Money provider <em>Optional</em></FormLabel><FormControl><Input placeholder="Enter your network or provider" maxLength={80} {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="cardProviderName" render={({ field }) => <FormItem><FormLabel>Card provider <em>Optional</em></FormLabel><FormControl><Input placeholder="Enter your card processor or bank" maxLength={80} {...field} /></FormControl><FormMessage /></FormItem>} />
              </div>
              <p>Record payments received through these providers. Online payment collection requires a separate verified connection.</p>
            </div>

            <div className="form-section"><div className="form-section-title"><span>03</span><div><h3>Contact details</h3><p>Optional for now. Add only what you want to keep in your record.</p></div></div>
              <div className="form-grid-two"><FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Phone number <em>Optional</em></FormLabel><FormControl><Input autoComplete="tel" inputMode="tel" placeholder="For example, +233 20 000 0000" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email address <em>Optional</em></FormLabel><FormControl><Input autoComplete="email" inputMode="email" placeholder="For example, hello@business.com" {...field} /></FormControl><FormMessage /></FormItem>} /></div>
              <FormField control={form.control} name="address" render={({ field }) => <FormItem><FormLabel>Address <em>Optional</em></FormLabel><FormControl><Textarea autoComplete="street-address" placeholder="A short location or address" {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>

            <div className="form-save-row"><div className="form-save-note" role="status" aria-live="polite"><Store className="h-4 w-4 text-baobab" aria-hidden="true" /><span>{savedMessage ?? "Your details are saved only on this device."}</span></div><button className="primary-action" type="submit" disabled={form.formState.isSubmitting}>{profile ? <><PencilLine className="h-4 w-4" aria-hidden="true" />Save changes</> : <><Save className="h-4 w-4" aria-hidden="true" />Save business</>}</button></div>
          </form>
        </Form>
      </section>

      {profile ? <TaxSettings key={`${profile.id}:${profile.updatedAt}`} /> : null}
      <section className="business-form-shell mobile-money-settings" aria-labelledby="mobile-money-settings-title">
        <div className="form-ledger-head"><div><p className="ledger-kicker">Mobile Money</p><h2 id="mobile-money-settings-title">Providers you accept at checkout.</h2><p>Choose your own provider names. Tallybook does not lock this list to a country or network.</p></div><div className="form-ledger-stamp"><Smartphone className="h-4 w-4" aria-hidden="true" /><span>Local setup</span></div></div>
        {!profile ? <div className="mobile-money-settings-note"><CircleAlert className="h-4 w-4" aria-hidden="true" /><p>Save your business details first, then add the providers you accept.</p></div> : <>
          <form className="mobile-money-provider-add" onSubmit={addProvider} noValidate>
            <label htmlFor="mobile-money-provider-name"><span>Provider name</span><Input id="mobile-money-provider-name" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="For example, MTN MoMo or Airtel Money" maxLength={80} disabled={providerBusy} /></label>
            <button className="secondary-action" type="submit" disabled={providerBusy || providerName.trim().length < 2}><Plus className="h-4 w-4" aria-hidden="true" />Add provider</button>
          </form>
          {providers.length === 0 ? <div className="mobile-money-settings-empty"><Smartphone className="h-5 w-5" aria-hidden="true" /><p><strong>No providers yet.</strong> Add one here so checkout stays quick and clear.</p></div> : <ul className="mobile-money-provider-list" aria-label="Configured Mobile Money providers">{providers.map((provider) => <li key={provider.id}><div><strong>{provider.name}</strong><span>{provider.active ? "Available at checkout" : "Hidden from checkout"}</span></div><button type="button" className="link-action" onClick={() => void changeProviderAvailability(provider)} disabled={providerBusy}>{provider.active ? <><ToggleRight className="h-4 w-4" aria-hidden="true" />Hide</> : <><ToggleLeft className="h-4 w-4" aria-hidden="true" />Make available</>}</button></li>)}</ul>}
        </>}
      </section>

      <section className="business-help-note"><CircleAlert className="h-4 w-4 text-clay" aria-hidden="true" /><p><strong>You stay in control.</strong> Tallybook does not need an account to save these details. You can make a local copy any time from Backup.</p></section>
    </div>
  );
}
