/** Read-only validation and preparation of retail events. Not a database writer. */
export type DrawerAction = 'drawer_open' | 'no_sale';
export interface StaffContext { businessProfileId:string; storeId:string; staffId:string; shiftId:string; authenticatedPin:boolean }
export interface RetailEvent { id:string; submissionKey:string; businessProfileId:string; storeId:string; staffId:string; shiftId:string; kind:DrawerAction; reason:string; occurredAt:string }
const nonempty = (value:unknown):value is string => typeof value==='string' && value.trim().length>0;
export function validateStaffSale(input:{staffId?:string; shiftId?:string; paymentMethod:string; mobileMoneyReference?:string; mobileMoneyProviderId?:string}):string[] {
 const errors:string[]=[];
 if(!nonempty(input.staffId)) errors.push('Staff ID is required.');
 if(!nonempty(input.shiftId)) errors.push('Shift ID is required.');
 if(input.paymentMethod==='mobile' && (!nonempty(input.mobileMoneyReference)||!nonempty(input.mobileMoneyProviderId))) errors.push('Mobile Money reference and provider are required.');
 return errors;
}
export function prepareDrawerEvent(context:StaffContext, input:{id:string;submissionKey:string;kind:DrawerAction;reason:string;occurredAt:string}):RetailEvent {
 if(!context.authenticatedPin) throw new Error('A verified PIN session is required.');
 for (const key of ['businessProfileId','storeId','staffId','shiftId'] as const) if(!nonempty(context[key])) throw new Error(`${key} is required.`);
 if(!nonempty(input.id)||!nonempty(input.submissionKey)||!nonempty(input.reason)) throw new Error('Event ID, submission key and reason are required.');
 if(input.kind!=='drawer_open'&&input.kind!=='no_sale') throw new Error('Unsupported drawer event.');
 if(!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('Invalid event time.');
 return Object.freeze({...input,reason:input.reason.trim(),businessProfileId:context.businessProfileId,storeId:context.storeId,staffId:context.staffId,shiftId:context.shiftId});
}
