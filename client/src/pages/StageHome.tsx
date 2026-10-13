/** Adobea design reminder (Stage 1 restyle): Home opens straight into today's numbers and the four most-used actions — no explainer copy, no marketing hero. */
import { ArrowRight, ShoppingBag, UsersRound, PackageSearch, BarChart3, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { db } from "@/db/TallybookDB";
import { buildSetupSteps, type SetupCounts } from "@/features/business/setupProgress";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useOnlineState } from "@/hooks/useOnlineState";
import { TodayDashboard } from "@/components/TodayDashboard";

export default function StageHome() {
  const { status, retry } = useDatabase();
  const { profile, activeCompanyId } = useBusinessProfile();
  const online = useOnlineState();
  const databaseReady = status === "ready";
  const [counts, setCounts] = useState<SetupCounts | null>(null);
  const [setupError, setSetupError] = useState(false);
  useEffect(() => {
    let mounted = true;
    setCounts(null);
    setSetupError(false);
    if (!databaseReady || !activeCompanyId) return () => { mounted = false; };
    const load = async () => {
      try {
        const result = await db.transaction("r", db.products, db.customers, db.sales, async () => ({
          products: await db.products.where("businessProfileId").equals(activeCompanyId).filter(product => !product.archivedAt).count(),
          customers: await db.customers.where("businessProfileId").equals(activeCompanyId).filter(customer => !customer.archivedAt).count(),
          sales: await db.sales.where("businessProfileId").equals(activeCompanyId).count(),
        }));
        if (mounted) { setCounts(result); setSetupError(false); }
      } catch { if (mounted) { setCounts(null); setSetupError(true); } }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { mounted = false; window.removeEventListener("focus", load); };
  }, [activeCompanyId, databaseReady]);

  if (status === "error") {
    return (
      <div className="home-workspace space-y-5 pb-6">
        <section className="op-row-card" style={{ display: "block" }} role="alert">
          <div className="op-row-title">Your saved records need attention.</div>
          <p className="op-row-sub" style={{ margin: "4px 0 10px" }}>Try again. Nothing on this device has been changed or removed.</p>
          <button className="secondary-action" onClick={() => void retry()} type="button">Try again</button>
        </section>
      </div>
    );
  }

  if (!databaseReady) {
    return (
      <div className="home-workspace space-y-5 pb-6">
        <p className="op-empty">Getting your records ready…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="home-workspace space-y-5 pb-6">
        <section className="op-row-card" style={{ display: "block" }}>
          <div className="op-row-title">Set up your business to get started</div>
          <p className="op-row-sub" style={{ margin: "4px 0 10px" }}>Add your business name and the money you use. It takes under a minute.</p>
          <Link href="/business" className="primary-action">Set up business <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>
      </div>
    );
  }

  return (
    <div className="home-workspace space-y-5 pb-6">
      <section>
        <div className="op-section-title">
          <span>Hello, <strong>{profile.name}</strong></span>
        </div>
        <p className="op-row-sub" style={{ marginBottom: 10 }}>
          <span>{profile.country} · {profile.currency}</span>
          {" — "}
          {online ? "Saved on this device" : "Working offline, saved on this device"}
        </p>

        <div className="op-quick-actions">
          <Link href="/sales" className="op-qa-btn">
            <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
            New Sale
          </Link>
          <Link href="/customers?view=owing" className="op-qa-btn op-alt">
            <UsersRound className="h-[18px] w-[18px]" aria-hidden="true" />
            View Debts
          </Link>
          <Link href="/inventory" className="op-qa-btn op-alt">
            <PackageSearch className="h-[18px] w-[18px]" aria-hidden="true" />
            Stock
          </Link>
          <Link href="/reports" className="op-qa-btn op-alt">
            <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
            Reports
          </Link>
        </div>
      </section>

      {counts && (counts.products === 0 || counts.sales === 0) ? (
        <section className="op-row-card" aria-labelledby="setup-checklist-title" style={{ display: "block" }}>
          <h2 id="setup-checklist-title" className="op-row-title">Get your shop ready</h2>
          <p className="op-row-sub">Your records stay on this device. Start with products, then record a sale. Customer details are optional for cash sales.</p>
          <ul className="space-y-2 mt-3">
            {buildSetupSteps(counts).filter(step => step.id !== "backup" || counts.sales > 0).map(step => (
              <li key={step.id}>
                <Link href={step.href} className="flex items-center gap-3 rounded-lg border p-3 min-h-11">
                  {step.done ? <CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
                  <span>{step.title}{step.done ? " — done" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {setupError ? <p role="status" className="op-row-sub">Setup progress is unavailable. Your saved records have not been changed.</p> : null}
      <TodayDashboard currency={profile.currency} activeCompanyId={activeCompanyId} />
    </div>
  );
}
