export interface SyncJournalEvent {organizationId:string;deviceId:string;eventId:string;operationId:string;payloadDigest:string}
export interface JournalDecision {status:'new'|'duplicate'|'conflict'|'stored';reason:string|null}
export declare function validateJournalEvent(event:SyncJournalEvent):Readonly<SyncJournalEvent>;
export declare function evaluateJournalEvent(events:ReadonlyArray<SyncJournalEvent>,event:SyncJournalEvent):Readonly<JournalDecision>;
export declare function createFileSyncJournal(filename:string):Readonly<{
 inspect(organizationId:string):Promise<ReadonlyArray<{event:Readonly<SyncJournalEvent>;acceptedAt:string}>>;
 stageEvent(event:SyncJournalEvent):Promise<Readonly<JournalDecision>>;
}>;
