import { DeviceBusinessSetup } from "@/components/DeviceBusinessSetup";
/** Tallybook Africa Stage 2 design reminder: make who owes what immediately scannable, while immutable repayments and derived balances remain the single source of truth. */
/** Tallybook Africa Stage 2 and 9 design reminder: debt actions remain plain, mobile-first, and visible; customer balances stay derived from immutable saved records, while sharing reads only saved local facts. */
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Check, ContactRound, FileText, PencilLine, Plus, Save, Search, Share2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { archiveCustomer, createCustomer, customerFormSchema, customerFormValues, getCustomerSnapshot, searchCustomers, type Customer, type CustomerFormValues, type CustomerSnapshot, updateCustomer } from "@/features/customers/customers";
import { customerListViewFromSearch, customerListViewHref, type CustomerListView } from "@/features/customers/customerListView";
import { getCustomerDebtSummary, getCustomerRepaymentTargets, recordRepayment, repaymentMethods, type CustomerDebtSummary, type RepaymentMethod } from "@/features/credit/credit";
import type { RepaymentTargetsResult } from "@/features/credit/repaymentTargets.mjs";
import { formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";
import { formatCustomerBalanceShareText, formatPaymentConfirmationShareText, shareBusinessText } from "@/features/sharing/businessSharing";

const emptySnapshot: CustomerSnapshot = { customers: [], archivedCustomers: [] };
const blankCustomer: CustomerFormValues = { name: "", phone: "", email: "", address: "", notes: "", status: "active" };

export default function CustomersPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const { status: databaseStatus } = useDatabase();
  const [snapshot, setSnapshot] = useState<CustomerSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CustomerListView>(() => typeof window !== "undefined" ? customerListViewFromSearch(window.location.search) : "all");
  const [debtByCustomer, setDebtByCustomer] = useState<Record<string, CustomerDebtSummary>>({});
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pendingArchiveCustomer, setPendingArchiveCustomer] = useState<Customer | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [customerDebtSummary, setCustomerDebtSummary] = useState<CustomerDebtSummary | null>(null);
  const [repaymentDialogOpen, setRepaymentDialogOpen] = useState(false);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentMethod, setRepaymentMethod] = useState<RepaymentMethod>("cash");
  const [repaymentNote, setRepaymentNote] = useState("");
  const [repaymentSaleId, setRepaymentSaleId] = useState("unallocated");
  const [repaymentTargets, setRepaymentTargets] = useState<RepaymentTargetsResult | null>(null);
  const [repaymentTargetsError, setRepaymentTargetsError] = useState<string | null>(null);
  const [savingRepayment, setSavingRepayment] = useState(false);
  const [manualShare, setManualShare] = useState<{ label: string; text: string } | null>(null);
  const repaymentSubmissionKey = useRef<string | null>(null);
  const archivedRecordsRef = useRef<HTMLDivElement | null>(null);
  const customerRecordRef = useRef<HTMLElement | null>(null);
  const form = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: blankCustomer });

  const refresh = useCallback(async () => {
    if (databaseStatus !== "ready") return;
    setLoading(true);
    try { setSnapshot(await getCustomerSnapshot()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not read your customer records."); }
    finally { setLoading(false); }
  }, [databaseStatus, activeCompanyId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setSnapshot(emptySnapshot);
    setDebtByCustomer({});
    setSelectedCustomer(null);
    setCustomerDebtSummary(null);
    setRepaymentDialogOpen(false);
    setRepaymentSaleId("unallocated");
    setRepaymentTargets(null);
    setShowArchived(false);
    setView("all");
  }, [activeCompanyId]);
  useEffect(() => {
    const sync = () => { void refresh(); };
    const syncVisible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("focus", sync); window.addEventListener("pageshow", sync); document.addEventListener("visibilitychange", syncVisible);
    return () => { window.removeEventListener("focus", sync); window.removeEventListener("pageshow", sync); document.removeEventListener("visibilitychange", syncVisible); };
  }, [refresh]);
  useEffect(() => {
    let current = true;
    if (!selectedCustomer || !profile) { setCustomerDebtSummary(null); return; }
    void getCustomerDebtSummary(selectedCustomer.id, profile.currency).then((summary) => { if (current) setCustomerDebtSummary(summary); }).catch(() => { if (current) setCustomerDebtSummary(null); });
    return () => { current = false; };
  }, [activeCompanyId, profile, selectedCustomer]);
  useEffect(() => {
    let current = true;
    if (!profile) { setDebtByCustomer({}); return; }
    void Promise.all(snapshot.customers.map(async (customer) => [customer.id, await getCustomerDebtSummary(customer.id, profile.currency)] as const)).then((entries) => {
      if (current) setDebtByCustomer(Object.fromEntries(entries));
    }).catch(() => { if (current) setDebtByCustomer({}); });
    return () => { current = false; };
  }, [activeCompanyId, profile, snapshot.customers]);

  useEffect(() => {
    let current = true;
    setRepaymentTargets(null);
    setRepaymentTargetsError(null);
    if (!repaymentDialogOpen || !selectedCustomer || !profile || databaseStatus !== "ready") return;
    void getCustomerRepaymentTargets(selectedCustomer.id, profile.currency).then((result) => {
      if (current) setRepaymentTargets(result);
    }).catch((error) => {
      if (current) setRepaymentTargetsError(error instanceof Error ? error.message : "Cannot verify the sale allocation options.");
    });
    return () => { current = false; };
  }, [activeCompanyId, databaseStatus, repaymentDialogOpen, profile?.currency, selectedCustomer?.id]);

  const matches = useMemo(() => searchCustomers(snapshot.customers, query), [snapshot.customers, query]);
  const visibleCustomers = useMemo(() => matches.filter((customer) => view === "all" || (debtByCustomer[customer.id]?.outstandingMinor ?? 0) > 0).sort((left, right) => (debtByCustomer[right.id]?.outstandingMinor ?? 0) - (debtByCustomer[left.id]?.outstandingMinor ?? 0)), [debtByCustomer, matches, view]);
  const activeCount = snapshot.customers.filter((customer) => customer.status === "active").length;
  const totalOwingMinor = Object.values(debtByCustomer).reduce((sum, debt) => sum + debt.outstandingMinor, 0);
  const debtorCount = snapshot.customers.filter((customer) => (debtByCustomer[customer.id]?.outstandingMinor ?? 0) > 0).length;
  const repaymentPreviewMinor = useMemo(() => {
    if (!profile) return null;
    try {
      const amount = parseAmountToMinor(repaymentAmount, profile.currency);
      return amount > 0 ? amount : null;
    } catch { return null; }
  }, [profile, repaymentAmount]);
  const selectedRepaymentTarget = repaymentSaleId === "unallocated" ? null : repaymentTargets?.targets.find(target => target.saleId === repaymentSaleId);
  const repaymentTargetInvalid = repaymentSaleId !== "unallocated" && (!repaymentTargets?.canLink || !selectedRepaymentTarget ||
    repaymentPreviewMinor === null || repaymentPreviewMinor > selectedRepaymentTarget.remainingMinor);

  const repaymentNewBalanceMinor = repaymentPreviewMinor !== null && customerDebtSummary && repaymentPreviewMinor <= customerDebtSummary.outstandingMinor ? customerDebtSummary.outstandingMinor - repaymentPreviewMinor : null;

  const openNewCustomer = () => { if (!profile) return; setEditingCustomer(null); form.reset(blankCustomer); setCustomerDialogOpen(true); };
  const openEdit = (customer: Customer) => { setEditingCustomer(customer); form.reset(customerFormValues(customer)); setCustomerDialogOpen(true); };
  const submitCustomer = form.handleSubmit(async (values) => {
    try {
      const customer = editingCustomer ? await updateCustomer(editingCustomer.id, values) : await createCustomer(values);
      toast.success(editingCustomer ? `${customer.name} was updated.` : `${customer.name} was added to your customer book.`);
      setCustomerDialogOpen(false); setSelectedCustomer(customer); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not save this customer."); }
  });
  const requestArchive = (customer: Customer) => { setPendingArchiveCustomer(customer); setArchiveDialogOpen(true); };
  const confirmArchive = async () => {
    if (!pendingArchiveCustomer) return;
    try { const archived = await archiveCustomer(pendingArchiveCustomer.id); setSelectedCustomer(null); setArchiveDialogOpen(false); setShowArchived(true); toast.success(`${archived.name} moved to archived customer records.`); await refresh(); requestAnimationFrame(() => archivedRecordsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })); }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not archive this customer."); }
  };
  const openArchived = async () => { await refresh(); setShowArchived(true); requestAnimationFrame(() => archivedRecordsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })); };
  const openRepayment = () => { if (!selectedCustomer || !customerDebtSummary?.outstandingMinor) return; repaymentSubmissionKey.current = null; setRepaymentAmount(""); setRepaymentMethod("cash"); setRepaymentNote(""); setRepaymentSaleId("unallocated"); setRepaymentTargets(null); setRepaymentDialogOpen(true); };
  const chooseCustomerView = (nextView: CustomerListView, focusList = false) => {
    setQuery("");
    setView(nextView);
    if (typeof window !== "undefined") {
      const nextUrl = customerListViewHref(nextView);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== nextUrl) window.history.replaceState(window.history.state, "", nextUrl);
    }
    if (focusList) requestAnimationFrame(() => {
      customerRecordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      customerRecordRef.current?.focus({ preventScroll: true });
    });
  };
  const openDebtors = () => chooseCustomerView("owing", true);
  const shareMessage = async ({ title, label, text }: { title: string; label: string; text: string }) => {
    setManualShare(null);
    const result = await shareBusinessText({ title, text });
    if (result === "shared") return toast.success(`${label} opened in your device share options.`);
    if (result === "copied") return toast.success(`${label} copied. Paste it into your customer message.`);
    if (result === "manual") { setManualShare({ label, text }); return toast.info(`Copy the ${label.toLowerCase()} below into your customer message.`); }
  };
  const shareBalance = () => {
    if (!selectedCustomer || !profile || !customerDebtSummary) return;
    void shareMessage({ title: "Customer balance", label: "Balance message", text: formatCustomerBalanceShareText({ businessName: profile.name, customerName: selectedCustomer.name, outstandingLabel: customerDebtSummary.outstandingLabel }) });
  };
  const sharePaymentConfirmation = (activity: Extract<CustomerDebtSummary["activities"][number], { type: "repayment" }>) => {
    if (!selectedCustomer || !profile) return;
    const methodLabel = activity.method === "mobile" ? "Mobile Money" : activity.method[0].toUpperCase() + activity.method.slice(1);
    void shareMessage({ title: "Payment confirmation", label: "Payment confirmation", text: formatPaymentConfirmationShareText({ businessName: profile.name, customerName: selectedCustomer.name, amountLabel: formatMinorAmount(activity.amountMinor, profile.currency), methodLabel, recordedAt: activity.createdAt, note: activity.note }) });
  };
  const saveRepayment = async () => {
    if (!selectedCustomer || !profile || savingRepayment) return;
    setSavingRepayment(true);
    try {
      repaymentSubmissionKey.current ??= nanoid(18);
      if (repaymentTargetInvalid) throw new Error("Choose a valid sale and amount, or record an unallocated customer payment.");
      const saved = await recordRepayment({ customerId: selectedCustomer.id, amount: repaymentAmount, method: repaymentMethod, note: repaymentNote, currency: profile.currency, submissionKey: repaymentSubmissionKey.current,
        ...(selectedRepaymentTarget && repaymentPreviewMinor !== null ? {saleAllocations: [{saleId: selectedRepaymentTarget.saleId, amountMinor: repaymentPreviewMinor}]} : {}),
      });
      repaymentSubmissionKey.current = null;
      setRepaymentDialogOpen(false);
      toast.success(`${formatMinorAmount(saved.amountMinor, profile.currency)} repayment was recorded.`);
      const summary = await getCustomerDebtSummary(selectedCustomer.id, profile.currency);
      setCustomerDebtSummary(summary);
      setDebtByCustomer((current) => ({ ...current, [selectedCustomer.id]: summary }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not record this repayment."); }
    finally { setSavingRepayment(false); }
  };

  if (!profile) return <DeviceBusinessSetup description="Add your business details to start saving customer records." />;

  return <div className="customers-page">
    <section className="customers-hero"><p className="eyebrow"><span className="eyebrow-dot" />Customers and money owed</p><span className="workspace-marker">CUS</span><h1>Know who <em>owes what.</em></h1><p>Names, contact details, sales, repayments, and outstanding balances stay together in {profile.name}'s local customer book.</p><div className="customers-hero-summary"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />{activeCount} active {activeCount === 1 ? "customer" : "customers"}</span><span className="inventory-quiet-token">Open a customer to see money owed</span></div></section>
    <section className="customer-debt-spotlight" aria-label="Who owes me"><div><p className="ledger-kicker">Who owes me?</p><strong>{formatMinorAmount(totalOwingMinor, profile.currency)}</strong><span>{debtorCount ? `${debtorCount} ${debtorCount === 1 ? "customer owes" : "customers owe"} you` : "No customer currently owes money"}</span></div><button className="primary-action" type="button" onClick={openDebtors}>View debtors <span aria-hidden="true">›</span></button></section>
    <section className="customer-actions" aria-label="Customer actions"><button className="primary-action" type="button" onClick={openNewCustomer}><Plus className="h-4 w-4" aria-hidden="true" />Add customer</button><button className={snapshot.archivedCustomers.length ? "archive-access-control" : "archive-access-control archive-access-control-empty"} type="button" onClick={() => void openArchived()}><ArchiveRestore className="h-4 w-4" aria-hidden="true" />Archived records <span>{snapshot.archivedCustomers.length}</span></button><label className="customer-search"><Search className="h-4 w-4" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or phone" aria-label="Search customers" />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X className="h-4 w-4" aria-hidden="true" /></button> : null}</label></section>
    <section ref={customerRecordRef} className="customer-record" aria-labelledby="customers-title" tabIndex={-1}><div className="customer-record-head"><div><p className="ledger-kicker">Customer balances</p><h2 id="customers-title">{view === "owing" ? "People who still owe." : "Your customer book, at a glance."}</h2></div><span className="workspace-marker">CUS</span></div><div className="customer-view-toggle" aria-label="Customer list view"><button type="button" className={view === "all" ? "is-selected" : ""} onClick={() => chooseCustomerView("all")}>All customers</button><button type="button" className={view === "owing" ? "is-selected" : ""} onClick={() => chooseCustomerView("owing")}>Owing {formatMinorAmount(totalOwingMinor, profile.currency)}</button></div>{loading ? <p className="inventory-loading">Opening customer records…</p> : null}{!loading && visibleCustomers.length === 0 ? <div className="customer-empty"><UserRound className="h-7 w-7 text-baobab" aria-hidden="true" /><h3>{query ? "No matching customers." : view === "owing" ? "No customer currently owes money." : "No customers yet."}</h3><p>{query ? "Try another name, phone number, or email address." : view === "owing" ? "Completed part payments and credit sales will appear here until repayments clear their balances." : "Add a customer when you want their details kept next to future sales and payment records."}</p>{!query && view === "all" ? <button className="secondary-action" type="button" onClick={openNewCustomer}><Plus className="h-4 w-4" aria-hidden="true" />Add first customer</button> : null}</div> : null}{!loading && visibleCustomers.length ? <div className="customer-ledger-list">{visibleCustomers.map((customer, index) => <article className="customer-ledger-row" key={customer.id}><span className="product-row-index">{String(index + 1).padStart(2, "0")}</span><button className="customer-record-main" type="button" onClick={() => setSelectedCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</span></button><span className={customer.status === "active" ? "customer-status customer-status-active" : "customer-status"}>{debtByCustomer[customer.id]?.outstandingMinor ? debtByCustomer[customer.id].outstandingLabel : customer.status}</span><div className="customer-row-actions"><button type="button" className="row-action" onClick={() => setSelectedCustomer(customer)}><FileText className="h-4 w-4" aria-hidden="true" />View</button><button type="button" className="row-icon-action" aria-label={`Edit ${customer.name}`} onClick={() => openEdit(customer)}><PencilLine className="h-4 w-4" aria-hidden="true" /></button><button type="button" className="row-icon-action" aria-label={`Archive ${customer.name}`} onClick={() => requestArchive(customer)}><Archive className="h-4 w-4" aria-hidden="true" /></button></div></article>)}</div> : null}</section>
    <div ref={archivedRecordsRef}><section className="archived-products-panel archived-customers-panel" id="archived-customers" tabIndex={-1} aria-labelledby="archived-customers-title"><div className="archived-products-panel-head"><div><p className="ledger-kicker">Archived customer records</p><h3 id="archived-customers-title">{snapshot.archivedCustomers.length ? `${snapshot.archivedCustomers.length} archived ${snapshot.archivedCustomers.length === 1 ? "customer" : "customers"}` : "No archived customers"}</h3></div><button className="secondary-action" type="button" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide archived" : "Show archived"}</button></div>{showArchived && snapshot.archivedCustomers.length ? <div className="archived-customer-list">{snapshot.archivedCustomers.map((customer) => <div key={customer.id}><strong>{customer.name}</strong><span>{customer.phone} · archived {customer.archivedAt ? new Date(customer.archivedAt).toLocaleDateString() : ""}</span></div>)}</div> : <p className="archived-products-hidden">Archived customers are kept out of active search. Their future sales and payment records will remain attached to this local identity.</p>}</section></div>
    {selectedCustomer ? <section className="customer-detail" aria-labelledby="customer-detail-title"><div className="customer-detail-head"><div><p className="ledger-kicker">Customer detail</p><h2 id="customer-detail-title">{selectedCustomer.name}</h2></div><button className="row-icon-action" type="button" aria-label="Close customer detail" onClick={() => setSelectedCustomer(null)}><X className="h-4 w-4" aria-hidden="true" /></button></div><div className="customer-detail-grid"><div><span>Phone</span><strong>{selectedCustomer.phone}</strong></div><div><span>Status</span><strong>{selectedCustomer.status}</strong></div><div><span>Email</span><strong>{selectedCustomer.email ?? "Not recorded"}</strong></div><div><span>Address</span><strong>{selectedCustomer.address ?? "Not recorded"}</strong></div></div>{selectedCustomer.notes ? <p className="customer-notes"><strong>Notes</strong>{selectedCustomer.notes}</p> : null}<div className="customer-debt-breakdown" aria-live="polite"><div><span>Customer owes</span><strong>{customerDebtSummary ? formatMinorAmount(customerDebtSummary.salesOutstandingMinor, profile.currency) : "—"}</strong></div><div><span>Customer paid</span><strong>{customerDebtSummary ? formatMinorAmount(customerDebtSummary.repaidMinor, profile.currency) : "—"}</strong></div><div><span>Remaining balance</span><strong>{customerDebtSummary?.outstandingLabel ?? "Loading…"}</strong></div></div><div className="customer-financial-boundary"><div><p className="ledger-kicker">Collect a payment</p><strong>{customerDebtSummary?.outstandingLabel ?? "Loading customer record…"}</strong><span>{customerDebtSummary?.outstandingMinor ? "This is the amount still due from this customer." : "This customer has no money due right now."}</span>{customerDebtSummary?.outstandingMinor ? <button className="secondary-action debt-repayment-action" type="button" onClick={openRepayment} disabled={selectedCustomer.status !== "active"}><Save className="h-4 w-4" aria-hidden="true" />Record payment</button> : null}</div><div><p className="ledger-kicker">Sales and payments</p>{customerDebtSummary?.activities.length ? <div className="customer-activity-list">{customerDebtSummary.activities.slice(0, 8).map((activity) => activity.type === "sale" ? <div key={activity.id} className="debt-activity debt-activity-sale"><strong>Sale · {activity.receiptNumber}</strong><span>{formatMinorAmount(activity.totalMinor, profile.currency)} total · {activity.outstandingMinor ? `${formatMinorAmount(activity.outstandingMinor, profile.currency)} due` : "paid in full"}</span></div> : activity.type === "repayment" ? <div key={activity.id} className="debt-activity debt-activity-repayment"><strong>Payment · {activity.method === "mobile" ? "Mobile Money" : activity.method[0].toUpperCase() + activity.method.slice(1)}</strong><span>{formatMinorAmount(activity.amountMinor, profile.currency)} received{activity.note ? ` · ${activity.note}` : ""}</span></div> : <div key={activity.id} className="debt-activity debt-activity-reversal"><strong>Reversal · {activity.receiptNumber}</strong><span>{formatMinorAmount(Math.abs(activity.amountMinor), profile.currency)} outstanding debt removed</span></div>)}</div> : <><strong>No debt history yet</strong><span>Credit sales and later payments will appear here once recorded.</span></>}</div></div></section> : null}
    <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}><DialogContent className="inventory-dialog max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editingCustomer ? `Edit ${editingCustomer.name}` : "Add a customer"}</DialogTitle><DialogDescription>Keep contact details simple. This creates no sale, debt, or balance record.</DialogDescription></DialogHeader><Form {...form}><form className="inventory-form" onSubmit={submitCustomer} noValidate><FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Customer name</FormLabel><FormControl><Input placeholder="For example, Ama Mensah" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Phone number</FormLabel><FormControl><Input inputMode="tel" placeholder="For example, +233 20 000 0000" {...field} /></FormControl><FormMessage /></FormItem>} /><div className="inventory-form-two"><FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Customer status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select><FormMessage /></FormItem>} /><FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email <em>Optional</em></FormLabel><FormControl><Input inputMode="email" placeholder="name@example.com" {...field} /></FormControl><FormMessage /></FormItem>} /></div><FormField control={form.control} name="address" render={({ field }) => <FormItem><FormLabel>Address <em>Optional</em></FormLabel><FormControl><Input placeholder="Market, street, or neighbourhood" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes <em>Optional</em></FormLabel><FormControl><Textarea placeholder="Useful details for your own customer record" {...field} /></FormControl><FormMessage /></FormItem>} /><div className="inventory-form-footer"><span><ContactRound className="h-4 w-4 text-baobab" aria-hidden="true" />Customer records stay on this device.</span><button className="primary-action" type="submit" disabled={form.formState.isSubmitting}><Save className="h-4 w-4" aria-hidden="true" />{editingCustomer ? "Save customer" : "Add customer"}</button></div></form></Form></DialogContent></Dialog>
    <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}><DialogContent className="inventory-dialog archive-confirmation-dialog"><DialogHeader><DialogTitle>Archive {pendingArchiveCustomer?.name}?</DialogTitle><DialogDescription>This removes the customer from active search. The local record remains, and future verified transactions will stay linked to it.</DialogDescription></DialogHeader><div className="inventory-form-footer"><span><Archive className="h-4 w-4 text-baobab" aria-hidden="true" />No customer record is deleted.</span><div className="archive-confirmation-actions"><button className="secondary-action" type="button" onClick={() => setArchiveDialogOpen(false)}>Keep active</button><button className="primary-action" type="button" onClick={() => void confirmArchive()}>Archive customer</button></div></div></DialogContent></Dialog>
    <Dialog open={repaymentDialogOpen} onOpenChange={setRepaymentDialogOpen}><DialogContent className="inventory-dialog repayment-dialog"><DialogHeader><DialogTitle>Record customer payment</DialogTitle><DialogDescription>Save the amount {selectedCustomer?.name} pays today. This creates one separate payment record and never changes their completed sales.</DialogDescription></DialogHeader><div className="repayment-balance-story" aria-live="polite"><div><span>Customer owes</span><strong>{customerDebtSummary?.outstandingLabel ?? "—"}</strong></div><div><span>Customer pays</span><strong>{repaymentPreviewMinor !== null ? formatMinorAmount(repaymentPreviewMinor, profile.currency) : "Enter amount"}</strong></div><div><span>New balance</span><strong>{repaymentNewBalanceMinor !== null ? formatMinorAmount(repaymentNewBalanceMinor, profile.currency) : "—"}</strong></div></div><div className="inventory-form"><label><span>Customer pays now ({profile.currency})</span><Input inputMode="decimal" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="0.00" /></label><label><span>Payment method</span><Select value={repaymentMethod} onValueChange={(value) => setRepaymentMethod(value as RepaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{repaymentMethods.map((method) => <SelectItem key={method} value={method}>{method === "mobile" ? "Mobile Money" : method[0].toUpperCase() + method.slice(1)}</SelectItem>)}</SelectContent></Select></label><div className="space-y-2"><label htmlFor="repayment-sale-link" className="block text-sm font-medium">Apply payment to a credit sale <em>Optional</em></label><Select value={repaymentSaleId} onValueChange={setRepaymentSaleId}><SelectTrigger id="repayment-sale-link" aria-label="Apply payment to a credit sale"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unallocated">Customer balance (not assigned to a sale)</SelectItem>{repaymentTargets?.canLink ? repaymentTargets.targets.map((target) => <SelectItem key={target.saleId} value={target.saleId}>{target.receiptNumber} · {formatMinorAmount(target.remainingMinor, profile.currency)} available</SelectItem>) : null}</SelectContent></Select><p className="text-xs text-muted-foreground">Sale linking applies the whole payment to one saved credit sale. It never distributes money across earlier sales automatically.</p>{repaymentTargets?.reason ? <p className="text-xs text-amber-700" role="status">{repaymentTargets.reason}</p> : null}{repaymentTargetsError ? <p className="text-xs text-amber-700" role="status">Sale links could not be verified: {repaymentTargetsError}. You can still record an unallocated payment.</p> : null}{repaymentTargetInvalid ? <p className="text-xs text-red-700" role="alert">The amount must be positive and within this sale's verified remaining balance. Choose another sale or leave the payment unallocated.</p> : null}</div><label><span>Note <em>Optional</em></span><Textarea value={repaymentNote} onChange={(event) => setRepaymentNote(event.target.value)} placeholder="For example, paid after market day" /></label><div className="inventory-form-footer"><span><Check className="h-4 w-4 text-baobab" aria-hidden="true" />The saved payment updates this customer’s balance immediately.</span><button className="primary-action" type="button" disabled={savingRepayment || Boolean(repaymentTargetInvalid)} onClick={() => void saveRepayment()}><Save className="h-4 w-4" aria-hidden="true" />{savingRepayment ? "Recording…" : "Save customer payment"}</button></div></div></DialogContent></Dialog>
    {selectedCustomer ? <section className="customer-share-workspace" aria-labelledby="customer-share-title"><div><p className="ledger-kicker">Share saved customer facts</p><h3 id="customer-share-title">Send a clear customer update.</h3><p>These short messages use the saved balance or payment record only. They do not send data from Tallybook or change any business record.</p><button className="secondary-action" type="button" onClick={shareBalance} disabled={!customerDebtSummary}><Share2 className="h-4 w-4" aria-hidden="true" />Share balance</button></div>{customerDebtSummary?.activities.filter((activity): activity is Extract<CustomerDebtSummary["activities"][number], { type: "repayment" }> => activity.type === "repayment").slice(0, 3).map((activity) => <div className="customer-share-payment" key={`share-${activity.id}`}><strong>Payment received · {formatMinorAmount(activity.amountMinor, profile.currency)}</strong><span>{activity.method === "mobile" ? "Mobile Money" : activity.method[0].toUpperCase() + activity.method.slice(1)} · {new Date(activity.createdAt).toLocaleDateString()}</span><button className="row-action" type="button" onClick={() => sharePaymentConfirmation(activity)}><Share2 className="h-3.5 w-3.5" aria-hidden="true" />Share payment confirmation</button></div>)}{manualShare ? <section className="receipt-manual-copy customer-share-fallback" aria-live="polite"><div><Share2 className="h-4 w-4" aria-hidden="true" /><strong>Copy {manualShare.label}</strong><button className="row-icon-action" type="button" aria-label="Close share message" onClick={() => setManualShare(null)}><X className="h-4 w-4" aria-hidden="true" /></button></div><p>Your browser could not open sharing or copy automatically. Select and copy this text into your normal customer message.</p><textarea aria-label={`${manualShare.label} text for manual copy`} readOnly value={manualShare.text} /></section> : null}</section> : null}
  </div>;
}
