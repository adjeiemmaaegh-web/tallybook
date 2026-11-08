import { workspaceOwner } from "./ownerWorkspace";
// A damaged or partly configured cloud deployment must still require account verification.
export function requiresCloudOwner() {
  if (workspaceOwner) return true;
  const env = import.meta.env;
  if (env.VITE_TALLYBOOK_FRIENDS_TEST_MODE === 'true' ||
      env.VITE_TALLYBOOK_REQUIRE_AUTH === 'true' ||
      env.VITE_SUPABASE_URL?.trim() || env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()) return true;
  try {
    return Boolean(localStorage.getItem('friendsTestVerifiedAuthUserId') ||
      localStorage.getItem('tallybook.entry.verifiedOwner.v1'));
  } catch { return true; }
}
