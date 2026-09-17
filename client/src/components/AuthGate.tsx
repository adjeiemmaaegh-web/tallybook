import { useEffect, useState, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      setError("Supabase is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }

    const client = getSupabaseClient();
    let mounted = true;

    void client.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) throw sessionError;
        setSession(data.session);
      })
      .catch((cause) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : "Could not read the Tallybook session.");
        }
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setError(null);
      setChecking(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // The sign-in page is the only public route. OAuth returns here so the
  // Supabase session can be established before the application is opened.
  if (location === "/signin") return <>{children}</>;

  if (checking) {
    return (
      <main className="home-workspace" style={{ maxWidth: 620, margin: "0 auto", paddingTop: 48 }}>
        <section className="op-row-card" style={{ display: "block", padding: 22 }}>
          <p className="eyebrow">Account access</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", margin: "12px 0 8px" }}>Checking your Tallybook session…</h1>
          <p className="op-row-sub">Please wait while Tallybook verifies your existing sign-in.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="home-workspace" style={{ maxWidth: 620, margin: "0 auto", paddingTop: 48 }}>
        <section className="op-row-card" style={{ display: "block", padding: 22 }}>
          <p className="eyebrow">Account access</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", margin: "12px 0 8px" }}>Tallybook needs account access</h1>
          <p className="op-row-sub" role="alert">{error}</p>
        </section>
      </main>
    );
  }

  return session ? <>{children}</> : <Redirect to="/signin" />;
}
