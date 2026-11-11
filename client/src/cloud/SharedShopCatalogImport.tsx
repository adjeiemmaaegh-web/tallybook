import { useMemo, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirmAction";
import { adjustShopStock, saveShopProductFull, ShopRejectedError, ShopUnreachableError, type ShopOverview } from "./shopClient";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, TEMPLATE_CSV, planCatalogImport, runCatalogImport, type ImportPlan, type ImportResult } from "./shopCatalogImport";

interface Props { companyId: string; overview: ShopOverview; refresh: () => Promise<void>; online: boolean; storeId: string }

/** Connection lost, access removed, or a shop that has not been upgraded: nothing more would succeed, so stop. */
const isStopError = (cause: unknown) =>
  cause instanceof ShopUnreachableError
  || (cause instanceof ShopRejectedError && /sign-in has expired|no longer have access|Unknown shop operations action/.test(cause.message));

export function SharedShopCatalogImport({ companyId, overview, refresh, online, storeId }: Props) {
  const currency = overview.currency!;
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const store = overview.stores.find(s => s.id === storeId && s.status === "active");
  const importing = progress !== null;

  // Re-planned when the catalogue changes, so "already in your catalogue" reflects what was just imported.
  const { plan, planError } = useMemo(() => {
    if (rawText === null) return { plan: null as ImportPlan | null, planError: "" };
    try { return { plan: planCatalogImport(rawText, currency, overview.products), planError: "" }; }
    catch (cause) { return { plan: null as ImportPlan | null, planError: cause instanceof Error ? cause.message : "This file could not be read." }; }
  }, [rawText, currency, overview.products]);

  const choose = async (file: File | undefined) => {
    setResult(null); setShowAll(false); setProblem(""); setRawText(null); setFileName("");
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { setProblem("This file is larger than 2 MB. Split it into smaller files."); return; }
    try { setRawText(await file.text()); setFileName(file.name); }
    catch { setProblem("This file could not be read. Check that it is a CSV file."); }
  };
  const reset = () => { setRawText(null); setFileName(""); setResult(null); setProblem(""); if (input.current) input.current.value = ""; };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "tallybook-products-template.csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const blockedByStore = Boolean(plan?.needsStore && !store);
  const start = async () => {
    if (!plan || !plan.rows.length || importing || blockedByStore) return;
    const stocked = plan.rows.filter(r => r.quantity > 0).length;
    const ok = await confirmAction(
      `Add ${plan.rows.length} product${plan.rows.length === 1 ? "" : "s"}${stocked ? ` and set opening stock for ${stocked} of them in ${store!.name}` : ""}? Products you already have are not changed.`,
      { confirmLabel: "Import" });
    if (!ok) return;
    setProgress({ done: 0, total: plan.rows.length });
    try {
      const outcome = await runCatalogImport(plan.rows, {
        saveProduct: product => saveShopProductFull(companyId, product),
        addStock: (productId, quantity, operationId) =>
          adjustShopStock(companyId, { storeId, productId, delta: quantity, operationId, note: "Opening stock (import)" }),
      }, (done, total) => setProgress({ done, total }), isStopError);
      setResult(outcome);
    } finally { setProgress(null); await refresh(); }
  };

  const skipped = plan?.skipped ?? [];
  const visibleSkipped = showAll ? skipped : skipped.slice(0, 8);
  return <details className="shop-import">
    <summary>Import products from a file</summary>
    <p className="shop-muted">Add many products at once from a spreadsheet saved as CSV. Products you already have (same name or barcode) are skipped, never changed. Up to {IMPORT_MAX_ROWS} per file.</p>
    <div className="shop-actions">
      <button type="button" className="secondary-action" onClick={downloadTemplate}>Download template</button>
      <input ref={input} type="file" accept=".csv,text/csv" aria-label="Choose a CSV file of products" disabled={!online || importing}
        onChange={e => void choose(e.target.files?.[0])} />
    </div>
    {!online && <p className="shop-muted" role="status">Connect to the internet to import products.</p>}
    {(problem || planError) && <p role="alert" className="shop-alert">{problem || planError}</p>}

    {plan && !result && <div className="shop-import-preview">
      <p role="status"><strong>{plan.rows.length}</strong> product{plan.rows.length === 1 ? "" : "s"} ready from {fileName}
        {skipped.length > 0 && <>, <strong>{skipped.length}</strong> skipped</>}.</p>
      {plan.needsStore && store && <p className="shop-muted">Opening stock will be added to <strong>{store.name}</strong>. Change the store in the list below first if that is wrong.</p>}
      {blockedByStore && <p role="alert" className="shop-alert">This file has opening stock, so a store must be selected. Add a store under Team, then try again.</p>}
      {skipped.length > 0 && <>
        <ul className="shop-import-skipped" aria-label="Skipped rows">{visibleSkipped.map(s => <li key={s.row}>Row {s.row} · {s.name}: {s.reason}</li>)}</ul>
        {skipped.length > visibleSkipped.length && <button type="button" className="shop-link" onClick={() => setShowAll(true)}>Show all {skipped.length} skipped rows</button>}
      </>}
      <div className="shop-actions">
        <button type="button" className="primary-action" disabled={!online || importing || !plan.rows.length || blockedByStore} onClick={() => void start()}>
          {importing ? "Importing…" : `Import ${plan.rows.length} product${plan.rows.length === 1 ? "" : "s"}`}</button>
        <button type="button" className="secondary-action" disabled={importing} onClick={reset}>Choose another file</button>
      </div>
    </div>}
    {progress && <p role="status" aria-live="polite">Importing {progress.done} of {progress.total}…</p>}

    {result && <div className="shop-import-result" role="status">
      <p><strong>{result.imported}</strong> product{result.imported === 1 ? "" : "s"} added{result.stocked ? `, opening stock set for ${result.stocked}` : ""}.
        {result.failed.length > 0 && <> <strong>{result.failed.length}</strong> had a problem.</>}</p>
      {result.stopped && <p role="alert" className="shop-alert">The import stopped before the end ({result.notAttempted} row{result.notAttempted === 1 ? "" : "s"} not tried). Reconnect and import the same file again: products already added are skipped.</p>}
      {result.failed.length > 0 && <ul aria-label="Rows with a problem">{result.failed.map(f => <li key={f.row}>Row {f.row} · {f.name}: {f.reason}</li>)}</ul>}
      <button type="button" className="secondary-action" onClick={reset}>Done</button>
    </div>}
  </details>;
}
