/** Deterministic, company-scoped category hierarchy for local POS.
 * Optional parent IDs require no Dexie index or historical row rewrite.
 * Every read/backup must reject cycles, missing parents, cross-company links,
 * and chains deeper than three category levels.
 */
export function validateCategoryHierarchy(categories,companyId,maxDepth=3){
 if(!Array.isArray(categories)||typeof companyId!=="string"||!companyId||
    !Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>6)throw Error("Invalid category hierarchy scope.");
 const byId=new Map();
 for(const row of categories){
  if(!row||typeof row.id!=="string"||!row.id||row.businessProfileId!==companyId||
     typeof row.name!=="string"||!row.name.trim()||byId.has(row.id))
    throw Error("Duplicate, invalid or foreign category in company hierarchy.");
  byId.set(row.id,row);
 }
 const depths=new Map(),labels=new Map(),visiting=new Set();
 const visit=id=>{
  if(depths.has(id))return depths.get(id);
  if(visiting.has(id))throw Error("Category hierarchy contains a cycle.");
  const row=byId.get(id);if(!row)throw Error("Category parent missing from the same company.");
  visiting.add(id);
  let parentDepth=0,parentLabel="";
  if(row.parentCategoryId!==undefined&&row.parentCategoryId!==""){
   if(typeof row.parentCategoryId!=="string"||row.parentCategoryId===id)
    throw Error("Category cannot be its own parent.");
   parentDepth=visit(row.parentCategoryId);
   parentLabel=labels.get(row.parentCategoryId)+" / ";
  }
  const depth=parentDepth+1;
  if(depth>maxDepth)throw Error("Category nesting exceeds the supported hierarchy depth.");
  depths.set(id,depth);labels.set(id,parentLabel+row.name.trim());visiting.delete(id);
  return depth;
 };
 for(const id of byId.keys())visit(id);
 return {depths,labels};
}
