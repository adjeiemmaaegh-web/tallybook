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
import BusinessSetup from "@/pages/BusinessSetup";
import CustomersPage from "@/pages/CustomersPage";
import InventoryPage from "@/pages/InventoryPage";
import SalesPage from "@/pages/SalesPage";
import ReportsPage from "@/pages/ReportsPage";
import BackupPage from "@/pages/BackupPage";
import EndOfDayPage from "@/pages/EndOfDayPage";
import PurchasesPage from "@/pages/PurchasesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import BusinessHealthPage from "@/pages/BusinessHealthPage";
import StageHome from "@/pages/StageHome";
import { StagePlaceholder } from "@/pages/StagePlaceholder";
import { ThemeProvider } from "./contexts/ThemeContext";


function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={StageHome} />
        <Route path="/business" component={BusinessSetup} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/end-of-day" component={EndOfDayPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/expenses" component={ExpensesPage} />
        <Route path="/business-health" component={BusinessHealthPage} />
        <Route path="/backup" component={BackupPage} />
        <Route component={AppNotFound} />
      </Switch>
    </AppShell>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

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
