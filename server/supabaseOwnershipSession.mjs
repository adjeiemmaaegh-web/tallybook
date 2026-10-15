/** Trust boundary for Supabase-account ownership operations.
 * The JWT is parsed ONLY AFTER Supabase Auth has validated it with getUser().
 * Every operation independently checks the server-owned auth.sessions table,
 * so a deleted/revoked session is denied before any ownership transaction.
 * No local IndexedDB record or browser-supplied account ID is trusted.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function denied(){throw Error('Ownership session is not authorized');}
function claimsAfterValidation(jwt){
  const sections=jwt.split('.');
  if(sections.length!==3 || sections.some(s=>!s || s.length>8192 || !/^[A-Za-z0-9_-]+$/.test(s)))denied();
  let claims;
  try{
    const decoded=Buffer.from(sections[1],'base64url');
    if(decoded.length>8192)denied();
    claims=JSON.parse(decoded.toString('utf8'));
  }catch{denied();}
  if(!claims||typeof claims!=='object'||Array.isArray(claims))denied();
  return claims;
}
export function createSupabaseOwnershipSessionResolver({authClient,sessionReader,clock=Date.now}){
  if(typeof authClient?.auth?.getUser!=='function' ||
     typeof sessionReader?.isSessionActive!=='function' ||
     typeof clock!=='function')denied();
  return async function resolve(accessToken){
    if(typeof accessToken!=='string' || accessToken.length<20 || accessToken.length>16384)denied();
    const now=clock();
    if(!Number.isSafeInteger(now)||now<0)denied();
    let response;
    try{response=await authClient.auth.getUser(accessToken);}catch{denied();}
    if(response?.error || !UUID.test(response?.data?.user?.id??''))denied();
    const claims=claimsAfterValidation(accessToken);
    const userId=response.data.user.id;
    if(claims.sub!==userId || !UUID.test(claims.session_id??'') ||
       claims.role!=='authenticated' || claims.aud!=='authenticated' ||
       !Number.isSafeInteger(claims.exp) || claims.exp<=Math.floor(now/1000) ||
       claims.exp>Math.floor(Number.MAX_SAFE_INTEGER/1000))denied();
    let active=false;
    try{active=await sessionReader.isSessionActive(claims.session_id,userId,now);}catch{denied();}
    if(active!==true)denied();
    // Preserve the validated JWT deadline for the subsequent privileged SQL transaction.
    return Object.freeze({userId,active:true,sessionId:claims.session_id,
      expiresAtEpochMs:claims.exp*1000});
  };
}
/** Reads the live Supabase Auth session in a PRIVATE database context.
 * Requires a privileged pool with SELECT on auth.sessions, never the user's RLS
 * connection, an anonymous API key or an auth-session cache.
 */
export function createPostgresAuthSessionReader(pool){
  if(typeof pool?.query!=='function')denied();
  return Object.freeze({
    async isSessionActive(sessionId,userId,now){
      if(!UUID.test(sessionId??'')||!UUID.test(userId??'')||
         !Number.isSafeInteger(now)||now<0)return false;
      const q=await pool.query(
        'select exists (select 1 from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>to_timestamp($3::double precision/1000))) as active',
        [sessionId,userId,now]);
      return q?.rows?.length===1 && q.rows[0].active===true;
    },
  });
}
