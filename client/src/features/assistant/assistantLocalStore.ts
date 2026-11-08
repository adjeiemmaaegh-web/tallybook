import { workspaceKey } from "@/auth/ownerWorkspace";
import Dexie, { type Table } from "dexie";
import { nanoid } from "nanoid";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { assertAssistantCompanyScope, orderAssistantHistoryNewest, validateAssistantHistoryLimit } from "./assistantDataSafety.mjs";

export interface StoredWorkflow { id: string; businessProfileId: string; name: string; description: string; commands: string[]; createdAt: string; updatedAt: string }
export interface StoredAlias { id: string; businessProfileId: string; phrase: string; canonicalValue: string; kind: "product" | "customer" | "supplier" | "intent"; confidence: number; enabled: boolean; createdAt: string; updatedAt: string }
export interface AssistantHistoryRecord { id: string; businessProfileId: string; input: string; replyText: string; intent?: string; createdAt: string; replayText: string }

class AssistantLocalDB extends Dexie {
  workflows!: Table<StoredWorkflow, string>;
  aliases!: Table<StoredAlias, string>;
  history!: Table<AssistantHistoryRecord, string>;
  constructor() {
    super(workspaceKey("tallybook-assistant-local"));
    this.version(1).stores({
      workflows: "id, businessProfileId, name, updatedAt",
      aliases: "id, businessProfileId, phrase, kind, enabled, updatedAt",
      history: "id, businessProfileId, createdAt, intent",
    });
  }
}

export const assistantLocalDB = new AssistantLocalDB();

async function open() { await assistantLocalDB.open(); }

function assertActiveCompany(companyId: string) {
  assertAssistantCompanyScope(companyId, getActiveBusinessProfileId());
}

export async function listStoredWorkflows(businessProfileId: string) {
  assertActiveCompany(businessProfileId);
  await open();
  const rows = await assistantLocalDB.workflows.where("businessProfileId").equals(businessProfileId).sortBy("updatedAt");
  assertActiveCompany(businessProfileId);
  return rows;
}
export async function saveStoredWorkflow(input: Omit<StoredWorkflow, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  assertActiveCompany(input.businessProfileId);
  await open();
  return withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.workflows, async () => {
    assertActiveCompany(input.businessProfileId);
    const existing = input.id ? await assistantLocalDB.workflows.get(input.id) : undefined;
    if (existing && existing.businessProfileId !== input.businessProfileId)
      throw new Error("Assistant workflow belongs to another company.");
    assertActiveCompany(input.businessProfileId);
    const now = new Date().toISOString();
    const value: StoredWorkflow = { ...input, id: input.id ?? nanoid(14), createdAt: existing?.createdAt ?? now, updatedAt: now };
    await assistantLocalDB.workflows.put(value);
    return value;
  }));
}
export async function deleteStoredWorkflow(id: string) {
  await open();
  const companyId = getActiveBusinessProfileId();
  await withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.workflows, async () => {
    const existing = await assistantLocalDB.workflows.get(id);
    if (!existing) return;
    assertActiveCompany(companyId);
    if (existing.businessProfileId !== companyId) throw new Error("Assistant workflow belongs to another company.");
    await assistantLocalDB.workflows.delete(id);
  }));
}
export async function listStoredAliases(businessProfileId: string) {
  assertActiveCompany(businessProfileId);
  await open();
  const rows = await assistantLocalDB.aliases.where("businessProfileId").equals(businessProfileId).and((alias) => alias.enabled).toArray();
  assertActiveCompany(businessProfileId);
  return rows;
}
export async function saveStoredAlias(input: Omit<StoredAlias, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  assertActiveCompany(input.businessProfileId);
  await open();
  return withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.aliases, async () => {
    assertActiveCompany(input.businessProfileId);
    const existing = input.id ? await assistantLocalDB.aliases.get(input.id) : undefined;
    if (existing && existing.businessProfileId !== input.businessProfileId)
      throw new Error("Assistant alias belongs to another company.");
    assertActiveCompany(input.businessProfileId);
    const now = new Date().toISOString();
    const value: StoredAlias = { ...input, id: input.id ?? nanoid(14), createdAt: existing?.createdAt ?? now, updatedAt: now };
    await assistantLocalDB.aliases.put(value);
    return value;
  }));
}
export async function deleteStoredAlias(id: string) {
  await open();
  const companyId = getActiveBusinessProfileId();
  await withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.aliases, async () => {
    const existing = await assistantLocalDB.aliases.get(id);
    if (!existing) return;
    assertActiveCompany(companyId);
    if (existing.businessProfileId !== companyId) throw new Error("Assistant alias belongs to another company.");
    await assistantLocalDB.aliases.delete(id);
  }));
}
export async function recordAssistantHistory(value: Omit<AssistantHistoryRecord, "id" | "createdAt">) {
  assertActiveCompany(value.businessProfileId);
  await open();
  return withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.history, async () => {
    assertActiveCompany(value.businessProfileId);
    const row: AssistantHistoryRecord = { ...value, id: nanoid(14), createdAt: new Date().toISOString() };
    // IndexedDB preserves explicit undefined, but the JSON recovery journal
    // cannot. Omit absent optional intent instead of persisting an unreplayable
    // field; keep real intent strings unchanged.
    if (row.intent === undefined) delete row.intent;
    await assistantLocalDB.history.add(row);
    return row;
  }));
}

/** Limited and newest-first for on-screen history. Do not use this for backup. */
export async function listAssistantHistory(businessProfileId: string, limit = 50) {
  assertActiveCompany(businessProfileId);
  validateAssistantHistoryLimit(limit);
  await open();
  const rows = await assistantLocalDB.history.where("businessProfileId").equals(businessProfileId).toArray();
  assertActiveCompany(businessProfileId);
  return orderAssistantHistoryNewest(rows).slice(0, limit);
}

/** Backup must not silently truncate all but the most recent 50 conversations. */
export async function listAllAssistantHistoryForBackup(businessProfileId: string) {
  assertActiveCompany(businessProfileId);
  await open();
  const rows = await assistantLocalDB.history.where("businessProfileId").equals(businessProfileId).toArray();
  assertActiveCompany(businessProfileId);
  return orderAssistantHistoryNewest(rows);
}

export async function clearAssistantHistory(businessProfileId: string) {
  assertActiveCompany(businessProfileId);
  await open();
  await withCrossTabDataLock("shared", () => assistantLocalDB.transaction("rw", assistantLocalDB.history, async () => {
    assertActiveCompany(businessProfileId);
    await assistantLocalDB.history.where("businessProfileId").equals(businessProfileId).delete();
  }));
}
