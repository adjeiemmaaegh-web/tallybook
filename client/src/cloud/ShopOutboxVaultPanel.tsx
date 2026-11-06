import {useCallback,useEffect,useState,type FormEvent} from "react";
import {
  enableShopOutboxVault,getShopOutboxVaultStatus,lockShopOutboxVault,
  unlockShopOutboxVault, exportProtectedShopOutbox, importProtectedShopOutbox,
  type OutboxScope
} from "./shopOutbox";

/** Optional incremental protection for this account's SHARED-SHOP queue.
 * The business's existing device-local ledger and catalogue have separate
 * storage and are not protected by this feature.
 */
export function ShopOutboxVaultPanel({
  scope,onStatusChange
}:{
  scope:OutboxScope;
  onStatusChange:()=>Promise<void>;
}) {
  const [status,setStatus]=useState<{configured:boolean;unlocked:boolean}|null>(null);
  const [first,setFirst]=useState("");
  const [second,setSecond]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const [restoring,setRestoring]=useState(false);
  const [restoreFile,setRestoreFile]=useState<File|null>(null);
  const load=useCallback(async()=>{
    setStatus(await getShopOutboxVaultStatus(scope));
  },[scope]);
  useEffect(()=>{
    let active=true;
    setStatus(null);setError("");setNote("");setFirst("");setSecond("");
    void getShopOutboxVaultStatus(scope)
      .then(result=>{if(active)setStatus(result);})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Could not check protected sales.");});
    return ()=>{active=false;};
  },[scope]);

  async function setup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    if(first!==second){setError("Both passphrases must match.");return;}
    setBusy(true);setError("");setNote("");
    try{
      await enableShopOutboxVault(scope,first);
      setFirst("");setSecond("");
      await load();
      setNote("Encrypted offline sales are ready on this device. Keep your passphrase secure.");
      await onStatusChange();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not protect pending sales.");}
    finally{setBusy(false);}
  }
  async function unlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError("");setNote("");
    try{
      await unlockShopOutboxVault(scope,first);
      setFirst("");setSecond("");
      await load();
      setNote("Offline sales unlocked for this tab.");
      await onStatusChange();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not unlock protected sales.");}
    finally{setBusy(false);}
  }
  async function exportBackup(){
    if(busy)return;
    setBusy(true);setError("");setNote("");
    try{
      const data=await exportProtectedShopOutbox(scope);
      const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));
      try{
        const link=document.createElement("a");
        const name=scope.companyId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,40);
        link.href=url;link.download="tallybook-encrypted-unsent-sales-"+name+".json";
        document.body.appendChild(link);link.click();link.remove();
      }finally{URL.revokeObjectURL(url);}
      setNote("Encrypted recovery file created. Store it privately with your passphrase. The file is a snapshot; stop checkout while backing up.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not export encrypted queue.");}
    finally{setBusy(false);}
  }
  async function restoreBackup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy || !restoreFile)return;
    setBusy(true);setError("");setNote("");
    try{
      if(restoreFile.size>10*1024*1024)throw Error("Encrypted recovery file is too large.");
      const count=await importProtectedShopOutbox(scope,await restoreFile.text(),first);
      setFirst("");setSecond("");setRestoreFile(null);setRestoring(false);
      await load();await onStatusChange();
      setNote("Recovered "+count+" encrypted unsent sale(s). Review pending sales before replay.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not recover offline sales.");}
    finally{setBusy(false);}
  }
  return <section className="shop-card" aria-label="Offline sales protection">
    <h2>Offline sales protection</h2>
    {status===null?<p role="status">Checking protected queue…</p>:
     status.configured ? status.unlocked ? <>
       <p role="status">Encrypted queue unlocked in this tab.</p>
       <button type="button" className="secondary-action" disabled={busy}
         onClick={()=>void exportBackup()}>Export encrypted recovery file</button>
       <button className="secondary-action" type="button" onClick={()=>{
         lockShopOutboxVault(scope);setStatus({configured:true,unlocked:false});
         setNote("Locked. Unlock again before recording or resending sales.");
         void onStatusChange();
       }}>Lock offline sales</button>
     </> : <>
       <p>Offline sales are encrypted. Enter your passphrase to view, record or send them. Your passphrase is not stored here.</p>
       <form onSubmit={event=>void unlock(event)}>
         <label className="shop-field">Offline sales passphrase
           <input aria-label="Unlock offline sales passphrase" type="password" autoComplete="off"
             value={first} onChange={event=>setFirst(event.target.value)} minLength={12} required />
         </label>
         <button className="primary-action" type="submit" disabled={busy||first.length<12}>
           {busy?"Unlocking…":"Unlock offline sales"}</button>
       </form>
     </> : <>
       <p>Optional: protect future unsent shared-shop sales with a passphrase. The queue must be empty first. Once enabled, you must unlock it after reloading the app.</p>
       <p className="shop-muted">If you forget this passphrase, encrypted unsent sales may be unrecoverable. This does not encrypt the separate device ledger or catalogue.</p>
       <button type="button" className="secondary-action" onClick={()=>{setRestoring(v=>!v);setError("");setFirst("");setSecond("");}}>
         {restoring?"Create a new protected queue instead":"Restore an encrypted recovery file"}</button>
       {restoring ? <form onSubmit={event=>void restoreBackup(event)}>
         <label className="shop-field">Encrypted recovery file
           <input aria-label="Encrypted recovery file" type="file" accept=".json,application/json" required
             onChange={event=>setRestoreFile(event.target.files?.[0]??null)}/>
         </label>
         <label className="shop-field">Recovery passphrase
           <input aria-label="Encrypted recovery passphrase" type="password" autoComplete="off"
             minLength={12} required value={first} onChange={event=>setFirst(event.target.value)}/>
         </label>
         <button type="submit" className="secondary-action" disabled={busy||!restoreFile||first.length<12}>
           {busy?"Restoring…":"Restore encrypted sales"}</button>
       </form> : <form onSubmit={event=>void setup(event)}>
         <label className="shop-field">Choose offline sales passphrase
           <input aria-label="Choose offline sales passphrase" type="password" autoComplete="new-password"
             minLength={12} value={first} onChange={event=>setFirst(event.target.value)} required />
         </label>
         <label className="shop-field">Repeat passphrase
           <input aria-label="Repeat offline sales passphrase" type="password" autoComplete="new-password"
             minLength={12} value={second} onChange={event=>setSecond(event.target.value)} required />
         </label>
         <button type="submit" className="secondary-action" disabled={busy||first.length<12||first!==second}>
           {busy?"Protecting…":"Enable protected offline sales"}
         </button>
       </form>}
     </>}
    {note&&<p role="status">{note}</p>}
    {error&&<p role="alert" className="shop-alert">{error}</p>}
  </section>;
}
