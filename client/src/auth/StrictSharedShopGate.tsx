/** Online-account deployments guard the shared-shop entry independently of the
 * local device workspace, and never render cached shop records on offline JWTs.
 */
import { useEffect, type ReactNode } from 'react';
import { Redirect } from 'wouter';
import { useRun4CloudSession } from './useRun4CloudSession';
import { mayMountSharedShop } from './strictSharedShopAccess.mjs';

const mandatoryOnlineAccountMode = import.meta.env.VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH === 'true';

export function StrictSharedShopGate({ children }: { children: ReactNode }) {
  return mandatoryOnlineAccountMode ? <VerifiedShopAccess>{children}</VerifiedShopAccess> : <>{children}</>;
}

function VerifiedShopAccess({ children }: { children: ReactNode }) {
  const {state, retry}=useRun4CloudSession(true,true);
  useEffect(()=>{
    // Recheck the server's active auth.sessions record even if the page stays open.
    const interval=window.setInterval(()=>{void retry();},30_000);
    return ()=>window.clearInterval(interval);
  },[retry]);
  const online=typeof navigator!=='undefined' && navigator.onLine;
  if (mayMountSharedShop(true, online, state.status, state.expiresAtEpochMs, Date.now()))
    return <>{children}</>;
  if(!online || state.status==='offline')
    return <main className="shop-page" role="alert"><h1>Connect to verify your account</h1><p>Shared shop records require an active online account in this workspace. Reconnect before continuing.</p></main>;
  if(state.status==='signed-out')return <Redirect to="/signin" replace/>;
  if(state.status==='checking')
    return <main className="shop-page" role="status">Verifying your shop account…</main>;
  return <main className="shop-page" role="alert">
    <h1>Shop access needs verification</h1>
    <p>Your account or session could not be verified. No saved shop records were displayed.</p>
    <button type="button" onClick={()=>void retry()}>Retry verification</button>
  </main>;
}
