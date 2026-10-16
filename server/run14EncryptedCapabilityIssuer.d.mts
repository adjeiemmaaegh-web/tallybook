export type Run14CapabilityScope="sync:replicate:write"|"sync:replicate:read";
export interface Run14IssuedCapability {
 capability:string;scope:Run14CapabilityScope;
 organizationId:string;deviceId:string;expiresAt:string
}
export function issueRun14ReplicaCapability(
 request:unknown,config:{
  secret?:string;sessionSecret?:string;session?:string;
  sessionStore?:unknown;directory?:unknown;clock?:()=>number
 }
):Promise<Readonly<Run14IssuedCapability>>;
