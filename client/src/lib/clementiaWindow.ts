/** One-time in-memory handoff from the standalone assistant to its floating panel. */
let restorePanelRequested = false;

export function requestClementiaPanelRestore(): void {
  restorePanelRequested = true;
}

export function consumeClementiaPanelRestore(): boolean {
  const requested = restorePanelRequested;
  restorePanelRequested = false;
  return requested;
}
