/** Operational authorization is independent of a cached cloud session.
 * No localStorage value, selected role or legacy company record grants access.
 * This boundary does not encrypt IndexedDB; protected-storage provisioning is
 * a separate prerequisite, attested by the trusted workspace service.
 */
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
export interface WorkspaceGrant {
  userId: string;
  localCompanyId: string;
  cloudCompanyId: string;
  staffId: string;
  storeIds: readonly string[];
  expiresAtEpochMs: number;
  databaseName: string;
  permissions: readonly string[];
}
let revision = 0;
let active: Readonly<WorkspaceGrant> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const LOCK_KEY = "tallybook.workspace.revocation.v1";
const listeners = new Set<() => void>();
const transactions = new Set<{ abort(): void }>();
const verificationRequests = new Set<AbortController>();
export function lockWorkspace(broadcast = true) {
  revision++;
  active = null;
  for (const request of verificationRequests) request.abort();
  verificationRequests.clear();
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = undefined;
  for (const tx of [...transactions]) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
  }
  transactions.clear();
  for (const notify of listeners) notify();
  if (broadcast && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCK_KEY, crypto.randomUUID());
    } catch {
      /* never restore access on failure */
    }
  }
}
export function listenForWorkspaceRevocation() {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCK_KEY || event.key === null) lockWorkspace(false);
  };
  const offline = () => lockWorkspace();
  window.addEventListener("storage", onStorage);
  window.addEventListener("offline", offline);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("offline", offline);
  };
}
export function subscribeWorkspace(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
export function workspaceSnapshot() {
  if (active && active.expiresAtEpochMs <= Date.now()) return null;
  return active;
}
export function requireWorkspaceAccess(
  databaseName?: string,
  companyId?: string
) {
  const grant = workspaceSnapshot();
  if (
    !grant ||
    (grant.databaseName !== databaseName && databaseName !== undefined) ||
    (companyId !== undefined && grant.localCompanyId !== companyId)
  )
    throw Error(
      "Unlock an authorized account, company and device workspace first."
    );
  return grant;
}
export function protectWorkspaceTransaction(tx: {
  abort(): void;
  addEventListener?(type: string, fn: () => void): void;
}) {
  transactions.add(tx);
  const release = () => {
    transactions.delete(tx);
  };
  tx.addEventListener?.("complete", release);
  tx.addEventListener?.("abort", release);
  tx.addEventListener?.("error", release);
}
/** Online authorization must come from a live session + approved binding.
 * There is deliberately no public method to install arbitrary client grants.
 * The server must fail closed until protected-storage provisioning exists.
 */
export async function verifyOnlineWorkspace() {
  lockWorkspace();
  const started = revision;
  if (!isSupabaseConfigured || !navigator.onLine)
    throw Error("Online workspace verification is unavailable.");
  if (
    window.location.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
  )
    throw Error("A secure connection is required for workspace verification.");
  const client = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  const verified = await client.auth.getUser();
  if (
    error ||
    verified.error ||
    !session ||
    verified.data.user?.id !== session.user.id ||
    started !== revision
  )
    throw Error("Sign in and verify your account first.");
  const request = new AbortController();
  verificationRequests.add(request);
  const timeout = setTimeout(() => request.abort(), 15_000);
  let proof;
  try {
    const response = await fetch("/api/workspace/access", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 1 }),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw Error(
        "This account has no verified, protected workspace provisioned on this device."
      );
    proof = await response.json();
  } finally {
    clearTimeout(timeout);
    verificationRequests.delete(request);
  }
  const grant = proof?.grant as WorkspaceGrant;
  const now = Date.now();
  if (
    proof?.active !== true ||
    proof?.storageProtection !== "encrypted-workspace-v1" ||
    !grant ||
    grant.userId !== session.user.id ||
    !/^tallybook-protected-v1-[a-f0-9]{64}$/.test(grant.databaseName ?? "") ||
    !["localCompanyId", "cloudCompanyId", "staffId", "databaseName"].every(
      key =>
        typeof grant[key as keyof WorkspaceGrant] === "string" &&
        String(grant[key as keyof WorkspaceGrant]).length > 0
    ) ||
    !Array.isArray(grant.storeIds) ||
    !grant.storeIds.length ||
    !grant.storeIds.every(id => typeof id === "string" && id.length > 0) ||
    !Array.isArray(grant.permissions) ||
    !grant.permissions.length ||
    !grant.permissions.every(p =>
      ["sell", "refund", "discount", "inventory", "reports", "staff"].includes(
        p
      )
    ) ||
    !Number.isSafeInteger(grant.expiresAtEpochMs) ||
    grant.expiresAtEpochMs <= now ||
    grant.expiresAtEpochMs >
      Math.min((session.expires_at ?? 0) * 1000, now + 15 * 60_000)
  )
    throw Error("Workspace authorization proof is invalid.");
  const latest = await client.auth.getSession();
  if (
    started !== revision ||
    latest.error ||
    latest.data.session?.access_token !== session.access_token ||
    !navigator.onLine
  )
    throw Error("Account changed during workspace verification.");
  active = Object.freeze({
    ...grant,
    storeIds: Object.freeze([...grant.storeIds]),
    permissions: Object.freeze([...grant.permissions]),
  });
  expiryTimer = setTimeout(
    () => lockWorkspace(),
    Math.max(1, grant.expiresAtEpochMs - Date.now())
  );
  for (const notify of listeners) notify();
  return active;
}
