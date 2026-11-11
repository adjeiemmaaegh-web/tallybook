/**
 * The device workspace: the local ledger, its providers, shell and routes.
 *
 * Loaded on demand (App.tsx imports it lazily) so that the shared shop at /shop,
 * which never mounts the local ledger, does not download the offline assistant,
 * backup, sales, staff and form code it will never use.
 */
import { lazy, Suspense } from "react";
import { internalToolsEnabled } from "@/lib/internalTools";
import { AuthGate } from "@/auth/AuthGate";
import { requiresCloudOwner } from "@/auth/deviceEntry";
import { FriendsTestGate } from "@/auth/FriendsTestGate";
import { Toaster } from "@/components/ui/sonner";
import { ConnectionRestoredNotifier } from "@/components/ConnectionRestoredNotifier";
import { Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { BusinessProfileProvider } from "@/contexts/BusinessProfileContext";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import AppNotFound from "@/pages/AppNotFound";
const AssistantPage = lazy(() => import("@/pages/AssistantPage"));
const BusinessSetup = lazy(() => import("@/pages/BusinessSetup"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const StaffPage = lazy(() => import("@/pages/StaffPage"));
const StoresPage = lazy(() => import("@/pages/StoresPage"));
const CommercePage = lazy(() => import("@/pages/CommercePage"));
const LocalAlertsPage = lazy(() => import("@/pages/LocalAlertsPage"));
const SyncStatusPage = lazy(() => import("@/pages/SyncStatusPage"));
const CustomerBenefitsPage = lazy(() => import("@/pages/CustomerBenefitsPage"));
const QuotationsPage = lazy(() => import("@/pages/QuotationsPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const SalesPage = lazy(() => import("@/pages/SalesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const FinancialIntelligencePage = lazy(() => import("@/pages/FinancialIntelligencePage"));
const BackupPage = lazy(() => import("@/pages/BackupPage"));
const Run19DeviceAcceptancePage = lazy(() => import("@/pages/Run19DeviceAcceptancePage"));
const Run20OperationsPage = lazy(() => import("@/pages/Run20OperationsPage"));
const EndOfDayPage = lazy(() => import("@/pages/EndOfDayPage"));
const PurchasesPage = lazy(() => import("@/pages/PurchasesPage"));
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage"));
const BusinessHealthPage = lazy(() => import("@/pages/BusinessHealthPage"));
const StageHome = lazy(() => import("@/pages/StageHome"));
const CloudAccountPage = lazy(() => import("@/pages/CloudAccountPage"));
import GoogleSignInPage from "@/pages/GoogleSignInPage";
import PasswordRecoveryPage from "@/pages/PasswordRecoveryPage";
import SupabaseSignInPage from "@/pages/SupabaseSignInPage";
import { isSupabaseAuthPreviewEnabled } from "@/lib/supabaseAuthPreview";

function Router() {
  return (
    <AppShell>
      <Suspense fallback={<main className="mx-auto max-w-3xl p-6" role="status" aria-live="polite"><h1 className="text-lg font-semibold">Opening this local workspace…</h1><p className="text-sm">Your saved records remain on this device. No data is uploaded.</p></main>}>
      <Switch>
        <Route path="/" component={StageHome} />
        <Route path="/signin" component={GoogleSignInPage} />
        <Route path="/reset-password" component={PasswordRecoveryPage} />
        <Route path="/account" component={isSupabaseAuthPreviewEnabled ? SupabaseSignInPage : GoogleSignInPage} />
        <Route path="/settings" component={GoogleSignInPage} />
        <Route path="/cloud-account" component={CloudAccountPage} />
        <Route path="/business" component={BusinessSetup} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/customer-benefits" component={CustomerBenefitsPage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/staff" component={StaffPage} />
        <Route path="/stores" component={StoresPage} />
        <Route path="/commerce" component={CommercePage} />
        <Route path="/alerts" component={LocalAlertsPage} />
        <Route path="/sync-status" component={SyncStatusPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/insights" component={InsightsPage} />
        <Route path="/financial-intelligence" component={FinancialIntelligencePage} />
        <Route path="/end-of-day" component={EndOfDayPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/expenses" component={ExpensesPage} />
        <Route path="/business-health" component={BusinessHealthPage} />
        <Route path="/backup" component={BackupPage} />
        {internalToolsEnabled ? <Route path="/device-uat" component={Run19DeviceAcceptancePage} /> : null}
        {internalToolsEnabled ? <Route path="/release-operations" component={Run20OperationsPage} /> : null}
        <Route path="/assistant" component={AssistantPage} />
        <Route component={AppNotFound} />
      </Switch>
      </Suspense>
    </AppShell>
  );
}

export default function DeviceWorkspace({ location }: { location: string }) {
  const workspace = <AuthGate signIn={<GoogleSignInPage />} accountSignIn={isSupabaseAuthPreviewEnabled ? <SupabaseSignInPage /> : <GoogleSignInPage />} passwordRecovery={<PasswordRecoveryPage />}>
    <DatabaseProvider>
      <BusinessProfileProvider>
        <Toaster position="top-center" richColors />
        <ConnectionRestoredNotifier />
        <Router />
      </BusinessProfileProvider>
    </DatabaseProvider>
  </AuthGate>;
  return <TooltipProvider>{requiresCloudOwner() && !['/signin','/account','/settings','/reset-password'].includes(location) ? <FriendsTestGate>{workspace}</FriendsTestGate> : workspace}</TooltipProvider>;
}
