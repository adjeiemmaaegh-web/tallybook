/** Run 18 — transient update approval, never auto-restart POS mid-write.
 * Installed service-worker update is only applied after explicit user action.
 */
export const RUN18_UPDATE_READY_EVENT="tallybook:offline-update-ready";
let applyUpdate:null|(()=>Promise<void>)=null;
export function announceRun18UpdateReady(updater:()=>Promise<void>){
 if(typeof updater!=="function")throw Error("Invalid offline update action.");
 applyUpdate=updater;
 if(typeof window!=="undefined")window.dispatchEvent(new Event(RUN18_UPDATE_READY_EVENT));
}
export function isRun18UpdateReady(){return applyUpdate!==null;}
export async function applyRun18ApprovedUpdate(){
 if(!applyUpdate)throw Error("No staged offline update is available.");
 await applyUpdate();
}
