/** Encrypted checkpoint journal. Unique revision keys serialize competing writers
 * across tabs. Prior ciphertext is immutable and remains available for recovery.
 * This storage layer does not select which business records a caller may export.
 */
import {
  requireWorkspaceAccess,
  protectWorkspaceTransaction,
} from "./workspaceBoundary";
import {
  assertWorkspaceKeyUnlocked,
  sealWorkspaceRecord,
  openWorkspaceRecord,
} from "./workspaceKeyVault";

function current() {
  const grant = requireWorkspaceAccess();
  assertWorkspaceKeyUnlocked(grant);
  return grant;
}
type Grant = ReturnType<typeof current>;
function stillCurrent(grant: Grant) {
  if (current() !== grant) throw Error("Workspace authorization changed.");
}
async function journal(grant: Grant) {
  stillCurrent(grant);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(grant.databaseName + "-journal", 1);
    let blocked = false;
    request.onupgradeneeded = () =>
      request.result.createObjectStore("checkpoints", { keyPath: "revision" });
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(Error("Workspace journal upgrade is blocked."));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}
interface Entry {
  revision: number;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}
async function transact(
  grant: Grant,
  entry?: Entry
): Promise<Entry | undefined> {
  const database = await journal(grant);
  try {
    stillCurrent(grant);
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(
        "checkpoints",
        entry ? "readwrite" : "readonly"
      );
      protectWorkspaceTransaction(tx);
      const store = tx.objectStore("checkpoints");
      let latest: Entry | undefined;
      let conflict = false;
      const cursor = store.openCursor(null, "prev");
      cursor.onsuccess = () => {
        latest = cursor.result?.value;
        if (!entry) return;
        if ((latest?.revision ?? 0) !== entry.revision - 1) {
          conflict = true;
          tx.abort();
          return;
        }
        store.add(entry);
      };
      tx.onabort = () =>
        reject(
          conflict
            ? Error("Workspace checkpoint changed. Reload before saving.")
            : (tx.error ?? Error("Workspace journal transaction aborted."))
        );
      tx.oncomplete = () => resolve(latest);
    });
  } finally {
    database.close();
  }
}
const label = (revision: number) => "ledger-checkpoint-v1/" + revision;
export async function appendWorkspaceCheckpoint(
  expectedRevision: number,
  payload: Uint8Array
) {
  const grant = current();
  const revision = expectedRevision + 1;
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("Invalid checkpoint revision.");
  const encrypted = await sealWorkspaceRecord(grant, label(revision), payload);
  await transact(grant, { revision, ...encrypted });
  return revision;
}
export async function readWorkspaceCheckpoint() {
  const grant = current();
  const latest = await transact(grant);
  stillCurrent(grant);
  if (!latest) return null;
  if (!Number.isSafeInteger(latest.revision) || latest.revision < 1)
    throw Error("Invalid stored checkpoint revision.");
  const payload = await openWorkspaceRecord(
    grant,
    label(latest.revision),
    latest
  );
  try {
    stillCurrent(grant);
  } catch (error) {
    payload.fill(0);
    throw error;
  }
  return { revision: latest.revision, payload };
}
