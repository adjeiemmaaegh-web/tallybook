export type QaSaleReadScope={
 companyId:string;deviceId:string;afterUtc:string;afterOperationId:string;
};
export type QaSaleEvent={
 operationId:string;eventId:string;storeId:string;staffId:string;actorId:string;
 payloadSha256:string;payload:Record<string,unknown>;evidenceStatus:'upload_claim_only';
 payloadBase64?:string;
 receivedAtUtc:string;
};
export type QaSalePage={
 companyId:string;deviceId:string;storeId:string;events:Readonly<QaSaleEvent[]>;
 hasMore:boolean;nextReceivedAtUtc:string|null;nextOperationId:string|null;
};
export function validateQaSalePage(value:unknown,scope:QaSaleReadScope):Readonly<QaSalePage>;
