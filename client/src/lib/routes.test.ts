/** Tactile Ledger testing reminder: navigation is explicit about which features belong to later approved stages. */
import { describe, expect, it } from "vitest";
import { appRoutes, getRouteDefinition } from "@/lib/routes";

describe("application routes", () => {
  it("provides one unique route for each current application destination", () => {
    expect(appRoutes.map((route) => route.href)).toEqual(["/", "/business", "/inventory", "/customers", "/sales", "/reports", "/end-of-day", "/purchases", "/expenses", "/business-health", "/backup"]);
    expect(new Set(appRoutes.map((route) => route.href)).size).toBe(appRoutes.length);
  });

  it("keeps future business workflows explicitly gated by their approved stage", () => {
    expect(getRouteDefinition("business").availableFromStage).toBe(2);
    expect(getRouteDefinition("inventory").availableFromStage).toBe(3);
    expect(getRouteDefinition("sales").availableFromStage).toBe(5);
    expect(getRouteDefinition("endOfDay").availableFromStage).toBe(6);
    expect(getRouteDefinition("purchases").availableFromStage).toBe(7);
    expect(getRouteDefinition("expenses").availableFromStage).toBe(8);
    expect(getRouteDefinition("businessHealth").availableFromStage).toBe(8);
    expect(getRouteDefinition("backup").availableFromStage).toBe(9);
  });
});
