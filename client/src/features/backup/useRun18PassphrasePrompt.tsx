/** Run 18: transient, masked backup passphrases.
 * No plaintext window.prompt, localStorage, analytics, logs, or persistence.
 * Strings are only held during the explicit encrypt/decrypt operation.
 */
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
type Pending={title:string;description:string;confirmLabel:string;minimum:number};
export function useRun18PassphrasePrompt(){
 const [pending,setPending]=useState<Pending|null>(null);
 const resolver=useRef<((value:string|null)=>void)|null>(null);
 const ask=useCallback((title:string,description:string,minimum=1,confirmLabel="Continue"):Promise<string|null>=>{
   if(resolver.current)return Promise.reject(Error("Finish the first backup passphrase request."));
   return new Promise(resolve=>{
     resolver.current=resolve;setPending({title,description,confirmLabel,minimum});
   });
 },[]);
 const settle=useCallback((value:string|null)=>{
   const resolve=resolver.current;resolver.current=null;setPending(null);resolve?.(value);
 },[]);
 useEffect(()=>()=>{if(resolver.current){resolver.current(null);resolver.current=null;}},[]);
 return {ask,active:pending!==null,dialog:pending?
   <MaskedDialog {...pending} onSettle={settle}/>:null};
}
function MaskedDialog({title,description,confirmLabel,minimum,onSettle}:Pending&{
 onSettle:(value:string|null)=>void
}){
 const [value,setValue]=useState("");
 const inputRef=useRef<HTMLInputElement>(null);
 const cancelRef=useRef<HTMLButtonElement>(null);
 const confirmRef=useRef<HTMLButtonElement>(null);
 const prior=useRef<HTMLElement|null>(null);
 useEffect(()=>{
   prior.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
   inputRef.current?.focus();
   return()=>prior.current?.focus();
 },[]);
 return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4">
  <section role="dialog" aria-modal="true" aria-labelledby="run18-pass-title"
   aria-describedby="run18-pass-desc" className="w-full max-w-md space-y-4 rounded-lg border bg-white p-5 text-black shadow-xl"
   onKeyDown={event=>{
    if(event.key==="Escape"){event.preventDefault();onSettle(null);}
    if(event.key!=="Tab")return;
    const first=inputRef.current,last=confirmRef.current?.disabled?cancelRef.current:confirmRef.current;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }}>
   <h2 id="run18-pass-title" className="text-xl font-semibold">{title}</h2>
   <p id="run18-pass-desc" className="text-sm">{description} The passphrase stays in temporary memory and is not saved.</p>
   <form onSubmit={event=>{event.preventDefault();if(value.length>=minimum)onSettle(value);}}>
     <label className="block text-sm font-medium">Backup passphrase
       <input ref={inputRef} type="password" autoComplete="off" spellCheck={false}
         value={value} minLength={minimum} required onChange={event=>setValue(event.target.value)}
         className="mt-2 block w-full rounded border p-3"/>
     </label>
     <p className="mt-2 text-xs">At least {minimum} characters. Never share a backup passphrase over chat.</p>
     <div className="mt-5 flex justify-end gap-3">
       <button ref={cancelRef} type="button" className="rounded border p-3"
         onClick={()=>onSettle(null)}>Cancel</button>
       <button ref={confirmRef} type="submit" className="rounded border bg-slate-900 p-3 text-white"
         disabled={value.length<minimum}>{confirmLabel}</button>
     </div>
   </form>
  </section>
 </div>;
}
