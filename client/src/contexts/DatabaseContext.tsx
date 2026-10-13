/** Tactile Ledger design reminder: local data readiness is visible, calm, and never concealed behind a server dependency. */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { recoverPendingBackupRestore } from "@/features/backup/restoreRecovery";
import { initializeDatabase, type DatabaseReadiness } from "@/db/TallybookDB";

export type DatabaseState =
  | { status: "checking"; readiness: null; message: null }
  | { status: "ready"; readiness: DatabaseReadiness; message: null }
  | { status: "error"; readiness: null; message: string };

type DatabaseContextValue = DatabaseState & { retry: () => Promise<void>; };

const DatabaseContext = createContext<DatabaseContextValue | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatabaseState>({ status: "checking", readiness: null, message: null });

  const startDatabase = useCallback(async () => {
    setState({ status: "checking", readiness: null, message: null });
    try {
      await recoverPendingBackupRestore();
      const readiness = await initializeDatabase();
      setState({ status: "ready", readiness, message: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tallybook could not open its local database.";
      setState({ status: "error", readiness: null, message });
    }
  }, []);

  useEffect(() => { void startDatabase(); }, [startDatabase]);
  const value = useMemo<DatabaseContextValue>(() => ({ ...state, retry: startDatabase }), [state, startDatabase]);
  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error("useDatabase must be used within DatabaseProvider.");
  return context;
}
