/** Adobea design reminder (Stage 1 restyle): Home opens straight into today's numbers and the four most-used actions — no explainer copy, no marketing hero. */
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { db } from "@/db/TallybookDB";
import type { SetupCounts } from "@/features/business/setupProgress";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useOnlineState } from "@/hooks/useOnlineState";
import { PremiumHomeOverview } from "@/components/PremiumHomeOverview";

export default function StageHome() {
  const { status, retry } = useDatabase();
  const { profile, activeCompanyId } = useBusinessProfile();
  const online = useOnlineState();
  const databaseReady = status === "ready";
  const [counts, setCounts] = useState<SetupCounts | null>(null);
  const [setupError, setSetupError] = useState(false);
  const websiteUpdate = <section className="op-row-card" style={{ display: "block", marginBottom: 18 }} aria-label="Tallybook website update">
    <div className="op-row-title">Tallybook V19 website update</div>
    <p className="op-row-sub" style={{ margin: "4px 0 10px" }}>Create an account with email or Google, then try the business, staff, sales and backup tools. Business records remain on this device; cloud sync is still being tested.</p>
    <Link href="/signin" className="secondary-action">Create account or sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
  </section>;
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
        {websiteUpdate}
        <section className="op-row-card" style={{ display: "block" }}>
          <div className="op-row-title">Set up your business to get started</div>
          <p className="op-row-sub" style={{ margin: "4px 0 10px" }}>Add your business name and the money you use. It takes under a minute.</p>
          <Link href="/business" className="primary-action">Set up business <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>
      </div>
    );
  }

  return <>{websiteUpdate}{setupError && <p role="status">Setup progress is temporarily unavailable. Saved records were not changed.</p>}<PremiumHomeOverview companyId={activeCompanyId} companyName={profile.name} country={profile.country} currency={profile.currency} online={online} counts={counts} /></>;
}
