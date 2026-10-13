import { useEffect, useState, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

const OFFLINE_IDENTITY_KEY = "tallybook.auth.offline-user.v1";
type State = "loading" | "signed-in" | "signed-out" | "error";

/** Local offline access is not a cloud authorization credential. Cloud requests
 * must still use the Supabase session and database-enforced membership policies. */
type Props = { children: ReactNode; signIn: ReactNode };
/** Staged rollout: enable only after the deployment's Supabase configuration is verified. */
export function AuthGate(props: Props & { enabled?: boolean }) {
  const enabled = props.enabled ?? import.meta.env.VITE_TALLYBOOK_REQUIRE_AUTH === "true";
  return enabled ? <RequiredAuthGate {...props} /> : <>{props.children}</>;
}

function RequiredAuthGate({ children, signIn }: Props) {
  const [location] = useLocation();
  const [state, setState] = useState<State>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured) { setState("error"); return; }
    let active = true;
    let revision = 0;
    const cachedOfflineUser = () => {
      try { return !navigator.onLine && Boolean(localStorage.getItem(OFFLINE_IDENTITY_KEY)); }
      catch { return false; }
    };
    const remember = (id: string | null) => {
      try {
        if (id) localStorage.setItem(OFFLINE_IDENTITY_KEY, id);
        else localStorage.removeItem(OFFLINE_IDENTITY_KEY);
      } catch { /* Storage denial must not prevent online authentication. */ }
    };
    setState(cachedOfflineUser() ? "signed-in" : "loading");
    const client = getSupabaseClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      revision++;
      if (session) { remember(session.user.id); setState("signed-in"); }
      else if (event === "SIGNED_OUT") { remember(null); setState("signed-out"); }
      else { if (navigator.onLine) remember(null); setState(cachedOfflineUser() ? "signed-in" : "signed-out"); }
    });
    const check = () => {
      const startedAt = revision;
      void client.auth.getSession().then(({ data, error }) => {
        if (!active || startedAt !== revision) return;
        if (error) { setState(cachedOfflineUser() ? "signed-in" : "error"); return; }
        if (data.session) { remember(data.session.user.id); setState("signed-in"); }
        else { if (navigator.onLine) remember(null); setState(cachedOfflineUser() ? "signed-in" : "signed-out"); }
      }).catch(() => {
        if (active && startedAt === revision) setState(cachedOfflineUser() ? "signed-in" : "error");
      });
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === OFFLINE_IDENTITY_KEY && event.newValue === null) {
        revision++; setState("signed-out");
      }
    };
    check();
    window.addEventListener("online", check);
    window.addEventListener("storage", storageChanged);
    return () => {
      active = false; subscription.unsubscribe();
      window.removeEventListener("online", check);
      window.removeEventListener("storage", storageChanged);
    };
  }, [attempt]);

  if (state === "loading") return <main className="mx-auto max-w-md p-6" role="status">Checking your sign-in…</main>;
  if (state === "error") return <main className="mx-auto max-w-md p-6 space-y-4">
    <h1 className="text-xl font-semibold">Sign-in is temporarily unavailable</h1>
    <p role="alert">{isSupabaseConfigured ? "We could not check your session. Your saved business records have not been changed." : "Account access has not been configured for this installation. Contact the owner to finish setup."}</p>
    <button className="primary-action" onClick={() => setAttempt(value => value + 1)}>Try again</button>
  </main>;
  if (state === "signed-out") return location === "/signin" ? <>{signIn}</> : <Redirect to="/signin" replace />;
  if (location === "/signin") return <Redirect to="/" replace />;
  return <>{children}</>;
}
