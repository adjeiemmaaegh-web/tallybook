import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { LogOut, ShieldCheck } from "lucide-react";

const AUTH_STORAGE_KEY = "tallybook.google-auth.v1";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleIdentity = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  exp?: number;
  iss?: string;
  aud?: string;
};

type GoogleCredentialResponse = { credential: string };

type GoogleAccountsId = {
  initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean }) => void;
  renderButton: (parent: HTMLElement, options: { theme: string; size: string; text: string; shape: string; width?: number }) => void;
  disableAutoSelect?: () => void;
};

declare global {
  interface Window { google?: { accounts?: { id?: GoogleAccountsId } } }
}

function decodeJwtPayload(token: string): GoogleIdentity {
  const part = token.split(".")[1];
  if (!part) throw new Error("Google returned an invalid credential.");
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
      .split("")
      .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join(""),
  );
  return JSON.parse(json) as GoogleIdentity;
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Sign-In could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Sign-In could not load."));
    document.head.appendChild(script);
  });
}

function readSavedIdentity(): GoogleIdentity | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GoogleIdentity) : null;
  } catch {
    return null;
  }
}

export default function GoogleSignInPage() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [identity, setIdentity] = useState<GoogleIdentity | null>(() => readSavedIdentity());
  const [error, setError] = useState<string | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

  useEffect(() => {
    if (!clientId || identity || !buttonRef.current) return;
    let cancelled = false;
    void loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            try {
              const decoded = decodeJwtPayload(response.credential);
              if (decoded.iss !== "https://accounts.google.com" && decoded.iss !== "accounts.google.com") {
                throw new Error("Google returned an unexpected issuer.");
              }
              if (decoded.aud !== clientId) throw new Error("This Google credential was issued for a different application.");
              if (decoded.exp && decoded.exp * 1000 <= Date.now()) throw new Error("The Google credential has expired. Please sign in again.");
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(decoded));
              setIdentity(decoded);
              setError(null);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Google sign-in failed.");
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: 320,
        });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Google Sign-In could not load."));
    return () => { cancelled = true; };
  }, [clientId, identity]);

  const signOut = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.google?.accounts?.id?.disableAutoSelect?.();
    setIdentity(null);
    setError(null);
  };

  return (
    <div className="home-workspace space-y-5 pb-6" style={{ maxWidth: 620, margin: "0 auto" }}>
      <section className="op-row-card" style={{ display: "block", padding: 22 }}>
        <p className="eyebrow"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Account access</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", margin: "12px 0 8px" }}>Sign in to Tallybook</h1>
        <p className="op-row-sub" style={{ fontSize: ".8rem", lineHeight: 1.6 }}>
          This first step connects a Google identity to this Tallybook installation. It does not yet upload business records or enable cloud synchronization.
        </p>

        {!clientId ? (
          <div className="attention-note" role="alert" style={{ marginTop: 18 }}>
            <div><strong>Google Sign-In is not configured for this build.</strong><p>Set <code>VITE_GOOGLE_CLIENT_ID</code> in the local environment and in the deployed app's environment settings, then rebuild.</p></div>
          </div>
        ) : identity ? (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            <div className="op-row-card" style={{ marginBottom: 0 }}>
              {identity.picture ? <img src={identity.picture} alt="" width={42} height={42} style={{ borderRadius: "50%" }} /> : null}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="op-row-title">Signed in with Google</div>
                <div className="op-row-sub" style={{ overflowWrap: "anywhere" }}>{identity.email ?? identity.name ?? "Google account"}</div>
              </div>
              <span className="stamp stamp-ready">Signed in</span>
            </div>
            <button className="secondary-action" type="button" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
            <p className="op-row-sub">For this first stage, the identity is stored only on this device. Secure server-side verification and cloud business access will be added in the later sync stage.</p>
          </div>
        ) : (
          <div style={{ marginTop: 18, minHeight: 48 }}>
            <div ref={buttonRef} />
          </div>
        )}

        {error ? <p role="alert" style={{ marginTop: 14, color: "var(--color-clay)", fontSize: ".78rem" }}>{error}</p> : null}
      </section>
      <Link className="back-link" href="/">Back to Tallybook</Link>
    </div>
  );
}
