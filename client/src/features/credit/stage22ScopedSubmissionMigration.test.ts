/** Stage 22 developer-only Dexie v33 -> v34 index migration regressions.
 * Index migration MUST never rewrite cash, credit, tax or stock balances.
 * Source is not an executed test result until the client runner passes.
 */
import Dexie from "dexie";
import {afterEach,describe,expect,it} from "vitest";
import {TallybookDB,DATABASE_SCHEMA_VERSION} from "@/db/TallybookDB";
const entries=[
 {name:"sales",old:"id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
  fields:{totalMinor:1500,outstandingMinor:300}},
 {name:"repayments",old:"id, businessProfileId, customerId, createdAt, method, &submissionKey",
  fields:{amountMinor:100}},
 {name:"purchases",old:"id, businessProfileId, supplierId, purchaseDate, createdAt, &submissionKey",
  fields:{totalCostMinor:2100}},
 {name:"expenses",old:"id, businessProfileId, expenseDate, category, createdAt, &submissionKey",
  fields:{amountMinor:400}},
 {name:"saleReversals",old:"id, businessProfileId, originalSaleId, customerId, createdAt, &submissionKey",
  fields:{reversedSaleTotalMinor:-1500}},
 {name:"customerBenefits",old:"id, businessProfileId, customerId, kind, createdAt, &submissionKey",
  fields:{delta:500}},
 {name:"walletTransfers",old:"id, businessProfileId, customerId, kind, createdAt, &submissionKey",
  fields:{amountMinor:700}}
] as const;
const names:string[]=[];
const opened:TallybookDB[]=[];
let sequence=0;
afterEach(async()=>{
  for(const database of opened.splice(0))database.close();
  for(const name of names.splice(0))await new Dexie(name).delete();
});
describe("Stage 22 company-scoped idempotency migration",()=>{
 it("preserves source data from historical global indexes and isolates all seven ledger retries",async()=>{
  const name=`stage22-seven-ledger-migration-${Date.now()}-${++sequence}`;
  names.push(name);
  const legacy=new Dexie(name);
  legacy.version(33).stores(Object.fromEntries(entries.map(e=>[e.name,e.old])));
  await legacy.open();
  const oldRecords:Record<string,Record<string,unknown>>={};
  for(const [i,source]of entries.entries()){
    const row={...source.fields,id:`original-${i}`,businessProfileId:"primary",
      submissionKey:`same-key-${i}-0001`,createdAt:"2026-10-10T12:00:00.000Z"};
    await legacy.table(source.name).add(row);
    oldRecords[source.name]=row;
  }
  legacy.close();
  const database=new TallybookDB(name);opened.push(database);
  await database.open();
  expect(DATABASE_SCHEMA_VERSION).toBe(36);
  for(const [i,source]of entries.entries()){
    const table=database.table(source.name);
    const original=oldRecords[source.name];
    expect(await table.get(original.id)).toMatchObject(original);
    expect((await table.where("[businessProfileId+submissionKey]")
      .equals(["primary",original.submissionKey]).count())).toBe(1);
    const other={...original,id:`second-${i}`,businessProfileId:"second-company"};
    await table.add(other);
    expect(await table.count()).toBe(2);
    await expect(table.add({...original,id:`duplicate-primary-${i}`})).rejects.toThrow();
    expect(await table.get(original.id)).toMatchObject(original);
  }
 });
});
