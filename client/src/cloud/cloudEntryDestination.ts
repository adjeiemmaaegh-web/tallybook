/** Only an already-verified owner or attendant membership may select an automatic home. */
export type VerifiedEntryRole = "owner" | "attendant";
export function cloudEntryDestination(role: VerifiedEntryRole): string {
  return role === "owner" ? "/shop?view=dashboard" : "/shop?view=home";
}
