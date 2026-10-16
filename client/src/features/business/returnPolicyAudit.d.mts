import type {BusinessProfile} from './businessProfile';
import type {Sale} from '../sales/sales';
import type {SaleReversal} from '../assistant/reversals';
import type {CashPartialSaleReturn} from '../sales/cashPartialReturnPosting';
export interface CompanyReturnPolicyEvidenceSummary {
 readonly verifiedRefunds:number;readonly legacyRefunds:number;
 readonly salesWithoutHistoricalTerms:number;readonly activeRevision:number;
}
export function auditCompanyReturnPolicyEvidence(
 profile:BusinessProfile,sales:Sale[],reversals:SaleReversal[],
 partialReturns:CashPartialSaleReturn[]
):CompanyReturnPolicyEvidenceSummary;
