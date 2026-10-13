import { useEffect, useState } from "react";
import { Link } from "wouter";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

/**
 * Opt-in authentication compatibility preview, adapted from the private
 * GitHub main branch (2026-09-15). This screen DOES NOT gate the local app,
 * grant business permissions, upload records, or activate cloud sync.
 */
export default function SupabaseSignInPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseClient();
    let active = true;

    void client.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) throw sessionError;
        setSession(data.session);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not read your session.");
      })
      .finally(() => { if (active) setLoading(false); });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setSigningIn(false);
      setError(null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/signin` },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setSigningIn(false);
      setError(cause instanceof Error ? cause.message : "Google sign-in could not start.");
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      setSession(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.");
    }
  };

  return (
    <div className="home-workspace space-y-5 pb-6" style={{ maxWidth: 620, margin: "0 auto" }}>
      <section className="op-row-card" style={{ display: "block", padding: 22 }}>
        <p className="eyebrow"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Authentication preview</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", margin: "12px 0 8px" }}>Tallybook account</h1>
        <p className="op-row-sub" style={{ fontSize: ".8rem", lineHeight: 1.6 }}>
          This optional test flow reuses Supabase authentication from the earlier GitHub version.
          It does not authorize local business access or synchronize business records.
          Cloud business ownership and offline authentication remain unimplemented.
        </p>
        {!isSupabaseConfigured ? (
          <div className="attention-note" role="alert" style={{ marginTop: 18 }}>
            <div><strong>Test Supabase credentials are not configured.</strong><p>Configure a separate test project before enabling this preview. Never use a service-role key.</p></div>
          </div>
        ) : loading ? (
          <p className="op-row-sub" style={{ marginTop: 18 }}>Checking the optional test session…</p>
        ) : session ? (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            <div className="op-row-card" style={{ marginBottom: 0 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="op-row-title">Test authentication session active</div>
                <div className="op-row-sub" style={{ overflowWrap: "anywhere" }}>{session.user.email ?? "Account"}</div>
              </div>
              <span className="stamp stamp-ready">Test session</span>
            </div>
            <button className="secondary-action" type="button" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <button className="primary-action" type="button" onClick={signInWithGoogle} disabled={signingIn}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {signingIn ? "Opening Google…" : "Test Supabase Google sign-in"}
            </button>
          </div>
        )}
        {error ? <p role="alert" style={{ marginTop: 14, color: "var(--color-clay)", fontSize: ".78rem" }}>{error}</p> : null}
      </section>
      <Link className="back-link" href="/">Back to Tallybook</Link>
    </div>
  );
}
