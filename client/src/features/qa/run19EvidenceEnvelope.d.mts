import type {Run19EvidencePayload} from "./run19Acceptance.mjs";
export function exportRun19Envelope(payload:Run19EvidencePayload):Promise<string>;
export function importRun19Envelope(text:string):Promise<Readonly<{
 payload:Run19EvidencePayload;sha256:string;integrity:"hash-match";
 ownerSignoff:false;independentReview:false;releaseAuthorized:false
}>>;
