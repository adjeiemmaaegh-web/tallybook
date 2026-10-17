/** Tactile Ledger Stage 10: local backup files are owner-controlled, inspectable, and restored only after an explicit replacement confirmation. */
import { ArchiveRestore, CheckCircle2, Download, FileCheck2, FileWarning, HardDriveDownload, SearchCheck, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { backupDownloadName, createBackup, getBackupSummary, getLastBackupAt, getLastBackupCompanyId, parseBackup, recordBackupExportedAt, restoreBackup, stringifyBackup, type BackupSummary, type TallybookBackup } from "@/features/backup/backup";
import { encryptBackupText, decryptBackupText } from "@/features/backup/backupCrypto";
import {classifyRun8BackupEnvelope,RUN8_ENCRYPTED_V1,RUN8_ENCRYPTED_V2} from "@/features/backup/run8EncryptedEnvelope.mjs";
import {createRun8FileReceipt,verifyRun8FileReceipt} from "@/features/backup/run8BackupFileReceipt.mjs";
import {readRun18BoundedBackupFile} from "@/features/backup/run18ImportAdmission.mjs";
import {useRun18PassphrasePrompt} from "@/features/backup/useRun18PassphrasePrompt";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import { auditLocalIntegrity, type IntegrityAudit } from "@/features/reliability/integrity";
import {db} from "@/db/TallybookDB";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";

function formatBackupDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function BackupPage() {
  const { profile, activeCompanyId, refresh } = useBusinessProfile();
  const passphrases=useRun18PassphrasePrompt();
  const [readingFile,setReadingFile]=useState(false);
  const importedUnderCompany=useRef<string|null>(null);
  const activeRead=useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);
  const [pendingFileProof,setPendingFileProof]=useState<Awaited<ReturnType<typeof createRun8FileReceipt>>|null>(null);
  const [verifyingFile,setVerifyingFile]=useState(false);
  const [pendingBackup, setPendingBackup] = useState<TallybookBackup | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastBackupCompanyId, setLastBackupCompanyId] = useState<string | null>(null);
  const [integrityAudit, setIntegrityAudit] = useState<IntegrityAudit | null>(null);

  useEffect(()=>{importedUnderCompany.current=null;setPendingBackup(null);setSummary(null);setPendingFileProof(null);},[activeCompanyId]);
  useEffect(() => {
    void Promise.all([getLastBackupAt(), getLastBackupCompanyId()]).then(([at, companyId]) => { setLastBackupAt(at); setLastBackupCompanyId(companyId); }).catch(() => { setLastBackupAt(null); setLastBackupCompanyId(null); });
  }, [profile?.id]);

  const exportLocalBackup = async () => {
    setExporting(true);setPendingFileProof(null);
    try {
      const companyAtStart=getActiveBusinessProfileId();
      const backup = await createBackup();
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed during backup export.");
      const exportedCompanyId=backup.records.businessProfiles[0]?.id;
      if(!exportedCompanyId)throw Error("The export has no valid company.");
      // All exports are encrypted: records include financial/customer data,
      // even on legacy businesses without any enrolled staff.
      const passphrase=await passphrases.ask("Encrypt local backup","Choose a strong passphrase and store it separately from your backup file.",12,"Encrypt backup");
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed during passphrase entry.");
      if(passphrase===null)return;
      const text=await encryptBackupText(stringifyBackup(backup),passphrase);
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company switched before the encrypted file was prepared.");
      const proof=await createRun8FileReceipt(text,exportedCompanyId,backup.createdAt);
      const blob=new Blob([text],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=backupDownloadName(new Date(backup.createdAt)).replace(".json",".encrypted.json");
      document.body.appendChild(link);
      try{link.click();}finally{
        link.remove();
        // Avoid revoking in the same task before slow browsers consume the URL.
        window.setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
      setPendingFileProof(proof);
      setMessage("Encrypted backup prepared. Find the downloaded file, then choose Verify downloaded file below. It will not be marked as verified until you reselect it and confirm the passphrase.");
      toast.info("Verify your encrypted backup",{
        description:"Reselect the saved file and enter the passphrase before marking this company's backup verified."
      });
    } catch(cause){
      const message=cause instanceof Error?cause.message:"Encrypted backup could not be prepared.";
      setMessage(message);toast.error("Backup was not prepared",{description:message});
    }finally{setExporting(false);}
  };

  const verifyDownloadedFile=async(file:File|undefined)=>{
    if(!file||!pendingFileProof)return;
    setVerifyingFile(true);
    try{
      const companyAtStart=getActiveBusinessProfileId();
      if(pendingFileProof.companyId!==companyAtStart)throw Error("Only the original exporting company may verify this file.");
      const fileText=await readRun18BoundedBackupFile(file,(navigator as Navigator & {deviceMemory?:number}).deviceMemory);
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed while reading the verification file.");
      const proof=await verifyRun8FileReceipt(
        pendingFileProof,fileText,pendingFileProof.companyId);
      const passphrase=await passphrases.ask("Verify saved encrypted file","Re-enter the passphrase for the actual downloaded file.",1,"Verify file");
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed during verification.");
      if(passphrase===null)return;
      const recovered=parseBackup(await decryptBackupText(fileText,passphrase));
      if(recovered.records.businessProfiles[0]?.id!==proof.companyId||
         recovered.createdAt!==proof.createdAt)
        throw Error("The checked backup identity does not match the original export.");
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed before confirming saved backup.");
      const confirmedAt=await recordBackupExportedAt(
        proof.createdAt,db,proof.companyId,proof.sha256);
      setLastBackupAt(confirmedAt);
      setLastBackupCompanyId(proof.companyId);
      setPendingFileProof(null);
      setMessage("The reselected encrypted file matched this export, decrypted successfully and passed backup validation. Keep it somewhere safe outside this device.");
      toast.success("Backup file verified",{description:"Keep the file and its passphrase in separate safe places."});
    }catch(cause){
      const message=cause instanceof Error?cause.message:"Backup file verification failed.";
      setMessage(message);toast.error("Backup not verified",{description:message});
    }finally{setVerifyingFile(false);}
  };

  const readBackup = async (file: File | undefined) => {
    if(!file||activeRead.current||restoring||passphrases.active)return;
    activeRead.current=true;setReadingFile(true);
    const companyAtStart=getActiveBusinessProfileId();
    // A cancelled or rejected second import must never leave the previous
    // file armed as the next destructive restore candidate.
    setPendingBackup(null);setSummary(null);setMessage(null);
    try {
      const text=await readRun18BoundedBackupFile(file,(navigator as Navigator & {deviceMemory?:number}).deviceMemory);
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed during file read.");
      const format=classifyRun8BackupEnvelope(text);
      let plain=text;
      if(format===RUN8_ENCRYPTED_V1||format===RUN8_ENCRYPTED_V2){
        const passphrase=await passphrases.ask("Open encrypted backup","Enter the passphrase for this selected backup before previewing its records.",1,"Open backup");
        if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed while unlocking backup.");
        if(passphrase===null)return;
        plain=await decryptBackupText(text,passphrase);
      }else if(!window.confirm(
        "This is an older, unencrypted local backup. Its personal and financial records are readable by anyone with the file. Review it only on a trusted device. Continue?")){
        return;
      }
      const backup=parseBackup(plain);
      if(companyAtStart!==getActiveBusinessProfileId())throw Error("Company changed before previewing the backup.");
      importedUnderCompany.current=companyAtStart;
      setPendingBackup(backup); setSummary(getBackupSummary(backup)); setMessage(null);
      toast.success("Backup file checked", { description: "Review the record count, then choose Restore backup when ready." });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "This file could not be read as a Tallybook backup.";
      importedUnderCompany.current=null;setPendingBackup(null);setSummary(null);setMessage(text);toast.error("Backup file was not accepted",{description:text});
    }finally{activeRead.current=false;setReadingFile(false);}
  };

  const confirmRestore = async () => {
    if(!pendingBackup||readingFile||passphrases.active)return;
    if(importedUnderCompany.current!==getActiveBusinessProfileId()){
      setMessage("Company changed after backup selection. Select the backup file again.");
      setPendingBackup(null);setSummary(null);return;
    }
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

  return <div className="backup-page"><section className="backup-hero"><div className="backup-brand"><HardDriveDownload className="h-6 w-6" aria-hidden="true" /><span>LOCAL COPY</span></div><span className="workspace-marker">BKP</span><p className="eyebrow"><span className="eyebrow-dot" />Owner-controlled backup</p><h1>Keep a copy of <em>your own record.</em></h1><p>Download a complete local backup file, then use it to restore this business on a cleared or reinstalled device. Nothing is sent to a server.</p><p className="backup-identity"><b>{profile?.name ?? "This local ledger"}</b><span>Encrypted local file · verification before backup readiness</span></p><div className="backup-last-export" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /><span><b>{lastBackupAt && lastBackupCompanyId === profile?.id ? `Last checked backup for ${profile.name}: ${formatBackupDate(lastBackupAt)}` : "No verified backup file recorded for this company yet"}</b><small>{lastBackupAt && lastBackupCompanyId === profile?.id ? "An encrypted file was reselected and validated; keep it and its passphrase off-device." : "Download this company’s copy before changing or clearing it."}</small></span></div></section>

    <div className="backup-workspace"><section className="backup-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">01 · Make a copy</p><h2>Download your local backup</h2></div><Download className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>Every new backup is encrypted with a passphrase, including businesses without staff. The file contains company, customer, stock and financial records. Keep the downloaded encrypted file somewhere outside this device and store the passphrase separately. Tallybook will not mark an export verified until you reselect its file and it passes decryption and record checks.</p><button className="primary-action" type="button" onClick={() => void exportLocalBackup()} disabled={exporting||readingFile||restoring||passphrases.active}>{exporting ? "Preparing encrypted backup…" : "Download encrypted backup"}<Download className="h-4 w-4" aria-hidden="true" /></button>
      {pendingFileProof?<label className="backup-file-input">
        <span><FileCheck2 className="h-4 w-4" aria-hidden="true" />{verifyingFile?"Verifying file…":"Verify downloaded file"}</span>
        <input ref={verifyInputRef} type="file" accept="application/json,.json" disabled={verifyingFile||readingFile||restoring||passphrases.active}
          onChange={event=>{
            const file=event.currentTarget.files?.[0];
            event.currentTarget.value="";
            void verifyDownloadedFile(file);
          }}/>
      </label>:null}
      {message ? <p className="backup-message" role="status"><FileCheck2 className="h-4 w-4" aria-hidden="true" />{message}</p> : null}</section>

      <section className="backup-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">02 · Restore a copy</p><h2>Check a backup file</h2></div><Upload className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>Choose an encrypted Tallybook backup and enter its passphrase. Legacy readable JSON backups are accepted only after an explicit privacy warning. Tallybook validates the schema and record links before offering to replace that company's local workspace.</p><label className="backup-file-input"><span><Upload className="h-4 w-4" aria-hidden="true" />Choose backup file</span><input ref={inputRef} type="file" accept="application/json,.json" disabled={readingFile||restoring||passphrases.active} onChange={(event) => {const file=event.currentTarget.files?.[0];event.currentTarget.value="";void readBackup(file);}} /></label>{summary ? <div className="backup-preview"><div><FileCheck2 className="h-5 w-5 text-baobab" aria-hidden="true" /><span><b>{summary.businessName ?? "Unnamed local business"}</b><small>Created {formatBackupDate(summary.createdAt)}</small></span></div><dl><div><dt>Products</dt><dd>{summary.counts.products}</dd></div><div><dt>Customers</dt><dd>{summary.counts.customers}</dd></div><div><dt>Sales</dt><dd>{summary.counts.sales}</dd></div><div><dt>Payments</dt><dd>{summary.counts.payments + summary.counts.repayments}</dd></div><div><dt>Receipts</dt><dd>{summary.counts.receipts}</dd></div></dl><button className="primary-action" type="button" onClick={() => setMessage("Confirm the replacement below to restore this checked local backup.")}><ArchiveRestore className="h-4 w-4" aria-hidden="true" />Restore backup</button></div> : <p className="backup-empty"><FileWarning className="h-4 w-4" aria-hidden="true" />No checked backup file yet.</p>}</section>

      <section className="backup-sheet backup-integrity-sheet"><div className="backup-sheet-head"><div><p className="ledger-kicker">03 · Check this device</p><h2>Review local records</h2></div><SearchCheck className="h-5 w-5 text-baobab" aria-hidden="true" /></div><p>This check reads saved record links and totals only. It never changes or removes your local records.</p><button className="secondary-action" type="button" onClick={() => void checkLocalRecords()} disabled={checkingIntegrity}>{checkingIntegrity ? "Checking local records…" : "Check local records"}<SearchCheck className="h-4 w-4" aria-hidden="true" /></button>{integrityAudit ? integrityAudit.status === "clear" ? <p className="backup-integrity-clear" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Checked {integrityAudit.recordsChecked} saved records. No relationship issues found.</p> : <div className="backup-integrity-attention" role="alert"><strong>Found {integrityAudit.issues.length} item{integrityAudit.issues.length === 1 ? "" : "s"} that need attention.</strong><p>Download a fresh backup before seeking help. This check did not change anything.</p><ul>{integrityAudit.issues.slice(0, 3).map((entry, index) => <li key={`${entry.code}-${entry.recordId ?? index}`}>{entry.message}</li>)}</ul></div> : null}</section></div>

    <section className="backup-boundary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /><div><strong>Restore replaces one company’s local workspace.</strong><p>Download a fresh backup before restoring. Stage 11 keeps other companies on this phone separate; it does not add cloud storage, automatic sync, or a remote copy.</p></div></section>

    {passphrases.dialog}
    <AlertDialog open={message === "Confirm the replacement below to restore this checked local backup."} onOpenChange={(open) => { if (!open && !restoring) setMessage(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Restore this company’s records?</AlertDialogTitle><AlertDialogDescription>This cannot be undone here for that company. The selected backup will replace or add only its business details, products, inventory movements, customers, suppliers, purchases, sales, payments, repayments, receipts, expenses, and Mobile Money details. Other companies on this phone will not be changed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={restoring}>Keep current records</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmRestore(); }} disabled={restoring||readingFile||passphrases.active}>{restoring ? "Restoring…" : "Replace with backup"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
