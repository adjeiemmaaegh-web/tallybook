/** Run 17 local CSV evidence export. No network upload.
 * Formula injection is escaped and personal customer identifiers are omitted.
 * This export is NOT a statutory, net-profit or settled-payment statement.
 */
const deny=x=>{throw Error("Run 17 CSV: "+x);};
function cell(value) {
 let text=String(value??"").replace(/[\r\n\u0000-\u001f]/g," ").slice(0,4000);
 if(/^\s*[=+\-@]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function exportRun17Csv(report) {
 if(!report||typeof report!=="object"||!Array.isArray(report.findings)||
    !Array.isArray(report.topObservedUnits)||!Array.isArray(report.stores)||
    !/^[A-Za-z0-9:_-]{1,128}$/.test(report.companyId??"")||
    !/^[A-Z]{3}$/.test(report.currency??"")||
    typeof report.asOf!=="string"||
    report.financialPostingPerformed!==false||report.automaticAction!==false)
   deny("unverified evidence report");
 const rows=[
  ["Category","Code","Metric or finding","Value","Evidence or limitation","Source references"],
  ["Metadata",report.companyId,"Reporting period",report.period,"Device local, recorded only",report.asOf],
  ["Metric","sales","Gross recorded invoices in minor units",report.summary.grossRecordedInvoiceMinor,
    "Not net revenue, customer cash received or bank settlement",""],
  ["Metric","sales","Saved sales",report.summary.recordedSaleCount,"Includes reversed receipts",""],
  ["Metric","returns","Full reversals",report.summary.fullyReversedSaleCount,"No cash claim",""],
  ["Metric","returns","Partial-return affected sales",report.summary.partialReturnAffectedSaleCount,
    "Excluded from observed product volume until net unit provenance established",""],
  ["Metric","stores","Sales missing store attribution",report.summary.storeOriginUnknownSaleCount,
    "Never guess a legacy sale's source location",""],
 ];
 for(const store of report.stores)rows.push(["Store",store.storeId,store.storeName,
   store.grossRecordedInvoiceMinor,
   store.recordedSaleCount+" saved sale invoices; "+store.fullyReversedSaleCount+" full reversals. Gross invoice minor units, not cash.",store.storeId]);
 for(const product of report.topObservedUnits)rows.push(["Observed units",product.productId,product.name,
   product.units,"Excludes sales impacted by full/partial returns",product.sourceSaleLineIds.join(";")]);
 for(const finding of report.findings)rows.push(["Advisory",finding.id,finding.title,
   finding.severity+" / "+finding.confidence,
   finding.evidence+" | Human review: "+finding.action,
   finding.sourceRefs.map(r=>r.kind+":"+r.id).join(";")]);
 const csv=rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
 if(new TextEncoder().encode(csv).byteLength>2_000_000)
   deny("export is too large; narrow the reporting period");
 return csv;
}
