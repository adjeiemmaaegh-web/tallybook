export const REFUND_ALLOCATIONS: readonly ["proportional", "reverse-order"];
export const LOYALTY_ON_RETURN: readonly ["reverse", "keep"];
export type RefundAllocation = (typeof REFUND_ALLOCATIONS)[number];
export type LoyaltyOnReturn = (typeof LOYALTY_ON_RETURN)[number];
export const DEFAULT_REFUND_ALLOCATION: RefundAllocation;
export const DEFAULT_LOYALTY_ON_RETURN: LoyaltyOnReturn;
export function returnPolicyChoices(policy?: { refundAllocation?: RefundAllocation; loyaltyOnReturn?: LoyaltyOnReturn }): Readonly<{ refundAllocation: RefundAllocation; loyaltyOnReturn: LoyaltyOnReturn }>;
export function allocateReturnToTenders(input: { valueMinor: number; legs: Array<{ method: string; capacityMinor: number }>; policy?: RefundAllocation }): Array<{ method: string; amountMinor: number }>;
export function pointsToReverse(input: { earnedPoints: number; paidMinor: number; refundedBeforeMinor: number; refundedAfterMinor: number; balancePoints: number; policy?: LoyaltyOnReturn }): { reverse: number; shortfall: number; due: number };
