import {afterEach,expect,it,vi} from 'vitest';
import {acceptCloudInvitation} from './run3MembershipClient';
const auth=vi.hoisted(()=>({
 getUser:vi.fn(async()=>({data:{user:{id:'attendant'}},error:null})),
 getSession:vi.fn(async()=>({data:{session:{user:{id:'attendant'},access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+60}},error:null})),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})
}));
vi.mock('@/lib/supabase',()=>({getSupabaseClient:()=>({auth})}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('rejects an incomplete code before reading credentials',async()=>{
 await expect(acceptCloudInvitation('incomplete')).rejects.toThrow(/complete invitation code/);
 expect(auth.getSession).not.toHaveBeenCalled();
});
it('rejects the website fallback page and forbids credential forwarding on redirects',async()=>{
 vi.stubGlobal('window',{location:{protocol:'https:'}});
 const fetcher=vi.fn(async()=>new Response('<html></html>',{headers:{'content-type':'text/html'}}));
 vi.stubGlobal('fetch',fetcher);
 await expect(acceptCloudInvitation('v1.'+'x'.repeat(43))).rejects.toThrow(/service is unavailable/);
 expect(fetcher).toHaveBeenCalledWith('/api/run3/membership/accept',expect.objectContaining({redirect:'error',credentials:'omit'}));
});
