/** Tactile Ledger design reminder: a running ledger strip shows the saved business identity wherever owners work, with generous thumb targets. */
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { db } from "@/db/TallybookDB";
import { currentStaffId, STAFF_SESSION_CHANGED } from "@/features/staff/staff";
import { Bell, Search, Users, Cloud, CloudOff, HardDriveDownload, MessageCircleQuestion, Store, Menu, X, Truck, CircleDollarSign, BarChart3, Boxes, ShoppingBag, ContactRound, LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "wouter";
import { BrandMark } from "@/components/BrandMark";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { appRoutes } from "@/lib/routes";
import { markReportsExplored } from "@/features/business/setupProgress";
import "./PremiumShell.css";
import { ClementiaLauncher } from "./ClementiaLauncher";

interface AppShellProps { children: ReactNode; }

function NavigationLink({ route }: { route: (typeof appRoutes)[number] }) {
  const { href, label, shortLabel, icon: Icon } = route;
  const [location] = useLocation();
  const isActive = location === href;
  return <Link href={href} aria-current={isActive ? "page" : undefined} className={`nav-link ${isActive ? "nav-link-active" : ""}`}><Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.8} aria-hidden="true" /><span className="hidden text-sm font-semibold md:inline">{label}</span><span className="text-[0.62rem] font-semibold sm:hidden">{shortLabel}</span></Link>;
}

