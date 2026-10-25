/** Read-only company-reference diagnostic. A missing company scope is INDETERMINATE, not proof of a violation. */
export function assessCompanyIsolation(snapshots, relations = [
  ['sales','customerId','customers'],['saleLines','saleId','sales'],
  ['saleLines','productId','products'],['payments','saleId','sales'],
  ['receipts','saleId','sales'],['repayments','customerId','customers'],
  ['staffShifts','staffId','staffMembers']
]) {
  const issues = [];
  const byId = new Map(Object.entries(snapshots).map(([table, rows]) => [table, new Map((rows || []).map(row => [row.id, row]))]));
  const resolveCompany = (table, row, visited = new Set()) => {
    if (!row || visited.has(table)) return undefined;
    if (typeof row.businessProfileId === 'string' && row.businessProfileId.trim()) return row.businessProfileId;
    const next = new Set(visited); next.add(table);
    if (table === 'saleLines' || table === 'payments' || table === 'receipts')
      return resolveCompany('sales', byId.get('sales')?.get(row.saleId), next);
    return undefined;
  };
  for (const [source, field, target] of relations) {
    const parents = byId.get(target) || new Map();
    for (const row of snapshots[source] || []) {
      if (row[field] == null || row[field] === '') continue;
      const parent = parents.get(row[field]);
      if (!parent) { issues.push({code:'MISSING_REFERENCE',source,id:row.id,field,target}); continue; }
      const childCompany = resolveCompany(source, row);
      const parentCompany = resolveCompany(target, parent);
      if (!childCompany || !parentCompany) {
        issues.push({code:'UNVERIFIABLE_COMPANY_SCOPE',source,id:row.id,field,target});
      } else if (childCompany !== parentCompany) {
        issues.push({code:'CROSS_COMPANY_REFERENCE',source,id:row.id,field,target});
      }
    }
  }
  return {status:issues.length?'issues':'clean',issues};
}
