/**
 * The frame shared by the signed-out account screens (sign in, create account, password reset):
 * a teal header with the Tallybook brand over a white sheet. It holds no sign-in logic.
 */
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import "./AuthShell.css";

export function AuthShell({ title, subtitle, children, notice, footer, tagline = true }: {
  title: string; subtitle?: string; children: ReactNode; notice?: ReactNode; footer?: ReactNode; tagline?: boolean;
}) {
  return <div className="tb-auth-page">
    <div className="tb-auth-col">
    {notice}
    <div className="tb-auth-shell">
      <header className="tb-auth-hero">
        <Link className="tb-auth-brand" href="/welcome" aria-label="Tallybook by Alchemy, back to the welcome page">
          <span className="tb-auth-brand-mark" aria-hidden="true">T</span>
          <span><strong>Tallybook</strong><small>BY ALCHEMY</small></span>
        </Link>
        {tagline && <h2 className="tb-auth-tagline">Your business.<em>Beautifully in hand.</em></h2>}
        <svg className="tb-auth-wave" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 64V30C70 6 130 2 205 22c70 19 130 24 195 4v38Z" />
        </svg>
      </header>
      <section className="tb-account-form tb-auth-body">
        <h1>{title}</h1>
        {subtitle && <p className="tb-auth-subtitle">{subtitle}</p>}
        {children}
        <p className="tb-auth-trust"><ShieldCheck size={26} aria-hidden="true" /><span>Secure, simple business inventory and bookkeeping</span></p>
        {footer}
      </section>
    </div>
    </div>
  </div>;
}
