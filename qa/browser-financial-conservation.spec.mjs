import {test,expect} from '@playwright/test';
test('native IndexedDB preserves cash, credit, prepaid wallet, stock and COGS under checkout retry and lock denial',async({page})=>{
 // This route stays outside the ledger shell. All business writes target a
 // uniquely named synthetic database, removed even after a failed assertion.
 await page.goto('/account');
 const result=await page.evaluate(async()=>{
  const {TallybookDB,initializeDatabase}=await import('/src/db/TallybookDB.ts');
  const Dexie=Object.getPrototypeOf(TallybookDB);
  const {saveBusinessProfile}=await import('/src/features/business/businessProfile.ts');
  const {setActiveBusinessProfileId}=await import('/src/features/business/activeCompany.ts');
  const {createStaff,unlockStaff,openShift,lockStaff}=await import('/src/features/staff/staff.ts');
  const {createProduct}=await import('/src/features/inventory/inventory.ts');
  const {createCustomer}=await import('/src/features/customers/customers.ts');
  const {recordWalletTransfer}=await import('/src/features/customers/walletTransfers.ts');
  const {completeSale}=await import('/src/features/sales/sales.ts');
  const name='cross-engine-finance-'+crypto.randomUUID(),db=new TallybookDB(name);
  setActiveBusinessProfileId('primary');
  try{
   await initializeDatabase(db);
   await saveBusinessProfile({name:'Synthetic engine finance',country:'Ghana',currency:'GHS',businessType:'Retail shop'},db);
   const owner=await createStaff('Synthetic owner','owner','123456',db);await unlockStaff(owner.id,'123456',db);await openShift(0,db);
   const product=await createProduct({name:'Native ledger rice',categoryId:'uncategorized',sellingPrice:'5',costPrice:'2',initialStock:'10',lowStockThreshold:'0'},'GHS',db);
   const customer=await createCustomer({name:'Synthetic customer',phone:'+233000000003',email:'',address:'',notes:'',status:'active'},db);
   await recordWalletTransfer({customerId:customer.id,kind:'deposit',amountMinor:1500,method:'cash',reference:'synthetic opening',submissionKey:crypto.randomUUID()},db);
   const cash={lines:[{productId:product.id,quantity:2}],discount:'0',paymentMethod:'cash',amountPaid:'10',currency:'GHS',submissionKey:crypto.randomUUID()};
   const [first,retry]=await Promise.all([completeSale(cash,db),completeSale(cash,db)]);
   await completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'credit',amountPaid:'0',customerId:customer.id,currency:'GHS',submissionKey:crypto.randomUUID()},db);
   await completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'wallet',amountPaid:'5',customerId:customer.id,currency:'GHS',submissionKey:crypto.randomUUID()},db);
   const snapshot=async()=>JSON.stringify(await Promise.all(db.tables.map(async table=>({name:table.name,rows:await table.toArray()}))));
   const before=await snapshot();lockStaff('primary');
   let denied=false;
   try{await completeSale({...cash,submissionKey:crypto.randomUUID()},db);}catch{denied=true;}
   const unchanged=await snapshot()===before;
   const sales=await db.sales.toArray(),payments=await db.payments.toArray(),benefits=await db.customerBenefits.toArray();
   return {sameSale:first.sale.id===retry.sale.id,sales:sales.length,receipts:await db.receipts.count(),
    units:(await db.products.get(product.id)).stockQuantity,
    totalMinor:sales.reduce((sum,row)=>sum+row.totalMinor,0),
    paidMinor:sales.reduce((sum,row)=>sum+row.amountPaidMinor,0),
    dueMinor:sales.reduce((sum,row)=>sum+row.outstandingMinor,0),
    cogsMinor:sales.reduce((sum,row)=>sum+(row.cogsMinor??NaN),0),
    cashPaymentMinor:payments.filter(row=>row.method==='cash').reduce((sum,row)=>sum+row.amountMinor,0),
    walletMinor:benefits.filter(row=>row.kind==='wallet').reduce((sum,row)=>sum+row.delta,0),
    denied,unchanged};
  }finally{lockStaff('primary');db.close();await Dexie.delete(name);}
 });
 expect(result).toEqual({sameSale:true,sales:3,receipts:3,units:6,totalMinor:2000,paidMinor:1500,dueMinor:500,cogsMinor:800,cashPaymentMinor:1000,walletMinor:1000,denied:true,unchanged:true});
});
