/** Tactile Ledger design reminder: local data readiness is visible, calm, and never concealed behind a server dependency. */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { recoverPendingBackupRestore } from "@/features/backup/restoreRecovery";
import { db, initializeDatabase, type DatabaseReadiness } from "@/db/TallybookDB";
import { prepareLedgerSecurity, type LedgerStatus } from "@/features/security/st24LedgerSecurity";
import { LedgerUnlockScreen } from "@/components/LedgerUnlockScreen";
import { LedgerAutoLock } from "@/components/LedgerAutoLock";
import { lockLedger } from "@/features/security/st24LedgerSecurity";
import { readAutoLockMinutes } from "@/features/security/ledgerAutoLock";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { lockAllStaff } from "@/features/staff/staff";

export type DatabaseState =
  | { status: "checking"; readiness: null; message: null }
  | { status: "ready"; readiness: DatabaseReadiness; message: null }
  | { status: "error"; readiness: null; message: string }
  /** The ledger is encrypted (or mid-change) and must be unlocked before ANY record is read. */
  | { status: "locked"; readiness: null; message: null; security: LedgerStatus };

type DatabaseContextValue = DatabaseState & { retry: () => Promise<void>; };

const DatabaseContext = createContext<DatabaseContextValue | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatabaseState>({ status: "checking", readiness: null, message: null });

  const startDatabase = useCallback(async () => {
    setState({ status: "checking", readiness: null, message: null });
    try {
      // ST24-05: decide the encryption state BEFORE any ledger read. Plaintext ledgers pass straight through.
      const security = await prepareLedgerSecurity(db);
      const mustUnlock = security.state === "orphaned" || security.state === "schema-mismatch" ||
        security.state === "migrating" || security.state === "decrypting" || security.state === "rekeying" || (security.state === "encrypted" && security.locked);
      if (mustUnlock) { setState({ status: "locked", readiness: null, message: null, security }); return; }
      await recoverPendingBackupRestore();
      const readiness = await initializeDatabase();
      setState({ status: "ready", readiness, message: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tallybook could not open its local database.";
      setState({ status: "error", readiness: null, message });
    }
  }, []);

  useEffect(() => { void startDatabase(); }, [startDatabase]);
  // Encrypted + unlocked + ready: lock automatically when the device sits idle. Waits for any in-flight write (exclusive lock) so a sale is never cut in half.
  const [encryptedAndOpen, setEncryptedAndOpen] = useState(false);
  useEffect(() => { setEncryptedAndOpen(state.status === "ready" && db.ledgerSeal.unlocked && db.ledgerSeal.mode === "encrypted"); }, [state]);
  const lockNow = useCallback(() => {
    void (async () => {
      try { await withCrossTabDataLock("exclusive", async () => { lockLedger(db); }); } finally { lockAllStaff(); await startDatabase(); }
    })();
  }, [startDatabase]);
  const value = useMemo<DatabaseContextValue>(() => ({ ...state, retry: startDatabase }), [state, startDatabase]);
  if (state.status === "locked") return <LedgerUnlockScreen security={state.security} onChanged={() => void startDatabase()} />;
  return <DatabaseContext.Provider value={value}>{encryptedAndOpen ? <LedgerAutoLock minutes={readAutoLockMinutes(db.name)} onIdle={lockNow} /> : null}{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error("useDatabase must be used within DatabaseProvider.");
  return context;
}
