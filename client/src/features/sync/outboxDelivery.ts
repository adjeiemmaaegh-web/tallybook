/** Explicit, single-event HTTPS metadata delivery. Does not replicate business records.
 * Credentials are provided by the caller for this invocation and are never persisted here.
 * No automatic retries: ambiguous transport errors leave the event pending for safe replay.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { validateOutboxEvent, type SyncOutboxEvent } from "./syncFoundation";
import { acknowledgeStagedEvent, validateJournalReceipt, type JournalReceipt } from "./outboxAcknowledgements";

export type StageCredentials = { capability: string; session: string };
export type StageTransport = (input: string, init: RequestInit) => Promise<Response>;
export type StageResult = "acknowledged" | "already-acknowledged" | "conflict";

export function validateStageEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) throw new Error("Invalid synchronization endpoint.");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Invalid synchronization URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/api/sync/events/stage" || !url.hostname || url.origin === "null")
    throw new Error("Only a credential-free HTTPS event-staging endpoint is allowed.");
  return url.href;
}

export function eventMetadata(event: SyncOutboxEvent) {
  validateOutboxEvent(event);
  if (event.status !== "pending") throw new Error("Only pending events may be staged.");
  return { organizationId: event.businessProfileId, deviceId: event.deviceId,
    eventId: event.id, operationId: event.operationId, payloadDigest: event.payloadDigest };
}

/** Transmit metadata only; reject redirects and untrusted/malformed responses. */
export async function deliverStagedMetadata(
  endpoint: string, event: SyncOutboxEvent, credentials: StageCredentials,
  transport: StageTransport = fetch,
): Promise<JournalReceipt> {
  const url = validateStageEndpoint(endpoint);
  const payload = eventMetadata(event);
  if (typeof credentials?.capability !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credentials.capability) || credentials.capability.length > 4096 ||
      typeof credentials?.session !== "string" || credentials.session.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credentials.session))
    throw new Error("Missing or malformed synchronization credentials.");
  const response = await transport(url, {
    method: "POST", mode: "cors", redirect: "error", cache: "no-store", credentials: "omit",
    headers: { "content-type": "application/json", authorization: `Bearer ${credentials.capability}`,
      "x-tallybook-session": credentials.session, "x-tallybook-org-id": payload.organizationId,
      "x-tallybook-device-id": payload.deviceId },
    body: JSON.stringify(payload),
  });
  if (!response || (response.status !== 200 && response.status !== 201 && response.status !== 409) ||
      response.redirected || response.type === "opaque" || !response.url || response.url !== url)
    throw new Error("Untrusted or unsuccessful staging response; event remains pending.");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) throw new Error("Invalid staging response media type.");
  const raw = await response.text();
  if (raw.length > 2048) throw new Error("Oversized staging response.");
  let receipt: JournalReceipt;
  try { receipt = JSON.parse(raw) as JournalReceipt; } catch { throw new Error("Malformed staging receipt."); }
  validateJournalReceipt(receipt);
  if ((response.status === 201 && receipt.status !== "stored") ||
      (response.status === 200 && receipt.status !== "duplicate") ||
      (response.status === 409 && receipt.status !== "conflict") ||
      receipt.organizationId !== payload.organizationId || receipt.eventId !== payload.eventId ||
      receipt.operationId !== payload.operationId)
    throw new Error("Staging receipt does not match the request.");
  return receipt;
}

/** Recheck consent and active device immediately before transmission, then acknowledge transactionally. */
export async function deliverPendingOutboxEvent(database: TallybookDB, businessProfileId: string,
  eventId: string, endpoint: string, credentials: StageCredentials,
  transport: StageTransport = fetch): Promise<StageResult> {
  const event = await database.transaction("r", database.businessProfiles, database.syncConsents,
    database.syncDevices, database.syncOutbox, async () => {
      if (!(await database.businessProfiles.get(businessProfileId)) ||
          (await database.syncConsents.get(businessProfileId))?.enabled !== true)
        throw new Error("Company synchronization is not enabled.");
      const pending = await database.syncOutbox.get(eventId);
      if (!pending || pending.businessProfileId !== businessProfileId || pending.status !== "pending")
        throw new Error("No pending company-scoped event.");
      const device = await database.syncDevices.get(pending.deviceId);
      if (!device || device.businessProfileId !== businessProfileId || device.status !== "active")
        throw new Error("Device is not active.");
      return pending;
    });
  const receipt = await deliverStagedMetadata(endpoint, event, credentials, transport);
  return acknowledgeStagedEvent(database, businessProfileId, eventId, receipt);
}
