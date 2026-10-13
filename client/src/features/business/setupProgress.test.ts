import { describe, expect, it } from "vitest";
import { buildSetupSteps } from "./setupProgress";
describe("company setup progress", () => {
  it("shows zero-stock shop as needing inventory and sale", () => {
    const steps = buildSetupSteps({ products: 0, customers: 0, sales: 0 });
    expect(steps.filter(s => s.done)).toHaveLength(0);
    expect(steps.find(s => s.id === "customers")?.optional).toBe(true);
  });
  it("derives milestones exclusively from current-company counts", () => {
    const steps = buildSetupSteps({ products: 3, customers: 0, sales: 1 });
    expect(steps.find(s => s.id === "products")?.done).toBe(true);
    expect(steps.find(s => s.id === "sales")?.done).toBe(true);
  });
  it("rejects corrupt counts instead of declaring setup complete", () => {
    expect(() => buildSetupSteps({products: -1, customers: 0, sales: 0})).toThrow();
  });
});
