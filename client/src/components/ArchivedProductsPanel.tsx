/** Tactile Ledger design reminder: archived records remain visible on request, while their original movement lines stay in the ledger history. */
import { ArchiveRestore, Eye, EyeOff } from "lucide-react";
import type { Product } from "@/features/inventory/inventory";

interface ArchivedProductsPanelProps {
  products: Product[];
  showArchived: boolean;
  onToggle: () => void;
}

export function ArchivedProductsPanel({ products, showArchived, onToggle }: ArchivedProductsPanelProps) {
  if (products.length === 0) {
    return <section className="archived-products-panel archived-products-panel-empty" id="archived-records" tabIndex={-1} aria-labelledby="archived-products-title"><div className="archived-products-panel-head"><div><p className="ledger-kicker">Archived records</p><h3 id="archived-products-title">No archived products</h3></div><span className="stamp stamp-neutral">0 records</span></div><p className="archived-products-hidden">When you archive a product, it will leave active stock and appear here with its movement history intact.</p></section>;
  }

  return (
    <section className="archived-products-panel" id="archived-records" tabIndex={-1} aria-labelledby="archived-products-title">
      <div className="archived-products-panel-head">
        <div>
          <p className="ledger-kicker">Archived records</p>
          <h3 id="archived-products-title">{products.length} archived {products.length === 1 ? "product" : "products"}</h3>
        </div>
        <button className="history-toggle" type="button" aria-expanded={showArchived} aria-controls="archived-products-list" onClick={onToggle}>
          {showArchived ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          {showArchived ? "Hide archived products" : `Show archived products (${products.length})`}
        </button>
      </div>
      {showArchived ? (
        <div className="archived-products-list" id="archived-products-list">
          {products.map((product) => (
            <div className="archived-product-row" key={product.id}>
              <ArchiveRestore className="h-4 w-4 text-clay" aria-hidden="true" />
              <div><strong>{product.name}</strong><p>Archived from active stock · {product.stockQuantity} units recorded</p></div>
              <span className="stamp stamp-neutral">Archived</span>
            </div>
          ))}
        </div>
      ) : <p className="archived-products-hidden">Archived products are hidden from this view. Their inventory movements remain in the history below.</p>}
    </section>
  );
}
