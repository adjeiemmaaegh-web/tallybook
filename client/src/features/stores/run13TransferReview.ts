/**
 * Run 13: permission-aware, READ-ONLY review of one saved transfer request.
 * Never treats a request as stock, delivery or payment evidence.
 */
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { currentStaffId, requirePermission } from "@/features/staff/staff";

export interface StoreTransferReview {
  requestId: string;
  companyId: string;
  sourceStoreId: string;
  destinationStoreId: string;
  productId: string;
  quantity: number;
  actorStaffId: string;
  canPostTransfer: false;
  physicalDeliveryVerified: false;
  companyStockUnchanged: true;
}

export async function reviewStoreTransferRequest(
  requestId: string,
  database: TallybookDB = db
): Promise<StoreTransferReview> {
  if (typeof requestId !== "string" || !requestId.trim())
    throw new Error("Transfer request identity required.");
  const company = getActiveBusinessProfileId();
  const reviewed = await database.transaction(
    "r",
    [database.storeTransferRequests, database.storeLocations, database.products,
      database.storeAssignments, database.staffMembers, database.businessProfiles],
    async () => {
      const member = await requirePermission("inventory", database, company);
      const staffId = member?.id ?? currentStaffId(company);
      if (!staffId || !member || member.id !== staffId)
        throw new Error("Active inventory-authorized staff required.");
      const [request, actor, companyProfile] = await Promise.all([
        database.storeTransferRequests.get(requestId),
        database.staffMembers.get(staffId),
        database.businessProfiles.get(company),
      ]);
      if (!companyProfile || !request || request.businessProfileId !== company ||
          request.status !== "requested" ||
          !actor || actor.businessProfileId !== company || actor.disabledAt)
        throw new Error("Transfer or actor unavailable in active company.");
      const [source, destination, product, sourceAssignment, destinationAssignment] = await Promise.all([
        database.storeLocations.get(request.sourceStoreId),
        database.storeLocations.get(request.destinationStoreId),
        database.products.get(request.productId),
        database.storeAssignments.where("[businessProfileId+staffId+storeId]")
          .equals([company, staffId, request.sourceStoreId]).first(),
        database.storeAssignments.where("[businessProfileId+staffId+storeId]")
          .equals([company, staffId, request.destinationStoreId]).first(),
      ]);
      if (!source || !destination || source.id === destination.id ||
          source.businessProfileId !== company || destination.businessProfileId !== company ||
          source.status !== "active" || destination.status !== "active" ||
          !product || product.businessProfileId !== company || product.archivedAt ||
          product.itemKind === "service" ||
          !Number.isSafeInteger(request.quantity) || request.quantity <= 0 || request.quantity > 9_999_999)
        throw new Error("Store, product or quantity is not eligible for review.");
      // Owner and supervisor are administrative roles; a cashier never acquires
      // authority merely because a request or store assignment exists.
      // Non-owner inventory staff must be explicitly assigned to BOTH stores.
      if (actor.role !== "owner" && (!sourceAssignment || !destinationAssignment))
        throw new Error("Reviewing staff is not assigned to both stores.");
      if (getActiveBusinessProfileId() !== company || currentStaffId(company) !== staffId)
        throw new Error("Company or staff session changed during transfer review.");
      return {
        requestId: request.id, companyId: company,
        sourceStoreId: request.sourceStoreId,
        destinationStoreId: request.destinationStoreId,
        productId: request.productId, quantity: request.quantity,
        actorStaffId: staffId,
      };
    }
  );
  if (getActiveBusinessProfileId() !== company ||
      currentStaffId(company) !== reviewed.actorStaffId)
    throw new Error("Company or staff session changed after review.");
  return {
    ...reviewed,
    canPostTransfer: false,
    physicalDeliveryVerified: false,
    companyStockUnchanged: true,
  };
}
