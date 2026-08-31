/** Tactile Ledger design reminder: the sale screen is a receipt in progress—clear lines, one commit action, no silent partial writes or indefinite saving state. */
/** Tallybook Africa design reminder: the POS stays compact and cobalt; payment details must be clear, local, and easy to complete on a phone. */
import { Check, ChevronDown, CircleAlert, CircleDollarSign, CreditCard, Eye, Minus, PackagePlus, Plus, Printer, ReceiptText, RotateCcw, Save, Share2, ShoppingBag, Smartphone, Trash2, UserRound, WalletCards } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Link } from "wouter";
import { ReceiptDetailDialog } from "@/components/ReceiptDetailDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { getCustomerSnapshot, type CustomerSnapshot } from "@/features/customers/customers";
import { formatMinorAmount, getInventorySnapshot, parseAmountToMinor, type InventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider, getMobileMoneyProviders, type MobileMoneyProvider } from "@/features/payments/mobileMoney";
import { completeSale, getSaleSnapshot, paymentMethodLabel, paymentMethods, type Payment, type PaymentMethod, type Sale, type SaleCartLineInput, type SaleSnapshot } from "@/features/sales/sales";
import { withSaleCompletionTimeout } from "@/features/sales/completion";
import { formatReceiptShareText, resolveReceiptDetail, shareReceiptText } from "@/features/receipts/receiptDetail";

