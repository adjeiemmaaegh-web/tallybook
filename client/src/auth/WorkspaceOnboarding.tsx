import { useState } from "react";
import { CloudBusinessPanel } from "@/cloud/CloudBusinessPanel";
/** Cloud setup only: never mounts legacy local data providers. */
export function WorkspaceOnboarding({
  userId,
  error,
  onOpen,
}: {
  userId: string;
  error: string;
  onOpen: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<"owner" | "employee" | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-xl p-6 space-y-5">
      <p className="eyebrow">Alchemy · Tallybook</p>
      <h1 className="text-2xl font-semibold">How will you use Tallybook?</h1>
      <p>
        Signed-in account: <code>{userId}</code>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="rounded-xl border p-5 text-left"
          aria-pressed={choice === "owner"}
          onClick={() => setChoice("owner")}
        >
          <strong>I own this business</strong>
          <span className="block">
            Create and manage your business, stores, staff, products and sales.
          </span>
        </button>
        <button
          className="rounded-xl border p-5 text-left"
          aria-pressed={choice === "employee"}
          onClick={() => setChoice("employee")}
        >
          <strong>I work for someone else</strong>
          <span className="block">
            Join your employer's business using a verified invitation.
          </span>
        </button>
      </div>
      {choice && (
        <CloudBusinessPanel
          key={userId + choice}
          allowCreate={choice === "owner"}
          accountSetupOnly
        />
      )}
      {choice === "employee" && (
        <p>
          Give your account identifier to your employer. Membership and store
          assignment must be verified before this device can open business
          records.
        </p>
      )}
      <p>
        Existing local businesses are not automatically assigned to this
        account. They require an owner-approved binding and protected-storage
        migration.
      </p>
      <button
        className="primary-action"
        disabled={busy || !choice}
        onClick={async () => {
          setBusy(true);
          try {
            await onOpen();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking workspace…" : "Check authorized workspace"}
      </button>
      {error && <p role="alert">{error}</p>}
      <a className="underline" href="/signin">
        Account and sign-out
      </a>
    </main>
  );
}
