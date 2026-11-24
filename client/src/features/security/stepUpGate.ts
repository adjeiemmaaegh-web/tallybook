/** Decides whether a sensitive operation may proceed, given the owner's optional security-key settings.
 *  The owner is already signed in (PIN/passphrase). If a key is REQUIRED they must touch it, or use the recovery code instead.
 *  With no key enrolled / not required, behaviour is unchanged. */
import type { TallybookDB } from "@/db/TallybookDB";
import { evaluateStepUp, StepUpError, type StepUpState } from "./webauthnStepUp.mjs";
import { confirmWithSecurityKey, loadStepUpState } from "./webauthnClient";
import { verifyRecoveryCode } from "./st24LedgerSecurity";

export interface StepUpOutcome { allowed: boolean; via: string | null; reason: string; audit?: string }
export interface StepUpDeps { confirmKey: typeof confirmWithSecurityKey; verifyCode: typeof verifyRecoveryCode; loadState: typeof loadStepUpState }
const defaults: StepUpDeps = { confirmKey: confirmWithSecurityKey, verifyCode: verifyRecoveryCode, loadState: loadStepUpState };

export async function authorizeSensitiveOperation(
  operation: string, o: { businessId: string; db: TallybookDB; recoveryCode?: string; recoveryCodeConfigured?: boolean }, deps: StepUpDeps = defaults,
): Promise<StepUpOutcome> {
  // An encrypted ledger always has a recovery code; callers may override (e.g. to test the unconfigured case).
  const state: StepUpState = { ...deps.loadState(o.businessId), recoveryCodeConfigured: o.recoveryCodeConfigured ?? true };
  const pre = evaluateStepUp({ operation, state, proofs: { pin: true } });
  if (pre.allowed) return pre;                                                   // not required: nothing to prove
  if (o.recoveryCode?.trim()) {                                                  // explicit alternative: no key touch needed
    if (await deps.verifyCode(o.db, o.recoveryCode)) return evaluateStepUp({ operation, state, proofs: { pin: true, recoveryCode: true } });
    return { allowed: false, via: null, reason: "That recovery code is not correct." };
  }
  try { await deps.confirmKey({ businessId: o.businessId }); }
  catch (e) { return { allowed: false, via: null, reason: e instanceof StepUpError && e.code === "cancelled" ? "Security key check was cancelled. Try again, or use your recovery code." : "The security key could not be verified. Try again, or use your recovery code." }; }
  return evaluateStepUp({ operation, state, proofs: { pin: true, keyAssertion: true } });
}
