import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import { type ReportPeriod } from '@/features/reports/reports';
import { getInsightFindings } from '@/features/insights/insightEvidence';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { evaluateAdvisoryRules, type LocalInsight, type AdvancedInsight } from '@/features/insights/localInsights.mjs';

export default function InsightsPage() {
  const {profile, activeCompanyId} = useBusinessProfile();
  const [period,setPeriod] = useState<ReportPeriod>('last7');
  const [items,setItems] = useState<(LocalInsight | AdvancedInsight)[]>([]);
  const [reviewRules,setReviewRules] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const refresh = useCallback(async () => {
    setItems([]);setError('');
    if (!profile || !activeCompanyId) return;
    const expectedCompany = activeCompanyId;
    setLoading(true);
    try { const findings = await getInsightFindings(period); if(expectedCompany === getActiveBusinessProfileId()) setItems(findings); }
    catch(e) { if(expectedCompany === getActiveBusinessProfileId()) setError(e instanceof Error ? e.message : 'Could not read your local reports'); }
    finally {if(expectedCompany === getActiveBusinessProfileId()) setLoading(false);}
  },[profile,activeCompanyId,period]);
  useEffect(()=>{void refresh();},[refresh]);
  if(!profile) return <main className="p-6"><h1 className="text-2xl font-bold">Business insights</h1><p>Set up a business before reading local insights.</p><Link href="/business">Business setup</Link></main>;
  return <main className="p-4 md:p-8 space-y-5 max-w-4xl mx-auto"><header className="space-y-2"><p className="text-sm text-muted-foreground">Stage 11 · local evidence, no automated financial changes</p><h1 className="text-3xl font-bold">Business insights</h1><p>These observations come only from records saved for the active business on this device. They are not predictions, profit statements, or automatic decisions.</p></header><div className="flex flex-wrap gap-2 items-center"><label htmlFor="insights-period">Review period</label><select id="insights-period" className="border rounded p-2" value={period} onChange={e=>setPeriod(e.target.value as ReportPeriod)}><option value="today">Today</option><option value="last7">Last 7 days</option><option value="all">All saved history</option></select><button type="button" className="border rounded p-2" onClick={()=>void refresh()}>Refresh</button><label className="flex gap-2 items-center"><input type="checkbox" checked={reviewRules} onChange={e=>setReviewRules(e.target.checked)}/>Show review-only automation suggestions</label></div>{loading?<p role="status">Reading local business records…</p>:error?<p role="alert">{error}</p>:<section className="space-y-3" aria-label="Evidence-backed insights">{items.map(item=><article key={item.id} className="rounded border p-4 space-y-2"><h2 className="text-lg font-semibold">{item.title}</h2><p>{item.evidence}</p><p className="text-sm text-muted-foreground">{item.action}</p><Link href={item.href} className="underline">Open supporting records</Link></article>)}</section>}<section aria-label="Human-reviewed automation" className="text-sm">{reviewRules ? <p>{evaluateAdvisoryRules(items.filter((i): i is AdvancedInsight => ["reorder","demand","repayment","expiry"].includes(i.kind)),{enabled:true}).length} advisory rules available for manual review. No messages, orders, transfers or payments will be sent.</p> : null}</section><p className="text-sm text-muted-foreground">Low-stock and customer-balance observations use current saved records, even when the sales period is limited. No inventory reservation, payment, or automated reorder is performed.</p></main>;
}
