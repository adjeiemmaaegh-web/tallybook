export type SyncDirectory = {
  getOrganization(orgId:string): Promise<{id:string,status:string}|null>;
  getMembership(orgId:string,actorId:string): Promise<{orgId:string,actorId:string,status:string,role:string}|null>;
  getDevice(orgId:string,deviceId:string): Promise<{orgId:string,id:string,actorId:string,status:string}|null>;
};
export function authorizeSyncInspect(claims:{orgId:string;deviceId:string;scope:string},directory:SyncDirectory|undefined,actorId:string|undefined): Promise<Readonly<{orgId:string;deviceId:string;actorId:string;role:string;scope:'sync:inspect'}>>;
export const disabledSyncIdentityDirectory: SyncDirectory;
