/** Tactile Ledger design reminder: the sale screen is a receipt in progress—clear lines, one commit action, no silent partial writes or indefinite saving state. */
/** Tallybook Africa design reminder: the POS stays compact and cobalt; payment details must be clear, local, and easy to complete on a phone. */
import { calculateTax, taxPolicyKey } from "@/features/sales/tax";
import { Check, ChevronDown, CircleAlert, CircleDollarSign, CreditCard, Eye, Minus, PackagePlus, Plus, Printer, ReceiptText, RotateCcw, Save, Share2, ShoppingBag, Smartphone, Trash2, UserRound, WalletCards } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { nanoid } from "nanoid";
import { db } from "@/db/TallybookDB";
import type { StoreLocation } from "@/features/stores/storeDirectory";
import { getAttendantStoreAvailability } from "@/features/stores/storeStockLedger";
import { toast } from "sonner";
import { Link } from "wouter";
import { CustomerCartDisplay } from "@/components/CustomerCartDisplay";
import { CameraBarcodeScanner } from "@/components/CameraBarcodeScanner";
import { ReceiptDetailDialog } from "@/components/ReceiptDetailDialog";
import { CashReturnReviewDialog } from "@/components/CashReturnReviewDialog";
import {currentCompanyReturnPolicy} from '@/features/business/returnPolicy.mjs';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { approveCheckoutDiscount, listStaff, type StaffDirectoryEntry } from "@/features/staff/staff";
import { getCustomerPolicy, getCustomerBenefits } from "@/features/customers/customerBenefits";
import { getCustomerSnapshot, type CustomerSnapshot } from "@/features/customers/customers";
import { selectUnitPrice } from "@/features/inventory/stage2Inventory";
import { formatMinorAmount, getInventorySnapshot, parseAmountToMinor, type InventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider, getMobileMoneyProviders, type MobileMoneyProvider } from "@/features/payments/mobileMoney";
import { completeSale, getSaleSnapshot, paymentMethodLabel, paymentMethods, type Payment, type PaymentMethod, type Sale, type SaleCartLineInput, type SaleSnapshot } from "@/features/sales/sales";
import { loadParkedCart, saveParkedCart, clearParkedCart, clearParkedCartIfMatches } from "@/features/sales/parkedCart";
import { loadPendingCheckout, getPendingCheckoutStatus, savePendingCheckout, clearPendingCheckout, type PendingCheckout } from "@/features/sales/pendingCheckout";
import { withSaleCompletionTimeout } from "@/features/sales/completion";
import { recoverSavedCheckout } from "@/features/sales/recoverSavedCheckout";
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
  const [storeMode, setStoreMode] = useState(false);
  const [saleStores, setSaleStores] = useState<StoreLocation[]>([]);
  const [saleStoreId, setSaleStoreId] = useState("");
  const [storeAvailable, setStoreAvailable] = useState<Record<string,number>|null>(null);
  const [customerDisplayOpen, setCustomerDisplayOpen] = useState(false);
  useEffect(() => { setCustomerDisplayOpen(false); }, [activeCompanyId]);
  const [productQuery, setProductQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [parkedAvailable, setParkedAvailable] = useState(false);
  const [resumedParkedLines, setResumedParkedLines] = useState<CartLine[] | null>(null);
  const [productToAdd, setProductToAdd] = useState("");
  const [quantityToAdd, setQuantityToAdd] = useState("1");
  const [customerId, setCustomerId] = useState("walk-in");
  const [discount, setDiscount] = useState("0");
  const [staffApprovers, setStaffApprovers] = useState<StaffDirectoryEntry[]>([]);
  const [approverId, setApproverId] = useState("");
  const [approverPin, setApproverPin] = useState("");
  const preferredPaymentMethod = profile?.preferredPaymentMethod ?? "cash";
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(preferredPaymentMethod);
  const [paymentPlan, setPaymentPlan] = useState<"full" | "partial" | "credit">("full");
  const [amountPaid, setAmountPaid] = useState("0");
  const [walletAvailableMinor, setWalletAvailableMinor] = useState<number | null>(null);
  const [pointsAvailable, setPointsAvailable] = useState(0);
  const [pointValueMinor, setPointValueMinor] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState("0");
  const [mobileMoneyProviders, setMobileMoneyProviders] = useState<MobileMoneyProvider[]>([]);
  const [mobileMoneyProviderId, setMobileMoneyProviderId] = useState("");
  const [mobileMoneyReference, setMobileMoneyReference] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [addingProvider, setAddingProvider] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [recoveryState, setRecoveryState] = useState<"empty" | "pending" | "damaged" | "unavailable">("empty");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | undefined>();
  const [receiptRecordId, setReceiptRecordId] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [returnReviewSaleId, setReturnReviewSaleId] = useState<string | null>(null);
  const [receiptManualCopyText, setReceiptManualCopyText] = useState<string | null>(null);
  const completionLock = useRef(false);
  const submissionKey = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void listStaff().then(members => {if (mounted) setStaffApprovers(members.filter(m => !m.disabledAt && m.role !== 'cashier'));})
      .catch(() => {if (mounted) setStaffApprovers([]);});
    return () => {mounted = false;};
  }, [activeCompanyId]);
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
    setPaymentMethod(preferredPaymentMethod);
    setResumedParkedLines(null);
    setCustomerId("walk-in");
    setMobileMoneyProviders([]);
    setMobileMoneyProviderId("");
    setMobileMoneyReference("");
    setReceipt(null);
    setReceiptPayment(undefined);
    setReceiptRecordId(null);
    setSelectedReceiptId(null);
    setReturnReviewSaleId(null);
    setReceiptManualCopyText(null);
    submissionKey.current = null;
    setApproverPin(""); setApproverId("");
    const status = getPendingCheckoutStatus(activeCompanyId ?? "");
    setPendingCheckout(status.pending);
    setRecoveryState(status.state);
    completionLock.current = false;
  }, [activeCompanyId]);
  useEffect(() => { setParkedAvailable(Boolean(activeCompanyId && loadParkedCart(activeCompanyId))); }, [activeCompanyId]);
  useEffect(() => { const sync = () => { void refresh(); }; window.addEventListener("focus", sync); window.addEventListener("pageshow", sync); return () => { window.removeEventListener("focus", sync); window.removeEventListener("pageshow", sync); }; }, [refresh]);

  const productById = useMemo(() => new Map(inventory.products.map((product) => [product.id, product])), [inventory.products]);
  const discoverableProducts = useMemo(() => inventory.products.filter((product) => product.name.toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase()) || (product.sku ?? "").toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase()) || (product.barcode ?? "").toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase())), [inventory.products, productQuery]);
  const cartLines = useMemo(() => cart.map((line) => ({ ...line, product: productById.get(line.productId) })).filter((line): line is CartLine & { product: NonNullable<typeof inventory.products[number]> } => Boolean(line.product)), [cart, productById]);
  const subtotalMinor = cartLines.reduce((sum, line) => sum + selectUnitPrice(line.product, line.quantity) * line.quantity, 0);
  const divisor = profile ? (profile.currency === "RWF" || profile.currency === "TZS" || profile.currency === "UGX" ? 1 : 100) : 100;
  const discountMinor = Math.min(subtotalMinor, Math.max(0, Math.round(Number(discount.replace(",", ".")) * divisor) || 0));
  const redemptionCount = Number(redeemPoints);
  const redemptionMinor = Number.isSafeInteger(redemptionCount) && redemptionCount >= 0 && redemptionCount <= pointsAvailable &&
    Number.isSafeInteger(pointValueMinor) ? redemptionCount * pointValueMinor : 0;
  const taxPreview = calculateTax(Math.max(0, subtotalMinor - discountMinor - redemptionMinor), profile?.taxPolicy);
  const totalMinor = taxPreview?.totalMinor ?? Math.max(0, subtotalMinor - discountMinor - redemptionMinor);
  const suggestedPaid = totalMinor / divisor;
  const amountPaidPreviewMinor = useMemo(() => { try { return parseAmountToMinor(amountPaid, profile?.currency ?? "GHS"); } catch { return 0; } }, [amountPaid, profile?.currency]);
  const outstandingPreview = Math.max(0, totalMinor - amountPaidPreviewMinor);
  useEffect(() => {
    let active = true;
    setWalletAvailableMinor(null);
    setPointsAvailable(0);
    setPointValueMinor(0);
    setRedeemPoints("0");
    if (customerId !== "walk-in") {
      void Promise.all([getCustomerBenefits(customerId), getCustomerPolicy(customerId)]).then(([data, policy]) => {
        if (active) { setWalletAvailableMinor(data.walletMinor); setPointsAvailable(data.points); setPointValueMinor(policy?.loyaltyPointValueMinor ?? 0); }
      })
        .catch(() => { if (active) setWalletAvailableMinor(null); });
    }
    return () => { active = false; };
  }, [customerId, activeCompanyId, sales]);
  const selectedCustomerName = customerId === "walk-in" ? "Walk-in customer" : customers.customers.find((customer) => customer.id === customerId)?.name ?? "Choose a customer";
  const paymentBySaleId = useMemo(() => new Map(sales.payments.map((payment) => [payment.saleId, payment])), [sales.payments]);
  const selectedReceiptDetail = useMemo(() => selectedReceiptId && profile ? resolveReceiptDetail({ receiptId: selectedReceiptId, snapshot: sales, profile, customers: customers.customers }) : undefined, [customers.customers, profile, sales, selectedReceiptId]);

  useEffect(() => { if (paymentPlan === "full") setAmountPaid(String(suggestedPaid)); }, [paymentPlan, suggestedPaid]);

  const availableUnits = (product:InventorySnapshot["products"][number])=>storeMode && product.itemKind!=="service" ? (storeAvailable?.[product.id]??0) : product.stockQuantity;
  const addProduct = () => { const quantity = Number(quantityToAdd); const product = productById.get(productToAdd); if (!product) return toast.info("Choose a product to add."); if (!Number.isInteger(quantity) || quantity < 1) return toast.error("Enter a whole quantity of at least 1."); setCart((current) => { const existing = current.find((line) => line.productId === product.id); const nextQuantity = (existing?.quantity ?? 0) + quantity; if (nextQuantity > availableUnits(product)) { toast.error(`${product.name} has only ${availableUnits(product)} available at this store.`); return current; } return existing ? current.map((line) => line.productId === product.id ? { ...line, quantity: nextQuantity } : line) : [...current, { productId: product.id, quantity }]; }); setProductToAdd(""); setQuantityToAdd("1"); };
  const addScannedCode = (rawCode: string) => {
    const code = rawCode.trim().toLocaleLowerCase();
    if (!code) return;
    const matches = inventory.products.filter((product) => product.sku?.trim().toLocaleLowerCase() === code || product.barcode?.trim().toLocaleLowerCase() === code);
    if (matches.length !== 1) return toast.error(matches.length ? "This code matches multiple products. Select a product manually." : "No active product matches that SKU or barcode.");
    const product = matches[0];
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if ((existing?.quantity ?? 0) + 1 > availableUnits(product)) { toast.error(`Only ${availableUnits(product)} ${product.name} available at this store.`); return current; }
      return existing ? current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { productId: product.id, quantity: 1 }];
    });
    setScanCode("");
  };
  const scanSku = () => addScannedCode(scanCode);
  const parkCart = () => {
    if (!activeCompanyId || !cart.length || submitting || completionLock.current) return;
    if (resumedParkedLines) return toast.info("This cart was resumed from a saved draft. Complete or discard it before parking another.");
    if (getPendingCheckoutStatus(activeCompanyId).state !== "empty") return toast.error("Resolve the pending checkout before parking a cart.");
    try { saveParkedCart(activeCompanyId, cart); setParkedAvailable(true); setCart([]); setDiscount("0"); toast.success("Cart parked on this device. No sale or stock movement was recorded."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "This device could not save the parked cart."); }
  };
  const resumeCart = () => {
    if (!activeCompanyId || cart.length || submitting || completionLock.current || recoveryState !== "empty") return toast.info("Finish or recover the current checkout before resuming a parked cart.");
    const saved = loadParkedCart(activeCompanyId);
    if (!saved) return toast.info("No parked cart found on this device.");
    const valid = saved.lines.every((line) => { const product = productById.get(line.productId); return Boolean(product && availableUnits(product) >= line.quantity); });
    if (!valid) return toast.error("Parked cart contains unavailable or insufficient stock. Review inventory before resuming.");
    setCart(saved.lines); setResumedParkedLines(saved.lines); toast.success("Parked cart loaded. Its saved backup remains until the sale succeeds or you discard it.");
  };
  const updateQuantity = (productId: string, quantity: number) => { const product = productById.get(productId); if (!product || quantity < 1) return; setCart((current) => current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(quantity, availableUnits(product)) } : line)); };
  useEffect(() => {
    let live=true; setStoreMode(false); setSaleStores([]); setSaleStoreId("");
    if (!activeCompanyId) return;
    void Promise.all([db.storeStockModes.get(activeCompanyId),db.storeLocations.where("businessProfileId").equals(activeCompanyId).toArray()])
      .then(([mode,locations])=>{if(live){setStoreMode(Boolean(mode));setSaleStores(locations.filter(s=>s.status==="active"));}})
      .catch(()=>{if(live)toast.error("Store inventory could not be loaded. Checkout may be blocked.");});
    return ()=>{live=false;};
  },[activeCompanyId]);
  useEffect(()=>{let live=true;setStoreAvailable(null);if(!storeMode||!saleStoreId)return;
    void getAttendantStoreAvailability(saleStoreId,db).then(rows=>{if(live)setStoreAvailable(Object.fromEntries(rows.map(r=>[r.productId,r.quantity])));})
      .catch(()=>{if(live){setStoreAvailable(null);toast.error("Cannot verify this store's available inventory.");}});
    return ()=>{live=false;};
  },[activeCompanyId,storeMode,saleStoreId,sales]);
  const complete = async () => {
    if (completionLock.current) return toast.info("This sale is already being recorded. Please wait for the receipt.");
    if (!profile || !activeCompanyId) return;
    const currentJournal = getPendingCheckoutStatus(activeCompanyId);
    if (currentJournal.state !== "empty") return toast.error(currentJournal.state === "damaged" ? "Saved checkout recovery data is damaged. Check sales history before proceeding." : currentJournal.state === "unavailable" ? "Recovery storage is unavailable. Checkout cannot safely start." : "Resolve the previous checkout before starting a new one.");
    if (!cart.length) return toast.info("Add a product before completing this sale.");
    if(storeMode && !saleStoreId)return toast.error("Select the selling store before saving a receipt.");
    if(storeMode && !storeAvailable)return toast.error("Wait for this store's stock to be verified before checkout.");
    if (outstandingPreview > 0 && customerId === "walk-in") return toast.error("Choose a named customer before saving a partial payment or credit sale.");
    if (!Number.isSafeInteger(Number(redeemPoints)) || Number(redeemPoints) < 0 ||
      Number(redeemPoints) > pointsAvailable || (Number(redeemPoints) > 0 && pointValueMinor <= 0) ||
      discountMinor + redemptionMinor > subtotalMinor)
      return toast.error("Review loyalty points and discounts before checkout.");
    if (paymentMethod === "wallet" && (customerId === "walk-in" || walletAvailableMinor === null || amountPaidPreviewMinor > walletAvailableMinor))
      return toast.error("Choose a customer with sufficient verified prepaid funds before using wallet payment.");
    if (paymentMethod === "mobile" && paymentPlan !== "credit" && amountPaidPreviewMinor > 0 && !mobileMoneyProviderId) return toast.error("Choose a Mobile Money provider before completing this sale.");
    completionLock.current = true;
    setSubmitting(true);
    try {
      submissionKey.current ??= nanoid(18);
      // The approval is for this exact checkout key and amount, never for the whole session.
      if (approverId && discount.trim() !== "0" && discount.trim() !== "0.00") {
        await approveCheckoutDiscount(approverId,approverPin,submissionKey.current,parseAmountToMinor(discount,profile.currency),subtotalMinor);
        setApproverPin("");
      }
      const intent = { ...(storeMode?{storeId:saleStoreId}:{}), taxReviewKey: taxPolicyKey(profile.taxPolicy), lines: cart.map(line => ({ ...line })), customerId: customerId === "walk-in" ? undefined : customerId, discount, redeemPoints: Number(redeemPoints), paymentMethod, amountPaid: paymentPlan === "credit" ? "0" : amountPaid, currency: profile.currency, ...(paymentMethod === "mobile" ? { mobileMoneyProviderId, mobileMoneyReference } : {}), submissionKey: submissionKey.current };
      const journal = savePendingCheckout(activeCompanyId, intent);
      setPendingCheckout(journal); setRecoveryState("pending");
      const result = await withSaleCompletionTimeout(completeSale(intent));
      clearPendingCheckout(activeCompanyId, journal.intent.submissionKey);
      if (resumedParkedLines) {
        try { clearParkedCartIfMatches(activeCompanyId, resumedParkedLines); setParkedAvailable(Boolean(loadParkedCart(activeCompanyId))); setResumedParkedLines(null); }
        catch { toast.info("Sale saved, but its parked-cart backup could not be cleared. Discard that old draft before another sale."); }
      }
      setPendingCheckout(null); setRecoveryState("empty");
      setReceipt(result.sale);
      setReceiptPayment(result.payment);
      setReceiptRecordId(result.receipt.id);
      setSales((current) => current.sales.some((sale) => sale.id === result.sale.id) ? current : { sales: [result.sale, ...current.sales], lines: [...result.lines, ...current.lines], payments: result.payment ? [result.payment, ...current.payments] : current.payments, receipts: [result.receipt, ...current.receipts] });
      setCart([]); setDiscount("0"); setPaymentMethod(preferredPaymentMethod); setPaymentPlan("full"); setAmountPaid("0"); setCustomerId("walk-in"); setMobileMoneyProviderId(""); setMobileMoneyReference("");
      submissionKey.current = null;
      toast.success(`Sale completed. Receipt ${result.sale.receiptNumber} is saved on this device.`);
      void refresh().catch(() => { toast.info("The receipt is saved. Refresh this page if the recent-sales list does not update immediately."); });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout status is uncertain. Check recent sales before retrying.");
    } finally {
      completionLock.current = false;
      flushSync(() => setSubmitting(false));
    }
  };
  const recoverCheckout = async () => {
    if (!activeCompanyId || !pendingCheckout || completionLock.current) return;
    completionLock.current = true;
    setSubmitting(true);
    try {
      // First inspect committed records. Never guess that a timeout meant failure.
      const snapshot = await getSaleSnapshot();
      const committed = recoverSavedCheckout(snapshot, activeCompanyId, pendingCheckout.intent.submissionKey);
      // Already committed: only read saved receipt and payment. Do not invoke a write service.
      // If absent: retry only the original immutable intent, preserving its idempotency key.
      const result = committed ?? await withSaleCompletionTimeout(completeSale(pendingCheckout.intent));
      clearPendingCheckout(activeCompanyId, pendingCheckout.intent.submissionKey);
      if (resumedParkedLines || loadParkedCart(activeCompanyId)) {
        try { clearParkedCartIfMatches(activeCompanyId, pendingCheckout.intent.lines); setParkedAvailable(Boolean(loadParkedCart(activeCompanyId))); setResumedParkedLines(null); }
        catch { toast.info("Recovered sale; its parked-cart backup may still exist. Discard the old draft before selling again."); }
      }
      setPendingCheckout(null); setRecoveryState("empty");
      setReceipt(result.sale); setReceiptPayment(result.payment); setReceiptRecordId(result.receipt.id);
      setCart([]); setDiscount("0"); setPaymentPlan("full"); setCustomerId("walk-in"); setPaymentMethod(preferredPaymentMethod);
      submissionKey.current = null;
      await refresh();
      toast.success(`Recovered saved receipt ${result.sale.receiptNumber}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery could not confirm this checkout. Keep its original key.");
    } finally { completionLock.current = false; setSubmitting(false); }
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
  // Open the persisted receipt first. Printing from within the dialog keeps
  // window.print() inside the cashier's direct click gesture on mobile browsers.
  const prepareReceiptPrint = (receiptId: string) => {
    const detail = profile ? resolveReceiptDetail({ receiptId, snapshot: sales, profile, customers: customers.customers }) : undefined;
    if (!detail) {
      toast.error("Receipt details are not ready. Refresh recent sales and try again; no sale was changed.");
      void refresh();
      return;
    }
    openReceipt(receiptId);
    toast.info("Receipt ready. Select Print in the receipt window to choose your printer.");
  };

  if (!profile) return <section className="reports-gate"><div className="reports-gate-sheet"><div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div><span className="workspace-marker">SAL</span><p className="eyebrow"><span className="eyebrow-dot" />Sale record preparation</p><h1>Set the record before you record a sale.</h1><p>Your business identity and receipt currency keep saved sales, payments, stock changes, and receipts together.</p><div className="reports-prerequisite-list"><div><span>01</span><strong>Business name</strong><small>Identifies the ledger that owns this sale.</small></div><div><span>02</span><strong>Receipt currency</strong><small>Keeps totals and payment amounts consistent.</small></div><div><span>03</span><strong>Product record</strong><small>Items can be selected after business setup is complete.</small></div></div><p className="reports-gate-tally"><b>Two details to begin</b><span>Business name · Currency</span></p><Link href="/business" className="primary-action">Set up business</Link></div></section>;
  if (!loading && inventory.products.length === 0 && recoveryState === "empty" && !receipt) return <section className="inventory-gate sales-gate"><div className="inventory-gate-sheet"><div className="inventory-gate-head"><PackagePlus className="h-8 w-8 text-baobab" aria-hidden="true" /><span className="workspace-marker">SAL</span></div><p className="eyebrow"><span className="eyebrow-dot" />Sale record preparation</p><h1>Add stock before you open the receipt.</h1><p>A completed sale writes a receipt and reduces stock together. Add at least one active product to start that record safely.</p><div className="sales-gate-records" aria-label="Sales prerequisites"><div><span>01</span><strong>Business profile</strong><small>Ready for {profile.name}.</small></div><div><span>02</span><strong>Active product</strong><small>Still needed before a sale can begin.</small></div><div><span>03</span><strong>Sale receipt</strong><small>Will be created only when stock is available.</small></div></div><div className="inventory-gate-record"><span className="tally-status"><i /><i />One task to begin</span><span>Active product · Stock quantity</span></div><Link href="/inventory" className="primary-action">Add a product <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" /></Link></div></section>;

  return <div className="sales-page">{customerDisplayOpen ? <CustomerCartDisplay businessName={profile.name} currency={profile.currency} lines={cartLines.map(line => ({ name: line.product.name, quantity: line.quantity, unitPriceMinor: selectUnitPrice(line.product, line.quantity) }))} discountMinor={discountMinor + redemptionMinor} taxPolicy={profile.taxPolicy} onClose={() => setCustomerDisplayOpen(false)} /> : null}<section className="sales-hero"><p className="eyebrow"><span className="eyebrow-dot" />Point of sale</p><span className="workspace-marker">POS</span><h1>Make a sale.</h1><p>Choose products, review the payment, then save one complete local record.</p><div className="sales-hero-summary"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />{inventory.products.length} ready to sell</span><span className="inventory-quiet-token">{cartLines.length} in cart</span><button type="button" className="secondary-action min-h-11" onClick={() => setCustomerDisplayOpen(true)}>Customer view</button></div></section>
    <section className="sales-builder"><div className="sale-lines-sheet"><div className="sale-sheet-head"><div><p className="ledger-kicker">Products</p><h2>Find and add items.</h2></div><span className="tally-status"><i /><i />Current sale</span></div><div className="sale-product-search"><Input aria-label="Search active products" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search by name, SKU or barcode" /><small>{discoverableProducts.length} available</small></div><form className="sale-product-search" onSubmit={(event) => { event.preventDefault(); scanSku(); }}><Input aria-label="Scan or enter SKU or barcode" value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scan SKU or barcode, then Enter" /><button className="secondary-action min-h-11" type="submit">Add item</button><button className="secondary-action min-h-11" type="button" aria-expanded={cameraOpen} onClick={() => setCameraOpen((open) => !open)}>{cameraOpen ? "Hide camera" : "Scan with camera"}</button></form>{cameraOpen && <CameraBarcodeScanner onClose={() => setCameraOpen(false)} onScan={(code) => { setCameraOpen(false); addScannedCode(code); }} />}<div className="sale-add-line"><Select value={productToAdd} onValueChange={setProductToAdd}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{discoverableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {availableUnits(product)} available</SelectItem>)}</SelectContent></Select><Input aria-label="Quantity to add" inputMode="numeric" value={quantityToAdd} onChange={(event) => setQuantityToAdd(event.target.value)} /><button className="secondary-action" type="button" onClick={addProduct}><Plus className="h-4 w-4" aria-hidden="true" />Add</button></div>{cartLines.length ? <div className="sale-cart-list">{cartLines.map((line, index) => <div className="sale-cart-row" key={line.productId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{line.product.name}</strong><small>{formatMinorAmount(selectUnitPrice(line.product, line.quantity), profile.currency)} each · {availableUnits(line.product)} available</small></div><div className="sale-quantity"><button className="min-h-11 min-w-11" type="button" aria-label={`Reduce ${line.product.name} quantity`} onClick={() => line.quantity === 1 ? setCart((current) => current.filter((cartLine) => cartLine.productId !== line.productId)) : updateQuantity(line.productId, line.quantity - 1)}><Minus className="h-3.5 w-3.5" /></button><strong>{line.quantity}</strong><button className="min-h-11 min-w-11" type="button" aria-label={`Increase ${line.product.name} quantity`} onClick={() => updateQuantity(line.productId, line.quantity + 1)} disabled={line.quantity >= availableUnits(line.product)}><Plus className="h-3.5 w-3.5" /></button></div><strong>{formatMinorAmount(selectUnitPrice(line.product, line.quantity) * line.quantity, profile.currency)}</strong><button className="row-icon-action min-h-11 min-w-11" type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setCart((current) => current.filter((cartLine) => cartLine.productId !== line.productId))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div>)}</div> : <div className="sale-empty"><ShoppingBag className="h-7 w-7 text-baobab" aria-hidden="true" /><strong>Your cart is empty.</strong><span>Search and add products to start this sale. Nothing is saved yet.</span></div>}</div><aside className="sale-totals-sheet"><p className="ledger-kicker">Cart summary</p><div className="sale-total-row"><span>Subtotal</span><strong>{formatMinorAmount(subtotalMinor, profile.currency)}</strong></div><label className="sale-discount"><span>Discount ({profile.currency})</span><Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>{discountMinor > 0 && staffApprovers.length > 0 && <div className="space-y-2 rounded border p-2"><p className="text-xs">For cashier sessions, a supervisor must approve this exact discount.</p><label className="block text-xs">Approving supervisor<select aria-label="Approving supervisor" className="block w-full rounded border p-2 bg-background" value={approverId} onChange={e => setApproverId(e.target.value)}><option value="">No approval selected</option>{staffApprovers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="block text-xs">Supervisor PIN<input aria-label="Supervisor approval PIN" type="password" inputMode="numeric" className="block w-full rounded border p-2" value={approverPin} onChange={e => setApproverPin(e.target.value)} /></label></div>}{taxPreview ? <div className="sale-total-row"><span>{taxPreview.policy.label} ({taxPreview.policy.rateBasisPoints / 100}%, {taxPreview.policy.priceMode === "inclusive" ? "included" : "added"})</span><strong>{formatMinorAmount(taxPreview.taxMinor, profile.currency)}</strong></div> : <p>Tax off</p>}<div className="sale-total-row sale-total-due"><span>Total</span><strong>{formatMinorAmount(totalMinor, profile.currency)}</strong></div><div className="flex flex-wrap gap-2"><button className="quiet-action" type="button" disabled={!cart.length || submitting || parkedAvailable || recoveryState !== "empty"} onClick={parkCart}>Park cart</button><button className="quiet-action" type="button" disabled={!parkedAvailable || Boolean(cart.length) || submitting || recoveryState !== "empty"} onClick={resumeCart}>Resume parked cart</button><button className="quiet-action" type="button" disabled={!parkedAvailable || submitting || recoveryState !== "empty"} onClick={() => { if (!activeCompanyId || !window.confirm("Discard the saved parked cart for this business? This cannot be undone.")) return; try { clearParkedCart(activeCompanyId); setParkedAvailable(false); setResumedParkedLines(null); toast.success("Saved parked cart discarded."); } catch { toast.error("Could not discard the parked cart. It remains saved."); } }}>Discard parked</button><button className="quiet-action" type="button" disabled={submitting || recoveryState !== "empty"} onClick={() => { setCart([]); setResumedParkedLines(null); setDiscount("0"); setAmountPaid("0"); }}>Clear cart</button></div></aside></section>
    {(recoveryState === "damaged" || recoveryState === "unavailable") ? <section className="sale-checkout" role="alert" aria-label="Checkout recovery storage problem"><h2>Checkout is blocked for safety</h2><p>{recoveryState === "damaged" ? "Saved recovery information is damaged. Do not create another sale until previous sales are reconciled and the journal is repaired." : "This browser cannot access checkout recovery storage. Restore storage access before recording sales."}</p><p>Inspect recent sales and contact an administrator for recovery. Tallybook will not discard recovery evidence automatically.</p></section> : null}
    {pendingCheckout ? <section className="sale-checkout" role="alert" aria-label="Pending checkout recovery"><h2>Checkout needs verification</h2><p>A sale was started on this device and its outcome may be uncertain. Recover using the original details and submission key; do not start a different sale until it is resolved.</p><button className="primary-action" type="button" disabled={submitting} onClick={() => void recoverCheckout()}>{submitting ? "Checking saved records…" : "Check and recover receipt"}</button><p>Any successful sale is reused without reducing stock or collecting payment again.</p></section> : null}
    <section className="sale-checkout"><div className="sale-checkout-head"><div><p className="ledger-kicker">Checkout</p><h2>Review and take payment.</h2></div><span className="workspace-marker">PAY</span></div><div className="sale-checkout-grid">{storeMode ? <label><span>Selling store</span><select aria-label="Selling store" required value={saleStoreId} onChange={event=>{setSaleStoreId(event.target.value);setCart([]);}}><option value="">Choose store</option>{saleStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label> : null}<label><span>Customer</span><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk-in">Walk-in customer</SelectItem>{customers.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</SelectItem>)}</SelectContent></Select></label><label><span>Payment method</span><Select value={paymentMethod} onValueChange={(value) => choosePayment(value as PaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map((method) => <SelectItem key={method} value={method}>{paymentMethodLabel(method)}</SelectItem>)}</SelectContent></Select></label><label><span>Amount paid now ({profile.currency})</span><Input aria-describedby="payment-amount-help" inputMode="decimal" disabled={paymentPlan === "credit"} value={amountPaid} onChange={(event) => { setPaymentPlan("partial"); setAmountPaid(event.target.value); }} placeholder="0.00" /><small id="payment-amount-help">{paymentMethod === "wallet" ? `Prepaid wallet available: ${walletAvailableMinor === null ? "Select a customer" : formatMinorAmount(walletAvailableMinor, profile.currency)}. Wallet settlement is not new cash received.` : "Enter only what you received today for part payment."}</small></label></div>{paymentMethod === "mobile" ? <div className="mobile-money-checkout" aria-labelledby="mobile-money-checkout-title"><div><p className="ledger-kicker">Mobile Money details</p><h3 id="mobile-money-checkout-title">Choose the provider and record a reference if you have one.</h3></div>{mobileMoneyProviders.length ? <div className="mobile-money-checkout-grid"><label><span>Provider</span><Select value={mobileMoneyProviderId} onValueChange={setMobileMoneyProviderId}><SelectTrigger><SelectValue placeholder="Choose a provider" /></SelectTrigger><SelectContent>{mobileMoneyProviders.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent></Select></label><label><span>Transaction / reference <em>Optional</em></span><Input value={mobileMoneyReference} onChange={(event) => setMobileMoneyReference(event.target.value)} placeholder="For example, 123456" maxLength={120} /></label></div> : <div className="mobile-money-provider-inline-add"><CircleAlert className="h-5 w-5" aria-hidden="true" /><div><strong>No Mobile Money provider is set up yet.</strong><p>Add one below and this sale will remain exactly as it is.</p><form onSubmit={addProviderInCheckout} noValidate><Input aria-label="New Mobile Money provider name" value={newProviderName} onChange={(event) => setNewProviderName(event.target.value)} placeholder="For example, MTN MoMo" maxLength={80} disabled={addingProvider} /><button className="secondary-action" type="submit" disabled={addingProvider || newProviderName.trim().length < 2}><Plus className="h-4 w-4" aria-hidden="true" />{addingProvider ? "Adding…" : "Add provider"}</button></form><Link href="/business" className="link-action">Manage providers in Business</Link></div></div>}</div> : null}<div className="sale-payment-plan" aria-label="Payment plan"><p className="ledger-kicker">Payment option</p><div><button className={paymentPlan === "full" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("full")}><strong>Pay now</strong><span>{paymentMethod === "wallet" ? "Use saved prepaid balance (no new cash)" : `${formatMinorAmount(totalMinor, profile.currency)} received today`}</span></button><button className={paymentPlan === "partial" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("partial")}><strong>Part payment</strong><span>Customer pays some now and owes the rest</span></button><button className={paymentPlan === "credit" ? "is-selected" : ""} type="button" onClick={() => choosePaymentPlan("credit")}><strong>Pay later</strong><span>No payment now; named customer required</span></button></div></div><label className="block mt-3 mb-3">Redeem loyalty points (optional)
  <Input type="number" min="0" max={pointsAvailable} step="1" disabled={customerId === "walk-in" || pointValueMinor <= 0} value={redeemPoints}
    onChange={event => setRedeemPoints(event.target.value)} />
  <small>{pointsAvailable} points available. Each point reduces this sale by {formatMinorAmount(pointValueMinor, profile.currency)}. Loyalty is not a cash payment.</small>
</label><div className="sale-confirmation-grid" aria-label="Sale outcome before completion"><div><span>Sale total</span><strong>{formatMinorAmount(totalMinor, profile.currency)}</strong></div><div><span>{paymentMethod === "wallet" ? "New cash received" : "Paid now"}</span><strong>{formatMinorAmount(paymentPlan === "credit" || paymentMethod === "wallet" ? 0 : amountPaidPreviewMinor, profile.currency)}</strong></div><div><span>Remaining after tender</span><strong>{formatMinorAmount(outstandingPreview, profile.currency)}</strong></div><div><span>Payment</span><strong>{paymentPlan === "partial" ? `Part payment · ${paymentMethodLabel(paymentMethod)}` : paymentPlan === "credit" ? "Pay later · Credit" : paymentMethodLabel(paymentMethod)}</strong></div><div className="sale-confirmation-customer"><span>Customer</span><strong>{selectedCustomerName}</strong></div></div><div className="sale-payment-summary"><WalletCards className="h-5 w-5 text-baobab" aria-hidden="true" /><div><strong>{outstandingPreview > 0 ? `${formatMinorAmount(outstandingPreview, profile.currency)} remains to collect.` : "This sale is fully paid."}</strong><span>{outstandingPreview > 0 ? "Choose a named customer before saving this part-payment or pay-later sale." : "The receipt and settlement will be saved together."}</span></div></div><button className={`primary-action sale-complete-action${cart.length ? "" : " sale-complete-action-empty"}`} type="button" aria-busy={submitting} disabled={submitting || recoveryState !== "empty"} onClick={() => void complete()}><Save className="h-4 w-4" aria-hidden="true" />{submitting ? "Saving sale…" : "Complete sale"}</button></section>
    {receipt ? <section className="receipt-confirmation" aria-labelledby="receipt-title">
      <div><p className="ledger-kicker">Receipt saved</p><h2 id="receipt-title">{receipt.receiptNumber}</h2><p>{new Date(receipt.createdAt).toLocaleString()} · {receipt.customerId ? "Customer sale" : "Walk-in sale"}</p><p className="receipt-payment-detail">{paymentMethodLabel(receipt.paymentMethod)}{receiptPayment?.mobileMoneyProviderName ? ` · ${receiptPayment.mobileMoneyProviderName}${receiptPayment.mobileMoneyReference ? ` · Ref ${receiptPayment.mobileMoneyReference}` : ""}` : ""}</p></div>
      <div><span>Total</span><strong>{formatMinorAmount(receipt.totalMinor, profile.currency)}</strong><span>{receipt.outstandingMinor ? `${formatMinorAmount(receipt.outstandingMinor, profile.currency)} outstanding` : "Paid in full"}</span></div>
      <ReceiptText className="h-9 w-9 text-baobab" aria-hidden="true" />
      <div className="receipt-confirmation-actions">
        {receiptRecordId ? <><button type="button" className="secondary-action" onClick={() => openReceipt(receiptRecordId)}><Eye className="h-4 w-4" aria-hidden="true" />View receipt</button><button type="button" className="secondary-action" onClick={() => void shareSavedReceipt(receiptRecordId)}><Share2 className="h-4 w-4" aria-hidden="true" />Share receipt</button><button type="button" className="secondary-action" onClick={() => prepareReceiptPrint(receiptRecordId)}><Printer className="h-4 w-4" aria-hidden="true" />Open to print</button></> : null}
        <button type="button" className="primary-action" onClick={() => { setReceipt(null); setReceiptPayment(undefined); setReceiptRecordId(null); }}>Done</button>
      </div>
    </section> : null}
    <section className="recent-sales"><div className="recent-sales-head"><div><p className="ledger-kicker">Recent sales</p><h2>Every completed sale has a line.</h2></div><CircleDollarSign className="h-7 w-7 text-baobab" aria-hidden="true" /></div>{sales.sales.length ? <div>{sales.sales.slice(0, 6).map((sale) => { const payment = paymentBySaleId.get(sale.id); const receiptForSale = sales.receipts.find((item) => item.saleId === sale.id); return <div className="recent-sale-row" key={sale.id}><div><strong>{sale.receiptNumber}</strong><span>{new Date(sale.createdAt).toLocaleString()} · {sale.customerId ? "Customer" : "Walk-in"}</span></div><span className="recent-sale-payment"><strong>{paymentMethodLabel(sale.paymentMethod)}</strong>{payment?.mobileMoneyProviderName ? <small>{payment.mobileMoneyProviderName}{payment.mobileMoneyReference ? ` · Ref ${payment.mobileMoneyReference}` : ""}</small> : null}</span><strong>{formatMinorAmount(sale.totalMinor, profile.currency)}</strong>{sale.paymentMethod === "cash" && !sale.customerId && profile && currentCompanyReturnPolicy(profile.returnPolicyHistory).enabled && currentCompanyReturnPolicy(profile.returnPolicyHistory).allowCashPartial && sale.returnPolicyAtSale?.allowCashPartial ? <button type="button" className="row-receipt-action" onClick={() => setReturnReviewSaleId(sale.id)}>Review cash return (no posting)</button> : null}{receiptForSale ? <><button type="button" className="row-receipt-action" onClick={() => openReceipt(receiptForSale.id)}><Eye className="h-4 w-4" aria-hidden="true" />View receipt</button><button type="button" className="row-receipt-action" onClick={() => prepareReceiptPrint(receiptForSale.id)}><Printer className="h-4 w-4" aria-hidden="true" />Reprint</button></> : null}</div>; })}</div> : <p>No completed sales yet. Your receipts will appear here after a sale is completed.</p>}</section>
    <CashReturnReviewDialog saleId={returnReviewSaleId} onClose={() => setReturnReviewSaleId(null)} />
    <ReceiptDetailDialog detail={selectedReceiptDetail} open={Boolean(selectedReceiptId)} onOpenChange={(open) => { if (!open) { setSelectedReceiptId(null); setReceiptManualCopyText(null); } }} manualCopyText={receiptManualCopyText} />
  </div>;
}
