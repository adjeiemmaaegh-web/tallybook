import {getSupabaseClient} from '@/lib/supabase';
import {callShop} from './shopClient';
export interface PublicCatalogue {
 companyId:string; name:string; storeId:string; revision:number; digest:string; currency:string;
 privacyNotice:string; retentionDays:number; paymentEnabled:false;
 returnPolicy:{refundsEnabled:boolean;allowPartial:boolean;maxAgeDays:number};
 items:Array<{id:string;name:string;priceMinor:string;available:boolean}>;
}
export interface CustomerOrder {
 orderId:string;storeId:string;currency:string;totalMinor:string;status:'reserved'|'expired'|'cancelled'|'sale-recorded';
 fulfillmentStatus:string;expiresAt:string;customerName:string|null;customerContact:string|null;deliveryNotes:string|null;
 deliveryMethod:'pickup'|'delivery';saleId:string|null;refundedMinor:string;
 lines:Array<{productId:string;name:string;quantity:number;unitPriceMinor:string}>;
}
export const commerce = <T>(companyId:string,action:string,input:Record<string,unknown>={}) =>
 callShop<T>(action,{companyId,...input},'tallybook_public_commerce');
export async function getCatalogue(companyId:string):Promise<PublicCatalogue> {
 const {data,error}=await getSupabaseClient().rpc('tallybook_catalogue',{p_company:companyId});
 if(error) throw new Error(error.code==='PGRST202'?'This catalogue is not available yet.':error.message);
 if(!data || typeof data.digest!=='string' || !Array.isArray(data.items)) throw new Error('Unexpected catalogue response.');
 return data;
}
