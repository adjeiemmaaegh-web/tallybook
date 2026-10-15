import express from "express";
import { verifySyncCapability, checkSyncRequestScope } from "./syncAuth.mjs";
import { authorizeSyncInspect, disabledSyncIdentityDirectory } from "./syncMembership.mjs";
import { verifySyncSession, authorizeActiveSyncSession, disabledSyncSessionStore } from "./syncSession.mjs";
import { createReadOnlyFileSessionStore } from "./syncSessionStore.mjs";
import { createReadOnlyFileDirectory } from "./syncDirectory.mjs";
import { createFileSyncJournal } from "./syncJournal.mjs";
import { stageAuthenticatedEvent } from "./syncEventDelivery.mjs";
import { inspectSyncTransport } from "./syncTransport.mjs";
import { retrieveEncryptedBackup } from "./syncBackupTransport.mjs";
import { uploadEncryptedBackup } from "./syncBackupUpload.mjs";
import { createEncryptedBackupVault } from "./syncBackupVault.mjs";
import { selectServerTransport } from "./syncHttps.mjs";
import { createAccessActions, isDirectTls } from "./syncAccessRoutes.mjs";
import { mountRun2OwnershipRoutes } from "./run2OwnershipRoutes.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();


  // The HTTP surface is present for development but stays fail-closed. A
  // separately reviewed server-only coordinator and isolated test DB must be
  // explicitly injected before allowing Run 2 ownership mutations.
  mountRun2OwnershipRoutes(app,express.json,{enabled:false});

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Explicitly gated access endpoints. HTTPS must terminate in this Node process;
  // proxy headers are not accepted as TLS evidence. No financial sync routes enabled.
  const accessPaths = new Map([
    ['/api/sync/access/login','login'],
    ['/api/sync/access/invite','invite'],
    ['/api/sync/access/enroll','enroll'],
    ['/api/sync/access/revoke','revoke'],
  ]);
  const accessSettings = [
    process.env.TALLYBOOK_SYNC_LOGIN_DIRECTORY_FILE,
    process.env.TALLYBOOK_SYNC_SESSION_FILE,
    process.env.TALLYBOOK_SYNC_SESSION_SECRET,
    process.env.TALLYBOOK_SYNC_ENROLLMENT_FILE,
  ];
  let accessActions: ReturnType<typeof createAccessActions> | undefined;
  if (process.env.TALLYBOOK_SYNC_ACCESS_ENABLED === 'true' && accessSettings.every(Boolean)) {
    try {
      accessActions = createAccessActions({
        loginDirectoryFile: accessSettings[0]!, sessionFile: accessSettings[1]!,
        sessionSecret: accessSettings[2]!, enrollmentFile: accessSettings[3]!,
      });
    } catch { console.error('Optional access endpoints disabled due to invalid server configuration'); }
  }
  // Route is always registered; unavailable configuration fails closed with 503.
  app.post(['/api/sync/access/login','/api/sync/access/invite','/api/sync/access/enroll','/api/sync/access/revoke'],
    express.json({limit:'4kb', type:'application/json'}), async (req,res) => {
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Pragma','no-cache');
      if (!accessActions) { res.status(503).json({error:'Access service unavailable'}); return; }
      if (!isDirectTls(req)) { res.status(403).json({error:'Direct TLS required'}); return; }
      const method = accessPaths.get(req.path);
      if (!method || !req.body || typeof req.body!=='object' || Array.isArray(req.body)) {
        res.status(400).json({error:'Invalid request'}); return;
      }
      const key = req.socket.remoteAddress ?? 'unknown';
      try {
        let result;
        if (method==='login') result=await accessActions.login(req.body,key);
        else if (method==='invite') result=await accessActions.invite(req.body,req.header('x-tallybook-session'),key);
        else if (method==='enroll') result=await accessActions.enroll(req.body,req.header('x-tallybook-session'),key);
        else result=await accessActions.revoke(req.body,req.header('x-tallybook-session'),key);
        res.status(method==='login'||method==='invite'||method==='enroll'?201:200).json(result);
      } catch { res.status(403).json({error:'Access denied'}); }
    });

  // Read-only server preflight. Explicitly configured server-owned files only.
  // No POST/PUT/PATCH/DELETE route uses this adapter; financial uploads remain disabled.
  app.get("/api/sync/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessionFile = process.env.TALLYBOOK_SYNC_SESSION_FILE;
    const directoryFile = process.env.TALLYBOOK_SYNC_DIRECTORY_FILE;
    const journalFile = process.env.TALLYBOOK_SYNC_JOURNAL_FILE;
    if (!sessionFile || !directoryFile || !journalFile) {
      res.status(503).json({ error: "Sync status is not configured." });
      return;
    }
    try {
      const status = await inspectSyncTransport({
        authorization: req.header("authorization") ?? undefined,
        organizationId: req.header("x-tallybook-org-id") ?? undefined,
        deviceId: req.header("x-tallybook-device-id") ?? undefined,
        session: req.header("x-tallybook-session") ?? undefined,
      }, {
        capabilitySecret: process.env.TALLYBOOK_SYNC_VERIFY_SECRET,
        sessionSecret: process.env.TALLYBOOK_SYNC_SESSION_SECRET,
        sessionStore: createReadOnlyFileSessionStore(sessionFile),
        directory: createReadOnlyFileDirectory(directoryFile),
        journal: createFileSyncJournal(journalFile),
      });
      res.status(200).json(status);
    } catch {
      res.status(403).json({ error: "Sync status authorization denied." });
    }
  });

  // Read-only encrypted backup retrieval. No sync:inspect credential can upload.
  app.get("/api/sync/backups/:backupId", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const sessionFile = process.env.TALLYBOOK_SYNC_SESSION_FILE;
    const directoryFile = process.env.TALLYBOOK_SYNC_DIRECTORY_FILE;
    const vaultRoot = process.env.TALLYBOOK_SYNC_BACKUP_VAULT;
    if (!sessionFile || !directoryFile || !vaultRoot) {
      res.status(503).json({ error: "Backup retrieval is not configured." });
      return;
    }
    try {
      const backup = await retrieveEncryptedBackup({
        authorization: req.header("authorization") ?? undefined,
        organizationId: req.header("x-tallybook-org-id") ?? undefined,
        deviceId: req.header("x-tallybook-device-id") ?? undefined,
        session: req.header("x-tallybook-session") ?? undefined,
      }, req.params.backupId, {
        capabilitySecret: process.env.TALLYBOOK_SYNC_VERIFY_SECRET,
        sessionSecret: process.env.TALLYBOOK_SYNC_SESSION_SECRET,
        directory: createReadOnlyFileDirectory(directoryFile),
        sessionStore: createReadOnlyFileSessionStore(sessionFile),
        vault: createEncryptedBackupVault(vaultRoot),
      });
      res.status(200).json(backup);
    } catch {
      res.status(403).json({ error: "Backup retrieval authorization denied or backup unavailable." });
    }
  });

  // Explicitly opt-in ciphertext-only write endpoint. Requires DIRECT TLS; no proxy
  // headers are trusted as proof of encryption. Not suitable for TLS termination
  // until deployment-level transport trust is audited.
  app.post("/api/sync/backups", express.json({ limit: "12mb", type: "application/json" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessionFile = process.env.TALLYBOOK_SYNC_SESSION_FILE;
    const directoryFile = process.env.TALLYBOOK_SYNC_DIRECTORY_FILE;
    const vaultRoot = process.env.TALLYBOOK_SYNC_BACKUP_VAULT;
    if (process.env.TALLYBOOK_SYNC_BACKUP_UPLOAD_ENABLED !== "true" || !sessionFile || !directoryFile || !vaultRoot) {
      res.status(503).json({ error: "Backup upload is not configured." });
      return;
    }
    if (!isDirectTls(req)) {
      res.status(403).json({ error: "Direct TLS required for backup upload." });
      return;
    }
    try {
      const result = await uploadEncryptedBackup({
        authorization: req.header("authorization") ?? undefined,
        organizationId: req.header("x-tallybook-org-id") ?? undefined,
        deviceId: req.header("x-tallybook-device-id") ?? undefined,
        session: req.header("x-tallybook-session") ?? undefined,
      }, req.body, {
        capabilitySecret: process.env.TALLYBOOK_SYNC_VERIFY_SECRET,
        sessionSecret: process.env.TALLYBOOK_SYNC_SESSION_SECRET,
        directory: createReadOnlyFileDirectory(directoryFile),
        sessionStore: createReadOnlyFileSessionStore(sessionFile),
        vault: createEncryptedBackupVault(vaultRoot),
      });
      res.status(201).json(result);
    } catch {
      res.status(403).json({ error: "Backup upload authorization denied or invalid package." });
    }
  });

  // Explicit opt-in metadata-only staging. No sales, stock, payment, or ledger payloads.
  app.post("/api/sync/events/stage", express.json({limit:"4kb",type:"application/json"}), async (req,res)=>{
    res.setHeader("Cache-Control","no-store");
    const sessionFile=process.env.TALLYBOOK_SYNC_SESSION_FILE;
    const directoryFile=process.env.TALLYBOOK_SYNC_DIRECTORY_FILE;
    const journalFile=process.env.TALLYBOOK_SYNC_JOURNAL_FILE;
    if(process.env.TALLYBOOK_SYNC_EVENT_STAGE_ENABLED!=="true" || !sessionFile || !directoryFile || !journalFile){
      res.status(503).json({error:"Event staging is not configured."});return;
    }
    if(!isDirectTls(req)){res.status(403).json({error:"Direct TLS required."});return;}
    try {
      const result=await stageAuthenticatedEvent({
        authorization:req.header("authorization")??undefined,
        organizationId:req.header("x-tallybook-org-id")??undefined,
        deviceId:req.header("x-tallybook-device-id")??undefined,
        session:req.header("x-tallybook-session")??undefined,
      },req.body,{
        capabilitySecret:process.env.TALLYBOOK_SYNC_VERIFY_SECRET,
        sessionSecret:process.env.TALLYBOOK_SYNC_SESSION_SECRET,
        directory:createReadOnlyFileDirectory(directoryFile),
        sessionStore:createReadOnlyFileSessionStore(sessionFile),
        journal:createFileSyncJournal(journalFile),
      });
      res.status(result.status==='conflict'?409:result.status==='stored'?201:200).json(result);
    } catch {res.status(403).json({error:"Event staging denied or invalid."});}
  });

  // Secure-by-default sync gateway: no remote reads/writes until durable backend is ready.
  // Client-local device registrations are NOT server-side authorization.
  app.use("/api/sync", express.json({ limit: "16kb" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = process.env.TALLYBOOK_SYNC_VERIFY_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      res.status(503).json({ error: "Connected synchronization is not configured." });
      return;
    }
    try {
      const claims = verifySyncCapability(req.header("authorization"), secret);
      const organizationId = req.header("x-tallybook-org-id");
      const deviceId = req.header("x-tallybook-device-id");
      checkSyncRequestScope(claims, organizationId, deviceId);
      // Independent human session proof is mandatory; never accept an actor ID from
      // client headers. Without a server-owned session store the request fails closed.
      const session = verifySyncSession(req.header("x-tallybook-session"), process.env.TALLYBOOK_SYNC_SESSION_SECRET);
      const configuredSessionFile = process.env.TALLYBOOK_SYNC_SESSION_FILE;
      const sessionStore = configuredSessionFile
        ? createReadOnlyFileSessionStore(configuredSessionFile)
        : disabledSyncSessionStore;
      const actorId = await authorizeActiveSyncSession(session, sessionStore);
      await authorizeSyncInspect(claims, disabledSyncIdentityDirectory, actorId);
      // A deployed directory is still insufficient for business data transfer: require
      // durable event journal and atomic acknowledgements before enabling any transfer.
      res.status(501).json({ error: "Remote synchronization is not enabled." });
    } catch {
      res.status(403).json({ error: "Sync authorization denied." });
    }
  });

  app.use(express.static(staticPath));

  // Handle client-side routing after static assets without a wildcard route pattern.
  app.use((_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  const { server, scheme } = selectServerTransport({
    mode: process.env.TALLYBOOK_SERVER_TRANSPORT ?? (process.env.NODE_ENV === "production" ? "https" : "http"),
    production: process.env.NODE_ENV === "production",
    accessEnabled: process.env.TALLYBOOK_SYNC_ACCESS_ENABLED === "true",
    backupUploadEnabled: process.env.TALLYBOOK_SYNC_BACKUP_UPLOAD_ENABLED === "true",
    certFile: process.env.TALLYBOOK_TLS_CERT_FILE,
    keyFile: process.env.TALLYBOOK_TLS_KEY_FILE,
  }, app);
  server.listen(port, () => {
    console.log(`Server running on ${scheme}://localhost:${port}/`);
  });
}

startServer().catch(console.error);
