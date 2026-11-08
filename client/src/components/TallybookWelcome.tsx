/**
 * Real Tallybook first-run surface. All actions navigate to existing routes:
 * no mock authentication, demo sales, fabricated financial amounts or database writes.
 */
import { ArrowRight, CheckCircle2, CloudOff, Package, ShieldCheck, ShoppingBag, Store, UsersRound } from "lucide-react";
import { Link } from "wouter";
import "./TallybookWelcome.css";

type WelcomeVariant = "device" | "shop";
export function TallybookWelcome({ variant = "device" }: { variant?: WelcomeVariant }) {
  const shop = variant === "shop";
  return <section className="tb-welcome" aria-labelledby="tb-welcome-title">
    <div className="tb-welcome-top">
      <div className="tb-welcome-brand">
        <span className="tb-welcome-brand-symbol" aria-hidden="true"><Store size={22} strokeWidth={2.25}/></span>
        <span><strong>Tallybook</strong><small>BY ALCHEMY</small></span>
      </div>
      <Link href="/signin" className="tb-welcome-nav-link">Sign in <ArrowRight size={15} aria-hidden="true"/></Link>
    </div>
    <div className="tb-welcome-main">
      <div className="tb-welcome-copy">
        <p className="tb-welcome-kicker"><span aria-hidden="true" /> YOUR BUSINESS, BETTER ORGANIZED</p>
        <h1 id="tb-welcome-title">Your business.<em>Beautifully in hand.</em></h1>
        <p className="tb-welcome-description">
          Keep sales, products and customers organized, even when your connection is unreliable.
          {shop ? " Create an account to run a shared shop with your team." : " Your verified owner account can open a private workspace on this device, or you can run a shared shop with your team."}
        </p>
        <div className="tb-welcome-ctas">
          <Link href={shop ? "/signin" : "/business"} className="tb-welcome-cta-primary">
            {shop ? "Create your account" : "Set up this device"} <ArrowRight size={19} aria-hidden="true"/>
          </Link>
          <Link href={shop ? "/signin" : "/shop"} className="tb-welcome-cta-secondary">
            {shop ? "I already have an account" : "Use a shared shop"} <ArrowRight size={17} aria-hidden="true"/>
          </Link>
        </div>
        <div className="tb-welcome-assurances" aria-label="Tallybook capabilities">
          <span><CloudOff size={16} aria-hidden="true"/> Offline-first local records</span>
          <span><ShieldCheck size={16} aria-hidden="true"/> Owner-controlled access</span>
          <span><UsersRound size={16} aria-hidden="true"/> Team shop option</span>
        </div>
        <p className="tb-welcome-disclosure">{shop
          ? "Account creation and cloud access require an internet connection. Offline shared-shop sales have separate syncing rules."
          : "Your owner account must be verified before first opening this device's ledger. After verification, the device ledger works offline. Local records stay in this browser and are not automatically uploaded."}</p>
      </div>
      <div className="tb-welcome-visual" aria-label="Illustrative preview of Tallybook's business dashboard; not real financial data">
        <div className="tb-welcome-orbit tb-welcome-orbit-one" aria-hidden="true"/>
        <div className="tb-welcome-orbit tb-welcome-orbit-two" aria-hidden="true"/>
        <div className="tb-welcome-phone">
          <div className="tb-welcome-phone-notch" aria-hidden="true"/>
          <div className="tb-welcome-phone-screen">
            <div className="tb-welcome-phone-status"><span>9:41</span><span>▰ ▰ ▰</span></div>
            <div className="tb-welcome-phone-heading"><span><small>Your workspace</small><strong>Good morning ✦</strong></span><span className="tb-welcome-avatar" aria-hidden="true">TB</span></div>
            <div className="tb-welcome-phone-till">
              <span>YOUR TILL · ILLUSTRATION</span><strong>Ready for today</strong>
              <small>Real totals appear after your first sale</small>
              <div className="tb-welcome-mini-graph" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/></div>
            </div>
            <div className="tb-welcome-phone-metrics">
              <div><ShoppingBag size={17}/><small>Sales</small><strong>Track</strong></div>
              <div><Package size={17}/><small>Stock</small><strong>Manage</strong></div>
              <div><UsersRound size={17}/><small>Team</small><strong>Organize</strong></div>
            </div>
            <div className="tb-welcome-phone-action"><CheckCircle2 size={18}/><span><strong>Make every day count</strong><small>Sell. Track. Understand.</small></span><ArrowRight size={16}/></div>
            <div className="tb-welcome-phone-section"><strong>Quick actions</strong><span>Sales · Products · Reports</span></div>
          </div>
        </div>
        <div className="tb-welcome-floating-note"><CheckCircle2 size={18}/><span><strong>Keep selling</strong><small>Built around your day</small></span></div>
      </div>
    </div>
    <div className="tb-welcome-footer">
      <span>One business workspace. Every essential tool.</span>
      <span>{shop ? "Account first · Owner or employee next" : "Local ledger or shared shop · You choose"}</span>
    </div>
  </section>;
}
