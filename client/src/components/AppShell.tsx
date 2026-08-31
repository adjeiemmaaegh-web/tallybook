/** Tactile Ledger design reminder: a running ledger strip shows the saved business identity wherever owners work, with generous thumb targets. */
import { useMemo, type ReactNode } from "react";
import { CloudOff, HardDriveDownload, Store } from "lucide-react";
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
  const { profile } = useBusinessProfile();
  const [location] = useLocation();
  const pageName = useMemo(() => appRoutes.find((route) => route.href === location)?.label ?? "Tallybook", [location]);
  const primaryRoutes = appRoutes.filter((route) => route.primary);
  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to page content</a><span className="screen-reader-announcer" aria-live="polite" aria-atomic="true">{pageName} page</span>
    <aside className="desktop-rail" aria-label="Primary navigation"><div className="px-5 pt-6"><BrandMark /><CompanySwitcher />{profile ? <p className="business-shell-name" title={profile.name}>{profile.name}</p> : <p className="business-shell-name business-shell-name-empty">Set up your business</p>}</div><nav className="mt-10 flex flex-1 flex-col gap-1 px-3">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav><div className="shell-utilities"><Link href="/business"><Store className="h-4 w-4" aria-hidden="true" />Business</Link><Link href="/backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" />Backup</Link></div><div className="mx-5 mb-6 border-t border-ink/10 pt-5"><div className="flex items-start gap-3 text-ink-soft"><CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-baobab" aria-hidden="true" /><p className="text-xs leading-relaxed">Your records stay on this device. Use Backup to keep a copy you control.</p></div></div></aside>
    <div className="content-frame"><header className="top-bar" aria-label="Application status"><div className="mobile-brand-lockup"><BrandMark compact /></div><CompanySwitcher compact /><div className="shell-top-utilities"><Link href="/business" aria-label="Business settings"><Store className="h-4 w-4" aria-hidden="true" /></Link><Link href="/backup" aria-label="Backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" /></Link><DatabaseStatus /></div></header><main id="main-content" className="page-content" tabIndex={-1}>{children}</main></div>
    <nav className="mobile-nav" aria-label="Primary navigation">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav>
  </div>;
}
