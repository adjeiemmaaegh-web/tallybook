export const ST24_ROW_VERSION: 1;
export interface SealedSt24Row { v: 1; n: Uint8Array; c: Uint8Array }
export function deriveSt24Subkeys(dek: Uint8Array): Promise<{ rowKey: Uint8Array; blindKey: Uint8Array }>;
export function sealSt24Row(args: { rowKey: Uint8Array; scope: string; table: string; primaryKey: unknown; record: object }): SealedSt24Row;
export function openSt24Row(args: { rowKey: Uint8Array; scope: string; table: string; primaryKey: unknown; sealed: unknown }): Record<string, unknown>;
export function blindSt24Value(args: { blindKey: Uint8Array; scope: string; table: string; field: string; value: unknown }): string;
export function zeroSt24Key(key: Uint8Array | null | undefined): void;
