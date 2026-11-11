/** UI-only store choice: the backend remains the authority on assigned stores. */
export const shopStorePreferenceKey=(userId:string,companyId:string)=>
 "tallybook.shop.store:"+userId+":"+companyId;
export function authorizedStoreChoice<T extends {id:string;status:"active"|"archived"}>(stores:readonly T[],saved:string|null):string {
 const active=stores.filter(store=>store.status==="active");
 return active.find(store=>store.id===saved)?.id??active[0]?.id??"";
}
