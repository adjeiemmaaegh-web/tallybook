/**
 * Device-local drafts (parked cart, pending-checkout recovery) hold products, amounts and customer ids. They live in localStorage,
 * outside the encrypted ledger, so when ledger encryption is on they are sealed with the SAME key (ST24-05 remainder):
 *  - plaintext ledger: stored exactly as before (no behaviour change);
 *  - encrypted + unlocked: stored sealed, authenticated against its own storage key (a draft cannot be moved or swapped);
 *  - encrypted + locked: sealed drafts are unreadable (reads throw LedgerLockedError, so callers report "unavailable", never "empty").
 * Enabling encryption seals existing drafts; turning it off restores them; a data-key rotation re-seals them under the new key.
 */
import { db as singleton } from "@/db/TallybookDB";
import type { LedgerSeal } from "./st24LedgerSeal";
import { LedgerIntegrityError, LedgerLockedError } from "./st24LedgerSeal";

const MARK = "tb-sealed:v1:";
const TABLE = "localDraft";
/** Storage keys of drafts that must follow the ledger's encryption state. */
export const DRAFT_KEY_MARKERS = ["tallybook:parked-cart:v1:", "tallybook:pending-checkout:v1:"] as const;
const isDraftKey = (key: string) => DRAFT_KEY_MARKERS.some(m => key.includes(m));

const toB64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (t: string) => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const store = (): Storage => { if (typeof localStorage === "undefined") throw new Error("Device storage is unavailable."); return localStorage; };

export function createDraftStore(getSeal: () => LedgerSeal) {
  const sealing = () => { const s = getSeal(); return s.mode === "encrypted" || s.mode === "migrating"; };
  function read(key: string): string | null {
    const raw = store().getItem(key);
    if (raw === null) return null;
    if (!raw.startsWith(MARK)) return raw; // plaintext (never sealed, or written before encryption was turned on)
    const seal = getSeal();
    if (!seal.unlocked) throw new LedgerLockedError();
    try {
      const body = JSON.parse(raw.slice(MARK.length)) as { v: number; n: string; c: string };
      const opened = seal.open(TABLE, key, { v: body.v, n: fromB64(body.n), c: fromB64(body.c) }) as { text?: unknown };
      if (typeof opened.text !== "string") throw new Error("shape");
      return opened.text;
    } catch (e) { if (e instanceof LedgerLockedError) throw e; throw new LedgerIntegrityError("A saved draft could not be authenticated. It was left untouched."); }
  }
  function write(key: string, text: string): void {
    const seal = getSeal();
    if (!sealing()) { store().setItem(key, text); return; }
    if (!seal.unlocked) throw new LedgerLockedError();
    const sealed = seal.seal(TABLE, key, { text });
    store().setItem(key, MARK + JSON.stringify({ v: sealed.v, n: toB64(sealed.n), c: toB64(sealed.c) }));
  }
  const remove = (key: string) => store().removeItem(key);
  const draftKeys = () => { const out: string[] = []; const s = store(); for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && isDraftKey(k)) out.push(k); } return out; };
  return {
    read, write, remove, draftKeys,
    /** Seal every plaintext draft (encryption turned on). Returns how many were converted. */
    sealAll(): number { let n = 0; for (const k of draftKeys()) { const raw = store().getItem(k); if (raw !== null && !raw.startsWith(MARK)) { write(k, raw); n++; } } return n; },
    /** Restore every draft to plaintext (encryption turned off). Needs the ledger unlocked. */
    unsealAll(): number { let n = 0; for (const k of draftKeys()) { const raw = store().getItem(k); if (raw !== null && raw.startsWith(MARK)) { store().setItem(k, read(k)!); n++; } } return n; },
    /** Re-seal every sealed draft under the CURRENT key (data-key rotation: they are read via the outgoing key, written under the new one). */
    resealAll(): number { let n = 0; for (const k of draftKeys()) { const raw = store().getItem(k); if (raw !== null && raw.startsWith(MARK)) { write(k, read(k)!); n++; } } return n; },
  };
}
export const drafts = createDraftStore(() => singleton.ledgerSeal);
