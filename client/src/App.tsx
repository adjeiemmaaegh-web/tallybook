/** Tactile Ledger design reminder: global routes wrap one reliable ledger shell and never imply unfinished features are available. */
import { Toaster } from "@/components/ui/sonner";
import { ConnectionRestoredNotifier } from "@/components/ConnectionRestoredNotifier";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { AppShell } from "@/components/AppShell";
import { BusinessProfileProvider } from "@/contexts/BusinessProfileContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import AppNotFound from "@/pages/AppNotFound";
import AssistantPage from "@/pages/AssistantPage";
import BusinessSetup from "@/pages/BusinessSetup";
import CustomersPage from "@/pages/CustomersPage";
import StaffPage from "@/pages/StaffPage";
import StoresPage from "@/pages/StoresPage";
import CommercePage from "@/pages/CommercePage";
import LocalAlertsPage from "@/pages/LocalAlertsPage";
import SyncStatusPage from "@/pages/SyncStatusPage";
import CustomerBenefitsPage from "@/pages/CustomerBenefitsPage";
import QuotationsPage from "@/pages/QuotationsPage";
import InventoryPage from "@/pages/InventoryPage";
import SalesPage from "@/pages/SalesPage";
import ReportsPage from "@/pages/ReportsPage";
import InsightsPage from "@/pages/InsightsPage";
import FinancialIntelligencePage from "@/pages/FinancialIntelligencePage";
import BackupPage from "@/pages/BackupPage";
import EndOfDayPage from "@/pages/EndOfDayPage";
import PurchasesPage from "@/pages/PurchasesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import BusinessHealthPage from "@/pages/BusinessHealthPage";
import StageHome from "@/pages/StageHome";
import GoogleSignInPage from "@/pages/GoogleSignInPage";
import SupabaseSignInPage from "@/pages/SupabaseSignInPage";
import { isSupabaseAuthPreviewEnabled } from "@/lib/supabaseAuthPreview";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={StageHome} />
        <Route path="/signin" component={isSupabaseAuthPreviewEnabled ? SupabaseSignInPage : GoogleSignInPage} />
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
        <Route path="/assistant" component={AssistantPage} />
        <Route component={AppNotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <DatabaseProvider>
            <BusinessProfileProvider>
              <Toaster position="top-center" richColors />
              <ConnectionRestoredNotifier />
              <Router />
            </BusinessProfileProvider>
          </DatabaseProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
