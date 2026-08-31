/** Adobea design reminder (Stage 1 restyle): Home opens straight into today's numbers and the four most-used actions — no explainer copy, no marketing hero. */
import { ArrowRight, ShoppingBag, UsersRound, PackageSearch, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useOnlineState } from "@/hooks/useOnlineState";
import { TodayDashboard } from "@/components/TodayDashboard";

export default function StageHome() {
  const { status, retry } = useDatabase();
  const { profile, activeCompanyId } = useBusinessProfile();
  const online = useOnlineState();
  const databaseReady = status === "ready";

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

      <TodayDashboard currency={profile.currency} activeCompanyId={activeCompanyId} />
    </div>
  );
}
