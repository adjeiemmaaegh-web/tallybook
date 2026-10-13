import { describe, expect, it } from "vitest";
import { applyLocalAliases } from "./aliases";
import { planForText } from "./taskPlanner";
import { exportLocalWorkflows, listLocalWorkflows, saveLocalWorkflow } from "./workflows";

describe("offline assistant intelligence", () => {
  it("plans a multi-domain overview without writing", () => {
    const result = planForText("Check sales, stock, and customer debt this month");
    expect(result?.plan.steps.map((step) => step.type)).toEqual(["read_sales", "read_inventory", "read_debt"]);
    expect(result?.plan.requiresConfirmation).toBe(false);
    expect(result?.reply.actions?.[0].type).toBe("run_plan");
  });

  it("recognizes reusable local workflows", () => {
    saveLocalWorkflow({ id: "test", name: "Test close", description: "Local", commands: ["End of day"] });
    expect(listLocalWorkflows().some((workflow) => workflow.name === "Test close")).toBe(true);
    expect(exportLocalWorkflows()).toContain("Test close");
  });

  it("normalizes common shop phrasing locally", () => {
    expect(applyLocalAliases("what tins dey finish")).toBe("what is running low");
    expect(applyLocalAliases("how mch rice left")).toBe("how much rice left");
  });
});
