/**
 * Connected Commerce shared platform client (CC-X). Owner-only; every decision is made by PostgreSQL.
 * Nothing here publishes data, contacts a shopper, takes payment or posts to a ledger. The UI may only
 * DISPLAY `effective`; it must never compute it. A track is usable only when the server says so.
 */
import { callShop, ShopRejectedError } from "../shopClient";

export const CC_TRACKS = ["discover", "network", "supply", "clementia", "passport"] as const;
export type CcTrack = (typeof CC_TRACKS)[number];

/** Structured error codes from the architecture contract that the platform RPC can return. */
export type CcErrorCode = "NOT_AUTHORIZED" | "STALE_VERSION" | "REQUIRES_CONFIRMATION" | "NOT_AVAILABLE" | "CONFLICT" | "UNKNOWN";

export interface CcTrackState {
  track: CcTrack;
  consent: "none" | "granted" | "revoked";
  consentVersion: string | null;
  currentConsentVersion: string | null;
  flagEnabled: boolean;
  flagVersion: number;
  killed: boolean;
  /** Server-computed: flag on AND current consent granted AND not switched off by the platform. */
  effective: boolean;
}
export type CcVerificationStatus = "none" | "self_declared" | "documents_submitted" | "reviewed_verified" | "rejected" | "suspended";
export interface CcVerification {
  status: CcVerificationStatus;
  /** Honest, server-supplied wording. Never present self-declared details as verified. */
  label: string;
  externallyVerified: boolean;
  declaredName: string | null;
  version: number;
}
export interface CcPlatformStatus {
  tracks: Record<CcTrack, CcTrackState>;
  verification: CcVerification;
  publicationDefault: "off";
  replayed?: boolean;
}

export class CcError extends Error {
  constructor(readonly code: CcErrorCode, message: string) { super(message); this.name = "CcError"; }
}

const FRIENDLY: Record<CcErrorCode, string> = {
  NOT_AUTHORIZED: "Only the business owner can change Connected Commerce settings.",
  STALE_VERSION: "This changed elsewhere. Reload and review the latest version.",
  REQUIRES_CONFIRMATION: "Review and accept the current terms first. This service stays off until you do.",
  NOT_AVAILABLE: "This service is temporarily switched off by Tallybook.",
  CONFLICT: "That request was already used for something different. Start again.",
  UNKNOWN: "Connected Commerce couldn't complete that request.",
};

/** Map a server rejection (message prefix `CC:CODE`) to a structured, owner-friendly error. */
export function parseCcError(error: unknown): CcError {
  if (error instanceof CcError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = /^CC:(NOT_AUTHORIZED|STALE_VERSION|REQUIRES_CONFIRMATION|NOT_AVAILABLE|CONFLICT)\b/.exec(raw);
  const code = (m?.[1] as CcErrorCode | undefined) ?? "UNKNOWN";
  // Only whitelisted copy is shown; raw server text is never echoed to the user for unknown failures.
  return new CcError(code, code === "UNKNOWN" && /Business access denied|Active Auth session/.test(raw) ? raw : FRIENDLY[code]);
}

const newKey = () => crypto.randomUUID();
async function call(action: string, input: Record<string, unknown>): Promise<CcPlatformStatus> {
  try {
    return await callShop<CcPlatformStatus>(action, input, "tallybook_cc_platform");
  } catch (error) {
    if (error instanceof ShopRejectedError) throw parseCcError(error);
    throw error; // unreachable-network errors keep their retry-safe meaning
  }
}

export const getCcStatus = (companyId: string) => call("status", { companyId });
export const grantCcConsent = (companyId: string, track: CcTrack, consentVersion: string, operationKey = newKey()) =>
  call("grantConsent", { companyId, track, consentVersion, operationKey });
export const revokeCcConsent = (companyId: string, track: CcTrack, operationKey = newKey()) =>
  call("revokeConsent", { companyId, track, operationKey });
export const setCcFlag = (companyId: string, track: CcTrack, enabled: boolean, expectedVersion?: number, operationKey = newKey()) =>
  call("setFlag", { companyId, track, enabled, ...(expectedVersion === undefined ? {} : { expectedVersion }), operationKey });
export const submitCcVerification = (companyId: string, declaredName: string, evidenceRef?: string, operationKey = newKey()) =>
  call("submitVerification", { companyId, declaredName, ...(evidenceRef ? { evidenceRef } : {}), operationKey });

/** What the owner can do next for a track, derived only from server-supplied facts. */
export type CcTrackAction = "wait_for_terms" | "accept_terms" | "accept_new_terms" | "turn_on" | "turn_off" | "unavailable";
export function nextTrackAction(s: CcTrackState): CcTrackAction {
  if (s.killed) return s.flagEnabled ? "turn_off" : "unavailable";
  if (s.effective || s.flagEnabled) return "turn_off";
  if (s.currentConsentVersion === null) return "wait_for_terms";
  if (s.consent !== "granted") return "accept_terms";
  if (s.consentVersion !== s.currentConsentVersion) return "accept_new_terms";
  return "turn_on";
}
