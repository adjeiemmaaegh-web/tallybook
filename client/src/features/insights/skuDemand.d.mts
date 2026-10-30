import type {Product} from '../inventory/inventory';
import type {Sale,SaleLine,Payment} from '../sales/sales';
import type {SaleReversal} from '../assistant/reversals';
import type {CashPartialSaleReturn} from '../sales/cashPartialReturnPosting';
export interface SkuDemand {productId:string;productName:string;soldUnits:number;returnedUnits:number;netUnits:number;sourceLineIds:string[];stockQuantity:number;windowDays:number|null;horizonDays:number;coverageUnits:number|null;reorderUnits:number|null}
export function deriveSkuDemand(input:{company:string;products:Product[];sales:Sale[];lines:SaleLine[];payments:Payment[];reversals:SaleReversal[];returns:CashPartialSaleReturn[];startMs:number;endMs:number;asOfMs:number;windowDays:number|null;horizonDays?:number}):SkuDemand[];
