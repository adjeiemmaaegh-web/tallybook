/** Tactile Ledger Stage 10: local backup files are owner-controlled, inspectable, and restored only after an explicit replacement confirmation. */
import { ArchiveRestore, CheckCircle2, Download, FileCheck2, FileWarning, HardDriveDownload, SearchCheck, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { backupDownloadName, createBackup, getBackupSummary, getLastBackupAt, getLastBackupCompanyId, parseBackup, recordBackupExportedAt, restoreBackup, stringifyBackup, type BackupSummary, type TallybookBackup } from "@/features/backup/backup";
import { encryptBackupText, decryptBackupText, isEncryptedBackup } from "@/features/backup/backupCrypto";
import { assertBackupImportFileSize } from "@/features/backup/backupResourceLimits.mjs";
import { auditLocalIntegrity, type IntegrityAudit } from "@/features/reliability/integrity";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";

function formatBackupDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function BackupPage() {
  const { profile, refresh } = useBusinessProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<TallybookBackup | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastBackupCompanyId, setLastBackupCompanyId] = useState<string | null>(null);
  const [integrityAudit, setIntegrityAudit] = useState<IntegrityAudit | null>(null);

  useEffect(() => {
    void Promise.all([getLastBackupAt(), getLastBackupCompanyId()]).then(([at, companyId]) => { setLastBackupAt(at); setLastBackupCompanyId(companyId); }).catch(() => { setLastBackupAt(null); setLastBackupCompanyId(null); });
  }, [profile?.id]);

  const exportLocalBackup = async () => {
    setExporting(true);
    try {
      const backup = await createBackup();
      // Local staff credentials contain salted PIN verifiers. Never export them as plaintext JSON.
      const requiresEncryption = backup.records.staffMembers.length > 0;
      const encrypted = requiresEncryption || window.confirm("Encrypt this backup with a passphrase? Choose OK for a protected backup, or Cancel for a readable JSON backup.");
      const passphrase = encrypted ? window.prompt("Choose a backup passphrase (at least 12 characters). Keep it safe; it cannot be recovered.") : null;
      if (encrypted && passphrase === null) return;
      const text = encrypted ? await encryptBackupText(stringifyBackup(backup), passphrase!) : stringifyBackup(backup);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = encrypted ? backupDownloadName(new Date(backup.createdAt)).replace(".json", ".encrypted.json") : backupDownloadName(new Date(backup.createdAt)); link.click();
      URL.revokeObjectURL(url);
      const backupSummary = getBackupSummary(backup);
      setMessage(`Backup ready for ${backupSummary.businessName ?? profile?.name ?? "this company"}: ${backupSummary.counts.sales} sale record${backupSummary.counts.sales === 1 ? "" : "s"} included.`);
      try { setLastBackupAt(await recordBackupExportedAt(backup.createdAt)); setLastBackupCompanyId(profile?.id ?? null); } catch { setLastBackupAt(null); setLastBackupCompanyId(null); }
      toast.success("Local backup downloaded", { description: "Keep the file somewhere you can find it when restoring this device." });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Tallybook could not prepare this local backup.";
      setMessage(text); toast.error("Backup was not downloaded", { description: text });
    } finally { setExporting(false); }
  };

  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      assertBackupImportFileSize(file.size); // Before loading potentially oversized data into memory.
      const text = await file.text();
      const encrypted = isEncryptedBackup(text);
      const passphrase = encrypted ? window.prompt("Enter the passphrase for this encrypted backup:") : null;
      if (encrypted && passphrase === null) return;
      const backup = parseBackup(encrypted ? await decryptBackupText(text, passphrase!) : text);
      setPendingBackup(backup); setSummary(getBackupSummary(backup)); setMessage(null);
      toast.success("Backup file checked", { description: "Review the record count, then choose Restore backup when ready." });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "This file could not be read as a Tallybook backup.";
      setPendingBackup(null); setSummary(null); setMessage(text); toast.error("Backup file was not accepted", { description: text });
    }
  };

  const confirmRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    try {
      const restored = await restoreBackup(pendingBackup);
      await refresh();
      setMessage(`Restored ${restored.businessName ?? "local business"} from ${formatBackupDate(restored.createdAt)}.`);
      setPendingBackup(null); setSummary(null); if (inputRef.current) inputRef.current.value = "";
      toast.success("Local backup restored", { description: "Your saved records were replaced with the selected backup." });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Tallybook could not restore this backup.";
      setMessage(text); toast.error("Restore was not completed", { description: text });
    } finally { setRestoring(false); }
  };

  const checkLocalRecords = async () => {
    setCheckingIntegrity(true);
    try {
      const audit = await auditLocalIntegrity(); setIntegrityAudit(audit);
      if (audit.status === "clear") toast.success("Local record check complete", { description: `Checked ${audit.recordsChecked} saved records. No relationship issues found.` });
      else toast.warning("Local records need attention", { description: `Found ${audit.issues.length} item${audit.issues.length === 1 ? "" : "s"}. Download a backup before seeking help.` });
    } catch (cause) { const text = cause instanceof Error ? cause.message : "Tallybook could not check local records."; setMessage(text); toast.error("Local record check was not completed", { description: text }); } finally { setCheckingIntegrity(false); }
  };

  return <div className="backup-page"><section className="backup-hero"><div className="backup-brand"><HardDriveDownload className="h-6 w-6" aria-hidden="true" /><span>LOCAL COPY</span></div><span className="workspace-marker">BKP</span><p className="eyebrow"><span className="eyebrow-dot" />Owner-controlled backup</p><h1>Keep a copy of <em>your own record.</em></h1><p>Download a complete local backup file, then use it to restore this business on a cleared or reinstalled device. Nothing is sent to a server.</p><p className="backup-identity"><b>{profile?.name ?? "This local ledger"}</b><span>JSON file · optional passphrase encryption</span></p><div className="backup-last-export" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /><span><b>{lastBackupAt && lastBackupCompanyId === profile?.id ? `Last export for ${profile.name}: ${formatBackupDate(lastBackupAt)}` : "No export recorded for this company yet"}</b><small>{lastBackupAt && lastBackupCompanyId === profile?.id ? "Keep the downloaded file somewhere safe." : "Download this company’s copy before changing or clearing it."}</small></span></div></section>

    <div className="backup-workspace"><section className="backup-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">01 · Make a copy</p><h2>Download your local backup</h2></div><Download className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>This company’s readable JSON file includes its business details, products, stock movements, customers, suppliers, purchases, sales, payments, repayments, receipts, expenses, and Mobile Money details. Other local companies stay outside this file. Staff-managed businesses require an encrypted export because backups include salted staff PIN verifiers. Unencrypted JSON contains readable financial and customer details.</p><button className="primary-action" type="button" onClick={() => void exportLocalBackup()} disabled={exporting}>{exporting ? "Preparing backup…" : "Download local backup"}<Download className="h-4 w-4" aria-hidden="true" /></button>{message ? <p className="backup-message" role="status"><FileCheck2 className="h-4 w-4" aria-hidden="true" />{message}</p> : null}</section>

      <section className="backup-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">02 · Restore a copy</p><h2>Check a backup file</h2></div><Upload className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>Choose a Tallybook backup file first. Tallybook checks its format and record counts before it offers to replace only that backup company’s local workspace.</p><label className="backup-file-input"><span><Upload className="h-4 w-4" aria-hidden="true" />Choose backup file</span><input ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => void readBackup(event.target.files?.[0])} /></label>{summary ? <div className="backup-preview"><div><FileCheck2 className="h-5 w-5 text-baobab" aria-hidden="true" /><span><b>{summary.businessName ?? "Unnamed local business"}</b><small>Created {formatBackupDate(summary.createdAt)}</small></span></div><dl><div><dt>Products</dt><dd>{summary.counts.products}</dd></div><div><dt>Customers</dt><dd>{summary.counts.customers}</dd></div><div><dt>Sales</dt><dd>{summary.counts.sales}</dd></div><div><dt>Payments</dt><dd>{summary.counts.payments + summary.counts.repayments}</dd></div><div><dt>Receipts</dt><dd>{summary.counts.receipts}</dd></div></dl><button className="primary-action" type="button" onClick={() => setMessage("Confirm the replacement below to restore this checked local backup.")}><ArchiveRestore className="h-4 w-4" aria-hidden="true" />Restore backup</button></div> : <p className="backup-empty"><FileWarning className="h-4 w-4" aria-hidden="true" />No checked backup file yet.</p>}</section>

      <section className="backup-sheet backup-integrity-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">03 · Check this device</p><h2>Review local records</h2></div><SearchCheck className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>This check reads saved record links and totals only. It never changes or removes your local records.</p><button className="secondary-action" type="button" onClick={() => void checkLocalRecords()} disabled={checkingIntegrity}>{checkingIntegrity ? "Checking local records…" : "Check local records"}<SearchCheck className="h-4 w-4" aria-hidden="true" /></button>{integrityAudit ? integrityAudit.status === "clear" ? <p className="backup-integrity-clear" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Checked {integrityAudit.recordsChecked} saved records. No relationship issues found.</p> : <div className="backup-integrity-attention" role="alert"><strong>Found {integrityAudit.issues.length} item{integrityAudit.issues.length === 1 ? "" : "s"} that need attention.</strong><p>Download a fresh backup before seeking help. This check did not change anything.</p><ul>{integrityAudit.issues.slice(0, 3).map((entry, index) => <li key={`${entry.code}-${entry.recordId ?? index}`}>{entry.message}</li>)}</ul></div> : null}</section></div>

    <section className="backup-boundary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /><div><strong>Restore replaces one company’s local workspace.</strong><p>Download a fresh backup before restoring. Stage 11 keeps other companies on this phone separate; it does not add cloud storage, automatic sync, or a remote copy.</p></div></section>

    <AlertDialog open={message === "Confirm the replacement below to restore this checked local backup."} onOpenChange={(open) => { if (!open && !restoring) setMessage(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Restore this company’s records?</AlertDialogTitle><AlertDialogDescription>This cannot be undone here for that company. The selected backup will replace or add only its business details, products, inventory movements, customers, suppliers, purchases, sales, payments, repayments, receipts, expenses, and Mobile Money details. Other companies on this phone will not be changed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={restoring}>Keep current records</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmRestore(); }} disabled={restoring}>{restoring ? "Restoring…" : "Replace with backup"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
