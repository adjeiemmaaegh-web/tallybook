/** Run 16 — read-only active physical commitments. These are reservations,
 * not financial or warehouse postings. A hold only expires when a trusted
 * timestamp passes; its history is never silently deleted.
 */
import type {TallybookDB} from "@/db/TallybookDB";
import {reservationBalance,type Run16CommerceHold} from "./run16Rules.mjs";
export async function reservedRun16Units(
 database:TallybookDB,company:string,productId:string,storeId:string|undefined,
 now:string,excludingOrderId?:string
):Promise<number>{
 const all=await database.commerceHolds.where("[businessProfileId+productId]")
   .equals([company,productId]).toArray() as Run16CommerceHold[];
 return reservationBalance(all,company,productId,storeId,now,excludingOrderId);
}
