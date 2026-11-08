/** Tactile Ledger design reminder: every product is a ledger record and every stock change is an explicit, visible movement. */
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Boxes, Check, ChevronDown, Clock3, FolderPlus, History, Minus, PackagePlus, PencilLine, Plus, RotateCcw, Save, Tag, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArchivedProductsPanel } from "@/components/ArchivedProductsPanel";
import { ArchivedRecordsAccess } from "@/components/ArchivedRecordsAccess";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { businessDateTimeLabel } from "@/features/business/businessCalendar.mjs";
import { useDatabase } from "@/contexts/DatabaseContext";
import { exportProductCatalogCsv, importProductCatalogCsv, type StockCountPreview } from "@/features/inventory/advancedInventory";
import { saveStockCountSession, updateStockCountSession, postSavedStockCount, type StockCountSession } from "@/features/inventory/stage2Inventory";
import { db } from "@/db/TallybookDB";
import {ProductPromotionsPanel} from "@/features/inventory/ProductPromotionsPanel";
import {validateCategoryHierarchy} from "@/features/inventory/categoryHierarchy.mjs";
import type { StoreLocation } from "@/features/stores/storeDirectory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { MoveToSharedShopPanel } from "@/cloud/MoveToSharedShopPanel";
import { adjustStock, archiveProduct, categoryFormSchema, createCategory, createProduct, formatMinorAmount, getInventorySnapshot, isLowStock, productFormSchema, stockAdjustmentSchema, type CategoryFormValues, type InventoryMovement, type InventorySnapshot, type Product, type ProductFormValues, type StockAdjustmentValues, updateProduct } from "@/features/inventory/inventory";

const emptySnapshot: InventorySnapshot = { categories: [], products: [], archivedProducts: [], movements: [] };
const blankProduct: ProductFormValues = { name: "", sku: "", barcode: "", categoryId: "uncategorized", ghanaTaxTreatment: "unclassified", sellingPrice: "", costPrice: "", initialStock: "0", lowStockThreshold: "0" };
const blankCategory: CategoryFormValues = { name: "", parentCategoryId: "" };
const blankAdjustment: StockAdjustmentValues = { movementType: "increase", quantity: "", note: "" };

function quantityLabel(movement: InventoryMovement) {
  if (movement.movementType === "correction") return `Count set to ${movement.resultingQuantity}`;
  return `${movement.quantityDelta > 0 ? "+" : ""}${movement.quantityDelta} units`;
}

function movementVerb(type: InventoryMovement["movementType"]) {
  return ({ initial: "Opening stock", increase: "Stock added", decrease: "Stock removed", correction: "Stock counted", sale: "Sale completed", purchase: "Purchase received", reversal: "Sale reversed" })[type];
}

