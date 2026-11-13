/** Tactile Ledger design reminder: global routes wrap one reliable ledger shell and never imply unfinished features are available. */
import { lazy, Suspense, useEffect } from "react";
import { createCloudStaffSessionBoundary } from "@/auth/cloudStaffSessionBoundary";
import { lockAllStaff } from "@/features/staff/staff";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { Redirect, useLocation } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ConfirmHost } from "@/components/ConfirmHost";
import { StrictSharedShopGate } from "@/auth/StrictSharedShopGate";
const SharedShopPage = lazy(() => import("@/pages/SharedShopPage"));
// Everything the local ledger needs is loaded only on its routes, never for /shop or /welcome.
const DeviceWorkspace = lazy(() => import("@/DeviceWorkspace"));
import { ThemeProvider } from "./contexts/ThemeContext";
import "./styles/ReferenceVisualSystem.css";
import "./styles/DesignSystem.css";
import { TallybookWelcome } from "@/components/TallybookWelcome";

function App() {
  const [location] = useLocation();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const onAccountEvent = createCloudStaffSessionBoundary(lockAllStaff);
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      // Events are only a reason to revoke a local unlock, never proof of cloud access.
      onAccountEvent(event, session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <>
          <ConfirmHost />
          {location === '/cloud-account'
            // Retired preview: its server check was never deployed. The account page is the real one.
            ? <Redirect to="/account" replace />
            : location === '/welcome'
            // Safe public first page: presents existing sign-in links only.
            // NEVER mounts the local ledger or bypasses verified owner access.
            ? <main className="tb-public-welcome"><TallybookWelcome variant="shop" /></main>
            : location === '/shop'
            // The shared shop is cloud-authoritative and checks the session
            // itself; it must not mount the local ledger or its unlock gates.
            ? <StrictSharedShopGate><Suspense fallback={<main className="shop-page" role="status">Opening your shop…</main>}><SharedShopPage /></Suspense></StrictSharedShopGate>
            : <Suspense fallback={<main className="mx-auto max-w-3xl p-6" role="status" aria-live="polite"><h1 className="text-lg font-semibold">Opening this local workspace…</h1><p className="text-sm">Your saved records remain on this device. No data is uploaded.</p></main>}>
                <DeviceWorkspace location={location} />
              </Suspense>}
        </>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

