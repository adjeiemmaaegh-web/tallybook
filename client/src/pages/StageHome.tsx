/** Adobea design reminder (Stage 1 restyle): Home opens straight into today's numbers and the four most-used actions — no explainer copy, no marketing hero. */
import { ArrowRight, ShoppingBag, UsersRound, PackageSearch, BarChart3, CheckCircle2, Truck, ArrowUpRight, Sparkles } from "lucide-react";
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

  const steps = counts ? buildSetupSteps(counts).filter(step => step.id !== "backup" || counts.sales > 0) : [];
  const completed = steps.filter(step => step.done).length;
  const beginner = counts !== null && (counts.products === 0 || counts.sales === 0);
  return (
    <div className="home-workspace space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Business overview</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Welcome to Tallybook 👋</h1>
          <p className="mt-2 text-sm text-muted-foreground">{beginner ? "Your business workspace is ready. Start with a few simple steps." : "Here is what is happening in your business today."}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
          <strong className="block">{profile.name}</strong>
          <span className="text-xs text-muted-foreground"><span>{profile.country} · {profile.currency}</span><span> · {online ? "Saved locally" : "Offline — saved locally"}</span></span>
        </div>
      </header>

      <section aria-labelledby="home-actions-title" className="rounded-2xl border bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="home-actions-title" className="text-lg font-bold">Quick actions</h2>
          <span className="text-xs text-muted-foreground">Choose what to do next</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            { href: "/sales", label: "Make a sale", detail: "Open checkout", Icon: ShoppingBag },
            { href: "/inventory", label: "Add products", detail: "Manage stock", Icon: PackageSearch },
            { href: "/customers", label: "Customers", detail: "Manage accounts", Icon: UsersRound },
            { href: "/purchases", label: "Purchases", detail: "Record stock received", Icon: Truck },
            { href: "/reports", label: "View reports", detail: "See your results", Icon: BarChart3 },
          ].map(({ href, label, detail, Icon }) => (
            <Link key={href} href={href} className="group flex min-h-28 flex-col justify-between rounded-xl border bg-background p-4 no-underline transition-colors hover:border-blue-400 hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <span className="flex items-center justify-between"><Icon className="h-6 w-6 text-blue-600" aria-hidden="true" /><ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></span>
              <span><strong className="block text-sm text-foreground">{label}</strong><small className="text-xs text-muted-foreground">{detail}</small></span>
            </Link>
          ))}
        </div>
      </section>

      {beginner && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="setup-checklist-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue-700"><Sparkles className="h-4 w-4" aria-hidden="true" /> GETTING STARTED</p><h2 id="setup-checklist-title" className="text-lg font-bold">Set up your business step by step</h2><p className="mt-1 text-sm text-muted-foreground">Follow these steps at your own pace. Customer details are optional for cash sales.</p></div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{completed} of {steps.length} completed</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Business setup progress"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: steps.length ? `${completed / steps.length * 100}%` : "0%" }} /></div>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {steps.map((step, index) => <li key={step.id}><Link href={step.href} className="flex h-full min-h-20 items-center gap-3 rounded-xl border p-4 no-underline hover:bg-accent"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{step.done ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : index + 1}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-foreground">{step.title}</strong><span className="text-xs text-muted-foreground">{step.done ? "Completed" : "Open this step"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></Link></li>)}
          </ol>
        </section>
      )}
      {setupError && <p role="status" className="text-sm text-muted-foreground">Setup progress is unavailable. Your records have not been changed.</p>}
      <section aria-label="Today's business performance" className="rounded-2xl border bg-card p-4 shadow-sm md:p-6">
        <TodayDashboard currency={profile.currency} activeCompanyId={activeCompanyId} />
      </section>
    </div>
  );
}
