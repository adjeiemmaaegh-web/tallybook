import {AdvisoryScheduleRunner} from "@/features/insights/AdvisoryScheduleRunner";
/** Tactile Ledger design reminder: a running ledger strip shows the saved business identity wherever owners work, with generous thumb targets. */
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { requiresCloudOwner } from "@/auth/deviceEntry";
import { db } from "@/db/TallybookDB";
import { currentStaffId, STAFF_SESSION_CHANGED } from "@/features/staff/staff";
import { Bell, Search, Users, Cloud, CloudOff, HardDriveDownload, MessageCircleQuestion, Store, Menu, X, Truck, CircleDollarSign, BarChart3, Boxes, ShoppingBag, ContactRound, LayoutDashboard, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { BrandMark } from "@/components/BrandMark";
import { DatabaseStatus } from "@/components/DatabaseStatus";
import {Run18UpdateNotice} from "@/components/Run18UpdateNotice";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { internalToolsEnabled } from "@/lib/internalTools";
import { appRoutes } from "@/lib/routes";
import { markReportsExplored } from "@/features/business/setupProgress";
import "./PremiumShell.css";
import { ClementiaLauncher } from "./ClementiaLauncher";

interface AppShellProps { children: ReactNode; }

function NavigationLink({ route }: { route: (typeof appRoutes)[number] }) {
  const { href, label, shortLabel, icon: Icon } = route;
  const [location] = useLocation();
  const isActive = location === href;
  return <Link href={href} aria-current={isActive ? "page" : undefined} className={`nav-link ${isActive ? "nav-link-active" : ""}`}><Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.8} aria-hidden="true" /><span className="hidden text-sm font-semibold md:inline">{label}</span><span className="text-[0.62rem] font-semibold md:hidden">{shortLabel}</span></Link>;
}

export function AppShell({ children }: AppShellProps) {
  const { activeCompanyId } = useBusinessProfile();
  return <CompanyShell key={activeCompanyId}><AdvisoryScheduleRunner companyId={activeCompanyId}/>{children}</CompanyShell>;
}

