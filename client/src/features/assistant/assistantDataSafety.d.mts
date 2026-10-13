export function assertAssistantCompanyScope(requestedId: string, activeId: string): void;
export function validateAssistantHistoryLimit(limit: number): number;
export function orderAssistantHistoryNewest<T extends { id: string; createdAt: string }>(entries: T[]): T[];
export function selectAssistantAuditPruneIds(entries: Array<{ id: string; createdAt: string }>, maxEntries: number): string[];
