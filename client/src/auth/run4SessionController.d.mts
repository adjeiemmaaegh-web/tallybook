export type Run4Status = 'checking'|'signed-in'|'signed-out'|'offline'|'error';
export interface Run4Snapshot {
  status: Run4Status;
  userId: string|null;
  expiresAtEpochMs: number|null;
  generation: number;
}
export interface Run4Auth {
  getSession():Promise<{data?:{session?:{
    user?:{id?:string};access_token?:string;expires_at?:number}|null};error?:unknown}>;
  getUser():Promise<{data?:{user?:{id?:string}|null};error?:unknown}>;
  signOut():Promise<{error?:unknown}>;
  onAuthStateChange(callback:(event:string,session?:unknown)=>void):
    {data:{subscription:{unsubscribe():void}}};
}
export interface Run4ControllerOptions {
  auth:Run4Auth;
  clock?:()=>number;
  isOnline?:()=>boolean;
  serverProof?:(input:{userId:string;accessToken:string;expiresAtEpochMs:number})=>
    Promise<{active:boolean;userId:string;expiresAtEpochMs:number}>;
  schedule?:(callback:()=>void)=>()=>void;
  alarm?:(callback:()=>void,milliseconds:number)=>()=>void;
  onChange?:(state:Run4Snapshot)=>void;
}
export interface Run4SessionController {
  start():Run4Snapshot;
  stop():void;
  refresh():Promise<Run4Snapshot>;
  signOut():Promise<boolean>;
  runVerified<T>(work:(context:{userId:string})=>Promise<T>):Promise<T>;
  getSnapshot():Run4Snapshot;
  offline():Run4Snapshot;
  invalidate(status?:Run4Status):Run4Snapshot;
  authEvent(event:string):void;
}
export function createRun4SessionController(options:Run4ControllerOptions):Run4SessionController;
