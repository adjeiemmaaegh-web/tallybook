export interface DirectorySnapshot {
  version: 1;
  organizations: Array<{id:string; status:'active'|'disabled'}>;
  memberships: Array<{orgId:string; actorId:string; status:'active'|'revoked'|'suspended'; role:'owner'|'admin'|'member'}>;
  devices: Array<{orgId:string; id:string; actorId:string; status:'active'|'revoked'}>;
}
export interface DirectoryReader {
  getOrganization(id:string): Promise<unknown>;
  getMembership(orgId:string, actorId:string): Promise<unknown>;
  getDevice(orgId:string, deviceId:string): Promise<unknown>;
}
export function validateDirectorySnapshot(input:unknown): Readonly<{organizations:Map<string,unknown>;memberships:Map<string,unknown>;devices:Map<string,unknown>}>;
export function createSnapshotDirectory(snapshot:DirectorySnapshot): DirectoryReader;
export function createReadOnlyFileDirectory(filename:string): Readonly<{authorizeSnapshot():Promise<DirectoryReader>}>;
