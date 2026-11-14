/**
 * Tallybook's public landing page. It only links to existing routes: no mock sign-in, no demo sales,
 * no fabricated financial amounts or database writes. Everything it claims is something the app does.
 */
import {
  ArrowRight, BarChart3, CheckCircle2, ChevronDown, CloudOff, HandCoins, Landmark, Menu, MessageCircle,
  Package, Receipt, ShieldCheck, ShoppingBag, Smartphone, Store, UsersRound, WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import "./TallybookWelcome.css";

type WelcomeVariant = "device" | "shop";

const NAV = [
  ["#features", "Features"], ["#pillars", "Three pillars"], ["#how", "How it works"], ["#ways", "How to run"], ["#roles", "Owner and team"], ["#faq", "Questions"],
] as const;

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <ShoppingBag size={22} />, title: "Sell at the till", text: "Search or scan, take cash, mobile money or card, and split a payment when a customer pays two ways." },
  { icon: <Package size={22} />, title: "Know your stock", text: "Counts, goods received and low-stock warnings, with a record of every change. Nothing disappears quietly." },
  { icon: <HandCoins size={22} />, title: "Customers and credit", text: "See who owes what, record repayments, and send a statement on WhatsApp." },
  { icon: <Receipt size={22} />, title: "Receipts people keep", text: "Share, print or send a receipt or payment confirmation straight from the sale." },
  { icon: <BarChart3 size={22} />, title: "Daily report and profit", text: "What sold, what came in by payment method, the cash that should be in the till and, for owners, profit." },
  { icon: <Landmark size={22} />, title: "Accounts that reconcile", text: "Follow cash, mobile money, card and bank, then count what is really there and see over or short." },
];

const PILLARS:{icon:ReactNode;eyebrow:string;title:string;text:string;points:string[]}[]=[
 {icon:<ShoppingBag size={23}/>,eyebrow:"01 / SELL",
  title:"Sales & receipts",
  text:"Record a sale, account for how it was paid, and produce a receipt. Tallybook records payment methods; it never moves money.",
  points:["Search or scan products","Cash, mobile money and card records","Receipts, returns and sales history"]},
 {icon:<Package size={23}/>,eyebrow:"02 / CONTROL",
  title:"Stock & purchasing",
  text:"Track stock movements and supplier obligations with records tied to actual shops, products and purchases.",
  points:["Low-stock visibility and physical counts","Purchase orders and partial receipts","Transfers between stores"]},
 {icon:<BarChart3 size={23}/>,eyebrow:"03 / UNDERSTAND",
  title:"Owners & their teams",
  text:"Give each person only the shop access they need and review recorded business activity through owner-only reporting.",
  points:["Owner-issued employee invitations","Sales and expense reports","Supplier and customer balances"]},
];

