import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BarChart3, CalendarDays, CheckCircle2, Circle, CircleDollarSign, GraduationCap, Lightbulb, Package, ShoppingCart, Truck, UsersRound, WalletCards, Zap } from "lucide-react";
import { TodayDashboard } from "@/components/TodayDashboard";
import { getDashboardSummary, type DashboardSummary } from "@/features/reports/reports";
import { formatMinorAmount } from "@/features/inventory/inventory";
import type { SetupCounts } from "@/features/business/setupProgress";
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
  { title:"Set up your business", href:"/business", detail:"Add your business details", Icon:GraduationCap },
  { title:"Add your products", href:"/inventory", detail:"Create your product inventory", Icon:Package },
  { title:"Add your customers", href:"/customers", detail:"Create customer records", Icon:UsersRound },
  { title:"Make your first sale", href:"/sales", detail:"Try a test sale to get familiar", Icon:ShoppingCart },
  { title:"Explore reports", href:"/reports", detail:"Check your sales and inventory", Icon:BarChart3 },
];
export function PremiumHomeOverview({companyId,companyName,currency,country,online,counts}:Props) {
  const [summary,setSummary] = useState<DashboardSummary|null>(null);
  const [error,setError] = useState(false);
  useEffect(()=>{
    let active=true;
    const load=()=>{void getDashboardSummary().then(data=>{if(active){setSummary(data);setError(false);}}).catch(()=>{if(active){setSummary(null);setError(true);}});};
    load();window.addEventListener("focus",load);
    return ()=>{active=false;window.removeEventListener("focus",load);};
  },[companyId]);
  const done=[true,Boolean(counts?.products),Boolean(counts?.customers),Boolean(counts?.sales),Boolean(counts?.sales)];
  const completed=done.filter(Boolean).length;
  const max=Math.max(1,...(summary?.trend.map(p=>p.salesMinor)??[]));
  const cards=[
    {title:"Sales Today",value:summary?formatMinorAmount(summary.todaySalesMinor,currency):"—",detail:summary?`${summary.todayTransactions} transactions`:"Loading records",Icon:CircleDollarSign,color:"#1eb77d"},
    {title:"Total Products",value:counts?String(counts.products):"—",detail:"In inventory",Icon:Package,color:"#2786e8"},
    {title:"Customers",value:counts?String(counts.customers):"—",detail:"Total customers",Icon:UsersRound,color:"#f49a24"},
    {title:"Collected Today",value:summary?formatMinorAmount(summary.todayMoneyReceivedMinor,currency):"—",detail:"Payments received",Icon:WalletCards,color:"#df4d6a"},
  ];
  return <div className="premium-home">
    <div className="premium-main">
      <header className="premium-welcome"><div><h1>Welcome to Tallybook! 👋</h1><p>Here's an overview of your business today. Let's get you started.</p><p className="premium-identity"><strong>{companyName}</strong> · <span>{country} · {currency}</span> · {online?"Saved locally":"Offline — saved locally"}</p></div><div className="premium-date"><strong><CalendarDays size={15} style={{display:"inline",marginRight:7}}/>{new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric",year:"numeric"})}</strong><small>Local business overview</small></div></header>
      <section className="premium-kpis" aria-label="Business key metrics">{cards.map(({title,value,detail,Icon,color})=><article className="premium-card premium-kpi" key={title}><span className="premium-kpi-icon" style={{background:color}}><Icon size={23}/></span><div><h3>{title}</h3><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
      <div className="premium-middle">
        <section className="premium-card premium-chart" aria-label="Sales overview"><h2 className="premium-section-title"><BarChart3 size={22} color="#2583dc"/>Sales Overview</h2>{error?<p role="alert">Sales overview is temporarily unavailable. Saved records have not changed.</p>:summary?<><div className="premium-chart-area" aria-label="Last seven days of completed sales">{summary.trend.map(point=><div className="premium-chart-col" key={point.dateKey}><span className="premium-chart-bar" style={{height:`${Math.max(1,point.salesMinor/max*87)}%`}} title={`${point.label}: ${formatMinorAmount(point.salesMinor,currency)}`}/><small>{point.label}</small></div>)}</div>{summary.trend.every(point=>point.salesMinor===0)&&<p className="premium-empty">No sales yet. Start making sales to see your chart here.</p>}</>:<p role="status">Loading sales overview…</p>}</section>
        <section className="premium-card" aria-labelledby="home-actions-title"><h2 className="premium-section-title" id="home-actions-title"><Zap size={22} color="#2685df"/>Quick actions</h2><div className="premium-action-list">{actions.map(({href,title,detail,Icon})=><Link href={href} className="premium-action" key={href}><span><Icon size={23}/></span><span>{title}<small>{detail}</small></span></Link>)}</div></section>
      </div>
      <section className="premium-card premium-setup" aria-label="Getting started"><div className="premium-setup-head"><div><h2 className="premium-section-title" style={{marginBottom:4}}><CheckCircle2 color="#2384d5"/>Getting Started with Tallybook</h2><p style={{fontSize:12,color:"#64748b"}}>Complete these steps to set up your business</p></div><div style={{fontSize:11,whiteSpace:"nowrap"}}>{completed} of 5 completed<div className="premium-progress" role="progressbar" aria-label="Business setup progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={5}><span style={{width:`${completed*20}%`}}/></div></div></div><div className="premium-step-grid">{steps.map(({title,href,detail,Icon},i)=><Link key={title} href={href} className={`premium-step ${done[i]?"done":""}`}><span className="premium-step-number">{done[i]?<CheckCircle2 size={19}/>:i+1}</span><Icon size={25} color="#73839a"/><strong>{title}</strong><small>{detail}</small></Link>)}</div></section>
      <div className="premium-detail"><TodayDashboard currency={currency} activeCompanyId={companyId}/></div>
    </div>
    <aside className="premium-side" aria-label="Beginner help"><section className="premium-card"><h2><Lightbulb size={20} color="#f0a520" style={{display:"inline",marginRight:8}}/>Tips for Beginners</h2>{steps.map((step,i)=><Link href={step.href} className="premium-tip" key={step.title}>{done[i]?<CheckCircle2 size={17} color="#19ad77"/>:<Circle size={17}/>}<span>{step.title}</span></Link>)}</section><section className="premium-card premium-side-help"><GraduationCap size={37} color="#1b72d5" style={{margin:"0 auto 10px"}}/><h2>Need help getting started?</h2><p>Explore the business setup guide and learn the basics.</p><Link href="/business">Continue Setup →</Link></section></aside>
  </div>;
}
