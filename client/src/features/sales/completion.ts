/** Tactile Ledger integrity reminder: a slow local sale must return control safely; the saved sale key remains the guard against duplicates. */
/** The only checkout failure whose outcome is genuinely unknown: the write may still commit. */
export class SaleCompletionTimeoutError extends Error {}
export function withSaleCompletionTimeout<T>(operation: Promise<T>, timeoutMs = 12_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SaleCompletionTimeoutError("The sale is taking longer than expected. Check recent sales before retrying with the same unchanged cart; the outcome may still be pending.")), timeoutMs); });
  return Promise.race([operation, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}
