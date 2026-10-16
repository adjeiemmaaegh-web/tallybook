import type {TaxPolicy,TaxSnapshot} from '../sales/tax';
export interface Run12SaleTaxConfiguration {mode:'on'|'off';policy?:TaxPolicy}
export interface Run12SaleTaxHistory {
 readonly configuredChargedSales:number;
 readonly explicitNoTaxSales:number;
 readonly legacyUnverifiedSales:number;
 readonly totalSales:number;
 readonly statutoryFilingVerified:false;
}
export function snapshotSaleTaxConfiguration(policy?:TaxPolicy):Run12SaleTaxConfiguration;
export function validateRun12SaleTaxEvidence(sale:{
 subtotalMinor:number;discountMinor:number;totalMinor:number;
 tax?:TaxSnapshot;taxConfigurationAtSale?:Run12SaleTaxConfiguration;
}):{verified:boolean;legacy:boolean;chargedTax:boolean};
export function auditRun12SaleTaxHistory(sales:Array<{
 id:string;subtotalMinor:number;discountMinor:number;totalMinor:number;
 tax?:TaxSnapshot;taxConfigurationAtSale?:Run12SaleTaxConfiguration;
}>):Run12SaleTaxHistory;
