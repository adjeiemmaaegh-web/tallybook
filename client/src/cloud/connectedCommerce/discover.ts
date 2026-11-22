/**
 * Tallybook Discover client (CC-D). PostgreSQL decides everything; nothing here computes visibility or availability.
 * A shopper request is only a REQUEST: no payment, no stock hold, no sale. Availability is the owner's confirmed label
 * with the time they confirmed it, never a stock figure.
 */
import { callShop, ShopRejectedError } from "../shopClient";

export const DISCOVER_CATEGORIES = ["groceries", "fashion", "electronics", "household", "beauty", "building", "pharmacy", "food", "services", "other"] as const;
export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];
export const AVAILABILITY = ["in_stock", "limited", "out_of_stock", "made_to_order", "unknown"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  in_stock: "In stock", limited: "Limited", out_of_stock: "Out of stock", made_to_order: "Made to order", unknown: "Ask the shop",
};

export interface DiscoverProfile { displayName: string; category: DiscoverCategory; areaLabel: string; contactLabel: string | null; status: "draft" | "published" | "unpublished"; version: number }
export interface OwnerListing { listingId: string; title: string; description: string; kind: "good" | "service"; priceMinor: string | null; currency: string; availability: Availability; availabilityAsOf: string; status: "published" | "unpublished"; version: number }
export interface ListingDraft { listingId?: string; title: string; description: string; kind: "good" | "service"; priceMinor: number | null; currency: string; availability: Availability; expectedVersion?: number }
export interface OwnerRequest { requestId: string; listingId: string; listingTitle: string; quantity: number; buyerName: string; buyerContact: string; note: string; status: "new" | "accepted" | "declined" | "cancelled" | "expired"; createdAt: string; decisionNote: string | null; paymentCollected: false; stockReserved: false }
export interface ShopSummary { name: string; category: DiscoverCategory; area: string; contact: string | null; verification: string; externallyVerified: boolean }
export interface PublicListing { listingId: string; title: string; description: string; kind: "good" | "service"; priceMinor: string | null; currency: string; availability: Availability; availabilityAsOf: string; shop: ShopSummary }
export interface SearchResult { results: PublicListing[]; next: { updatedAt: string; id: string } | null; note: string }
export interface RequestReceipt { requestId: string; status: "new" | "accepted" | "declined" | "cancelled" | "expired"; replayed: boolean; cancelToken?: string; cancelTokenIssued: boolean; paymentCollected: false; stockReserved: false; accepted: boolean; message?: string }
export interface RequestStatus { requestId: string; listingTitle: string; status: RequestReceipt["status"]; decisionNote: string | null; paymentCollected: false; stockReserved: false }

