/**
 * Conversation memory — pronouns and follow-ups, end to end. One assistant with a controllable clock per test.
 * The most important tests are the safety ones: a remembered customer must never be attached to a sale or payment that didn't name them.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createAssistant, type Assistant } from "./assistant";
import { MEMORY_TTL_MS } from "./conversation";
import type { AssistantReply } from "./index";
import { confirmAction, ledgerCounts, row, useAssistantDb } from "./testKit";
import { formatMinorAmount } from "@/features/inventory/inventory";

const kit = useAssistantDb();
let clock: Date;
let ai: Assistant;
const ghs = (minor: number) => formatMinorAmount(minor, "GHS");
const names = (reply: AssistantReply) => reply.rows?.map((item) => item.primary.replace(/^\d+\.\s*/, "")) ?? [];
/** The reply without the page's "Using recent context" banner, which names whoever is remembered. */
const body = (reply: AssistantReply) => JSON.stringify({ ...reply, context: undefined });
const advance = (ms: number) => { clock = new Date(clock.getTime() + ms); };

beforeEach(() => {
  clock = new Date(2026, 9, 15, 12, 0, 0);
  ai = createAssistant({ currency: "GHS", database: kit.database, now: () => clock });
});

describe("pronouns for the customer just discussed", () => {
  it("“she paid 100 cash” after asking about Adwoa previews a payment for Adwoa, saves nothing, and says who it assumed", async () => {
    await ai.send("How much does Adwoa owe?");
    const before = await ledgerCounts(kit.database);
    const preview = await ai.send("she paid 100 cash");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Customer")).toContain("Adwoa Mensah");
    expect(preview.notice).toContain("Taking “she” to mean Adwoa Mensah");
    expect(await ledgerCounts(kit.database)).toEqual(before);

    await ai.act(confirmAction(preview));
    expect((await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database)).outstandingMinor).toBe(35000);
  });

  it("answers “how much does he owe” about the same customer", async () => {
    await ai.send("How much does Adwoa owe?");
    const reply = await ai.send("how much does she still owe?");
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("Adwoa Mensah");
    expect(reply.notice).toContain("Adwoa Mensah");
  });

  it("works for “to him/her” in a sale, and the preview names the customer", async () => {
    await ai.send("How much does Kwame owe?");
    const preview = await ai.send("sell 2 eggs to him, paid cash");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Customer")).toContain("Kwame Boateng");
  });

  it("remembers the customer from a preview the owner has just seen", async () => {
    await ai.send("Sell 1 eggs to Kwame, paid cash");
    await ai.send("cancel");
    const reply = await ai.send("how much does he owe?");
    expect(reply.text).toContain("Kwame Boateng");
  });

  it("asks who is meant when nothing is remembered, instead of guessing", async () => {
    const reply = await ai.send("he paid 50 cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain("Which customer paid");
    expect((await ledgerCounts(kit.database)).repayments).toBe(0);
    const preview = await ai.send("Adwoa"); // the amount and method were kept
    expect(row(preview, "Customer")).toContain("Adwoa Mensah");
    expect(row(preview, "Amount")).toContain("50.00");
  });

  it("forgets after 15 minutes", async () => {
    await ai.send("How much does Adwoa owe?");
    advance(MEMORY_TTL_MS - 1000);
    expect((await ai.send("she paid 100 cash")).kind).toBe("preview");
    await ai.send("cancel");
    await ai.send("How much does Adwoa owe?");
    advance(MEMORY_TTL_MS + 1000);
    expect((await ai.send("she paid 100 cash")).text).toContain("Which customer paid");
  });

  it("never remembers a lookup that failed", async () => {
    await ai.send("How much does Zainab owe?");
    expect((await ai.send("she paid 50")).text).toContain("Which customer paid");
  });

  it("a sentence that names someone is never rewritten", async () => {
    await ai.send("How much does Adwoa owe?");
    const reply = await ai.send("Kwame paid 20 cash and he is happy");
    expect(reply.text).toContain("Kwame Boateng"); // handled as Kwame (who owes nothing, so refused), not rewritten to Adwoa
    expect(body(reply)).not.toContain("Adwoa");
    expect(reply.notice).toBeUndefined();
  });
});

describe("safety: remembered customers are never attached silently", () => {
  it("a sale that doesn't name a customer does not pick up the last one", async () => {
    await ai.send("How much does Adwoa owe?");
    const reply = await ai.send("Sell 2 eggs, paid cash");
    expect(body(reply)).not.toContain("Adwoa");
    expect(reply.kind === "preview" ? row(reply, "Customer") : reply.text).toMatch(/walk-in|who|customer/i);
  });

  it("a payment with no name asks who paid", async () => {
    await ai.send("How much does Adwoa owe?");
    const reply = await ai.send("record a payment of 50 cash");
    expect(reply.kind).toBe("question");
    expect(body(reply)).not.toContain("Adwoa Mensah paid");
  });
});