interface CartLine { productId: string; quantity: number; }
const emptyInventory: InventorySnapshot = { categories: [], products: [], archivedProducts: [], movements: [] };
const emptyCustomers: CustomerSnapshot = { customers: [], archivedCustomers: [] };
const emptySales: SaleSnapshot = { sales: [], lines: [], payments: [], receipts: [] };
export default function SalesPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const { status: databaseStatus } = useDatabase();
  const [inventory, setInventory] = useState<InventorySnapshot>(emptyInventory);
  const [customers, setCustomers] = useState<CustomerSnapshot>(emptyCustomers);
  const [sales, setSales] = useState<SaleSnapshot>(emptySales);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productToAdd, setProductToAdd] = useState("");
  const [quantityToAdd, setQuantityToAdd] = useState("1");
  const [customerId, setCustomerId] = useState("walk-in");
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentPlan, setPaymentPlan] = useState<"full" | "partial" | "credit">("full");
  const [amountPaid, setAmountPaid] = useState("0");
  const [mobileMoneyProviders, setMobileMoneyProviders] = useState<MobileMoneyProvider[]>([]);
  const [mobileMoneyProviderId, setMobileMoneyProviderId] = useState("");
  const [mobileMoneyReference, setMobileMoneyReference] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [addingProvider, setAddingProvider] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | undefined>();
  const [receiptRecordId, setReceiptRecordId] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [receiptManualCopyText, setReceiptManualCopyText] = useState<string | null>(null);
  const completionLock = useRef(false);
  const submissionKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (databaseStatus !== "ready") return;
    setLoading(true);
    try { const [inventorySnapshot, customerSnapshot, saleSnapshot, providers] = await Promise.all([getInventorySnapshot(), getCustomerSnapshot(), getSaleSnapshot(), getMobileMoneyProviders(undefined, false)]); setInventory(inventorySnapshot); setCustomers(customerSnapshot); setSales(saleSnapshot); setMobileMoneyProviders(providers); }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not open your sale records."); }
    finally { setLoading(false); }
  }, [databaseStatus, activeCompanyId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setInventory(emptyInventory);
    setCustomers(emptyCustomers);
    setSales(emptySales);
    setCart([]);
    setCustomerId("walk-in");
    setMobileMoneyProviders([]);
    setMobileMoneyProviderId("");
    setMobileMoneyReference("");
    setReceipt(null);
    setReceiptPayment(undefined);
    setReceiptRecordId(null);
    setSelectedReceiptId(null);
    setReceiptManualCopyText(null);
    submissionKey.current = null;
    completionLock.current = false;
  }, [activeCompanyId]);
  useEffect(() => { const sync = () => { void refresh(); }; window.addEventListener("focus", sync); window.addEventListener("pageshow", sync); return () => { window.removeEventListener("focus", sync); window.removeEventListener("pageshow", sync); }; }, [refresh]);

  const productById = useMemo(() => new Map(inventory.products.map((product) => [product.id, product])), [inventory.products]);
  const discoverableProducts = useMemo(() => inventory.products.filter((product) => product.name.toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase())), [inventory.products, productQuery]);
  const cartLines = useMemo(() => cart.map((line) => ({ ...line, product: productById.get(line.productId) })).filter((line): line is CartLine & { product: NonNullable<typeof inventory.products[number]> } => Boolean(line.product)), [cart, productById]);
  const subtotalMinor = cartLines.reduce((sum, line) => sum + line.product.sellingPriceMinor * line.quantity, 0);
  const divisor = profile ? (profile.currency === "RWF" || profile.currency === "TZS" || profile.currency === "UGX" ? 1 : 100) : 100;
  const discountMinor = Math.min(subtotalMinor, Math.max(0, Math.round(Number(discount.replace(",", ".")) * divisor) || 0));
  const totalMinor = subtotalMinor - discountMinor;
  const suggestedPaid = totalMinor / divisor;
  const amountPaidPreviewMinor = useMemo(() => { try { return parseAmountToMinor(amountPaid, profile?.currency ?? "GHS"); } catch { return 0; } }, [amountPaid, profile?.currency]);
  const outstandingPreview = Math.max(0, totalMinor - amountPaidPreviewMinor);
  const selectedCustomerName = customerId === "walk-in" ? "Walk-in customer" : customers.customers.find((customer) => customer.id === customerId)?.name ?? "Choose a customer";
  const paymentBySaleId = useMemo(() => new Map(sales.payments.map((payment) => [payment.saleId, payment])), [sales.payments]);
  const selectedReceiptDetail = useMemo(() => selectedReceiptId && profile ? resolveReceiptDetail({ receiptId: selectedReceiptId, snapshot: sales, profile, customers: customers.customers }) : undefined, [customers.customers, profile, sales, selectedReceiptId]);

  useEffect(() => { if (paymentPlan === "full") setAmountPaid(String(suggestedPaid)); }, [paymentPlan, suggestedPaid]);

  const addProduct = () => { const quantity = Number(quantityToAdd); const product = productById.get(productToAdd); if (!product) return toast.info("Choose a product to add."); if (!Number.isInteger(quantity) || quantity < 1) return toast.error("Enter a whole quantity of at least 1."); setCart((current) => { const existing = current.find((line) => line.productId === product.id); const nextQuantity = (existing?.quantity ?? 0) + quantity; if (nextQuantity > product.stockQuantity) { toast.error(`${product.name} has only ${product.stockQuantity} available.`); return current; } return existing ? current.map((line) => line.productId === product.id ? { ...line, quantity: nextQuantity } : line) : [...current, { productId: product.id, quantity }]; }); setProductToAdd(""); setQuantityToAdd("1"); };
  const updateQuantity = (productId: string, quantity: number) => { const product = productById.get(productId); if (!product || quantity < 1) return; setCart((current) => current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(quantity, product.stockQuantity) } : line)); };
  const complete = async () => {
    if (completionLock.current) return toast.info("This sale is already being recorded. Please wait for the receipt.");
    if (!profile) return;
    if (!cart.length) return toast.info("Add a product before completing this sale.");
    if (outstandingPreview > 0 && customerId === "walk-in") return toast.error("Choose a named customer before saving a partial payment or credit sale.");
    if (paymentMethod === "mobile" && paymentPlan !== "credit" && amountPaidPreviewMinor > 0 && !mobileMoneyProviderId) return toast.error("Choose a Mobile Money provider before completing this sale.");
    completionLock.current = true;
    setSubmitting(true);
    try {
      submissionKey.current ??= nanoid(18);
      const result = await withSaleCompletionTimeout(completeSale({ lines: cart, customerId: customerId === "walk-in" ? undefined : customerId, discount, paymentMethod, amountPaid: paymentPlan === "credit" ? "0" : amountPaid, currency: profile.currency, ...(paymentMethod === "mobile" ? { mobileMoneyProviderId, mobileMoneyReference } : {}), submissionKey: submissionKey.current }));
      setReceipt(result.sale);
      setReceiptPayment(result.payment);
      setReceiptRecordId(result.receipt.id);
      setSales((current) => current.sales.some((sale) => sale.id === result.sale.id) ? current : { sales: [result.sale, ...current.sales], lines: [...result.lines, ...current.lines], payments: result.payment ? [result.payment, ...current.payments] : current.payments, receipts: [result.receipt, ...current.receipts] });
      setCart([]); setDiscount("0"); setPaymentMethod("cash"); setPaymentPlan("full"); setAmountPaid("0"); setCustomerId("walk-in"); setMobileMoneyProviderId(""); setMobileMoneyReference("");
      submissionKey.current = null;
      toast.success(`Sale completed. Receipt ${result.sale.receiptNumber} is saved on this device.`);
      void refresh().catch(() => { toast.info("The receipt is saved. Refresh this page if the recent-sales list does not update immediately."); });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This sale could not be completed. Nothing was saved.");
    } finally {
      completionLock.current = false;
      flushSync(() => setSubmitting(false));
    }
  };
  const choosePayment = (method: PaymentMethod) => { setPaymentMethod(method); if (method !== "mobile") { setMobileMoneyProviderId(""); setMobileMoneyReference(""); } if (method === "credit") { setPaymentPlan("credit"); setAmountPaid("0"); } else if (paymentPlan === "credit") { setPaymentPlan("full"); setAmountPaid(String(suggestedPaid)); } };
  const choosePaymentPlan = (plan: "full" | "partial" | "credit") => { setPaymentPlan(plan); if (plan === "credit") { setPaymentMethod("credit"); setAmountPaid("0"); return; } if (paymentMethod === "credit") setPaymentMethod("cash"); setAmountPaid(plan === "full" ? String(suggestedPaid) : ""); };
  const addProviderInCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingProvider(true);
    try {
      const provider = await addMobileMoneyProvider({ name: newProviderName });
      setMobileMoneyProviders(await getMobileMoneyProviders(undefined, false));
      setMobileMoneyProviderId(provider.id);
      setNewProviderName("");
      toast.success(`${provider.name} is selected for this sale. Your cart is unchanged.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We could not add that Mobile Money provider.");
    } finally {
      setAddingProvider(false);
    }
  };
  const openReceipt = (receiptId: string, manualText?: string | null) => { setReceiptManualCopyText(manualText ?? null); setSelectedReceiptId(receiptId); };
  const shareSavedReceipt = async (receiptId: string) => {
    if (!profile) return;
    const detail = resolveReceiptDetail({ receiptId, snapshot: sales, profile, customers: customers.customers });
    if (!detail) return toast.error("This saved receipt is not available to share.");
    const text = formatReceiptShareText(detail);
    const result = await shareReceiptText(text);
    if (result === "shared") return toast.success("Receipt opened in your device share options.");
    if (result === "copied") return toast.success("Receipt text copied. Paste it into your customer message.");
    if (result === "manual") { openReceipt(receiptId, text); return toast.info("Copy the receipt text from the receipt view."); }
  };
  const printSavedReceipt = (receiptId: string) => { openReceipt(receiptId); window.setTimeout(() => { if (typeof window.print === "function") window.print(); else toast.info("Printing is not available in this browser."); }, 0); };

  if (!profile) return <section className="reports-gate"><div className="reports-gate-sheet"><div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div><span className="workspace-marker">SAL</span><p className="eyebrow"><span className="eyebrow-dot" />Sale record preparation</p><h1>Set the record before you record a sale.</h1><p>Your business identity and receipt currency keep saved sales, payments, stock changes, and receipts together.</p><div className="reports-prerequisite-list"><div><span>01</span><strong>Business name</strong><small>Identifies the ledger that owns this sale.</small></div><div><span>02</span><strong>Receipt currency</strong><small>Keeps totals and payment amounts consistent.</small></div><div><span>03</span><strong>Product record</strong><small>Items can be selected after business setup is complete.</small></div></div><p className="reports-gate-tally"><b>Two details to begin</b><span>Business name · Currency</span></p><Link href="/business" className="primary-action">Set up business</Link></div></section>;
  if (!loading && inventory.products.length === 0) return <section className="inventory-gate sales-gate"><div className="inventory-gate-sheet"><div className="inventory-gate-head"><PackagePlus className="h-8 w-8 text-baobab" aria-hidden="true" /><span className="workspace-marker">SAL</span></div><p className="eyebrow"><span className="eyebrow-dot" />Sale record preparation</p><h1>Add stock before you open the receipt.</h1><p>A completed sale writes a receipt and reduces stock together. Add at least one active product to start that record safely.</p><div className="sales-gate-records" aria-label="Sales prerequisites"><div><span>01</span><strong>Business profile</strong><small>Ready for {profile.name}.</small></div><div><span>02</span><strong>Active product</strong><small>Still needed before a sale can begin.</small></div><div><span>03</span><strong>Sale receipt</strong><small>Will be created only when stock is available.</small></div></div><div className="inventory-gate-record"><span className="tally-status"><i /><i />One task to begin</span><span>Active product · Stock quantity</span></div><Link href="/inventory" className="primary-action">Add a product <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" /></Link></div></section>;

  return <div className="sales-page"><section className="sales-hero"><p className="eyebrow"><span className="eyebrow-dot" />Point of sale</p><span className="workspace-marker">POS</span><h1>Make a sale.</h1><p>Choose products, review the payment, then save one complete local record.</p><div className="sales-hero-summary"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />{inventory.products.length} ready to sell</span><span className="inventory-quiet-token">{cartLines.length} in cart</span></div></section>
    <section className="sales-builder"><div className="sale-lines-sheet"><div className="sale-sheet-head"><div><p className="ledger-kicker">Products</p><h2>Find and add items.</h2></div><span className="tally-status"><i /><i />Current sale</span></div><div className="sale-product-search"><Input aria-label="Search active products" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search products" /><small>{discoverableProducts.length} available</small></div><div className="sale-add-line"><Select value={productToAdd} onValueChange={setProductToAdd}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{discoverableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.stockQuantity} available</SelectItem>)}</SelectContent></Select><Input aria-label="Quantity to add" inputMode="numeric" value={quantityToAdd} onChange={(event) => setQuantityToAdd(event.target.value)} /><button className="secondary-action" type="button" onClick={addProduct}><Plus className="h-4 w-4" aria-hidden="true" />Add</button></div>{cartLines.length ? <div className="sale-cart-list">{cartLines.map((line, index) => <div className="sale-cart-row" key={line.productId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{line.product.name}</strong><small>{formatMinorAmount(line.product.sellingPriceMinor, profile.currency)} each · {line.product.stockQuantity} available</small></div><div className="sale-quantity"><button type="button" aria-label={`Reduce ${line.product.name} quantity`} onClick={() => line.quantity === 1 ? setCart((current) => current.filter((cartLine) => cartLine.productId !== line.productId)) : updateQuantity(line.productId, line.quantity - 1)}><Minus className="h-3.5 w-3.5" /></button><strong>{line.quantity}</strong><button type="button" aria-label={`Increase ${line.product.name} quantity`} onClick={() => updateQuantity(line.productId, line.quantity + 1)} disabled={line.quantity >= line.product.stockQuantity}><Plus className="h-3.5 w-3.5" /></button></div><strong>{formatMinorAmount(line.product.sellingPriceMinor * line.quantity, profile.currency)}</strong><button className="row-icon-action" type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setCart((current) => current.filter((cartLine) => cartLine.productId !== line.productId))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div>)}</div> : <div className="sale-empty"><ShoppingBag className="h-7 w-7 text-baobab" aria-hidden="true" /><strong>Your cart is empty.</strong><span>Search and add products to start this sale. Nothing is saved yet.</span></div>}</div><aside className="sale-totals-sheet"><p className="ledger-kicker">Cart summary</p><div className="sale-total-row"><span>Subtotal</span><strong>{formatMinorAmount(subtotalMinor, profile.currency)}</strong></div><label className="sale-discount"><span>Discount ({profile.currency})</span><Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label><div className="sale-total-row sale-total-due"><span>Total</span><strong>{formatMinorAmount(totalMinor, profile.currency)}</strong></div><button className="quiet-action" type="button" onClick={() => { setCart([]); setDiscount("0"); setAmountPaid("0"); }}>Clear cart</button></aside></section>
    <section className="sale-checkout"><div className="sale-checkout-head"><div><p className="ledger-kicker">Checkout</p><h2>Review and take payment.</h2></div><span className="workspace-marker">PAY</span></div><div className="sale-checkout-grid"><label><span>Customer</span><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk-in">Walk-in customer</SelectItem>{customers.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</SelectItem>)}</SelectContent></Select></label><label><span>Payment method</span><Select value={paymentMethod} onValueChange={(value) => choosePayment(value as PaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((method) => <SelectItem key={method} value={method}>{paymentMethodLabel(method)}</SelectItem>)}</SelectContent></Select></label><label><span>Amount paid now ({profile.currency})</span><Input aria-describedby="payment-amount-help" inputMode="decimal" disabled={paymentPlan === "credit"} value={amountPaid} onChange={(event) => { setPaymentPlan("partial"); setAmountPaid(event.target.value); }} placeholder="0.00" /><small id="payment-amount-help">Enter only what you received today for part payment.</small></label></div>{paymentMethod === "mobile" ? <div className="mobile-money-checkout" aria-labelledby="mobile-money-checkout-title"><div><p className="ledger-kicker">Mobile Money details</p><h3 id="mobile-money-checkout-title">Choose the provider and record a reference if you have one.</h3></div>{mobileMoneyProviders.length ? <div className="mobile-money-checkout-grid"><label><span>Provider</span><Select value={mobileMoneyProviderId} onValueChange={setMobileMoneyProviderId}><SelectTrigger><SelectValue placeholder="Choose a provider" /></SelectTrigger><SelectContent>{mobileMoneyProviders.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></label><label><span>Transaction / reference <em>Optional</em></span><Input value={mobileMoneyReference} onChange={(event) => setMobileMoneyReference(event.target.value)} placeholder="For example, 123456" maxLength={120} /></label></div> : <div className="mobile-money-provider-inline-add"><CircleAlert className="h-5 w-5" aria-hidden="true" /><div><strong>No Mobile Money provider is set up yet.</strong><p>Add one below and this sale will remain exactly as it is.</p><form onSubmit={addProviderInCheckout} noValidate><Input aria-label="New Mobile Money provider name" value={newProviderName} onChange={(event) => setNewProviderName(event.target.value)} placeholder="For example, MTN MoMo" maxLength={80} disabled={addingProvider} /><button className="secondary-action" type="submit" disabled={addingProvider || newProviderName.trim().length < 2}><Plus className="h-4 w-4" aria-hidden="true" />{addingProvider ? "Adding…" : "Add provider"}</button></form><Link href="/business" className="link-action">Manage providers in Business</Link></div></div>}</div> : null}<div className="sale-payment-plan" aria-label="Payment plan"><p className="ledger-kicker">Payment option</p><div><button className={paymentPlan === "full" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("full")}><strong>Pay now</strong><span>{formatMinorAmount(totalMinor, profile.currency)} received today</span></button><button className={paymentPlan === "partial" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("partial")}><strong>Part payment</strong><span>Customer pays some now and owes the rest</span></button><button className={paymentPlan === "credit" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("credit")}><strong>Pay later</strong><span>No payment now; named customer required</span></button></div></div><div className="sale-confirmation-grid" aria-label="Sale outcome before completion"><div><span>Sale total</span><strong>{formatMinorAmount(totalMinor, profile.currency)}</strong></div><div><span>Paid now</span><strong>{formatMinorAmount(paymentPlan === "credit" ? 0 : amountPaidPreviewMinor, profile.currency)}</strong></div><div><span>Remaining</span><strong>{formatMinorAmount(outstandingPreview, profile.currency)}</strong></div><div><span>Payment</span><strong>{paymentPlan === "partial" ? `Part payment · ${paymentMethodLabel(paymentMethod)}` : paymentPlan === "credit" ? "Pay later · Credit" : paymentMethodLabel(paymentMethod)}</strong></div><div className="sale-confirmation-customer"><span>Customer</span><strong>{selectedCustomerName}</strong></div></div><div className="sale-payment-summary"><WalletCards className="h-5 w-5 text-baobab" aria-hidden="true" /><div><strong>{outstandingPreview > 0 ? `${formatMinorAmount(outstandingPreview, profile.currency)} remains to collect.` : "This sale is fully paid."}</strong><span>{outstandingPreview > 0 ? "Choose a named customer before saving this part-payment or pay-later sale." : "The receipt and payment record will be saved together."}</span></div></div><button className={`primary-action sale-complete-action${cart.length ? "" : " sale-complete-action-empty"}`} type="button" aria-busy={submitting} disabled={submitting} onClick={() => void complete()}><Save className="h-4 w-4" aria-hidden="true" />{submitting ? "Saving sale…" : "Complete sale"}</button></section>
    {receipt ? <section className="receipt-confirmation" aria-labelledby="receipt-title">
      <div><p className="ledger-kicker">Receipt saved</p><h2 id="receipt-title">{receipt.receiptNumber}</h2><p>{new Date(receipt.createdAt).toLocaleString()} · {receipt.customerId ? "Customer sale" : "Walk-in sale"}</p><p className="receipt-payment-detail">{paymentMethodLabel(receipt.paymentMethod)}{receiptPayment?.mobileMoneyProviderName ? ` · ${receiptPayment.mobileMoneyProviderName}${receiptPayment.mobileMoneyReference ? ` · Ref ${receiptPayment.mobileMoneyReference}` : ""}` : ""}</p></div>
      <div><span>Total</span><strong>{formatMinorAmount(receipt.totalMinor, profile.currency)}</strong><span>{receipt.outstandingMinor ? `${formatMinorAmount(receipt.outstandingMinor, profile.currency)} outstanding` : "Paid in full"}</span></div>
      <ReceiptText className="h-9 w-9 text-baobab" aria-hidden="true" />
      <div className="receipt-confirmation-actions">
        {receiptRecordId ? <><button type="button" className="secondary-action" onClick={() => openReceipt(receiptRecordId)}><Eye className="h-4 w-4" aria-hidden="true" />View receipt</button><button type="button" className="secondary-action" onClick={() => void shareSavedReceipt(receiptRecordId)}><Share2 className="h-4 w-4" aria-hidden="true" />Share receipt</button><button type="button" className="secondary-action" onClick={() => printSavedReceipt(receiptRecordId)}><Printer className="h-4 w-4" aria-hidden="true" />Print</button></> : null}
        <button type="button" className="primary-action" onClick={() => { setReceipt(null); setReceiptPayment(undefined); setReceiptRecordId(null); }}>Done</button>
      </div>
    </section> : null}
    <section className="recent-sales"><div className="recent-sales-head"><div><p className="ledger-kicker">Recent sales</p><h2>Every completed sale has a line.</h2></div><CircleDollarSign className="h-7 w-7 text-baobab" aria-hidden="true" /></div>{sales.sales.length ? <div>{sales.sales.slice(0, 6).map((sale) => { const payment = paymentBySaleId.get(sale.id); const receiptForSale = sales.receipts.find((item) => item.saleId === sale.id); return <div className="recent-sale-row" key={sale.id}><div><strong>{sale.receiptNumber}</strong><span>{new Date(sale.createdAt).toLocaleString()} · {sale.customerId ? "Customer" : "Walk-in"}</span></div><span className="recent-sale-payment"><strong>{paymentMethodLabel(sale.paymentMethod)}</strong>{payment?.mobileMoneyProviderName ? <small>{payment.mobileMoneyProviderName}{payment.mobileMoneyReference ? ` · Ref ${payment.mobileMoneyReference}` : ""}</small> : null}</span><strong>{formatMinorAmount(sale.totalMinor, profile.currency)}</strong>{receiptForSale ? <button type="button" className="row-receipt-action" onClick={() => openReceipt(receiptForSale.id)}><Eye className="h-4 w-4" aria-hidden="true" />View receipt</button> : null}</div>; })}</div> : <p>No completed sales yet. Your receipts will appear here after a sale is completed.</p>}</section>
    <ReceiptDetailDialog detail={selectedReceiptDetail} open={Boolean(selectedReceiptId)} onOpenChange={(open) => { if (!open) { setSelectedReceiptId(null); setReceiptManualCopyText(null); } }} manualCopyText={receiptManualCopyText} />
  </div>;
}
