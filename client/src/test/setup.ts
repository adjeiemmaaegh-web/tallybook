/** Tactile Ledger testing reminder: database behavior is exercised against a browser-like IndexedDB implementation, never localStorage. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach } from "vitest";

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
