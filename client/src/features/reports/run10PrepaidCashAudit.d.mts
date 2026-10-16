import type {WalletTransfer} from '../customers/walletTransfers';
import type {CustomerBenefitEntry} from '../customers/customerBenefits';
import type {Sale} from '../sales/sales';
import type {SaleReversal} from '../assistant/reversals';
export interface Run10PrepaidCashAudit {
 readonly currency:string;
 readonly liabilityMinor:number;
 readonly customerCount:number;
 readonly depositedMinor:number;
 readonly refundedMinor:number;
 readonly spentMinor:number;
 readonly reversedWalletSpendMinor:number;
 readonly recordedNetExternalCashMinor:number;
 readonly netWalletConsumptionMinor:number;
}
export function auditRun10PrepaidCashConservation(input:{
 transfers:WalletTransfer[];benefits:CustomerBenefitEntry[];
 sales:Sale[];reversals:SaleReversal[];
},currency:string):Run10PrepaidCashAudit;