describe("“and last month?” — the same question for another period", () => {
  it("best sellers", async () => {
    const first = await ai.send("Best-sellers this month");
    const next = await ai.send("and last month?");
    expect(next.text).toContain("Last month");
    expect(next.text).toContain("best seller");
    expect(next.notice).toContain("same question");
    expect(first.text).toContain("This month");
    expect(names(await ai.send("what about this year"))).toBeDefined();
    expect((await ai.send("what about this year")).text).toContain("This year");
  });

  it("follows the most recent question, whatever it was", async () => {
    await ai.send("Best-sellers this month");
    await ai.send("Top debtors this month");
    const reply = await ai.send("and last month?");
    expect(reply.text).toContain("Last month");
    expect(reply.text.toLowerCase()).toMatch(/credit|unpaid/);
  });

  it("sales totals, including 'today' and a bare 'yesterday'", async () => {
    await ai.send("Show sales for this month");
    expect((await ai.send("and yesterday?")).text).toContain("October 14, 2026");
    expect((await ai.send("how about last month")).text).toContain("Last month");
  });

  it("answers follow-up questions for a previous quarter", async () => {
    await ai.send("Best-sellers this month");
    expect((await ai.send("and last quarter?")).kind).toBe("answer");
  });

  it("does not hijack a complete new sentence", async () => {
    await ai.send("Best-sellers this month");
    const reply = await ai.send("Show sales for last month");
    expect(reply.text).toContain("Last month");
    expect(reply.text).not.toContain("best-selling");
  });

  it("does nothing when there was no earlier question, or it has expired", async () => {
    expect((await ai.send("and last month?")).kind).not.toBe("answer");
    await ai.send("Best-sellers this month");
    advance(MEMORY_TTL_MS + 1000);
    expect((await ai.send("and last month?")).notice).toBeUndefined();
  });
});

describe("“what about Adwoa?” — the same question about someone or something else", () => {
  it("customers", async () => {
    await ai.send("How much does Kwame owe?");
    const reply = await ai.send("what about Adwoa?");
    expect(reply.text).toContain("Adwoa Mensah");
    expect(reply.notice).toContain("same question");
  });

  it("products, and a pronoun for the product just shown", async () => {
    await ai.send("How many eggs are left?");
    const rice = await ai.send("and rice?");
    expect(rice.text).toContain("Rice");
    const again = await ai.send("how many of those are left");
    expect(again.text).toContain("Rice");
    expect(again.notice).toContain("Rice");
  });

  it("suppliers", async () => {
    await ai.send("What did we receive from Kofi Traders?");
    expect((await ai.send("how about ABC Suppliers")).text).toContain("ABC Suppliers");
  });

  it("an unknown name still gets the usual 'add them' offer", async () => {
    await ai.send("How much does Kwame owe?");
    const reply = await ai.send("what about Zainab?");
    expect(reply.kind).toBe("error");
    expect(reply.actions?.some((action) => /Add “Zainab”/.test(action.label))).toBe(true);
  });
});

describe("follow-ups don't interfere with an open question", () => {
  it("while the assistant is waiting for a phone number, a name-like answer is the answer", async () => {
    await ai.send("How much does Kwame owe?");
    await ai.send("Add customer Ama Mensah");
    const reply = await ai.send("0241234567");
    expect(reply.kind).toBe("preview");
    expect(row(reply, "Phone")).toBe("0241234567");
  });
});

describe("the page's context banner and \u201cClear conversation context\u201d run on the real memory", () => {
  it("names whoever is remembered, and stops when the context is cleared", async () => {
    expect((await ai.send("How many eggs are left?")).context).toBeUndefined(); // no customer discussed yet
    const reply = await ai.send("How much does Adwoa owe?");
    expect(reply.context).toBe("Using recent context: Adwoa Mensah");
    expect((await ai.send("how much does she still owe?")).context).toBe("Using recent context: Adwoa Mensah");
    ai.clearContext();
    expect((await ai.send("How many eggs are left?")).context).toBeUndefined();
    expect((await ai.send("she paid 100 cash")).text).toContain("Which customer paid"); // forgotten
  });

  it("the banner disappears with the 15-minute expiry too", async () => {
    await ai.send("How much does Adwoa owe?");
    advance(MEMORY_TTL_MS + 1000);
    expect((await ai.send("How many eggs are left?")).context).toBeUndefined();
  });
});

describe("Stage 5: company-scoped conversational state", () => {
  it("does not reuse customer pronouns after a business switch and return", async () => {
    await ai.send("How much does Adwoa owe?");
    setActiveBusinessProfileId("another-company");
    const reply = await ai.send("she paid 50 cash");
    expect(reply.kind).not.toBe("preview");
    setActiveBusinessProfileId("primary");
    const again = await ai.send("she paid 50 cash");
    expect(again.kind).not.toBe("preview");
  });

  it("invalidates a prepared financial confirmation on company switch", async () => {
    const preview = await ai.send("Sell 1 eggs to Kwame, paid cash");
    expect(preview.kind).toBe("preview");
    setActiveBusinessProfileId("another-company");
    const action = preview.actions?.find((item) => item.type === "confirm");
    expect(action).toBeDefined();
    const response = await ai.act(action!);
    expect(response.text).toMatch(/switched business/i);
    expect(ai.pendingToken()).toBeNull();
    setActiveBusinessProfileId("primary");
  });
});