const STEPS: { title: string; text: string }[] = [
  { title: "Set up your shop", text: "Name it, choose your currency and add your products. Stores, a team and opening stock can come later." },
  { title: "Sell and record", text: "Every sale writes a receipt and updates stock together, so the shelf and the books agree." },
  { title: "Close the day with confidence", text: "Read the daily report, log what you spent and check the cash against the till." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Does it work without internet?", a: "The device ledger does. Once your verified owner account has opened it, sales, stock and customers work with no connection and stay in your browser. The shared shop is cloud-based and works best online; the app explains how it behaves when the signal drops." },
  { q: "Where is my data kept?", a: "A device ledger lives in the browser on that device and is never uploaded automatically. A shared shop lives in the shop's private database and is reached only through the app's permission checks. Keep an encrypted backup file of your device ledger." },
  { q: "How do my employees join?", a: "The owner can make a private eight-character join code from Team, or target a one-time invitation to the employee\'s verified Tallybook account ID. A code works once and expires after 24 hours. An email address or employee number alone cannot grant access. New employees start with no special permissions." },
  { q: "Does Tallybook take payments?", a: "No. Cash, mobile money and card are recorded as how the customer paid. Tallybook never moves money or talks to a payment provider." },
  { q: "Can I get my records out?", a: "Yes. Back up your device ledger to an encrypted file, export products and reports to CSV, and share customer statements and receipts." },
  { q: "Do I need to install anything?", a: "No. It runs in your phone or computer's browser, and you can add it to your home screen so it opens like an app." },
];

const OWNER = [
  "Sees profit, accounts, expenses and reports",
  "Adds products, stores and team members",
  "Approves refund requests and sets who may count stock",
  "Makes join codes for new employees",
];
const ATTENDANT = [
  "Sells from their own phone, in their own store",
  "Sees their own sales and their own day",
  "Counts stock and receives goods only if you allow it",
  "Never sees costs or profit",
];

function Check({ children }: { children: ReactNode }) {
  return <li><CheckCircle2 size={18} aria-hidden="true" /><span>{children}</span></li>;
}

export function TallybookWelcome({ variant = "device" }: { variant?: WelcomeVariant }) {
  const shop = variant === "shop";
  return <div className="tb-welcome">
    <a className="tbl-skip" href="#tbl-content">Skip to content</a>

    <header className="tbl-header">
      <div className="tbl-wrap tbl-header-inner">
        <Link href="/welcome" className="tbl-brand" aria-label="Tallybook home">
          <span className="tbl-brand-mark" aria-hidden="true"><Store size={20} strokeWidth={2.25} /></span>
          <span><strong>Tallybook</strong><small>by Alchemy</small></span>
        </Link>
        <nav className="tbl-nav" aria-label="Page sections">
          {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className="tbl-header-actions">
          <Link href="/signin" className="tbl-btn tbl-btn-outline tbl-btn-sm">Sign in</Link>
          <Link href="/signin" className="tbl-btn tbl-btn-primary tbl-btn-sm tbl-hide-small">Get started</Link>
          <details className="tbl-menu">
            <summary aria-label="Open menu"><Menu size={20} aria-hidden="true" /></summary>
            <nav aria-label="Page sections (menu)">
              {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
              <Link href="/signin">Get started</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>

    <div id="tbl-content">
      <section className="tbl-hero" aria-labelledby="tb-welcome-title">
        <div className="tbl-wrap tbl-hero-grid">
          <div className="tbl-hero-copy">
            <p className="tbl-pill"><span aria-hidden="true" /> Made for shops that cannot afford downtime</p>
            <h1 id="tb-welcome-title">Your business.<em>Beautifully in hand.</em></h1>
            <p className="tbl-lead">
              Keep sales, products and customers organized, even when your connection is unreliable.
              {shop ? " Create an account to run a shared shop with your team." : " Your verified owner account can open a private workspace on this device, or you can run a shared shop with your team."}
            </p>
            <div className="tbl-ctas">
              <Link href={shop ? "/signin" : "/business"} className="tbl-btn tbl-btn-primary">
                {shop ? "Create your account" : "Set up this device"} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href={shop ? "/signin" : "/shop"} className="tbl-btn tbl-btn-outline">
                {shop ? "I already have an account" : "Use a shared shop"} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="tbl-assurances" aria-label="Tallybook capabilities">
              <li><CloudOff size={17} aria-hidden="true" /> {shop ? "Pending shared-shop sale recovery" : "Offline-first private ledger"}</li>
              <li><ShieldCheck size={17} aria-hidden="true" /> Owner-controlled access</li>
              <li><UsersRound size={17} aria-hidden="true" /> Team shop option</li>
            </ul>
            <p className="tbl-disclosure">{shop
              ? "Account creation and cloud access require an internet connection. Offline shared-shop sales have separate syncing rules."
              : "Your owner account must be verified before first opening this device's ledger. After verification, the device ledger works offline. Local records stay in this browser and are not automatically uploaded."}</p>
          </div>

          <div className="tbl-hero-art" role="img" aria-label="Illustrative preview of Tallybook's business dashboard; not real financial data">
            <div className="tbl-orbit tbl-orbit-one" aria-hidden="true" />
            <div className="tbl-orbit tbl-orbit-two" aria-hidden="true" />
            <div className="tb-welcome-phone" aria-hidden="true">
              <div className="tbl-notch" />
              <div className="tbl-screen">
                <div className="tbl-screen-top"><span>9:41</span><span className="tbl-bars"><i /><i /><i /></span></div>
                <div className="tbl-screen-greet"><span><small>Your workspace</small><strong>Good morning</strong></span><span className="tbl-avatar">TB</span></div>
                <div className="tbl-till">
                  <small>YOUR TILL · ILLUSTRATION</small>
                  <strong>Ready for today</strong>
                  <span>Real totals appear after your first sale</span>
                  <div className="tbl-graph"><i /><i /><i /><i /><i /><i /><i /></div>
                </div>
                <div className="tbl-tiles">
                  <div><ShoppingBag size={16} /><small>Sales</small><strong>Track</strong></div>
                  <div><Package size={16} /><small>Stock</small><strong>Manage</strong></div>
                  <div><UsersRound size={16} /><small>Team</small><strong>Organize</strong></div>
                </div>
                <div className="tbl-screen-action"><CheckCircle2 size={18} /><span><strong>Make every day count</strong><small>Sell. Track. Understand.</small></span></div>
              </div>
            </div>
            <div className="tbl-float tbl-float-top"><span className="tbl-float-icon"><CheckCircle2 size={18} /></span><span><strong>{shop ? "Sales awaiting confirmation" : "Saved on this device"}</strong><small>{shop ? "Reconcile after reconnecting" : "Private offline records"}</small></span></div>
            <div className="tbl-float tbl-float-bottom"><span className="tbl-float-icon"><WifiOff size={18} /></span><span><strong>{shop ? "Shared shop uses the cloud" : "Works without signal"}</strong><small>{shop ? "Server confirms stock and sales" : "After the first verified opening"}</small></span></div>
          </div>
        </div>
      </section>

      <div className="tbl-strip" aria-label="What Tallybook covers">
        <div className="tbl-wrap"><ul>
          {["Point of sale", "Stock", "Customers on credit", "Receipts", "Reports", "Team roles"].map(item => <li key={item}>{item}</li>)}
        </ul></div>
      </div>

      <section className="tbl-section" id="features" aria-labelledby="tbl-features-title">
        <div className="tbl-wrap">
          <div className="tbl-heading tbl-heading-center">
            <p className="tbl-eyebrow">The business toolkit</p>
            <h2 id="tbl-features-title">Everything a shop does in a day, in one place.</h2>
            <p className="tbl-sub">From the first sale of the morning to counting the till at night, with records that agree with each other.</p>
          </div>
          <ul className="tbl-feature-grid">
            {FEATURES.map(f => <li key={f.title} className="tbl-card">
              <span className="tbl-icon" aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>)}
          </ul>
        </div>
      </section>

      <section className="tbl-section tbl-pillars" id="pillars" aria-labelledby="tbl-pillars-title">
        <div className="tbl-wrap">
          <div className="tbl-heading tbl-heading-center">
            <p className="tbl-eyebrow">The three essentials</p>
            <h2 id="tbl-pillars-title">A sharper way to run every working day.</h2>
            <p className="tbl-sub">Built for the work a shop actually does—not imaginary figures, payment promises or complicated setups.</p>
          </div>
          <div className="tbl-pillar-grid">
            {PILLARS.map(pillar=><article className="tbl-pillar" key={pillar.eyebrow}>
              <span className="tbl-pillar-index">{pillar.eyebrow}</span>
              <div className="tbl-pillar-icon" aria-hidden="true">{pillar.icon}</div>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
              <ul>{pillar.points.map(item=><Check key={item}>{item}</Check>)}</ul>
            </article>)}
          </div>
          <p className="tbl-pillar-note">Local device ledgers and shared shops are separate workspaces. Device records are not automatically uploaded or merged into a cloud shop.</p>
          <div className="tbl-pillars-action">
            <Link href="/signin" className="tbl-btn tbl-btn-primary">Explore your shop account <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className="tbl-section tbl-alt" id="how" aria-labelledby="tbl-how-title">
        <div className="tbl-wrap tbl-how">
          <div>
            <p className="tbl-eyebrow">How it works</p>
            <h2 id="tbl-how-title">From your shelf to a closed day.</h2>
            <ol className="tbl-steps">
              {STEPS.map((s, i) => <li key={s.title}><span className="tbl-step-no" aria-hidden="true">{i + 1}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>)}
            </ol>
          </div>
          <div className="tbl-flow" aria-label="How one sale is recorded">
            <p className="tbl-flow-title">One sale, recorded once</p>
            <ol>
              <li><span className="tbl-flow-icon"><ShoppingBag size={18} aria-hidden="true" /></span><div><strong>Choose items</strong><small>Search, scan or tap a product</small></div></li>
              <li><span className="tbl-flow-icon"><HandCoins size={18} aria-hidden="true" /></span><div><strong>Take payment</strong><small>Cash, mobile money, card or credit</small></div></li>
              <li><span className="tbl-flow-icon"><Receipt size={18} aria-hidden="true" /></span><div><strong>Receipt and stock</strong><small>Both update in the same step</small></div></li>
              <li><span className="tbl-flow-icon"><MessageCircle size={18} aria-hidden="true" /></span><div><strong>Share it</strong><small>WhatsApp, print or save</small></div></li>
            </ol>
          </div>
        </div>
      </section>

      <section className="tbl-section" id="ways" aria-labelledby="tbl-ways-title">
        <div className="tbl-wrap">
          <div className="tbl-heading tbl-heading-center">
            <p className="tbl-eyebrow">Two ways to run</p>
            <h2 id="tbl-ways-title">Start on one phone. Grow into a team.</h2>
            <p className="tbl-sub">Choose what fits your shop today. You are not locked in.</p>
          </div>
          <div className="tbl-two">
            <article className="tbl-card tbl-way">
              <span className="tbl-icon" aria-hidden="true"><Smartphone size={22} /></span>
              <h3>On this device</h3>
              <p>A private ledger that lives in your browser. Ideal for one owner and one till.</p>
              <ul><Check>Works fully offline once opened</Check><Check>Protected by your owner PIN</Check><Check>Encrypted backup you control</Check></ul>
            </article>
            <article className="tbl-card tbl-way tbl-way-feature">
              <span className="tbl-icon" aria-hidden="true"><UsersRound size={22} /></span>
              <h3>A shared shop</h3>
              <p>The owner and attendants each use their own phone, across one or more stores.</p>
              <ul><Check>Roles and permissions per person</Check><Check>Several stores, one set of books</Check><Check>Quotations, refunds and accounts</Check></ul>
            </article>
          </div>
        </div>
      </section>

      <section className="tbl-section tbl-alt" id="roles" aria-labelledby="tbl-roles-title">
        <div className="tbl-wrap">
          <div className="tbl-heading tbl-heading-center">
            <p className="tbl-eyebrow">Owner and team</p>
            <h2 id="tbl-roles-title">Everyone sees what they need. No more.</h2>
            <p className="tbl-sub">Costs, profit and money stay with the owner. Attendants get a clean till.</p>
          </div>
          <div className="tbl-two">
            <article className="tbl-card tbl-role">
              <p className="tbl-role-tag">Owner</p>
              <ul>{OWNER.map(item => <Check key={item}>{item}</Check>)}</ul>
            </article>
            <article className="tbl-card tbl-role">
              <p className="tbl-role-tag tbl-role-tag-soft">Attendant</p>
              <ul>{ATTENDANT.map(item => <Check key={item}>{item}</Check>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section className="tbl-section" id="faq" aria-labelledby="tbl-faq-title">
        <div className="tbl-wrap tbl-faq-wrap">
          <div className="tbl-heading tbl-heading-center">
            <p className="tbl-eyebrow">Questions</p>
            <h2 id="tbl-faq-title">Straight answers.</h2>
          </div>
          <div className="tbl-faq">
            {FAQ.map(item => <details key={item.q}>
              <summary><span>{item.q}</span><ChevronDown size={20} aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>)}
          </div>
        </div>
      </section>

      <section className="tbl-final" aria-labelledby="tbl-final-title">
        <div className="tbl-wrap">
          <h2 id="tbl-final-title">Run your shop with clearer books.</h2>
          <p>Start with your account. Set up in minutes, sell today.</p>
          <div className="tbl-ctas tbl-ctas-center">
            <Link href="/signin" className="tbl-btn tbl-btn-light">Start with your account <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/signin" className="tbl-btn tbl-btn-ghost">Sign in to your shop</Link>
          </div>
        </div>
      </section>
    </div>

    <footer className="tbl-footer">
      <div className="tbl-wrap tbl-footer-inner">
        <span className="tbl-brand tbl-brand-light"><span className="tbl-brand-mark" aria-hidden="true"><Store size={18} strokeWidth={2.25} /></span><span><strong>Tallybook</strong><small>by Alchemy</small></span></span>
        <p>{shop ? "Account first, then owner or employee." : "Local ledger or shared shop. You choose."}</p>
        <nav aria-label="Footer"><Link href="/signin">Sign in</Link><a href="#features">Features</a><a href="#faq">Questions</a></nav>
      </div>
    </footer>
  </div>;
}
