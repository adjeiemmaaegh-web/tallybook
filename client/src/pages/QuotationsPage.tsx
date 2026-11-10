import { calculateSaleTax, taxReviewKeyForSale } from "@/features/sales/tax";
import { confirmAction } from "@/lib/confirmAction";
import { businessDateTimeLabel } from "@/features/business/businessCalendar.mjs";
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import { getCustomerSnapshot } from '@/features/customers/customers';
import { getInventorySnapshot, formatMinorAmount } from '@/features/inventory/inventory';
import { createQuotation, listQuotations, setQuotationStatus, convertQuotationToSale, previewQuotationConversion, type Quotation } from '@/features/customers/quotations';
import { readQuotationHandoff, clearQuotationHandoff } from '@/features/customers/quotationHandoff';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { db } from '@/db/TallybookDB';
import type { StoreLocation } from '@/features/stores/storeDirectory';

type Pick = { productId: string; quantity: number };
export default function QuotationsPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [customers,setCustomers] = useState<{id:string;name:string}[]>([]);
  const [products,setProducts] = useState<Array<{id:string;name:string;sellingPriceMinor:number;ghanaTaxTreatment?: "standard" | "zero-rated" | "exempt"}>>([]);
  const [quotes,setQuotes] = useState<Quotation[]>([]);
  const [customerId,setCustomerId] = useState('');
  const [productId,setProductId] = useState('');
  const [quantity,setQuantity] = useState('1');
  const [lines,setLines] = useState<Pick[]>([]);
  const [busy,setBusy] = useState(false);
  const [storeMode,setStoreMode] = useState(false);
  const [locations,setLocations] = useState<StoreLocation[]>([]);
  const [conversionStoreId,setConversionStoreId] = useState("");
  useEffect(()=>{let live=true;setStoreMode(false);setLocations([]);setConversionStoreId("");if(!activeCompanyId)return;
    void Promise.all([db.storeStockModes.get(activeCompanyId),db.storeLocations.where("businessProfileId").equals(activeCompanyId).toArray()]).then(([mode,stores])=>{
      if(live){setStoreMode(Boolean(mode));setLocations(stores.filter(s=>s.status==="active"));}
    }).catch(()=>{if(live)toast.error("Cannot read store scope. Conversion may be blocked.");});
    return ()=>{live=false;};
  },[activeCompanyId]);
  const refresh = useCallback(async () => {
    const company = activeCompanyId;
    const [c,p,q] = await Promise.all([getCustomerSnapshot(),getInventorySnapshot(),listQuotations()]);
    if (company !== getActiveBusinessProfileId()) return;
    setCustomers(c.customers.filter(x=>x.status==='active').map(x=>({id:x.id,name:x.name})));
    setProducts(p.products.filter(x=>!x.archivedAt).map(x=>({id:x.id,name:x.name,sellingPriceMinor:x.sellingPriceMinor,ghanaTaxTreatment:x.ghanaTaxTreatment})));
    setQuotes(q);
  },[activeCompanyId]);
  useEffect(() => {
    setCustomerId(''); setProductId(''); setLines([]); setCustomers([]); setProducts([]); setQuotes([]);
    const token = new URLSearchParams(window.location.search).get('draft');
    if (!token || !activeCompanyId) return;
    const draft = readQuotationHandoff(token, activeCompanyId);
    if (!draft || draft.currency !== profile?.currency) { toast.error('This prepared quotation expired or belongs to another company. Start a new quotation.'); return; }
    setCustomerId(draft.customerId); setLines(draft.lines.map(({ productId, quantity }) => ({ productId, quantity })));
    toast.info('Prepared items loaded. Review the customer and current prices before saving.');
  }, [activeCompanyId, profile?.currency]);
  useEffect(()=>{void refresh().catch(e=>toast.error(e instanceof Error?e.message:'Could not load quotations.'));},[refresh,activeCompanyId]);
  const money = (v:number)=>formatMinorAmount(v,profile?.currency??'GHS');
  const subtotal = lines.reduce((sum,line)=>sum+(products.find(p=>p.id===line.productId)?.sellingPriceMinor??0)*line.quantity,0);
  const quoteTaxLines = lines.map(line => {
    const product = products.find(p => p.id === line.productId);
    return { productId: line.productId, amountMinor: (product?.sellingPriceMinor ?? 0) * line.quantity, treatment: product?.ghanaTaxTreatment };
  });
  let tax: ReturnType<typeof calculateSaleTax> = undefined;
  let taxError: string | null = null;
  try { tax = quoteTaxLines.length ? calculateSaleTax(quoteTaxLines, 0, profile?.taxPolicy) : undefined; }
  catch (cause) { taxError = cause instanceof Error ? cause.message : "Review product tax classifications."; }
  const total = tax?.totalMinor ?? subtotal;
  async function save(){if(!profile||!customerId||lines.length===0)return;setBusy(true);try {await createQuotation({taxReviewKey:taxReviewKeyForSale(profile.taxPolicy,quoteTaxLines),customerId,currency:profile.currency,lines:lines.map(line=>({...line,expectedPriceMinor:products.find(product=>product.id===line.productId)?.sellingPriceMinor}))});const token=new URLSearchParams(window.location.search).get('draft');if(token)clearQuotationHandoff(token);setLines([]);toast.success('Quotation saved as draft. No sale or stock movement was created.');await refresh();}catch(e){toast.error(e instanceof Error?e.message:'Unable to save quotation.');}finally{setBusy(false);}}
  async function advance(id:string,status:'issued'|'accepted'|'declined'){setBusy(true);try{await setQuotationStatus(id,status);await refresh();toast.success('Quotation status updated. No sale was recorded.');}catch(e){toast.error(e instanceof Error?e.message:'Unable to update quotation.');}finally{setBusy(false);}}
  async function convert(id:string){setBusy(true);try{if(storeMode&&!conversionStoreId)throw Error('Choose the store selling this quotation.');const preview=await previewQuotationConversion(id);const summary=`Quotation: ${money(preview.quotedTotalMinor)}\nCurrent catalogue total: ${money(preview.currentTotalMinor)}\n${preview.priceChanged?'WARNING: Catalogue prices changed since the quote.\n':''}Record a credit sale using the CURRENT prices? Stock and customer credit will be validated again.`;if(!(await confirmAction(summary)))return;const result=await convertQuotationToSale(id,{paymentMethod:'credit',amountPaid:'0',discount:'0',expectedTotalMinor:preview.currentTotalMinor,...(storeMode?{storeId:conversionStoreId}:{})});toast.success(`Sale saved: ${result.sale.receiptNumber}`);await refresh();}catch(e){toast.error(e instanceof Error?e.message:'Quotation could not be converted.');}finally{setBusy(false);}}
  return <main className="mx-auto max-w-5xl p-4 md:p-8 space-y-6">
    <header><p className="text-sm text-muted-foreground">CUSTOMERS</p><h1 className="text-3xl font-semibold">Quotations</h1><p className="text-muted-foreground">Prepare non-binding offers offline. Quotations never reserve stock or record a sale.</p></header>
    <section className="rounded-xl border p-5 space-y-4"><h2 className="text-xl font-semibold">New quotation</h2>
      <label className="block">Customer<select className="w-full rounded border p-3 mt-1 bg-background" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Choose a customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_auto] gap-2 items-end"><label>Product<select className="w-full rounded border p-3 mt-1 bg-background" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Choose a product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.sellingPriceMinor)}</option>)}</select></label><label>Quantity<input className="w-full rounded border p-3 mt-1 bg-background" value={quantity} inputMode="numeric" onChange={e=>setQuantity(e.target.value)}/></label><button className="border rounded p-3 min-h-11" type="button" onClick={()=>{const qty=Number(quantity);if(!productId||!Number.isSafeInteger(qty)||qty<=0){toast.error('Choose a product and positive whole-number quantity.');return;}setLines(old=>{const existing=old.find(x=>x.productId===productId);return existing?old.map(x=>x.productId===productId?{...x,quantity:x.quantity+qty}:x):[...old,{productId,quantity:qty}];});}}>Add</button></div>
      {lines.map((line,i)=><div key={line.productId} className="flex flex-wrap justify-between gap-2 border-b pb-2"><span>{products.find(p=>p.id===line.productId)?.name} × {line.quantity}</span><span>{money((products.find(p=>p.id===line.productId)?.sellingPriceMinor??0)*line.quantity)}</span><button type="button" className="underline" onClick={()=>setLines(old=>old.filter((_,j)=>j!==i))}>Remove</button></div>)}
      {taxError ? <p role="alert">{taxError}</p> : tax?.ghana ? <p>VAT: {money(tax.ghana.vatMinor)} · NHIL: {money(tax.ghana.nhilMinor)} · GETFund: {money(tax.ghana.getFundMinor)} (not GRA-certified)</p> : tax ? <p>{tax.policy.label} ({tax.policy.rateBasisPoints / 100}%, {tax.policy.priceMode}): {money(tax.taxMinor)}</p> : null}<p className="text-lg font-semibold">Total offer: {money(total)}</p><button className="rounded bg-primary text-primary-foreground p-3 min-h-11" disabled={busy||!customerId||!lines.length||Boolean(taxError)} onClick={()=>void save()}>Save draft quotation</button>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Saved quotations</h2>{storeMode?<label className="block">Store for quotation conversion<select className="block w-full rounded border p-3" aria-label="Quotation conversion store" value={conversionStoreId} onChange={e=>setConversionStoreId(e.target.value)}><option value="">Choose store</option>{locations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:null}{quotes.length===0&&<p className="text-muted-foreground">No quotations saved yet.</p>}{quotes.map(q=><article key={q.id} className="border rounded-xl p-4 space-y-2"><div className="flex flex-wrap justify-between gap-2"><strong>{customers.find(c=>c.id===q.customerId)?.name??'Customer'} · {money(q.totalMinor)}</strong><span>{q.status.toUpperCase()}</span></div><p className="text-sm text-muted-foreground">{q.lines.map(l=>`${l.productName} × ${l.quantity}`).join(' · ')}</p><p className="text-xs text-muted-foreground">{businessDateTimeLabel(q.createdAt,profile?.country)}</p><div className="flex gap-2 flex-wrap">{q.status==='draft'&&<button className="border rounded p-2 min-h-11" disabled={busy} onClick={()=>void advance(q.id,'issued')}>Mark issued</button>}{q.status==='accepted'&&!q.convertedSaleId&&<button className="border rounded p-2 min-h-11" disabled={busy} onClick={()=>void convert(q.id)}>Convert to credit sale</button>}{q.convertedSaleId&&<span className="text-sm">Converted to saved sale</span>}{q.status==='issued'&&<><button className="border rounded p-2 min-h-11" disabled={busy} onClick={()=>void advance(q.id,'accepted')}>Mark accepted</button><button className="border rounded p-2 min-h-11" disabled={busy} onClick={()=>void advance(q.id,'declined')}>Mark declined</button></>}</div></article>)}</section>
  </main>;
}
