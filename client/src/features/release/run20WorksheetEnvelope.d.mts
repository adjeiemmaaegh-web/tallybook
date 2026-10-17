import type {Run20Evidence,Run20ReleaseDecision} from "./run20ReleaseGates.mjs";
export function exportRun20Worksheet(input:{sourceSha:string;asOf:string;evidence:ReadonlyArray<Run20Evidence>}):Promise<string>;
export function importRun20Worksheet(text:string):Promise<Readonly<{
 sourceSha:string;asOf:string;evidence:ReadonlyArray<Run20Evidence>;
 decision:Run20ReleaseDecision;sha256:string;independentReview:false;
 ownerAuthorization:false;releaseAuthorized:false
}>>;
