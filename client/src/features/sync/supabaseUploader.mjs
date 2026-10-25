/** Upload receipt gate. Network delivery is at-least-once; idempotency belongs to server. */
export function verifyCentralReceipt(operation, receipt) {
 if(!operation || !receipt || typeof receipt!=='object') throw new Error('Missing server receipt.');
 if(receipt.businessId!==operation.businessProfileId || receipt.operationId!==operation.operationId ||
    receipt.deviceId!==operation.deviceId || receipt.payloadDigest!==operation.payloadDigest ||
    receipt.status!=='accepted' || !Number.isFinite(Date.parse(receipt.receivedAtUtc??'')))
   throw new Error('Server acknowledgment does not reconcile with queued operation.');
 return receipt.receivedAtUtc;
}
export function assertUploadPayload(operation,payloadDigest) {
 if(!operation || operation.status!=='pending' || !/^[a-f0-9]{64}$/i.test(operation.payloadDigest))
   throw new Error('Only a validated pending operation can be uploaded.');
 if(typeof payloadDigest!=='string' || operation.payloadDigest.toLowerCase()!==payloadDigest.toLowerCase())
   throw new Error('Payload differs from the original queued immutable digest.');
 return operation.operationId;
}
