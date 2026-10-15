/** A one-time, in-memory UI handoff across SPA route changes.
 * Never stores chat contents or financial records. */
let restorePanelRequested = false;

export function requestClementiaPanelRestore(): void {
  restorePanelRequested = true;
}

export function consumeClementiaPanelRestore(): boolean {
  const requested = restorePanelRequested;
  restorePanelRequested = false;
  return requested;
}
