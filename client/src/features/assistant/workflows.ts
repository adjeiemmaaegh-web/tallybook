import { deleteStoredWorkflow, listStoredWorkflows, saveStoredWorkflow } from "./assistantLocalStore";

export interface LocalWorkflow {
  id: string;
  name: string;
  description: string;
  commands: string[];
}

const BUILT_IN: LocalWorkflow[] = [
  { id: "morning-check", name: "Morning check", description: "Review recent sales, stock, balances, and reorder estimates.", commands: ["Morning check"] },
  { id: "end-of-day", name: "End-of-day summary", description: "Review today's sales and collections, then current stock.", commands: ["End of day"] },
];

let customWorkflows: LocalWorkflow[] = [];

export function listLocalWorkflows(): LocalWorkflow[] { return [...BUILT_IN, ...customWorkflows].map((workflow) => ({ ...workflow, commands: [...workflow.commands] })); }

export function saveLocalWorkflow(workflow: LocalWorkflow): LocalWorkflow {
  const normalized = { ...workflow, id: workflow.id || `workflow-${Date.now()}`, commands: [...workflow.commands] };
  customWorkflows = [...customWorkflows.filter((item) => item.id !== normalized.id), normalized];
  return normalized;
}

export function removeLocalWorkflow(id: string): void { customWorkflows = customWorkflows.filter((workflow) => workflow.id !== id); }

export function exportLocalWorkflows(): string { return JSON.stringify(listLocalWorkflows(), null, 2); }

export function importLocalWorkflows(serialized: string): number {
  const parsed = JSON.parse(serialized) as LocalWorkflow[];
  if (!Array.isArray(parsed)) throw new Error("Workflow file must contain a list.");
  const valid = parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.commands));
  customWorkflows = valid.map((item) => ({ id: item.id, name: item.name, description: item.description ?? "Local workflow", commands: item.commands.map(String) }));
  return valid.length;
}

export function workflowByName(name: string): LocalWorkflow | undefined {
  const normalized = name.trim().toLowerCase();
  return listLocalWorkflows().find((workflow) => workflow.name.toLowerCase() === normalized);
}

export async function listPersistentWorkflows(businessProfileId: string): Promise<LocalWorkflow[]> {
  return (await listStoredWorkflows(businessProfileId)).map(({ id, name, description, commands }) => ({ id, name, description, commands }));
}

export async function savePersistentWorkflow(businessProfileId: string, workflow: Omit<LocalWorkflow, "id"> & { id?: string }): Promise<LocalWorkflow> {
  const saved = await saveStoredWorkflow({ ...workflow, id: workflow.id, businessProfileId });
  return { id: saved.id, name: saved.name, description: saved.description, commands: saved.commands };
}

export async function deletePersistentWorkflow(id: string): Promise<void> { await deleteStoredWorkflow(id); }
