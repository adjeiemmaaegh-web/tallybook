export function classifyPendingAssistantRecovery(
  journal: unknown,
  current: unknown
): Readonly<{ action: 'remove-marker' | 'restore-preimage'; requiresAssistantWrite: boolean }>;
