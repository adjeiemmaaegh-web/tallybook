/** Test-only: read the durable keyring record for a ledger name. */
import { KEYRING_DB_NAME } from "./st24LedgerSecurity";
export function readKeyringForTest(dbName: string): Promise<never> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(KEYRING_DB_NAME, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const k = open.result, r = k.transaction("keyrings", "readonly").objectStore("keyrings").get(dbName);
      r.onsuccess = () => { k.close(); resolve((r.result as { keyring: never }).keyring); };
      r.onerror = () => { k.close(); reject(r.error); };
    };
  });
}
