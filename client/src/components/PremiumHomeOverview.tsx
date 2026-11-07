import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BarChart3, CalendarDays, CheckCircle2, ChevronDown, Circle, CircleDollarSign, GraduationCap, Lightbulb, Package, ShoppingCart, Truck, UsersRound, WalletCards, Zap } from "lucide-react";
import { getDashboardSummary, getBusinessHealthSummary, type DashboardSummary } from "@/features/reports/reports";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { hasReportsExplored, type SetupCounts } from "@/features/business/setupProgress";
import "./PremiumHome.css";

interface Props { companyId: string; companyName: string; currency: string; country: string; online: boolean; counts: SetupCounts | null; }
const actions = [
  { href:"/sales", title:"Make a Sale (POS)", detail:"Start a new sale", Icon:ShoppingCart },
  { href:"/inventory", title:"Add a Product", detail:"Build your inventory", Icon:Package },
  { href:"/customers", title:"Add a Customer", detail:"Create a customer record", Icon:UsersRound },
  { href:"/purchases", title:"Record a Purchase", detail:"Add supplier purchases", Icon:Truck },
  { href:"/reports", title:"View Reports", detail:"Check your business performance", Icon:BarChart3 },
];
const steps = [
  { title:"Set up your business", href:"/business", detail:"Add your business details", cta:"Review setup", Icon:GraduationCap },
  { title:"Add your products", href:"/inventory", detail:"Create your product inventory", cta:"Add Products", Icon:Package },
  { title:"Add your customers", href:"/customers", detail:"Create customer records", cta:"Add Customers", Icon:UsersRound },
  { title:"Make your first sale", href:"/sales", detail:"Try a test sale to get familiar", cta:"Make a Sale", Icon:ShoppingCart },
  { title:"Explore reports", href:"/reports", detail:"Check your sales and inventory", cta:"View Reports", Icon:BarChart3 },
];
export function PremiumHomeOverview({companyId,companyName,currency,country,online,counts}:Props) {
  const [summary,setSummary] = useState<DashboardSummary|null>(null);
  const [error,setError] = useState(false);
  const [expensesToday,setExpensesToday] = useState<number|null>(null);
  useEffect(()=>{
    let active=true;
    const load=()=>{void getDashboardSummary().then(data=>{if(active){setSummary(data);setError(false);}}).catch(()=>{if(active){setSummary(null);setError(true);}});};
    const loadExpenses=()=>{void getBusinessHealthSummary("today").then(data=>{if(active)setExpensesToday(data.expensesMinor);}).catch(()=>{if(active)setExpensesToday(null);});};
    load();loadExpenses();window.addEventListener("focus",load);window.addEventListener("focus",loadExpenses);
    return ()=>{active=false;window.removeEventListener("focus",load);window.removeEventListener("focus",loadExpenses);};
  },[companyId]);
  const done=[true,Boolean(counts?.products),Boolean(counts?.customers),Boolean(counts?.sales),hasReportsExplored(companyId)];
  const completed=done.filter(Boolean).length;
  const max=Math.max(10000,...(summary?.trend.map(p=>p.salesMinor)??[]));
  const axisValue=(fraction:number)=>formatMinorAmount(Math.round(max*fraction),currency);
  const sevenDayTotal = summary?.trend.reduce((total, day) => total + day.salesMinor, 0) ?? null;
  const cards=[
    {title:"Collected today",value:summary?formatMinorAmount(summary.todayMoneyReceivedMinor,currency):"—",detail:"Payments recorded today",Icon:CircleDollarSign,color:"#0b806d"},
    {title:"Receivables",value:summary?formatMinorAmount(summary.outstandingDebtMinor,currency):"—",detail:"Customer balances",Icon:WalletCards,color:"#137e7b"},
    {title:"Products",value:counts?String(counts.products):"—",detail:"In this device's catalogue",Icon:Package,color:"#288b79"},
    {title:"Expenses today",value:expensesToday!==null?formatMinorAmount(expensesToday,currency):"—",detail:"Recorded business expenses",Icon:ShoppingCart,color:"#b68344"},
  ];
  return <div className="premium-home tb-reference-dashboard">
    <div className="premium-main">
      <header className="premium-welcome tb-dashboard-welcome">
        <div>
          <span className="tb-dashboard-kicker">OPERATIONS · YOUR BUSINESS</span>
          <h1>Good to see you</h1>
          <p><strong>{companyName}</strong> · {country} · {currency}</p>
          <p className="premium-identity">{online ? "Offline-first device ledger" : "Offline — records saved on this device"}</p>
        </div>
        <div className="premium-date"><strong><CalendarDays size={15} style={{display:"inline",marginRight:7}}/>{new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric",year:"numeric"})}</strong><small>Local business overview</small></div>
      </header>
      <nav className="tb-dashboard-shortcuts" aria-label="Quick business actions">
        <Link href="/sales" className="tb-dashboard-open-pos"><ShoppingCart size={17} aria-hidden="true"/> Open POS</Link>
        <Link href="/reports" className="tb-dashboard-pill"><BarChart3 size={16} aria-hidden="true"/> Sales & reports</Link>
        <Link href="/inventory" className="tb-dashboard-pill"><Package size={16} aria-hidden="true"/> Add product</Link>
      </nav>
      <section className="tb-dashboard-till" aria-labelledby="tb-till-heading">
        <span id="tb-till-heading" className="tb-dashboard-till-kicker">TODAY AT THE TILL</span>
        <strong className="tb-dashboard-till-total">{summary ? formatMinorAmount(summary.todaySalesMinor,currency) : "—"}</strong>
        <p>{summary ? `${summary.todayTransactions} recorded ${summary.todayTransactions===1?"sale":"sales"} · Collected ${formatMinorAmount(summary.todayMoneyReceivedMinor,currency)}` : error ? "Today's totals are unavailable. Your saved records have not changed." : "Loading your saved sales…"}</p>
        <div className="tb-dashboard-till-cells">
          <div><span>LAST 7 DAYS</span><strong>{sevenDayTotal===null ? "—" : formatMinorAmount(sevenDayTotal,currency)}</strong><small>Recorded sales</small></div>
          <div><span>OPEN BALANCE</span><strong>{summary ? formatMinorAmount(summary.outstandingDebtMinor,currency) : "—"}</strong><small>Customer receivables</small></div>
        </div>
      </section>
      <section className="premium-kpis tb-dashboard-metrics" aria-label="Business key metrics">{cards.map(({title,value,detail,Icon,color})=><article className="premium-card premium-kpi" key={title}><span className="premium-kpi-icon" style={{background:color}}><Icon size={23}/></span><div><h3>{title}</h3><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
      <div className="premium-middle">
        <section className="premium-card premium-chart" aria-label="Sales overview"><div className="premium-chart-header"><h2 className="premium-section-title"><BarChart3 size={22} color="#0c8372"/>Sales Overview</h2><Link href="/reports" className="premium-chart-period" aria-label="Open reports for the last seven days">Last 7 days <ChevronDown size={15}/></Link></div>{error?<p role="alert">Sales overview is temporarily unavailable. Saved records have not changed.</p>:summary?<><div className="premium-line-chart" aria-label="Last seven days of completed sales"><svg viewBox="0 0 700 250" preserveAspectRatio="none" role="img" aria-label="Sales line chart over the past seven days with labeled sales axis"><defs><linearGradient id="premiumSalesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#11917b" stopOpacity=".18"/><stop offset="100%" stopColor="#11917b" stopOpacity="0"/></linearGradient></defs>{[0,0.25,0.5,0.75,1].map(fraction=><g key={fraction}><line x1="45" x2="688" y1={220-fraction*175} y2={220-fraction*175} stroke="#e8eff8" strokeWidth="1"/><text x="36" y={224-fraction*175} textAnchor="end" fontSize="12" fill="#64748b">{Math.round(max*fraction/100).toLocaleString()}</text></g>)}<polygon points={`45,230 ${summary.trend.map((point,i)=>`${45+i*(643/6)},${220-(point.salesMinor/max)*175}`).join(" ")} 688,230`} fill="url(#premiumSalesArea)"/><polyline points={summary.trend.map((point,i)=>`${45+i*(643/6)},${220-(point.salesMinor/max)*175}`).join(" ")} fill="none" stroke="#087f71" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{summary.trend.map((point,i)=><circle key={point.dateKey} cx={45+i*(643/6)} cy={220-(point.salesMinor/max)*175} r="5" fill="#fff" stroke="#087f71" strokeWidth="3"><title>{point.label}: {formatMinorAmount(point.salesMinor,currency)}</title></circle>)}</svg><div className="premium-line-labels">{summary.trend.map((point,i)=><small key={point.dateKey} style={{left:`${(45+i*(643/6))/7}%`}}>{new Date(`${point.dateKey}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</small>)}</div>{summary.trend.every(point=>point.salesMinor===0)&&<div className="premium-chart-empty-note" role="status"><strong>No sales yet</strong><span>Start making sales to see your chart here.</span></div>}</div></>:<p role="status">Loading sales overview…</p>}</section>
        <section className="premium-card" aria-labelledby="home-actions-title"><h2 className="premium-section-title" id="home-actions-title"><Zap size={22} color="#0c8372"/>Quick actions</h2><div className="premium-action-list">{actions.map(({href,title,detail,Icon})=><Link href={href} className="premium-action" key={href}><span><Icon size={23}/></span><span>{title}<small>{detail}</small></span></Link>)}</div></section>
      </div>
      <section id="getting-started" className="premium-card premium-setup" aria-label="Getting started"><div className="premium-setup-head"><div><h2 className="premium-section-title" style={{marginBottom:4}}><CheckCircle2 color="#0c8372"/>Getting Started with Tallybook</h2><p style={{fontSize:12,color:"#64748b"}}>Complete these steps to set up your business</p></div><div style={{fontSize:11,whiteSpace:"nowrap"}}>{completed} of 5 completed<div className="premium-progress" role="progressbar" aria-label="Business setup progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={5}><span style={{width:`${completed*20}%`}}/></div></div></div><div className="premium-step-grid">{steps.map(({title,href,detail,cta,Icon},i)=><Link key={title} href={href} className={`premium-step ${done[i]?"done":""}`}><span className="premium-step-number">{done[i]?<CheckCircle2 size={19}/>:i+1}</span><Icon size={25} color="#73839a"/><strong>{title}</strong><small>{detail}</small><span className="premium-step-cta">{done[i]?"Completed":cta}</span></Link>)}</div></section>
    </div>
    <aside className="premium-side" aria-label="Beginner help"><section className="premium-card"><h2><Lightbulb size={20} color="#f0a520" style={{display:"inline",marginRight:8}}/>Tips for Beginners</h2>{steps.map((step,i)=><Link href={step.href} className="premium-tip" key={step.title}>{done[i]?<CheckCircle2 size={17} color="#19ad77"/>:<Circle size={17}/>}<span>{step.title}</span></Link>)}</section><section className="premium-card premium-side-help"><GraduationCap size={37} color="#1b72d5" style={{margin:"0 auto 10px"}}/><h2>Need help getting started?</h2><p>Explore the business setup guide and learn the basics.</p><Link href="/business">Continue Setup →</Link></section></aside>
  </div>;
}
