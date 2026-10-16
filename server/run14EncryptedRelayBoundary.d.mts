import type {Run14EncryptedEnvelope,Run14EncryptedPage,Run14EncryptedReceipt} from "./run14EncryptedReplicaStore.mjs";
export function stageRun14EncryptedEvent(
 headers:{authorization?:string;organizationId?:string;deviceId?:string;session?:string},
 envelope:unknown,config:unknown
):Promise<Run14EncryptedReceipt>;
export function listRun14EncryptedEvents(
 headers:{authorization?:string;organizationId?:string;deviceId?:string;session?:string},
 after:number,config:unknown
):Promise<Run14EncryptedPage>;