export default function InventoryPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const { status: databaseStatus } = useDatabase();
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [storeMode, setStoreMode] = useState(false);
  const [companyStores, setCompanyStores] = useState<StoreLocation[]>([]);
  const [newProductStoreId, setNewProductStoreId] = useState("");
  const [adjustStoreId, setAdjustStoreId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [stockCount, setStockCount] = useState<StockCountSession | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const csvUploadRef = useRef<HTMLInputElement | null>(null);
  const [postingCount, setPostingCount] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [pendingArchiveProduct, setPendingArchiveProduct] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [recentlyArchivedProduct, setRecentlyArchivedProduct] = useState<string | null>(null);
  const archivedRecordsRef = useRef<HTMLDivElement | null>(null);

  const productForm = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: blankProduct });
  const categoryForm = useForm<CategoryFormValues>({ resolver: zodResolver(categoryFormSchema), defaultValues: blankCategory });
  const adjustmentForm = useForm<StockAdjustmentValues>({ resolver: zodResolver(stockAdjustmentSchema), defaultValues: blankAdjustment });

  const refresh = useCallback(async () => {
    if (databaseStatus !== "ready") return;
    const requestedCompany = activeCompanyId;
    setLoading(true);
    try {
      const result = await getInventorySnapshot();
      if (requestedCompany === getActiveBusinessProfileId()) setSnapshot(result);
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not read your stock records."); }
    finally { setLoading(false); }
  }, [databaseStatus, activeCompanyId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setSnapshot(emptySnapshot);
    setStockCount(null);
    setPostingCount(false);
    setShowArchived(false);
    setRecentlyArchivedProduct(null);
    setProductDialogOpen(false);
    setCategoryDialogOpen(false);
    setAdjustDialogOpen(false);
    setArchiveDialogOpen(false);
    setEditingProduct(null);
    setAdjustingProduct(null);
    setPendingArchiveProduct(null);
  }, [activeCompanyId]);

  useEffect(() => {
    const syncInventory = () => { void refresh(); };
    const syncWhenVisible = () => { if (document.visibilityState === "visible") syncInventory(); };
    window.addEventListener("focus", syncInventory);
    window.addEventListener("pageshow", syncInventory);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("focus", syncInventory);
      window.removeEventListener("pageshow", syncInventory);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [refresh]);

  const categoryMap = useMemo(()=>{
    if(snapshot.categories.some(c=>c.businessProfileId!==activeCompanyId))return new Map<string,string>();
    return validateCategoryHierarchy(snapshot.categories,activeCompanyId).labels;
  }, [snapshot.categories,activeCompanyId]);
  const lowStockProducts = snapshot.products.filter(isLowStock);
  const visibleProducts = useMemo(() => snapshot.products.filter((product) => product.name.toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase()) || (product.sku ?? "").toLocaleLowerCase().includes(productQuery.trim().toLocaleLowerCase())), [productQuery, snapshot.products]);
  const currency = profile?.currency ?? "USD";

  const downloadCatalog = () => {
    const data = exportProductCatalogCsv(snapshot.products);
    const url = URL.createObjectURL(new Blob(["\uFEFF", data], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "tallybook-products.csv";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const beginStockCount = async () => {
    const requestedCompany = activeCompanyId;
    try {
      const session = await saveStockCountSession(snapshot.products.filter(p => p.itemKind !== "service").map(p => p.id));
      if (requestedCompany === getActiveBusinessProfileId() && session.businessProfileId === requestedCompany) setStockCount(session);
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to start stock count."); }
  };
  const commitStockCount = async () => {
    if (!stockCount || postingCount || stockCount.businessProfileId !== activeCompanyId || stockCount.businessProfileId !== getActiveBusinessProfileId()) return;
    setPostingCount(true);
    try { await updateStockCountSession(stockCount.id, Object.fromEntries(stockCount.lines.map(line => [line.productId, line.countedQuantity]))); const changes = await postSavedStockCount(stockCount.id); setStockCount(null); toast.success(`${changes.length} stock corrections recorded.`); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Stock count was not posted."); }
    finally { setPostingCount(false); }
  };

  const resumeStockCount = async () => {
    const requestedCompany = activeCompanyId;
    try {
      const sessions = await db.stockCountSessions.where("businessProfileId").equals(requestedCompany).toArray();
      if (requestedCompany !== getActiveBusinessProfileId()) return;
      const draft = sessions.filter(session => session.status === "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!draft) { toast.info("No saved draft stock count."); return; }
      if (draft.businessProfileId === requestedCompany && draft.companyId === requestedCompany) setStockCount(draft);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to resume stock count."); }
  };
  const importCsv = async (file: File | undefined) => {
    if (!file || importingCsv) return;
    if (file.size > 2_000_000) { toast.error("CSV exceeds the 2 MB import limit."); return; }
    setImportingCsv(true);
    try {
      const text = await file.text();
      const approved = window.confirm("Import products into this business? Existing stock records will not be replaced. Review the file before continuing.");
      if (!approved) return;
      const records = await importProductCatalogCsv(text);
      toast.success(`${records.length} products imported.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "CSV import failed. No products were imported."); }
    finally { setImportingCsv(false); if (csvUploadRef.current) csvUploadRef.current.value = ""; }
  };
  useEffect(()=>{let live=true;setStoreMode(false);setCompanyStores([]);setNewProductStoreId("");setAdjustStoreId("");
    if (!activeCompanyId)return;
    void Promise.all([db.storeStockModes.get(activeCompanyId),db.storeLocations.where("businessProfileId").equals(activeCompanyId).toArray()])
      .then(([mode,stores])=>{if(live){setStoreMode(Boolean(mode));setCompanyStores(stores.filter(s=>s.status==="active"));}})
      .catch(()=>{if(live)toast.error("Store stock scope unavailable; new stock postings may be blocked.");});
    return ()=>{live=false;};
  },[activeCompanyId]);
  const openNewProduct = () => {
    if (!profile) { toast.info("Set up your business before adding stock."); return; }
    setEditingProduct(null);
    productForm.reset(blankProduct);
    setProductDialogOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    productForm.reset({ name: product.name, sku: product.sku ?? "", barcode: product.barcode ?? "", categoryId: product.categoryId ?? "uncategorized", ghanaTaxTreatment: product.ghanaTaxTreatment ?? "unclassified", sellingPrice: String(product.sellingPriceMinor / (currency === "RWF" || currency === "TZS" || currency === "UGX" ? 1 : 100)), costPrice: product.costPriceMinor === undefined ? "" : String(product.costPriceMinor / (currency === "RWF" || currency === "TZS" || currency === "UGX" ? 1 : 100)), initialStock: String(product.stockQuantity), lowStockThreshold: String(product.lowStockThreshold) });
    setProductDialogOpen(true);
  };

  const submitProduct = productForm.handleSubmit(async (values) => {
    if (!profile) return;
    try {
      if (!editingProduct && storeMode && Number(values.initialStock)>0 && !newProductStoreId) throw new Error("Choose the store receiving the opening stock.");
       const product = editingProduct ? await updateProduct(editingProduct.id, values, profile.currency) : await createProduct({...values,...(storeMode&&Number(values.initialStock)>0?{storeId:newProductStoreId}:{})}, profile.currency);
      toast.success(editingProduct ? `${product.name} was updated.` : `${product.name} was added with an opening stock record.`);
      setProductDialogOpen(false);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not save this product."); }
  });

  const submitCategory = categoryForm.handleSubmit(async (values) => {
    try {
      const category = await createCategory(values);
      toast.success(`${category.name} is ready to use.`);
      categoryForm.reset(blankCategory);
      setCategoryDialogOpen(false);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not save this category."); }
  });

  const openAdjustment = (product: Product) => {
    setAdjustingProduct(product);
    adjustmentForm.reset({ ...blankAdjustment, movementType: "increase" });
    setAdjustDialogOpen(true);
  };

  const submitAdjustment = adjustmentForm.handleSubmit(async (values) => {
    if (!adjustingProduct) return;
    try {
      if(storeMode&&!adjustStoreId)throw new Error("Choose the store where the adjustment happened.");
       const movement = await adjustStock(adjustingProduct.id, {...values,...(storeMode?{storeId:adjustStoreId}:{})});
      toast.success(`${movementVerb(movement.movementType)}: ${quantityLabel(movement)}.`);
      setAdjustDialogOpen(false);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not adjust this stock record."); }
  });

  const requestArchive = (product: Product) => {
    setPendingArchiveProduct(product);
    setArchiveDialogOpen(true);
  };

  const confirmArchive = async () => {
    if (!pendingArchiveProduct) return;
    try {
      await archiveProduct(pendingArchiveProduct.id);
      setRecentlyArchivedProduct(pendingArchiveProduct.name);
      setShowArchived(true);
      setArchiveDialogOpen(false);
      toast.success(`${pendingArchiveProduct.name} was archived. Its stock history remains intact.`);
      await refresh();
      requestAnimationFrame(() => archivedRecordsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not archive this product."); }
  };

  const openArchivedRecords = async () => {
    await refresh();
    setShowArchived(true);
    requestAnimationFrame(() => archivedRecordsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  if (!profile) {
    return <section className="inventory-gate"><div className="inventory-gate-sheet"><div className="inventory-gate-head"><Boxes className="h-8 w-8 text-baobab" aria-hidden="true" /><span className="workspace-marker">STK</span></div><p className="eyebrow"><span className="eyebrow-dot" />Stock starts with a business</p><h1>Set up your business before you add stock.</h1><p>Your products, prices, and stock records need a business name and currency first. Nothing will be lost while you complete that short setup.</p><div className="inventory-gate-record"><span className="tally-status"><i /><i />Two details to begin</span><span>Business name · Currency</span></div><Link href="/business" className="primary-action">Set up your business <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" /></Link></div><div className="inventory-gate-note"><Clock3 className="h-4 w-4 text-clay" aria-hidden="true" /><p><strong>Your stock page is ready.</strong> Add your business details first, then your first product will start the stock record.</p></div></section>;
  }

  return <div className="inventory-page">
    <section className="inventory-hero">
      <div className="inventory-hero-markers" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow"><span className="eyebrow-dot" />Your stock record</p>
      <h1>Know what is <em>on the shelf.</em></h1>
      <p>Every product, count, and adjustment stays in one local record for {profile.name}.</p>
      <div className="inventory-hero-summary"><span className="stamp stamp-ready"><Check className="h-3.5 w-3.5" aria-hidden="true" />{snapshot.products.length} active {snapshot.products.length === 1 ? "product" : "products"}</span><span className={lowStockProducts.length ? "inventory-alert-token" : "inventory-quiet-token"}>{lowStockProducts.length ? `${lowStockProducts.length} low-stock ${lowStockProducts.length === 1 ? "item" : "items"}` : "No low-stock items"}</span></div>
    </section>

    <section className="inventory-actions" aria-label="Inventory actions"><button className="primary-action" type="button" onClick={openNewProduct}><PackagePlus className="h-4 w-4" aria-hidden="true" />Add product</button><Link href="/purchases" className="secondary-action"><Truck className="h-4 w-4" aria-hidden="true" />Purchases</Link><button className="secondary-action" type="button" onClick={() => { categoryForm.reset(blankCategory); setCategoryDialogOpen(true); }}><FolderPlus className="h-4 w-4" aria-hidden="true" />Add category</button><input ref={csvUploadRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose product CSV" onChange={e => void importCsv(e.target.files?.[0])} /><button type="button" className="secondary-action" disabled={importingCsv} onClick={() => csvUploadRef.current?.click()}>Import products CSV</button><button type="button" className="secondary-action" onClick={() => void resumeStockCount()}>Resume stock count</button><button type="button" className="secondary-action" onClick={downloadCatalog} disabled={!snapshot.products.length}>Export products CSV</button><button type="button" className="secondary-action" onClick={() => void beginStockCount()} disabled={!snapshot.products.length}>Count all stock</button><ArchivedRecordsAccess count={snapshot.archivedProducts.length} onOpen={() => void openArchivedRecords()} /><span className="inventory-actions-note"><History className="h-4 w-4" aria-hidden="true" />Each count change becomes a movement record.</span></section>
    {activeCompanyId && snapshot.products.length ? <MoveToSharedShopPanel database={db} profileId={activeCompanyId} /> : null}

    {lowStockProducts.length ? <section className="low-stock-strip"><TrendingDown className="h-5 w-5" aria-hidden="true" /><div><p className="ledger-kicker">Low stock attention</p><strong>{lowStockProducts.map((product) => product.name).join(", ")}</strong><span> needs a count check.</span></div></section> : null}

    {profile?.country==="Ghana"&&activeCompanyId&&snapshot.products.length>0&&<ProductPromotionsPanel companyId={activeCompanyId} country={profile.country} products={snapshot.products} onSaved={refresh} />}
    <section className="inventory-record" aria-labelledby="products-title">
      <div className="inventory-record-head"><div><p className="ledger-kicker">Active products</p><h2 id="products-title">Your shelf, clearly counted.</h2></div><span className="workspace-marker">STK</span></div>
      {recentlyArchivedProduct ? <p className="archive-success-line" role="status"><Archive className="h-4 w-4" aria-hidden="true" /><strong>{recentlyArchivedProduct}</strong> moved out of active stock and into archived records.</p> : null}
      {loading ? <p className="inventory-loading"><RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" />Opening your stock record…</p> : null}
      {!loading && snapshot.products.length === 0 ? <div className="inventory-empty"><Boxes className="h-7 w-7 text-baobab" aria-hidden="true" /><h3>No products yet.</h3><p>Add a product when you are ready. Its opening quantity will become the first item in its stock history.</p><button className="secondary-action" type="button" onClick={openNewProduct}><Plus className="h-4 w-4" aria-hidden="true" />Add first product</button></div> : null}
      {!loading && snapshot.products.length ? <><label className="inventory-product-search"><span>Find active stock</span><Input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search product or reference" aria-label="Search active stock" /></label>{visibleProducts.length ? <div className="product-ledger-list">{visibleProducts.map((product, index) => <article className="product-ledger-row" key={product.id}><span className="product-row-index">{String(index + 1).padStart(2, "0")}</span><div className="product-main"><div className="product-name-line"><h3>{product.name}</h3>{isLowStock(product) ? <span className="low-stock-stamp"><TrendingDown className="h-3 w-3" aria-hidden="true" />Low</span> : null}</div><p>{product.categoryId ? categoryMap.get(product.categoryId) ?? "Archived category" : "Uncategorized"}{product.sku ? ` · ${product.sku}` : ""}</p></div><div className="product-figure"><span>On shelf</span><strong>{product.stockQuantity}</strong><small>low at {product.lowStockThreshold}</small></div><div className="product-price"><span>Selling price</span><strong>{formatMinorAmount(product.sellingPriceMinor, currency)}</strong></div><div className="product-actions"><button type="button" className="row-action" onClick={() => openAdjustment(product)}><TrendingUp className="h-4 w-4" aria-hidden="true" />Adjust</button><button type="button" className="row-icon-action" aria-label={`Edit ${product.name}`} onClick={() => openEditProduct(product)}><PencilLine className="h-4 w-4" aria-hidden="true" /></button><button type="button" className="row-icon-action" aria-label={`Archive ${product.name}`} onClick={() => requestArchive(product)}><Archive className="h-4 w-4" aria-hidden="true" /></button></div></article>)}</div> : <p className="inventory-loading">No active product matches this search.</p>}</> : null}
      <div ref={archivedRecordsRef}><ArchivedProductsPanel products={snapshot.archivedProducts} showArchived={showArchived} onToggle={() => setShowArchived((value) => !value)} /></div>
    </section>

    <section className="inventory-history" aria-labelledby="history-title"><div className="inventory-history-head"><div><p className="ledger-kicker">Inventory history</p><h2 id="history-title">Every count leaves a line.</h2></div><span className="workspace-marker">MOV</span></div>{snapshot.movements.length ? <div className="movement-list">{snapshot.movements.slice(0, 8).map((movement) => { const product = [...snapshot.products, ...snapshot.archivedProducts].find((item) => item.id === movement.productId); return <div className="movement-row" key={movement.id}><span className={`movement-token movement-${movement.movementType}`}>{movement.movementType === "decrease" ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}</span><div><strong>{product?.name ?? "Archived product"}</strong><p>{movementVerb(movement.movementType)} · {quantityLabel(movement)}{movement.note ? ` · ${movement.note}` : ""}</p></div><time>{businessDateTimeLabel(movement.createdAt, profile?.country)}</time></div>; })}</div> : <p className="inventory-history-empty">Opening stock movements will appear here as products are added.</p>}</section>

    <Dialog open={Boolean(stockCount && stockCount.businessProfileId === activeCompanyId)} onOpenChange={(open) => { if (!open && !postingCount) setStockCount(null); }}><DialogContent className="inventory-dialog max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>Physical stock count</DialogTitle><DialogDescription>Review quantities before posting. If any stock changes after this count begins, posting is rejected so no sale is overwritten.</DialogDescription></DialogHeader><div className="space-y-3">{stockCount?.lines.map((line, index) => { const product = snapshot.products.find(p => p.id === line.productId); return <label key={line.productId} className="flex items-center justify-between gap-3"><span>{product?.name ?? "Product"} (expected {line.expectedQuantity})</span><Input aria-label={`Counted quantity for ${product?.name ?? line.productId}`} className="w-28" inputMode="numeric" type="number" min={0} step={1} value={line.countedQuantity} onChange={(event) => setStockCount(prev => prev?.businessProfileId === activeCompanyId ? { ...prev, lines: prev.lines.map((item, i) => i === index ? { ...item, countedQuantity: Number(event.target.value) } : item) } : prev)} /></label>; })}</div><div className="inventory-form-footer"><button type="button" className="secondary-action" disabled={postingCount} onClick={() => setStockCount(null)}>Cancel</button><button type="button" className="primary-action" disabled={postingCount || stockCount?.businessProfileId !== activeCompanyId} onClick={() => void commitStockCount()}>Post reviewed count</button></div></DialogContent></Dialog>

    <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}><DialogContent className="inventory-dialog max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editingProduct ? `Edit ${editingProduct.name}` : "Add a product"}</DialogTitle><DialogDescription>{editingProduct ? "Update the product details. Use Adjust stock to preserve count history." : "The opening quantity will create the first movement in this product’s stock history."}</DialogDescription></DialogHeader><Form {...productForm}><form className="inventory-form" onSubmit={submitProduct} noValidate>{storeMode&&!editingProduct?<label>Opening stock store<select className="block w-full rounded border p-3" value={newProductStoreId} onChange={e=>setNewProductStoreId(e.target.value)}><option value="">Choose store for positive opening quantity</option>{companyStores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:null}<FormField control={productForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Product name</FormLabel><FormControl><Input placeholder="For example, Laundry soap" {...field} /></FormControl><FormMessage /></FormItem>} /><div className="inventory-form-two"><FormField control={productForm.control} name="categoryId" render={({ field }) => <FormItem><FormLabel>Category</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="uncategorized">Uncategorized</SelectItem>{snapshot.categories.map((category) => <SelectItem key={category.id} value={category.id}>{categoryMap.get(category.id)??category.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} /><FormField control={productForm.control} name="sku" render={({ field }) => <FormItem><FormLabel>Reference <em>Optional</em></FormLabel><FormControl><Input placeholder="For example, SOAP-1" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={productForm.control} name="barcode" render={({ field }) => <FormItem><FormLabel>Barcode <em>Optional</em></FormLabel><FormControl><Input placeholder="Scan or type barcode" {...field} /></FormControl><FormMessage /></FormItem>} /></div>{profile?.country === "Ghana" && <FormField control={productForm.control} name="ghanaTaxTreatment" render={({ field }) => <FormItem><FormLabel>Ghana tax treatment</FormLabel><Select value={field.value ?? "unclassified"} onValueChange={field.onChange}><FormControl><SelectTrigger aria-label="Ghana tax treatment"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="unclassified">Not classified — blocked if Ghana VAT is enabled</SelectItem><SelectItem value="standard">Standard rated (VAT / NHIL / GETFund)</SelectItem><SelectItem value="zero-rated">Zero rated (0% levies)</SelectItem><SelectItem value="exempt">Exempt (0% levies)</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />}<div className="inventory-form-two"><FormField control={productForm.control} name="sellingPrice" render={({ field }) => <FormItem><FormLabel>Selling price ({currency})</FormLabel><FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={productForm.control} name="costPrice" render={({ field }) => <FormItem><FormLabel>Cost price <em>Optional</em></FormLabel><FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>} /></div><div className="inventory-form-two"><FormField control={productForm.control} name="initialStock" render={({ field }) => <FormItem><FormLabel>{editingProduct ? "Current stock" : "Opening stock"}</FormLabel><FormControl><Input inputMode="numeric" disabled={Boolean(editingProduct)} {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={productForm.control} name="lowStockThreshold" render={({ field }) => <FormItem><FormLabel>Low-stock level</FormLabel><FormControl><Input inputMode="numeric" {...field} /></FormControl><FormMessage /></FormItem>} /></div><div className="inventory-form-footer"><span><Tag className="h-4 w-4 text-baobab" aria-hidden="true" />Stock changes are recorded separately.</span><button className="primary-action" type="submit" disabled={productForm.formState.isSubmitting}><Save className="h-4 w-4" aria-hidden="true" />{editingProduct ? "Save product" : "Add product"}</button></div></form></Form></DialogContent></Dialog>

    <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}><DialogContent className="inventory-dialog"><DialogHeader><DialogTitle>Add a category</DialogTitle><DialogDescription>Categories make your shelf easier to scan. They do not change stock quantities.</DialogDescription></DialogHeader><Form {...categoryForm}><form className="inventory-form" onSubmit={submitCategory} noValidate><FormField control={categoryForm.control} name="name" render={({ field }) => <FormItem><FormLabel>Category name</FormLabel><FormControl><Input placeholder="For example, Household goods" {...field} /></FormControl><FormMessage /></FormItem>} />
      <FormField control={categoryForm.control} name="parentCategoryId" render={({field})=><FormItem><FormLabel>Parent category (optional)</FormLabel><select className="w-full border rounded p-3 bg-background" aria-label="Category parent" value={field.value??""} onChange={field.onChange}><option value="">Top-level category</option>{snapshot.categories.map(category=><option value={category.id} key={category.id} disabled={categoryMap.get(category.id)?.split(" / ").length===3}>{categoryMap.get(category.id)??category.name}</option>)}</select><FormMessage/></FormItem>}/>
      <div className="inventory-form-footer"><span><Tag className="h-4 w-4 text-baobab" aria-hidden="true" />Categories stay local to this business.</span><button className="primary-action" type="submit" disabled={categoryForm.formState.isSubmitting}><FolderPlus className="h-4 w-4" aria-hidden="true" />Save category</button></div></form></Form></DialogContent></Dialog>

    <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}><DialogContent className="inventory-dialog"><DialogHeader><DialogTitle>{adjustingProduct ? `Adjust ${adjustingProduct.name}` : "Adjust stock"}</DialogTitle><DialogDescription>{adjustingProduct ? `${adjustingProduct.stockQuantity} units are currently on the shelf. This creates a permanent movement entry.` : ""}</DialogDescription></DialogHeader><Form {...adjustmentForm}><form className="inventory-form" onSubmit={submitAdjustment} noValidate>{storeMode?<label>Stock adjustment store<select className="block w-full rounded border p-3" required value={adjustStoreId} onChange={e=>setAdjustStoreId(e.target.value)}><option value="">Choose store</option>{companyStores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:null}<FormField control={adjustmentForm.control} name="movementType" render={({ field }) => <FormItem><FormLabel>What happened?</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="increase">Added stock</SelectItem><SelectItem value="decrease">Removed stock</SelectItem>{!storeMode?<SelectItem value="correction">Counted the shelf</SelectItem>:null}</SelectContent></Select><FormMessage /></FormItem>} /><FormField control={adjustmentForm.control} name="quantity" render={({ field }) => <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input inputMode="numeric" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={adjustmentForm.control} name="note" render={({ field }) => <FormItem><FormLabel>Reason <em>Optional</em></FormLabel><FormControl><Textarea placeholder="For example, new delivery or damaged item" {...field} /></FormControl><FormMessage /></FormItem>} /><div className="inventory-form-footer"><span><History className="h-4 w-4 text-baobab" aria-hidden="true" />The old and new counts will both be kept.</span><button className="primary-action" type="submit" disabled={adjustmentForm.formState.isSubmitting}><Save className="h-4 w-4" aria-hidden="true" />Save adjustment</button></div></form></Form></DialogContent></Dialog>

    <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}><DialogContent className="inventory-dialog archive-confirmation-dialog"><DialogHeader><DialogTitle>Archive {pendingArchiveProduct?.name}?</DialogTitle><DialogDescription>This removes the product from active stock. Its quantity and every inventory movement stay in your local record and can be viewed under Archived records.</DialogDescription></DialogHeader><div className="inventory-form-footer"><span><Archive className="h-4 w-4 text-baobab" aria-hidden="true" />You can no longer adjust an archived product.</span><div className="archive-confirmation-actions"><button className="secondary-action" type="button" onClick={() => setArchiveDialogOpen(false)}>Keep active</button><button className="primary-action" type="button" onClick={() => void confirmArchive()}>Archive product</button></div></div></DialogContent></Dialog>
  </div>;
}
