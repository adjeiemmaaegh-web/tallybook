/** Standard streaming Response for injected transports; no provider/network claim. */
export function jsonResponseFixture(url:string,body:unknown,status=200):Response {
 const response=new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 Object.defineProperty(response,'url',{value:url});
 return response;
}
