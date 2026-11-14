import type { AssistantAction, AssistantReply, ReplyDetail } from "./types";

export type AssistantStep =
  | { type: "read_sales"; label: string }
  | { type: "read_inventory"; label: string }
  | { type: "read_debt"; label: string }
  | { type: "calculate_reorder"; label: string };

export interface AssistantPlan {
  goal: string;
  steps: AssistantStep[];
  requiresConfirmation: boolean;
}

export interface PlanResult {
  plan: AssistantPlan;
  reply: AssistantReply;
}

const planActions = (steps: AssistantStep[]): AssistantAction[] => [
  { type: "run_plan", label: "Run this check", plan: { goal: "Business overview", steps, requiresConfirmation: false } },
  { type: "cancel", label: "Cancel" },
];

export function planForText(raw: string): PlanResult | null {
  const text = raw.toLowerCase().replace(/[?!.,-]/g, " ").replace(/\s+/g, " ").trim();
  const domainCount = ["sales", "stock", "inventory", "debt", "owe", "reorder"].filter((word) => text.includes(word)).length;
  const isOverview = /\b(?:check|review|summari[sz]e|show)\b/.test(text) && (domainCount >= 2 || text.includes("business overview"));
  const isMorning = /\b(?:morning check|morning summary|start of day)\b/.test(text);
  const isEndOfDay = /\b(?:end of day|close of day|daily close)\b/.test(text);
  if (!isOverview && !isMorning && !isEndOfDay) return null;

  const steps: AssistantStep[] = [];
  if (isMorning || isEndOfDay || text.includes("sales")) steps.push({ type: "read_sales", label: isEndOfDay ? "Review today's sales and collections" : "Review recent sales" });
  if (isMorning || isEndOfDay || text.includes("stock") || text.includes("inventory") || text.includes("reorder")) steps.push({ type: "read_inventory", label: "Review current stock" });
  if (isMorning || text.includes("debt") || text.includes("owe")) steps.push({ type: "read_debt", label: "Review outstanding customer balances" });
  if (text.includes("reorder") || text.includes("morning")) steps.push({ type: "calculate_reorder", label: "Calculate reorder suggestions from recent sales" });
  const unique = steps.filter((step, index) => steps.findIndex((candidate) => candidate.type === step.type) === index);
  const goal = isMorning ? "Morning business check" : isEndOfDay ? "End-of-day business summary" : "Business overview";
  const plan: AssistantPlan = { goal, steps: unique, requiresConfirmation: false };
  const details: ReplyDetail[] = unique.map((step, index) => ({ label: String(index + 1), value: step.label }));
  return {
    plan,
    reply: {
      kind: "question",
      text: `I can prepare a ${goal.toLowerCase()} from your saved local records. Nothing will be changed.`,
      details,
      plan,
      actions: planActions(unique),
    },
  };
}

export function planEvidence(plan: AssistantPlan): ReplyDetail[] {
  return plan.steps.map((step, index) => ({ label: `Step ${index + 1}`, value: step.label }));
}
