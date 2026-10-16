import type {StoreStockCompanyProduct, StoreStockLocation, StoreStockAllocation, StoreStockPlan} from "./run13StockConservation.mjs";
export interface ProposedStoreTransferEvent {
  kind: "proposed-transfer";
  id: string;
  submissionKey: string;
  requestId: string;
  businessProfileId: string;
  authorizedByStaffId: string;
  sourceStoreId: string;
  destinationStoreId: string;
  productId: string;
  quantity: number;
  createdAt: string;
}
export interface ProposedTransferJournalAudit extends StoreStockPlan {
  journalEntryCount: number;
  verifiedPhysicalDelivery: false;
  financialPostingPerformed: false;
  authoritative: false;
}
export function auditProposedStoreTransferJournal(input: {
  companyId: string;
  products: StoreStockCompanyProduct[];
  stores: StoreStockLocation[];
  allocations: StoreStockAllocation[];
  journal: ProposedStoreTransferEvent[];
}): ProposedTransferJournalAudit;
export function compareProposedTransferIntent(
  saved: ProposedStoreTransferEvent, incoming: ProposedStoreTransferEvent
): true;