export function AppShell({ children }: AppShellProps) {
  const { activeCompanyId } = useBusinessProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const menuDrawerRef = useRef<HTMLElement>(null);
  const [staffGate, setStaffGate] = useState<"loading" | "locked" | "open">("loading");
  useEffect(() => {
    let mounted = true;
    const refresh = (silent = false) => {
      if (mounted && !silent) setStaffGate("loading");
      // Do not repeatedly deserialize all PIN hashes and WebAuthn credentials.
      const current=currentStaffId(activeCompanyId);
      void db.transaction("r",db.staffMembers,async()=>{
        const total=await db.staffMembers.where("businessProfileId").equals(activeCompanyId).count();
        if(!total)return true;
        if(!current)return false;
        const member=await db.staffMembers.get(current);
        return Boolean(member&&member.businessProfileId===activeCompanyId&&!member.disabledAt);
      }).then(open=>{if(mounted)setStaffGate(open?"open":"locked");})
      .catch(() => { if (mounted) setStaffGate("locked"); });
    };
    refresh();
    const onSession = () => refresh(true);
    const onFocus = () => {if(document.visibilityState==="visible")refresh(true);};
    const timer = window.setInterval(onFocus,30_000);
    window.addEventListener(STAFF_SESSION_CHANGED,onSession);
    window.addEventListener('focus',onFocus);
     document.addEventListener('visibilitychange',onFocus);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener(STAFF_SESSION_CHANGED,onSession); window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onFocus); };
  }, [activeCompanyId]);
  const [location] = useLocation();
  const pageName = useMemo(() => appRoutes.find((route) => route.href === location)?.label ?? "Tallybook", [location]);
  const primaryRoutes = appRoutes.filter((route) => route.primary);
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => {
    if (location === "/reports" && staffGate === "open") markReportsExplored(activeCompanyId);
  }, [location, activeCompanyId, staffGate]);
  useEffect(() => {
    if (!menuOpen) return;
    menuCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); menuTriggerRef.current?.focus(); }
      if (event.key !== "Tab" || !menuDrawerRef.current) return;
      const focusable = Array.from(menuDrawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  const groups = [
    { title: "Workspace", links: [{ href: "/", label: "Home", Icon: LayoutDashboard }, { href: "/sales", label: "Sales (POS)", Icon: ShoppingBag }, { href: "/inventory", label: "Inventory", Icon: Boxes }, { href: "/customers", label: "Customers", Icon: ContactRound }] },
    { title: "Management", links: [{ href: "/purchases", label: "Purchases", Icon: Truck }, { href: "/expenses", label: "Expenses", Icon: CircleDollarSign }, { href: "/reports", label: "Reports", Icon: BarChart3 }] },
    { title: "Settings", links: [{ href: "/business", label: "Business Setup", Icon: Store }, { href: "/staff", label: "Staff & Permissions", Icon: Users }, { href: "/backup", label: "Backup & Restore", Icon: HardDriveDownload }] },
  ];
  const groupedNav = (onNavigate?: () => void) => <>{groups.map(group => <section key={group.title} className="premium-nav-group"><h2>{group.title}</h2>{group.links.map(({ href, label, Icon }) => <Link key={href} href={href} onClick={onNavigate} aria-current={location === href ? "page" : undefined} className={`premium-nav-item ${location === href ? "premium-nav-selected" : ""}`}><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{label}</span></Link>)}</section>)}<details className="premium-more-tools"><summary>More tools</summary>{[{ href: "/end-of-day", label: "End of day", Icon: Bell }, { href: "/stores", label: "Stores", Icon: Store }, { href: "/commerce", label: "Commerce drafts", Icon: Store }, { href: "/alerts", label: "Alerts", Icon: Bell }, { href: "/sync-status", label: "Sync status", Icon: Cloud }, { href: "/assistant", label: "Assistant", Icon: MessageCircleQuestion }].map(({href,label,Icon})=><Link key={href} href={href} onClick={onNavigate} className="premium-nav-item"><Icon className="h-5 w-5 shrink-0" aria-hidden="true"/><span>{label}</span></Link>)}</details></>;
  if (staffGate !== "open" && location !== "/staff" && location !== "/account") return <main className="mx-auto mt-12 max-w-md rounded-xl border p-6 space-y-4">
    <h1 className="text-xl font-semibold">{staffGate === "locked" ? "Tallybook is locked" : "Checking local staff access"}</h1>
    <p className="text-sm text-muted-foreground">{staffGate === "locked" ? "Unlock with your local staff PIN to access this business." : "Checking the staff records stored on this device."}</p>
    <Link href="/staff" className="inline-block rounded border p-3">Go to staff unlock</Link>
  </main>;
  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to page content</a><span className="screen-reader-announcer" aria-live="polite" aria-atomic="true">{pageName} page</span>
    <aside className="desktop-rail premium-desktop-rail" aria-label="Primary navigation"><nav className="premium-nav-groups" aria-label="Desktop sections">{groupedNav()}</nav><Link href="/#getting-started" className="premium-rail-setup"><span className="premium-rail-setup-icon"><LayoutDashboard className="h-5 w-5" aria-hidden="true" /></span><span><strong>Complete setup</strong><small>Let's get your business ready. Follow the steps to start.</small></span><span>Continue Setup →</span></Link><p className="premium-storage-note"><CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />Records stay on this device. Keep a backup.</p></aside>
    {menuOpen && <div className="premium-mobile-overlay"><button type="button" className="premium-drawer-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /><aside ref={menuDrawerRef} className="premium-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation"><div className="premium-drawer-heading"><BrandMark compact /><button ref={menuCloseRef} type="button" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuTriggerRef.current?.focus(); }}><X className="h-5 w-5" /></button></div><nav className="premium-nav-groups">{groupedNav(() => setMenuOpen(false))}</nav></aside></div>}
    <div className="content-frame"><header className="top-bar" aria-label="Application status"><div className="premium-header-brand"><button ref={menuTriggerRef} className="premium-menu-button" type="button" aria-label="Open navigation menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></button><div className="premium-header-brandmark" aria-label="Tallybook"><span className="premium-header-logo" aria-hidden="true"><BarChart3 size={25} strokeWidth={3}/></span><span className="premium-header-wordmark"><strong>Tallybook</strong><small>Manage. Grow. Together.</small></span></div><div className="mobile-brand-lockup"><BrandMark compact /></div></div><Link href="/inventory" className="premium-global-search" aria-label="Search products in inventory"><Search size={17} aria-hidden="true"/><span>Search products in inventory</span><kbd>Inventory</kbd></Link><CompanySwitcher compact /><div className="shell-top-utilities"><Link href="/alerts" aria-label="View alerts"><Bell className="h-4 w-4" aria-hidden="true" /></Link><Link href="/business" aria-label="Business settings"><Store className="h-4 w-4" aria-hidden="true" /></Link><Link href="/assistant" aria-label="Clementia assistant"><MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /></Link><Link href="/backup" aria-label="Backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" /></Link><DatabaseStatus /></div><Link href="/account" className="premium-header-account" aria-label="Open Tallybook account"><span aria-hidden="true">TB</span><span><strong>My Account</strong><small>Business user</small></span></Link></header><main id="main-content" className="page-content" tabIndex={-1}>{children}</main></div>
    <ClementiaLauncher hidden={location === "/assistant" || location === "/sales" || location === "/staff"} />
    <nav className="mobile-nav" aria-label="Primary navigation">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav>
  </div>;
}
