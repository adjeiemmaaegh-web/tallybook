export interface AuthenticatorCredential { credentialId: string; publicKey: string; algorithm: number; signCount: number }
export interface StaffCredentialSnapshot {
  id: string; businessProfileId: string; disabledAt?: string;
  pinHash?: string; salt?: string; role?: string; permissions?: string[]; webAuthn?: AuthenticatorCredential;
}
export function assertAuthenticatorCredentialFresh(initial: StaffCredentialSnapshot | null | undefined, latest: StaffCredentialSnapshot | null | undefined, company: string, count: number): AuthenticatorCredential;
export function assertSupervisorApprovalFresh(before: StaffCredentialSnapshot | null | undefined, latest: StaffCredentialSnapshot | null | undefined, company: string, originalCashierId: string, currentCashierId: string | null, activeCashier: {id: string; role: string} | null | undefined, stillAllowed: boolean): void;
