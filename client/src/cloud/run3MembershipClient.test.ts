import {afterEach,expect,it,vi} from 'vitest';
import {acceptCloudInvitation} from './run3MembershipClient';
const auth=vi.hoisted(()=>({
 getUser:vi.fn(async()=>({data:{user:{id:'attendant'}},error:null})),
 getSession:vi.fn(async()=>({data:{session:{user:{id:'attendant'},access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+60}},error:null})),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})
}));
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase',()=>({getSupabaseClient:()=>({auth,rpc})}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
it('rejects an incomplete code before reading credentials',async()=>{
 await expect(acceptCloudInvitation('incomplete')).rejects.toThrow(/complete invitation code/);
 expect(auth.getSession).not.toHaveBeenCalled();
});
it('an explicitly configured QA endpoint rejects a website fallback page and forbids credential forwarding on redirects',async()=>{
 vi.stubGlobal('window',{location:{protocol:'https:'}});
 vi.stubEnv('VITE_TALLYBOOK_RUN3_QA_ENDPOINT','https://lmneuqxfyxplrxjswpma.supabase.co/functions/v1/tallybook-run3-qa');
 vi.stubEnv('VITE_SUPABASE_URL','https://lmneuqxfyxplrxjswpma.supabase.co');
 vi.stubEnv('VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW','true');
 vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_fixture');
 const fetcher=vi.fn(async()=>new Response('<html></html>',{headers:{'content-type':'text/html'}}));
 vi.stubGlobal('fetch',fetcher);
 await expect(acceptCloudInvitation('v1.'+'x'.repeat(43))).rejects.toThrow(/service is unavailable/);
 expect(fetcher).toHaveBeenCalledWith('https://lmneuqxfyxplrxjswpma.supabase.co/functions/v1/tallybook-run3-qa/accept',expect.objectContaining({redirect:'error',credentials:'omit'}));
 expect(rpc).not.toHaveBeenCalled();
});

it('uses the authenticated database operation on any project without a QA endpoint',async()=>{
 vi.stubGlobal('window',{location:{protocol:'https:'}});
 vi.stubEnv('VITE_TALLYBOOK_RUN3_QA_ENDPOINT','');
 vi.stubEnv('VITE_SUPABASE_URL','https://staging-project.supabase.co');
 rpc.mockResolvedValueOnce({data:{companyId:'shop',userId:'attendant',role:'attendant'},error:null});
 const code='v1.'+'x'.repeat(43);
 expect(await acceptCloudInvitation(code)).toEqual({companyId:'shop',userId:'attendant'});
 expect(rpc).toHaveBeenCalledWith('tallybook_membership',{p_action:'accept',p_input:{inviteToken:code}});
});
