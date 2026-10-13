import type { TallybookDB } from "@/db/TallybookDB";

export type AssistantToolMode = "read" | "prepare-write" | "write";
export interface AssistantToolContext { database: TallybookDB; currency: string; companyId: string; now: Date }
export interface AssistantTool<Input, Output> { id: string; description: string; mode: AssistantToolMode; run(input: Input, context: AssistantToolContext): Promise<Output> }

const tools = new Map<string, AssistantTool<unknown, unknown>>();
export function registerAssistantTool<Input, Output>(tool: AssistantTool<Input, Output>) { tools.set(tool.id, tool as AssistantTool<unknown, unknown>); return tool; }
export function getAssistantTool<Input, Output>(id: string): AssistantTool<Input, Output> | undefined { return tools.get(id) as AssistantTool<Input, Output> | undefined; }
export function listAssistantTools() { return Array.from(tools.values()).map(({ id, description, mode }) => ({ id, description, mode })); }
export async function runAssistantTool<Input, Output>(id: string, input: Input, context: AssistantToolContext): Promise<Output> {
  const tool = getAssistantTool<Input, Output>(id); if (!tool) throw new Error(`Unknown assistant tool: ${id}`);
  if (tool.mode === "write") throw new Error("Direct assistant writes are disabled; use a confirmation-gated transaction preview.");
  return tool.run(input, context);
}
