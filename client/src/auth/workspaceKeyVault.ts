/** Wrapped data keys only. This vault does not authorize users or encrypt the legacy ledger.
 * Creating/unlocking a key never installs a workspace grant.
 */
export interface WorkspaceKeyScope {
  userId: string;
  cloudCompanyId: string;
  localCompanyId: string;
  deviceId: string;
  databaseName: string;
}
const DB = "tallybook-workspace-key-vault-v1";
const ITERATIONS = 600000;
const encoder = new TextEncoder();
let generation = 0;
const keys = new Map<string, CryptoKey>();
const pending = new Set<IDBTransaction>();
interface Envelope {
  id: string;
  version: 1;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  wrapped: ArrayBuffer;
}
function identity(scope: WorkspaceKeyScope): string {
  if (
    !scope ||
    !["userId", "cloudCompanyId", "localCompanyId", "deviceId"].every(
      k =>
        typeof scope[k as keyof WorkspaceKeyScope] === "string" &&
        /^[A-Za-z0-9:_-]{1,128}$/.test(scope[k as keyof WorkspaceKeyScope])
    ) ||
    !/^tallybook-protected-v1-[a-f0-9]{64}$/.test(scope.databaseName)
  )
    throw Error("Invalid protected workspace identity.");
  return JSON.stringify([
    scope.userId,
    scope.cloudCompanyId,
    scope.localCompanyId,
    scope.deviceId,
    scope.databaseName,
  ]);
}
function assertGeneration(started: number) {
  if (generation !== started)
    throw Error("Workspace locked during key operation.");
}
export function clearWorkspaceKeys() {
  generation++;
  keys.clear();
  for (const tx of pending) {
    try {
      tx.abort();
    } catch {
      /* completed */
    }
  }
  pending.clear();
}
export function assertWorkspaceKeyUnlocked(scope: WorkspaceKeyScope) {
  if (!keys.has(identity(scope)))
    throw Error(
      "Unlock the protected key for this account, company and device first."
    );
}
function passwordBytes(password: string) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024 ||
    /^\d+$/.test(password)
  )
    throw Error(
      "Use a local passphrase of 12–1024 characters, not a numeric staff PIN."
    );
  return encoder.encode(password);
}
async function wrappingKey(password: string, salt: Uint8Array) {
  const bytes = passwordBytes(password);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      bytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
    );
  } finally {
    bytes.fill(0);
  }
}
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("keys", { keyPath: "id" });
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close other Tallybook tabs before opening the key vault."));
  });
}
async function record(
  id: string,
  started: number,
  value?: Envelope
): Promise<Envelope | undefined> {
  const db = await open();
  try {
    assertGeneration(started);
  } catch (error) {
    db.close();
    throw error;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", value ? "readwrite" : "readonly");
    pending.add(tx);
    const request = value
      ? tx.objectStore("keys").add(value)
      : tx.objectStore("keys").get(id);
    let result: Envelope | undefined;
    request.onsuccess = () => {
      if (!value) result = request.result as Envelope | undefined;
    };
    tx.oncomplete = () => {
      pending.delete(tx);
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      pending.delete(tx);
      db.close();
      reject(tx.error ?? Error("Key operation aborted."));
    };
    tx.onerror = () => {
      /* onabort is the final outcome */
    };
  });
}
/** Creates only a wrapped key. Caller must independently verify provisioning authority.
 * add(), rather than put(), prevents accidentally replacing an existing workspace key.
 */
export async function createWorkspaceKey(
  scope: WorkspaceKeyScope,
  password: string
) {
  const id = identity(scope),
    started = generation;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapper = await wrappingKey(password, salt);
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const wrapped = await crypto.subtle.wrapKey("raw", key, wrapper, {
    name: "AES-GCM",
    iv,
    additionalData: encoder.encode(id),
    tagLength: 128,
  });
  assertGeneration(started);
  await record(id, started, {
    id,
    version: 1,
    iterations: ITERATIONS,
    salt,
    iv,
    wrapped,
  });
  assertGeneration(started);
  // Creation deliberately does not unlock or authorize this workspace.
}
export async function unlockWorkspaceKey(
  scope: WorkspaceKeyScope,
  password: string
) {
  const id = identity(scope),
    started = generation;
  keys.delete(id);
  const value = await record(id, started);
  if (
    !value ||
    value.id !== id ||
    value.version !== 1 ||
    value.iterations !== ITERATIONS ||
    value.salt?.byteLength !== 16 ||
    value.iv?.byteLength !== 12 ||
    value.wrapped?.byteLength !== 48
  )
    throw Error("Protected workspace key is missing or invalid.");
  const wrapper = await wrappingKey(password, new Uint8Array(value.salt));
  const key = await crypto.subtle.unwrapKey(
    "raw",
    value.wrapped,
    wrapper,
    {
      name: "AES-GCM",
      iv: new Uint8Array(value.iv),
      additionalData: encoder.encode(id),
      tagLength: 128,
    },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  assertGeneration(started);
  keys.set(id, key);
}
/** Memory-only encryption operations for the future protected record adapter.
 * Binding AAD to identity and record ID prevents cross-account/record substitution.
 */
export async function sealWorkspaceRecord(
  scope: WorkspaceKeyScope,
  recordId: string,
  plaintext: Uint8Array
) {
  const id = identity(scope),
    started = generation,
    key = keys.get(id);
  if (!key) throw Error("Protected workspace key is locked.");
  if (
    !recordId ||
    recordId.length > 512 ||
    plaintext.byteLength > 16 * 1024 * 1024
  )
    throw Error("Invalid protected record.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(JSON.stringify([id, recordId])),
      tagLength: 128,
    },
    key,
    plaintext
  );
  assertGeneration(started);
  return { iv, ciphertext };
}
export async function openWorkspaceRecord(
  scope: WorkspaceKeyScope,
  recordId: string,
  envelope: { iv: Uint8Array; ciphertext: ArrayBuffer }
) {
  const id = identity(scope),
    started = generation,
    key = keys.get(id);
  if (!key) throw Error("Protected workspace key is locked.");
  if (
    !recordId ||
    recordId.length > 512 ||
    envelope.iv?.byteLength !== 12 ||
    envelope.ciphertext?.byteLength < 16 ||
    envelope.ciphertext?.byteLength > 16 * 1024 * 1024 + 16
  )
    throw Error("Invalid protected record.");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: envelope.iv,
      additionalData: encoder.encode(JSON.stringify([id, recordId])),
      tagLength: 128,
    },
    key,
    envelope.ciphertext
  );
  if (generation !== started) {
    new Uint8Array(plaintext).fill(0);
    throw Error("Workspace locked during key operation.");
  }
  return new Uint8Array(plaintext);
}