function CompanyShell({ children }: AppShellProps) {
  const { activeCompanyId, profile, companies, status } = useBusinessProfile();
  const standalone = !requiresCloudOwner();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const menuDrawerRef = useRef<HTMLElement>(null);
  const mainRef=useRef<HTMLElement>(null);
  const [staffGate, setStaffGate] = useState<"loading" | "locked" | "open" | "cashier">("loading");
  useEffect(() => {
    let mounted = true;
    let requestId = 0;
    const refresh = (silent = false) => {
      const request = ++requestId;
      if (mounted && !silent) setStaffGate("loading");
      // Do not repeatedly deserialize all PIN hashes and WebAuthn credentials.
      const current=currentStaffId(activeCompanyId);
      void db.transaction("r",[db.staffMembers,db.businessProfiles],async()=>{
        const total=await db.staffMembers.where("businessProfileId").equals(activeCompanyId).count();
        if(!total)return !standalone && !(await db.businessProfiles.get(activeCompanyId))?.staffGovernanceEnabled;
        if(!current)return false;
        const member=await db.staffMembers.get(current);
        if (!member || member.businessProfileId !== activeCompanyId || member.disabledAt) return false;
        return member.role === "cashier" ? "cashier" as const : true;
      }).then(open=>{
        if (!mounted || request !== requestId) return;
        if (current !== currentStaffId(activeCompanyId)) { refresh(true); return; }
        setStaffGate(open === "cashier" ? "cashier" : open ? "open" : "locked");
      })
      .catch(() => { if (mounted && request === requestId) setStaffGate("locked"); });
    };
    refresh();
    const onSession = () => {
      // Drop the previous user's shell immediately. A subsequent IndexedDB
      // check may admit a new unlock, but cannot keep the old session visible.
      setStaffGate("loading");
      refresh(true);
    };
    const onFocus = () => {if(document.visibilityState==="visible")refresh(true);};
    const timer = window.setInterval(onFocus,30_000);
    window.addEventListener(STAFF_SESSION_CHANGED,onSession);
    window.addEventListener('focus',onFocus);
     document.addEventListener('visibilitychange',onFocus);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener(STAFF_SESSION_CHANGED,onSession); window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onFocus); };
  }, [activeCompanyId, location, standalone]);
  const pageName = useMemo(() => appRoutes.find((route) => route.href === location)?.label ?? "Tallybook", [location]);
  const primaryRoutes = appRoutes.filter((route) => route.primary);
  useEffect(() => {
    setMenuOpen(false);
    const frame=window.requestAnimationFrame(()=>mainRef.current?.focus());
    return()=>window.cancelAnimationFrame(frame);
  },[location]);
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
    { title: "Daily work", links: [
      { href: "/", label: "Home", Icon: LayoutDashboard },
      { href: "/sales", label: "Sales", Icon: ShoppingBag },
      { href: "/inventory", label: "Stock", Icon: Boxes },
      { href: "/customers", label: "Customers", Icon: ContactRound },
      { href: "/assistant", label: "Clementia", Icon: MessageCircleQuestion },
    ]},
    { title: "Money and stock", links: [
      { href: "/purchases", label: "Purchases", Icon: Truck },
      { href: "/expenses", label: "Expenses", Icon: CircleDollarSign },
      { href: "/end-of-day", label: "End of day", Icon: ClipboardCheck },
      { href: "/reports", label: "Reports", Icon: BarChart3 },
    ]},
    { title: "Business settings", links: [
      { href: "/business", label: "Business details", Icon: Store },
      { href: "/stores", label: "Stores", Icon: Store },
      { href: "/staff", label: "Staff and permissions", Icon: Users },
      { href: "/backup", label: "Backup and restore", Icon: HardDriveDownload },
    ]},
  ];
  const moreTools = [
    { href: "/quotations", label: "Quotations", Icon: ClipboardCheck },
    { href: "/customer-benefits", label: "Customer benefits", Icon: ContactRound },
    { href: "/commerce", label: "Commerce drafts", Icon: Store },
    { href: "/insights", label: "Insights", Icon: BarChart3 },
    { href: "/business-health", label: "Business health", Icon: BarChart3 },
    { href: "/financial-intelligence", label: "Financial analysis", Icon: CircleDollarSign },
    { href: "/alerts", label: "Alerts", Icon: Bell },
    { href: "/sync-status", label: "Sync status", Icon: Cloud },
    ...(internalToolsEnabled ? [
      { href: "/device-uat", label: "Device acceptance (owner only)", Icon: ClipboardCheck },
      { href: "/release-operations", label: "Release operations (owner only)", Icon: ShieldCheck },
    ] : []),
  ];
  const groupedNav = (onNavigate?: () => void) => {
    const links = (items: typeof moreTools) => items.map(({href, label, Icon}) =>
      <Link key={href} href={href} onClick={onNavigate} aria-current={location === href ? "page" : undefined}
        className={location === href ? "premium-nav-item premium-nav-selected" : "premium-nav-item"}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true"/><span>{label}</span>
      </Link>);
    return <>{groups.map(group => <section key={group.title} className="premium-nav-group">
      <h2>{group.title}</h2>{links(group.links)}
    </section>)}<details className="premium-more-tools" open={moreTools.some(tool => tool.href === location) || undefined}>
      <summary>More tools</summary>{links(moreTools)}
    </details></>;
  };
  if (staffGate === "cashier") {
    if (location !== "/sales" && location !== "/staff") return <Redirect to="/sales" replace />;
    return <div className="cashier-workspace">
      <header><strong>{profile?.name || "Tallybook"}</strong><span>Cashier workspace</span></header>
      <nav aria-label="Cashier navigation">
        <Link href="/sales" aria-current={location === "/sales" ? "page" : undefined}>Sales</Link>
        <Link href="/staff" aria-current={location === "/staff" ? "page" : undefined}>Staff session</Link>
      </nav>
      <main ref={mainRef} tabIndex={-1} id="main-content">{children}</main>
    </div>;
  }
  // Local setup and unlock mount only their form, never navigation or business reports.
  if (standalone && (status !== "ready" || staffGate === "loading"))
    return <main role="status">{status === "error" ? "Cannot open the local ledger." : "Checking local staff access"}</main>;
  if (standalone && staffGate !== "open") {
    const emptyDevice = !profile && companies.length === 0;
    if ((location === "/business" && emptyDevice && !window.location.search) ||
        (location === "/staff" && profile))
      return <main id="main-content">{children}</main>;
    return <main className="mx-auto mt-12 max-w-md space-y-4 p-6">
      <h1>{emptyDevice ? "Set up this device" : "Tallybook is locked"}</h1>
      <Link href={emptyDevice ? "/business" : "/staff"}>{emptyDevice ? "Set up business" : "Go to staff unlock"}</Link>
    </main>;
  }
  if (staffGate !== "open" && location !== "/staff" && location !== "/account") return <main className="mx-auto mt-12 max-w-md rounded-xl border p-6 space-y-4">
    <h1 className="text-xl font-semibold">{staffGate === "locked" ? "Tallybook is locked" : "Checking local staff access"}</h1>
    <p className="text-sm text-muted-foreground">{staffGate === "locked" ? "Unlock with your local staff PIN to access this business." : "Checking the staff records stored on this device."}</p>
    <Link href="/staff" className="inline-block rounded border p-3">Go to staff unlock</Link>
  </main>;
  if (staffGate !== "open") return <main id="main-content">{children}</main>;
  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to page content</a><span className="screen-reader-announcer" aria-live="polite" aria-atomic="true">{pageName} page</span>
    <aside className="desktop-rail premium-desktop-rail" aria-label="Primary navigation"><nav className="premium-nav-groups" aria-label="Desktop sections">{groupedNav()}</nav><p className="premium-storage-note"><CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />Records stay on this device. Keep a backup.</p></aside>
    {menuOpen && <div className="premium-mobile-overlay"><button type="button" className="premium-drawer-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /><aside ref={menuDrawerRef} id="run18-navigation-drawer" className="premium-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation"><div className="premium-drawer-heading"><BrandMark compact /><button ref={menuCloseRef} type="button" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuTriggerRef.current?.focus(); }}><X className="h-5 w-5" /></button></div><nav className="premium-nav-groups">{groupedNav(() => setMenuOpen(false))}</nav></aside></div>}
    <div className="content-frame"><header className="top-bar" aria-label="Application status"><div className="premium-header-brand"><button ref={menuTriggerRef} className="premium-menu-button" type="button" aria-label="Open navigation menu" aria-controls="run18-navigation-drawer" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></button><div className="premium-header-brandmark" aria-label="Tallybook"><span className="premium-header-logo" aria-hidden="true"><BarChart3 size={25} strokeWidth={3}/></span><span className="premium-header-wordmark"><strong>Tallybook</strong><small>Manage. Grow. Together.</small></span></div><div className="mobile-brand-lockup"><BrandMark compact /></div></div><Link href="/inventory" className="premium-global-search" aria-label="Search products in inventory"><Search size={17} aria-hidden="true"/><span>Search products in inventory</span><kbd>Inventory</kbd></Link><CompanySwitcher compact /><div className="shell-top-utilities"><Link href="/alerts" aria-label="View alerts"><Bell className="h-4 w-4" aria-hidden="true" /></Link><Link href="/business" aria-label="Business settings"><Store className="h-4 w-4" aria-hidden="true" /></Link><Link href="/assistant" aria-label="Clementia assistant"><MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /></Link><Link href="/backup" aria-label="Backup"><HardDriveDownload className="h-4 w-4" aria-hidden="true" /></Link><DatabaseStatus /></div><Link href="/account" className="premium-header-account" aria-label="Open Tallybook account"><span aria-hidden="true">TB</span><span><strong>My Account</strong><small>Business user</small></span></Link></header><Run18UpdateNotice/><main ref={mainRef} id="main-content" className="page-content" tabIndex={-1}>{children}</main></div>
    <ClementiaLauncher hidden={location === "/assistant" || location === "/sales" || location === "/staff"} />
    <nav className="mobile-nav" aria-label="Primary navigation">{primaryRoutes.map((route) => <NavigationLink key={route.key} route={route} />)}</nav>
  </div>;
}
