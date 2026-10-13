/** Tallybook Assistant public surface. Everything else in this folder is an internal building block. */
export { createAssistant, type Assistant, type AssistantOptions } from "./assistant";
export { parseCommand } from "./intentParser";
export { appCapabilities, applicationReply, findAppCapability, parseApplicationRequest } from "./appKnowledge";
export type { AssistantAction, AssistantIntent, AssistantPlan, AssistantReply, ParsedCommand, ResolvedCommand, TransactionPreviewView } from "./types";
export { planForText } from "./taskPlanner";
export { deletePersistentWorkflow, exportLocalWorkflows, importLocalWorkflows, listLocalWorkflows, listPersistentWorkflows, removeLocalWorkflow, saveLocalWorkflow, savePersistentWorkflow } from "./workflows";
export { applyLocalAliases, listBuiltInAliases } from "./aliases";
export { ENGLISH_TALLYBOOK_VOCABULARY, explainLanguage, interpretLanguage } from "./languageUnderstanding";
export { clearAssistantHistory, deleteStoredAlias, deleteStoredWorkflow, listAssistantHistory, listStoredAliases, listStoredWorkflows, saveStoredAlias, saveStoredWorkflow } from "./assistantLocalStore";
export { getAssistantTool, listAssistantTools, registerAssistantTool, runAssistantTool } from "./toolRegistry";
export { simulatePurchase, simulateRepayment, simulateSale } from "./dryRun";
export { executeLatestSaleReversal, prepareLatestSaleReversal } from "./reversals";
export { localModelAvailable, registerLocalModelAdapter, tryLocalModelFallback } from "./localModel";
export { AUDIT_ACTION_LABELS, listAudit, recordAudit } from "./audit";
export type { AssistantAuditEntry, AuditAction } from "./audit";
