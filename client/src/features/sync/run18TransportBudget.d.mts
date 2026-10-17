export const RUN18_RELAY_REQUEST_DEADLINE_MS:number;
export function requestRun18WithDeadline(
 transport:(url:string,init:RequestInit)=>Promise<Response>,
 url:string,init:RequestInit,deadline?:number
):Promise<Response>;
export function readRun18BoundedJson(response:Response,maxBytes:number):Promise<unknown>;
