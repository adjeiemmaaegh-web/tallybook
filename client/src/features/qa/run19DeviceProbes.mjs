/** Safe in-browser capability preview for owner-directed Run 19.
 * Detection is NOT execution, compatibility, performance, hardware proof,
 * staff authentication, successful storage, or independent UAT acceptance.
 */
export function inspectRun19DeviceCapabilities(env=globalThis){
 const nav=env.navigator;
 const doc=env.document;
 const supports=name=>typeof env[name]!=="undefined";
 const items=[
  ["IndexedDB API",supports("indexedDB")],
  ["Web Crypto",Boolean(env.crypto?.subtle)],
  ["Service worker API",Boolean(nav?.serviceWorker)],
  ["Current page controlled by service worker",Boolean(nav?.serviceWorker?.controller)],
  ["Web Locks API",Boolean(nav?.locks?.request)],
  ["WebAuthn API",supports("PublicKeyCredential")],
  ["Storage estimate API",Boolean(nav?.storage?.estimate)],
  ["Web print API",typeof env.print==="function"],
  ["Clipboard API",Boolean(nav?.clipboard)],
  ["PWA standalone display",Boolean(env.matchMedia?.("(display-mode: standalone)")?.matches)],
  ["Online flag (not a connectivity test)",nav?.onLine===true]
 ];
 return Object.freeze({checkedAt:new Date().toISOString(),
   apiPresenceOnly:true,hardwareVerificationPerformed:false,
   offlineRouteCheckPerformed:false,livePaymentPerformed:false,
   results:Object.freeze(items.map(([label,detected])=>Object.freeze({label,detected:Boolean(detected)})))});
}
/** Print on explicit operator click, never from a POS sale or receipt.
 * Only this fixed, nonfinancial markup is printed in an isolated iframe.
 */
export function printRun19Diagnostic(documentRef=globalThis.document){
 if(!documentRef?.createElement||!documentRef.body)throw Error("Browser print preview is unavailable.");
 const frame=documentRef.createElement("iframe");
 frame.setAttribute("title","Run 19 disposable diagnostic print page");
 frame.style.cssText="position:fixed;width:0;height:0;border:0;left:-9999px";
 frame.srcdoc='<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Tallybook device QA only</title>'+
  '<style>body{font:16px system-ui;margin:15mm;color:#000}h1{font-size:22px}p{line-height:1.5}' +
  'strong{display:block;font-size:20px;border:2px solid black;padding:12px}</style></head><body>'+
  '<h1>Tallybook Run 19 — physical printer check</h1>'+
  '<strong>TEST PAGE ONLY — NOT A SALE, RECEIPT OR PAYMENT</strong>'+
  '<p>Check page scaling, character clarity, paper feed and printer selection. No customer or business data are printed.</p>'+
  '<p>0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz</p>'+
  '<p>Never attach a real customer receipt to diagnostic evidence.</p></body></html>';
 documentRef.body.append(frame);
 const remove=()=>{frame.remove();};
 frame.addEventListener("load",()=>{
  try{
   const target=frame.contentWindow;
   if(!target||typeof target.print!=="function")throw Error("Print preview unavailable.");
   target.addEventListener("afterprint",remove,{once:true});
   target.focus();target.print();
  }catch{remove();}
 },{once:true});
 // An optional print dialog can remain open indefinitely. The zero-sized
 // iframe contains no private records even if it remains in the document.
 return true;
}
