import { describe, expect, it } from "vitest";
import { classifyClaim, validateRemoteClaim, type RemoteEventClaim } from "./reconciliation";
import type { SyncOutboxEvent } from "./syncFoundation";
const local: SyncOutboxEvent = { id:"e1", businessProfileId:"b1", deviceId:"d1", operationId:"op1", entityType:"sale", entityId:"s1", payloadDigest:"a".repeat(64), status:"pending", createdAt:"2026-10-09T12:00:00.000Z" };
const claim: RemoteEventClaim = {id:local.id,businessProfileId:local.businessProfileId,deviceId:local.deviceId,operationId:local.operationId,entityType:local.entityType,entityId:local.entityId,payloadDigest:local.payloadDigest};
describe("offline sync conflict preflight",()=>{
 it("recognizes identical metadata without assuming delivery",()=>expect(classifyClaim(local,local,claim)).toBe("identical"));
 it("rejects changed payloads",()=>expect(classifyClaim(local,local,{...claim,payloadDigest:"b".repeat(64)})).toBe("payload-mismatch"));
 it("rejects cross-company claims",()=>expect(classifyClaim(local,local,{...claim,businessProfileId:"b2"})).toBe("payload-mismatch"));
 it("detects operation reuse under a new event ID",()=>expect(classifyClaim(undefined,local,{...claim,id:"other"})).toBe("operation-collision"));
 it("rejects unknown events rather than importing them",()=>expect(classifyClaim(undefined,undefined,claim)).toBe("unknown-event"));
 it("rejects malformed claims",()=>expect(()=>validateRemoteClaim({...claim,entityId:"../other"})).toThrow());
});
