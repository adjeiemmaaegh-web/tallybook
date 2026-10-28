type ActorIdentity = { id?: string | null } | null | undefined;

export function assertCashReturnActorUnchanged(
  initialStaff: ActorIdentity,
  initialShift: ActorIdentity,
  currentStaff: ActorIdentity,
  currentShift: ActorIdentity,
): void;