export type DiscoverErrorCode = "REQUIRES_CONFIRMATION" | "NOT_AUTHORIZED" | "STALE_VERSION" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "NOT_AVAILABLE" | "UNKNOWN";
export class DiscoverError extends Error { constructor(readonly code: DiscoverErrorCode, message: string) { super(message); this.name = "DiscoverError"; } }
const FRIENDLY: Record<DiscoverErrorCode, string> = {
  REQUIRES_CONFIRMATION: "Turn on Tallybook Discover first (accept the current terms in Connected Commerce settings).",
  NOT_AUTHORIZED: "Only the business owner can manage Discover.",
  STALE_VERSION: "This changed elsewhere. Reload and try again.",
  NOT_FOUND: "That item is no longer available.",
  CONFLICT: "This was already handled or you already have an open request for this item.",
  RATE_LIMITED: "Too many requests right now. Please try again later.",
  NOT_AVAILABLE: "This is not available right now.",
  UNKNOWN: "That did not work. Nothing was changed.",
};
export function parseDiscoverError(error: unknown): DiscoverError {
  if (error instanceof DiscoverError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = /^CC:(REQUIRES_CONFIRMATION|NOT_AUTHORIZED|STALE_VERSION|NOT_FOUND|CONFLICT|RATE_LIMITED|NOT_AVAILABLE)\b/.exec(raw);
  const code = (m?.[1] as DiscoverErrorCode | undefined) ?? "UNKNOWN";
  // Validation text from the server (e.g. "Invalid areaLabel (use a town...)") is safe, short guidance; other raw text is not echoed.
  const guidance = code === "UNKNOWN" && /^Invalid [A-Za-z]+( \(.*\))?$/.test(raw) ? raw : FRIENDLY[code];
  return new DiscoverError(code, guidance);
}
async function owner<T>(action: string, input: Record<string, unknown>): Promise<T> {
  try { return await callShop<T>(action, input, "tallybook_cc_discover"); }
  catch (e) { if (e instanceof ShopRejectedError) throw parseDiscoverError(e); throw e; }
}
async function publicCall<T>(action: string, input: Record<string, unknown>): Promise<T> {
  try { return await callShop<T>(action, input, "tallybook_cc_discover_public"); }
  catch (e) { if (e instanceof ShopRejectedError) throw parseDiscoverError(e); throw e; }
}
const key = () => crypto.randomUUID();

// ---- owner
export const getDiscoverProfile = (companyId: string) => owner<{ enabled: boolean; profile: DiscoverProfile | null }>("getProfile", { companyId });
export const saveDiscoverProfile = (companyId: string, p: { displayName: string; category: DiscoverCategory; areaLabel: string; contactLabel?: string; expectedVersion?: number }, operationKey = key()) =>
  owner<{ replayed: boolean }>("saveProfile", { companyId, ...p, operationKey });
export const publishDiscoverProfile = (companyId: string, publish: boolean, operationKey = key()) =>
  owner<{ replayed: boolean }>(publish ? "publishProfile" : "unpublishProfile", { companyId, operationKey });
export const listDiscoverListings = (companyId: string) => owner<{ listings: OwnerListing[] }>("listListings", { companyId }).then(r => r.listings);
export const saveDiscoverListing = (companyId: string, draft: ListingDraft, operationKey = key()) =>
  owner<{ listingId: string; version: number; status: string }>("saveListing", { companyId, ...draft, operationKey });
export const confirmDiscoverAvailability = (companyId: string, listingId: string, availability: Availability, operationKey = key()) =>
  owner<{ listingId: string; availabilityAsOf: string }>("confirmAvailability", { companyId, listingId, availability, operationKey });
export const setDiscoverListingStatus = (companyId: string, listingId: string, status: "published" | "unpublished" | "removed", operationKey = key()) =>
  owner<{ listingId: string }>("setListingStatus", { companyId, listingId, status, operationKey });
export const listDiscoverRequests = (companyId: string) => owner<{ requests: OwnerRequest[] }>("listRequests", { companyId }).then(r => r.requests);
export const decideDiscoverRequest = (companyId: string, requestId: string, decision: "accept" | "decline", note?: string, operationKey = key()) =>
  owner<{ requestId: string; status: string; paymentCollected: false; stockReserved: false; saleRecorded: false }>("decideRequest", { companyId, requestId, decision, ...(note?.trim() ? { note: note.trim() } : {}), operationKey });

// ---- shopper (anonymous)
export const searchDiscover = (q: { q?: string; category?: DiscoverCategory; area?: string; after?: SearchResult["next"]; limit?: number }) =>
  publicCall<SearchResult>("search", { ...q });
export const getDiscoverListing = (listingId: string) => publicCall<PublicListing>("listing", { listingId });
export interface RequestDraft { listingId: string; quantity: number; buyerName: string; buyerContact: string; note: string; consent: boolean; operationKey: string }
export function validateRequestDraft(d: RequestDraft): string | null {
  if (!d.consent) return "Please agree that the shop may contact you about this request.";
  if (!Number.isInteger(d.quantity) || d.quantity < 1 || d.quantity > 20) return "Choose 1 to 20.";
  const name = d.buyerName.trim();
  if (name.length < 2 || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) return "Enter your name.";
  if (!/^[+0-9 ()-]{6,40}$/.test(d.buyerContact.trim())) return "Enter a phone number the shop can call.";
  if (d.note.trim().length > 200 || /[\x00-\x1f\x7f]/.test(d.note)) return "Keep the note under 200 characters.";
  return null;
}
export const sendDiscoverRequest = (d: RequestDraft) =>
  publicCall<RequestReceipt>("request", { listingId: d.listingId, quantity: d.quantity, buyerName: d.buyerName.trim(), buyerContact: d.buyerContact.trim(), note: d.note.trim(), consent: d.consent, operationKey: d.operationKey });
export const discoverRequestStatus = (requestId: string, cancelToken: string) => publicCall<RequestStatus>("status", { requestId, cancelToken });
export const cancelDiscoverRequest = (requestId: string, cancelToken: string) => publicCall<RequestStatus>("cancel", { requestId, cancelToken });

/** Money arrives as a decimal string of minor units. Never convert through Number for display of huge values. */
export function formatDiscoverPrice(minor: string | null, currency: string): string {
  if (minor === null) return "Ask the shop";
  if (!/^(0|[1-9][0-9]{0,14})$/.test(minor)) return "Ask the shop";
  const n = BigInt(minor);
  try {
    const nf = new Intl.NumberFormat(undefined, { style: "currency", currency });
    const d = nf.resolvedOptions().maximumFractionDigits ?? 2;
    return nf.format(Number(n) / 10 ** d);
  } catch { return `${minor} minor units (${currency})`; }
}
/** Honest freshness wording for an owner-confirmed availability label. */
export function availabilityText(a: Availability, asOf: string, now = Date.now()): string {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return AVAILABILITY_LABEL[a];
  const days = Math.floor((now - t) / 86_400_000);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `${AVAILABILITY_LABEL[a]} (shop confirmed ${when})`;
}
