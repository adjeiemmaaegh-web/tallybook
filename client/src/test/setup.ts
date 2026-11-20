/** Tactile Ledger testing reminder: database behavior is exercised against a browser-like IndexedDB implementation, never localStorage. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, vi } from "vitest";

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB, writable: true });
Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange, writable: true });

afterEach(() => cleanup());

// jsdom does not implement the browser Web Locks API. Model cross-tab lock
// availability to exercise transaction coordination in Dexie/Vitest fixtures.
// This shim deliberately DOES NOT claim to be a real multi-process browser.
const activeWebLocks = new Map<string, {readers:number; writer:boolean}>();
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {
  async request<T>(name:string, options:{mode:'shared'|'exclusive'; ifAvailable:true}, callback:(lock:object|null)=>Promise<T>):Promise<T> {
    let held=activeWebLocks.get(name);
    if (!held) { held={readers:0,writer:false};activeWebLocks.set(name,held); }
    const available=!held.writer && (options.mode==='shared'||held.readers===0);
    if (!available) return callback(null);
    if (options.mode==='shared') held.readers++;
    else held.writer=true;
    try { return await callback({name,mode:options.mode}); }
    finally {
      if(options.mode==='shared') held.readers--;
      else held.writer=false;
      if(!held.writer&&!held.readers)activeWebLocks.delete(name);
    }
  },
}});

// ST24-05 verification mode: TALLYBOOK_ENCRYPTED_TESTS=1 forces EVERY TallybookDB connection in the whole suite
// into encrypted mode with a fixed test key, so the existing service tests prove the layer is transparent.
// Normal runs are untouched. This lives only in the test setup file; production code has no such switch.
// "1" = migrating mode (seal on write, tolerate legacy plaintext rows that upgrade tests seed on purpose);
// "2" = strict encrypted mode (any plaintext row is refused).
const ENCRYPTED_SUITE = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const suiteKeys = ENCRYPTED_SUITE
  ? await (await import("@/features/security/st24RowCipher.mjs")).deriveSt24Subkeys(new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255))
  : null;
vi.mock("@/features/security/st24LedgerSeal", async importOriginal => {
  const real = await importOriginal<typeof import("@/features/security/st24LedgerSeal")>();
  if (process.env.TALLYBOOK_ENCRYPTED_TESTS !== "1" && process.env.TALLYBOOK_ENCRYPTED_TESTS !== "2") return real;
  class AutoSealed extends real.LedgerSeal {
    constructor(scope: string) {
      super(scope);
      if (suiteKeys) { this.unlock(suiteKeys); this.setMode(process.env.TALLYBOOK_ENCRYPTED_TESTS === "2" ? "encrypted" : "migrating"); }
    }
  }
  return { ...real, LedgerSeal: AutoSealed };
});
