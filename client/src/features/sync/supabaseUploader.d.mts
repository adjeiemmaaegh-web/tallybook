export function verifyCentralReceipt(operation:{businessProfileId:string;operationId:string;deviceId:string;payloadDigest:string},receipt:{businessId:string;operationId:string;deviceId:string;payloadDigest:string;status:string;receivedAtUtc:string}):string;
export function assertUploadPayload(operation:{operationId:string;status:string;payloadDigest:string},payloadDigest:string):string;
