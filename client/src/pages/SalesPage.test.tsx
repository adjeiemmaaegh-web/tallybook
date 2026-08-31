/** Tactile Ledger regression: a sale operation that stalls must become recoverable rather than leaving the owner at a permanent spinner. */
import { describe, expect, it } from "vitest";
import { withSaleCompletionTimeout } from "@/features/sales/completion";

describe("sale completion recovery", () => {
  it("rejects a stalled local completion operation with a clear retry-safe message", async () => {
    await expect(withSaleCompletionTimeout(new Promise<never>(() => {}), 1)).rejects.toThrow("No second sale will be created if you try again.");
  });

  it("returns the saved result when the local completion operation resolves promptly", async () => {
    await expect(withSaleCompletionTimeout(Promise.resolve("sale-saved"), 1_000)).resolves.toBe("sale-saved");
  });
});
