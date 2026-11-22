export const SENSITIVE_OPERATIONS: readonly string[];
export class StepUpError extends Error { code: string; constructor(message: string, code?: string) }
export interface StoredCredential { credentialId: string; publicKeyJwk: JsonWebKey; signCount: number; label?: string; addedAt?: string }
export interface StepUpState { credentials: StoredCredential[]; requireForSensitive: boolean; recoveryCodeConfigured: boolean; passphraseConfigured: boolean }
export function b64uEncode(bytes: Uint8Array): string;
export function b64uDecode(s: string): Uint8Array;
export function decodeCbor(bytes: Uint8Array, offset?: number, depth?: number): { value: unknown; end: number };
export function parseAuthenticatorData(raw: BufferSource): { rpIdHash: Uint8Array; flags: number; signCount: number; attested: null | { aaguid: Uint8Array; credentialId: Uint8Array; coseKey: unknown } };
export function coseToJwk(cose: unknown): JsonWebKey;
export function derToRaw(sig: BufferSource): Uint8Array;
export function verifyRegistration(i: { clientDataJSON: BufferSource; attestationObject: BufferSource; expectedChallenge: string; expectedOrigin: string; rpId: string; requireUserVerification?: boolean }): Promise<{ credentialId: string; publicKeyJwk: JsonWebKey; signCount: number }>;
export function verifyAssertion(i: { credential: StoredCredential | undefined; credentialId: string; clientDataJSON: BufferSource; authenticatorData: BufferSource; signature: BufferSource; expectedChallenge: string; expectedOrigin: string; rpId: string; requireUserVerification?: boolean }): Promise<{ ok: true; signCount: number; userVerified: boolean }>;
export function createChallengeStore(o?: { ttlMs?: number; clock?: () => number }): { issue(purpose: string): string; consume(challenge: string, purpose: string): true; size(): number };
export function canRequireSecurityKey(s: StepUpState): { ok: boolean; reason?: string };
export function removeCredential(s: StepUpState, credentialId: string): { state: StepUpState; changed: boolean; requirementDropped?: boolean };
export function evaluateStepUp(i: { operation: string; state: StepUpState; proofs: { pin?: boolean; keyAssertion?: boolean; recoveryCode?: boolean } }): { allowed: boolean; reason: string; via: string | null; audit?: string };
