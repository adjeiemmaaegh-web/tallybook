/** Tactile Ledger testing reminder: database behavior is exercised against a browser-like IndexedDB implementation, never localStorage. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach } from "vitest";

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB, writable: true });
Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange, writable: true });

afterEach(() => cleanup());
