/**
 * Consent texts the app can DISPLAY, keyed by track and version. A track's "accept" button appears only when this
 * registry holds text whose SHA-256 equals the hash the server published for the current version
 * (cc_consent_versions.text_sha256, itself inserted only with a legal-review reference).
 *
 * This registry is intentionally EMPTY. No counsel-approved text exists yet (CC-X-09), so no owner can accept
 * anything and every Connected Commerce service stays off. Adding text here without a matching server row, or a
 * server row without matching text, still leaves "accept" unavailable.
 */
import type { CcTrack } from "./platform";

export interface ConsentText { version: string; title: string; body: string }
export const CONSENT_TEXTS: Readonly<Partial<Record<CcTrack, readonly ConsentText[]>>> = Object.freeze({});

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/** The text for this exact version, only if it hashes to the server's published hash. */
export async function displayableConsent(
  texts: Readonly<Partial<Record<CcTrack, readonly ConsentText[]>>>, track: CcTrack, version: string | null, sha256: string | null,
): Promise<ConsentText | null> {
  if (!version || !sha256) return null;
  const candidate = texts[track]?.find(t => t.version === version);
  if (!candidate) return null;
  return (await sha256Hex(`${candidate.title}\n\n${candidate.body}`)) === sha256 ? candidate : null;
}
