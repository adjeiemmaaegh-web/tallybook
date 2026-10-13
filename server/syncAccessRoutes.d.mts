export function createAccessLimiter(config?: {limit?:number;windowMs?:number;clock?:()=>number}): {allow(key:string):boolean};
export function isDirectTls(req: {socket?: object & {encrypted?:boolean}}):boolean;
export function createAccessActions(config: {
  loginDirectoryFile:string; sessionFile:string; sessionSecret:string;
  enrollmentFile:string;clock?:()=>number;limiter?:{allow(key:string):boolean};
}): {
  login(body:{userId:string;password:string},clientKey:string):Promise<{session:string;expiresAt:number}>;
  invite(body:{orgId:string;targetActorId:string},sessionHeader:string|undefined,clientKey:string):Promise<{token:string;expiresAt:number}>;
  enroll(body:{orgId:string;deviceId:string;token:string},sessionHeader:string|undefined,clientKey:string):Promise<{orgId:string;actorId:string;deviceId:string;status:string}>;
  revoke(body:{orgId:string;deviceId:string},sessionHeader:string|undefined,clientKey:string):Promise<{orgId:string;deviceId:string;status:string}>;
};
