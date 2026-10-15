/** Optional cloud account workspace. Local operations have their own routes. */
import {CloudBusinessPanel} from '@/cloud/CloudBusinessPanel';
export default function CloudAccountPage(){
  if(import.meta.env.VITE_TALLYBOOK_RUN4_CLOUD_ACCOUNT_PREVIEW!=='true')
    return <main className="mx-auto max-w-xl p-6">
      <h1 className="font-semibold">Cloud account preview disabled</h1>
      <p>Tallybook's offline business features are available without cloud sign-in.</p>
    </main>;
  return <main className="mx-auto max-w-2xl p-5 space-y-4">
    <h1 className="text-xl font-semibold">Cloud account</h1>
    <p className="text-sm">Account membership only. Cloud financial synchronization is not enabled.</p>
    <CloudBusinessPanel/>
  </main>;
}
