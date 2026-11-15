import { describe, expect, it } from "vitest";
import { createExpense } from "@/features/expenses/expenses";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { lockStaff } from "@/features/staff/staff";
import { useAssistantDb } from "./testKit";
import { isExpenseReviewRequest } from "./expenseReview";

const now = new Date("2026-03-15T12:00:00.000Z");

describe("Clementia read-only spending questions", () => {
  const kit = useAssistantDb();
  const record = (category: "transport" | "rent" | "utilities", amount: string, expenseDate: string) =>
    createExpense({ category, amount, expenseDate, currency: "GHS" }, kit.database);

  it("recognizes spending reads but never takes a recording or help question as a read", () => {
    expect(isExpenseReviewRequest("How much did we spend today?")).toBe(true);
    expect(isExpenseReviewRequest("Show expenses this month")).toBe(true);
    expect(isExpenseReviewRequest("Record expense rent 100 cedis today")).toBe(false);
    expect(isExpenseReviewRequest("How do I record expenses?")).toBe(false);
    expect(isExpenseReviewRequest("How much did Adwoa spend?")).toBe(false);
  });

  it("totals only verified company-currency expenses in the requested period and category", async () => {
    await record("transport", "12.50", "2026-03-15");
    await record("rent", "100", "2026-03-14");
    await record("transport", "3.25", "2026-03-01");
    await record("utilities", "21", "2026-02-28");
    const assistant = kit.assistantAt(now);
    const before = await kit.database.expenses.toArray();
    const today = await assistant.send("How much did we spend today?");
    expect(today.kind).toBe("answer");
    expect(today.text).toContain(formatMinorAmount(1250, "GHS"));
    const dated = await assistant.send("Show expenses on 2026-03-15");
    expect(dated.text).toContain(formatMinorAmount(1250, "GHS"));
    expect(dated.details?.find((item) => item.label === "Verified expense entries")?.value).toBe("1");
    expect(today.details?.find((item) => item.label === "Verified expense entries")?.value).toBe("1");
    const week = await assistant.send("Show expenses last 7 days");
    expect(week.text).toContain(formatMinorAmount(11250, "GHS"));
    const marchTransport = await assistant.send("Show transport expenses this month");
    expect(marchTransport.text).toContain(formatMinorAmount(1575, "GHS"));
    expect(marchTransport.details?.find((item) => item.label === "Verified expense entries")?.value).toBe("2");
    const february = await assistant.send("Expense summary last month");
    expect(february.text).toContain(formatMinorAmount(2100, "GHS"));
    expect(await kit.database.expenses.toArray()).toEqual(before);
  });

  it("excludes foreign-company and legacy or mismatched-currency records without hiding the limitation", async () => {
    await record("rent", "10", "2026-03-15");
    const createdAt = now.toISOString();
    for (const [id, company, currency, amount] of [
      ["foreign", "another-business", "GHS", 99999],
      ["usd", "primary", "USD", 20000],
      ["unknown", "primary", undefined, 5000],
      ["unsafe", "primary", "GHS", Number.MAX_SAFE_INTEGER + 1],
    ] as const) {
      await kit.database.expenses.add({
        id, businessProfileId: company, category: "rent", amountMinor: amount,
        ...(currency ? { currency } : {}), expenseDate: "2026-03-15",
        submissionKey: "legacy-" + id, createdAt,
      });
    }
    const assistant = kit.assistantAt(now);
    const reply = await assistant.send("Show expenses today");
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain(formatMinorAmount(1000, "GHS"));
    expect(reply.moreText).toMatch(/3 saved entries.*excluded/i);
    expect(reply.text).not.toContain("999");
    expect(reply.details?.find((item) => item.label === "Verified expense entries")?.value).toBe("1");
  });

  it("fails closed when reports permission is unavailable and never changes financial tables", async () => {
    await record("transport", "5", "2026-03-15");
    const before = await kit.database.expenses.toArray();
    const shifts = await kit.database.staffShifts.toArray();
    const assistant = kit.assistantAt(now);
    lockStaff("primary");
    const reply = await assistant.send("Show expenses today");
    expect(reply.kind).toBe("error");
    expect(await kit.database.expenses.toArray()).toEqual(before);
    expect(await kit.database.staffShifts.toArray()).toEqual(shifts);
  });

  it("asks for one supported period instead of silently summing ambiguous time ranges", async () => {
    const assistant = kit.assistantAt(now);
    expect((await assistant.send("Show expenses today and yesterday")).kind).toBe("question");
    expect((await assistant.send("Show expenses last week")).kind).toBe("question");
    expect((await assistant.send("Show expenses for March")).kind).toBe("question");
    expect((await assistant.send("Show expenses on 2026-02-31")).kind).toBe("question");
    expect((await assistant.send("Show expenses for 2026")).kind).toBe("question");
    expect((await assistant.send("Show expenses today and 2026-03-15")).kind).toBe("question");
    expect(await kit.database.expenses.count()).toBe(0);
  });
});
