/** Identity projection ONLY. Does not grant writes, store access or local data ownership. */
export function resolveCloudMembership(
  userId: string, companyId: string,
  member: Record<string, unknown> | null | undefined,
  business: Record<string, unknown> | null | undefined,
): Readonly<{userId:string;companyId:string;role:"owner"|"staff"}>;
