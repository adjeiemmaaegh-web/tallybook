/** Tactile Ledger design reminder: a running ledger strip shows the saved business identity wherever owners work, with generous thumb targets. */
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { db } from "@/db/TallybookDB";
import { currentStaffId, STAFF_SESSION_CHANGED } from "@/features/staff/staff";
import { Bell, Users, Cloud, CloudOff, HardDriveDownload, MessageCircleQuestion, Store } from "lucide-react";
import { Link, useLocation } from "wouter";
import { BrandMark } from "@/components/BrandMark";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { appRoutes } from "@/lib/routes";

interface AppShellProps { children: ReactNode; }

function NavigationLink({ route }: { route: (typeof appRoutes)[number] }) {
  const { href, label, shortLabel, icon: Icon } = route;
  const [location] = useLocation();
  const isActive = location === href;
  return <Link href={href} aria-current={isActive ? "page" : undefined} className={`nav-link ${isActive ? "nav-link-active" : ""}`}><Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.8} aria-hidden="true" /><span className="hidden text-sm font-semibold md:inline">{label}</span><span className="text-[0.62rem] font-semibold sm:hidden">{shortLabel}</span></Link>;
}

export function AppShell({ children }: AppShellProps) {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [staffGate, setStaffGate] = useState<"loading" | "locked" | "open">("loading");
  useEffect(() => {
    let mounted = true;
    const refresh = (silent = false) => {
      if (mounted && !silent) setStaffGate("loading");
      void db.staffMembers.where("businessProfileId").equals(activeCompanyId).toArray().then(members => {
        const current=currentStaffId(activeCompanyId);
        if (mounted) setStaffGate(members.length === 0 || members.some(member => member.id === current && !member.disabledAt) ? "open" : "locked");
      }).catch(() => { if (mounted) setStaffGate("locked"); });
    };
    refresh();
    const onSession = () => refresh(true);
    const onFocus = () => refresh(true);
    const timer = window.setInterval(onFocus,15_000);
    window.addEventListener(STAFF_SESSION_CHANGED,onSession);
    window.addEventListener('focus',onFocus);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener(STAFF_SESSION_CHANGED,onSession); window.removeEventListener('focus',onFocus); };
  }, [activeCompanyId]);
  const [location] = useLocation();
  const pageName = useMemo(() => appRoutes.find((route) => route.href === location)?.label ?? "Tallybook", [location]);
  const primaryRoutes = appRoutes.filter((route) => route.primary);
  if (staffGate !== "open" && location !== "/staff") return <main className="mx-auto mt-12 max-w-md rounded-xl border p-6 space-y-4">
    <h1 className="text-xl font-semibold">{staffGate === "locked" ? "Tallybook is locked" : "Checking local staff access"}</h1>
    <p className="text-sm text-muted-foreground">{staffGate === "locked" ? "Unlock with your local staff PIN to access this business." : "Checking the staff records stored on this device."}</p>
    <Link href="/staff" className="inline-block rounded border p-3">Go to staff unlock</Link>
  </main>;
  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to page content</a><span className="screen-reader-announcer" aria-live="polite" aria-atomic="true">{pageName} page</span>
    <aside className="desktop-rail" aria-label="Primary navigation"><div className="px-5 pt-6"><BrandMark /><CompanySwitcher />{profile ? <p className="business-shell-name" title={profile.name}>{profile.name}</p> : <p className="business-shell-name business-shell-name-empty">Set up your business</p>}</div><nav className="mt-10 flex flex-1 flex-col gap-1 px-3">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav><div className="shell-utilities"><Link href="/business"><Store className="h-4 w-4" aria-hidden="true" />Business</Link><Link href="/assistant"><MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />Assistant</Link><Link href="/alerts"><Bell className="h-4 w-4" aria-hidden="true" />Alerts</Link><Link href="/stores"><Store className="h-4 w-4" aria-hidden="true" />Stores</Link><Link href="/commerce"><Store className="h-4 w-4" aria-hidden="true" />Commerce drafts</Link><Link href="/staff"><Users className="h-4 w-4" aria-hidden="true" />Staff</Link><Link href="/sync-status"><Cloud className="h-4 w-4" aria-hidden="true" />Sync status</Link><Link href="/backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" />Backup</Link></div><div className="mx-5 mb-6 border-t border-ink/10 pt-5"><div className="flex items-start gap-3 text-ink-soft"><CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-baobab" aria-hidden="true" /><p className="text-xs leading-relaxed">Your records stay on this device. Use Backup to keep a copy you control.</p></div></div></aside>
    <div className="content-frame"><header className="top-bar" aria-label="Application status"><div className="mobile-brand-lockup"><BrandMark compact /></div><CompanySwitcher compact /><div className="shell-top-utilities"><Link href="/account" aria-label="Account and sign out"><Users className="h-4 w-4" aria-hidden="true" /></Link><Link href="/business" aria-label="Business settings"><Store className="h-4 w-4" aria-hidden="true" /></Link><Link href="/assistant" aria-label="Assistant"><MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /></Link><Link href="/backup" aria-label="Backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" /></Link><DatabaseStatus /></div></header><main id="main-content" className="page-content" tabIndex={-1}>{children}</main></div>
    <nav className="mobile-nav" aria-label="Primary navigation">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav>
  </div>;
}
