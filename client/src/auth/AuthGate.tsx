/** Run 4 cloud-only AuthGate.
 * Offline-first ledger routes are never blocked by cloud identity.
 * Local IndexedDB records are NOT encrypted by signing out or switching user.
 */
import {type ReactNode} from 'react';
import {Redirect,useLocation} from 'wouter';
import {useRun4CloudSession} from './useRun4CloudSession';

type Props={children:ReactNode;signIn:ReactNode;accountSignIn?:ReactNode;passwordRecovery?:ReactNode;enabled?:boolean};
export function AuthGate({children,signIn,accountSignIn,passwordRecovery,enabled=true}:Props){
  const [location]=useLocation();
  // Account screens have no reason to mount the local business database.
  // This also keeps a signed-out cloud-route redirect outside the ledger tree.
  if(location==='/signin')return <>{signIn}</>;
  if(location==='/reset-password')return <>{passwordRecovery??signIn}</>;
  if(location==='/account')return <>{accountSignIn??signIn}</>;
  // Preserve offline sales, inventory, reports and backup in every mode.
  // Only the opt-in cloud-account route requires a validated online session.
  if(!enabled||location!=='/cloud-account')return <>{children}</>;
  return <CloudOnlyGate signIn={signIn}>{children}</CloudOnlyGate>;
}

function CloudOnlyGate({children,signIn}:{children:ReactNode;signIn:ReactNode}){
  const {state,retry}=useRun4CloudSession(true,true);
  if(state.status==='signed-in')return <>{children}</>;
  if(state.status==='signed-out')return <Redirect to="/signin" replace/>;
  if(state.status==='checking')
    return <main className="mx-auto max-w-md p-6" role="status">Verifying your cloud session…</main>;
  if(state.status==='offline')
    return <main className="mx-auto max-w-md p-6 space-y-3">
      <h1 className="font-semibold">Cloud account needs an online connection</h1>
      <p role="status">Your local Tallybook business remains available from the home page.</p>
      <a href="/" className="underline">Return to offline Tallybook</a>
    </main>;
  return <main className="mx-auto max-w-md p-6 space-y-3">
    <h1 className="font-semibold">Cloud identity could not be verified</h1>
    <p role="alert">No cloud membership has been granted. Your offline business records were not changed.</p>
    <button className="rounded border px-4 py-2" onClick={()=>void retry()}>Retry verification</button>
    <a href="/" className="underline">Return to offline Tallybook</a>
  </main>;
}
