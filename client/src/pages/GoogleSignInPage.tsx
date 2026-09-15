import { useEffect, useState } from "react";
import { Link } from "wouter";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

export default function GoogleSignInPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
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
        if (mounted) setError(cause instanceof Error ? cause.message : "Could not read the sign-in session.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setSigningIn(false);
      setError(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setError(null);

    try {
      const client = getSupabaseClient();
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/signin`,
        },
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
      const client = getSupabaseClient();
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
      setSession(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign out failed.");
    }
  };

  return (
    <div className="home-workspace space-y-5 pb-6" style={{ maxWidth: 620, margin: "0 auto" }}>
      <section className="op-row-card" style={{ display: "block", padding: 22 }}>
        <p className="eyebrow"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Account access</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", margin: "12px 0 8px" }}>Sign in to Tallybook</h1>
        <p className="op-row-sub" style={{ fontSize: ".8rem", lineHeight: 1.6 }}>
          Google authentication is now handled through Tallybook's secure Supabase authentication layer. Your existing offline business data remains on this device; cloud synchronization is not enabled yet.
        </p>

        {!isSupabaseConfigured ? (
          <div className="attention-note" role="alert" style={{ marginTop: 18 }}>
            <div><strong>Supabase is not configured for this build.</strong><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in the deployment environment, then rebuild.</p></div>
          </div>
        ) : loading ? (
          <p className="op-row-sub" style={{ marginTop: 18 }}>Checking your Tallybook account session…</p>
        ) : session ? (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            <div className="op-row-card" style={{ marginBottom: 0 }}>
              {session.user.user_metadata?.avatar_url ? <img src={session.user.user_metadata.avatar_url} alt="" width={42} height={42} style={{ borderRadius: "50%" }} /> : null}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="op-row-title">Signed in with Google</div>
                <div className="op-row-sub" style={{ overflowWrap: "anywhere" }}>{session.user.email ?? session.user.user_metadata?.full_name ?? "Google account"}</div>
              </div>
              <span className="stamp stamp-ready">Supabase session active</span>
            </div>
            <button className="secondary-action" type="button" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
            <p className="op-row-sub">This confirms identity/session handling only. Business records are still local and no cloud synchronization has been added.</p>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <button className="primary-action" type="button" onClick={signInWithGoogle} disabled={signingIn}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {signingIn ? "Opening Google…" : "Sign in with Google"}
            </button>
          </div>
        )}

        {error ? <p role="alert" style={{ marginTop: 14, color: "var(--color-clay)", fontSize: ".78rem" }}>{error}</p> : null}
      </section>
      <Link className="back-link" href="/">Back to Tallybook</Link>
    </div>
  );
}
