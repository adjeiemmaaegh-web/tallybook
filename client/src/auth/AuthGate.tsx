/** Mandatory account and workspace boundary; no environment-flag bypass. */
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Redirect, useLocation } from "wouter";
import { useRun4CloudSession } from "./useRun4CloudSession";
import {
  lockWorkspace,
  subscribeWorkspace,
  workspaceSnapshot,
  verifyOnlineWorkspace,
} from "./workspaceBoundary";
import { WorkspaceOnboarding } from "./WorkspaceOnboarding";
type Props = {
  children: ReactNode;
  signIn: ReactNode;
  accountSignIn?: ReactNode;
  passwordRecovery?: ReactNode;
  enabled?: boolean;
};
export function AuthGate({
  children,
  signIn,
  accountSignIn,
  passwordRecovery,
}: Props) {
  const [location] = useLocation();
  if (location === "/signin") return <>{signIn}</>;
  if (location === "/reset-password") return <>{passwordRecovery ?? signIn}</>;
  if (location === "/account") return <>{accountSignIn ?? signIn}</>;
  return <OperationalGate>{children}</OperationalGate>;
}
function OperationalGate({ children }: { children: ReactNode }) {
  const { state, retry } = useRun4CloudSession(true);
  const grant = useSyncExternalStore(
    subscribeWorkspace,
    workspaceSnapshot,
    () => null
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (state.status !== "signed-in") lockWorkspace();
  }, [state.status, state.userId]);
  if (state.status === "signed-out") return <Redirect to="/signin" replace />;
  if (state.status === "checking")
    return (
      <main className="mx-auto max-w-md p-6" role="status">
        Verifying your Tallybook account…
      </main>
    );
  if (state.status === "offline")
    return (
      <main className="mx-auto max-w-md p-6 space-y-3">
        <h1 className="text-xl font-semibold">Tallybook is locked</h1>
        <p role="status">
          An internet connection is required to create or verify your Tallybook
          account for the first time.
        </p>
        <p>
          A provisioned offline credential is required to unlock an existing
          workspace. Unbound local records remain preserved and locked.
        </p>
      </main>
    );
  if (state.status !== "signed-in")
    return (
      <main className="mx-auto max-w-md p-6 space-y-3">
        <h1>Account verification unavailable</h1>
        <p role="alert">
          Business records remain locked. Check your connection and account
          configuration.
        </p>
        <button onClick={() => void retry()}>Retry verification</button>
        <a href="/signin">Sign in</a>
      </main>
    );
  if (
    grant &&
    grant.userId === state.userId &&
    grant.expiresAtEpochMs > Date.now()
  )
    return <>{children}</>;
  return (
    <WorkspaceOnboarding
      userId={state.userId!}
      error={error}
      onOpen={async () => {
        setError("");
        try {
          await verifyOnlineWorkspace();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Workspace authorization failed."
          );
        }
      }}
    />
  );
}
