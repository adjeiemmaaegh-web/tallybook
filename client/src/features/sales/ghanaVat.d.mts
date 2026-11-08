export declare const GHANA_VAT_VERSION: "act-1151-2026";
export declare const GHANA_STANDARD_RATES_BPS: Readonly<{ vat: 1500; nhil: 250; getFund: 250 }>;
export type GhanaTaxTreatment = "standard" | "zero-rated" | "exempt";
export interface GhanaTaxLine { amountMinor: number; treatment?: GhanaTaxTreatment; }
export interface GhanaVatBreakdown {
  version: "act-1151-2026";
  eVatStatus: "not-certified";
  standardMinor: number;
  zeroRatedMinor: number;
  exemptMinor: number;
  taxableBaseMinor: number;
  vatMinor: number;
  nhilMinor: number;
  getFundMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxableMinor: number;
}
export declare function calculateGhanaVat(lines: GhanaTaxLine[], discountMinor: number, priceMode: "inclusive" | "exclusive"): GhanaVatBreakdown;
export declare function validateGhanaVatEvidence(sale: {
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  tax?: {
    policy: { enabled: boolean; scheme?: string; registrationStatus: string; registrationNumber?: string; rateBasisPoints: number; priceMode: "inclusive" | "exclusive" };
    ghana?: GhanaVatBreakdown;
    taxMinor: number; taxableMinor: number; totalMinor: number;
  };
}): true;
