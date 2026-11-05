/** Test and release tooling (simulated payments, relay rehearsal, evidence archives, device acceptance).
 * Never shown to customers: off unless a build opts in with VITE_TALLYBOOK_INTERNAL_TOOLS=true. */
export const internalToolsEnabled = import.meta.env.VITE_TALLYBOOK_INTERNAL_TOOLS === "true";
