import { describe, expect, it, vi } from "vitest";
import { deliverStagedMetadata, eventMetadata, validateStageEndpoint } from "./outboxDelivery";
const event = {id:"ev1",businessProfileId:"org1",deviceId:"dev1",operationId:"op1",entityType:"sale",entityId:"sale1",payloadDigest:"a".repeat(64),createdAt:"2026-01-01T00:00:00Z",status:"pending" as const};
const cred = {capability:"abc.def",session:"ghi.jkl"};
const receipt = {organizationId:"org1",eventId:"ev1",operationId:"op1",status:"stored",reason:null,financialReplicationEnabled:false};
const endpoint = "https://example.org/api/sync/events/stage";
function mockResponse(body: unknown, status=201, url=endpoint) { return { status, url, redirected:false, type:"basic",headers:{get:()=>"application/json"},text:async()=>JSON.stringify(body) } as unknown as Response; }
describe("HTTPS outbox staging (metadata-only)",()=>{
 it("requires HTTPS without URL credentials or redirects",()=>{
  expect(()=>validateStageEndpoint("http://example.org/api/sync/events/stage")).toThrow();
  expect(()=>validateStageEndpoint("https://u:p@example.org/api/sync/events/stage")).toThrow();
  expect(()=>validateStageEndpoint(endpoint+"?secret=1")).toThrow();
 });
 it("excludes financial records and other event details",()=>expect(Object.keys(eventMetadata(event)).sort()).toEqual(["deviceId","eventId","operationId","organizationId","payloadDigest"]));
 it("sends only scoped metadata and returns matching durable receipt",async()=>{
  const send=vi.fn(async (url:string, init:RequestInit)=>{
   expect(url).toBe(endpoint); expect(init.redirect).toBe("error");
   expect(JSON.parse(init.body as string)).not.toHaveProperty("entityType");
   return mockResponse(receipt);
  });
  expect(await deliverStagedMetadata(endpoint,event,cred,send)).toEqual(receipt);
  expect(send).toHaveBeenCalledTimes(1);
 });
 it("rejects a response from another URL",async()=>{
  await expect(deliverStagedMetadata(endpoint,event,cred,async()=>mockResponse(receipt,201,"https://evil.example/api/sync/events/stage"))).rejects.toThrow();
 });
 it("rejects mismatched acknowledgement scope",async()=>{
  await expect(deliverStagedMetadata(endpoint,event,cred,async()=>mockResponse({...receipt,organizationId:"org2"}))).rejects.toThrow();
 });
 it("rejects mismatched HTTP status and receipt",async()=>{
  await expect(deliverStagedMetadata(endpoint,event,cred,async()=>mockResponse(receipt,200))).rejects.toThrow();
 });
 it("rejects failed transport with no acknowledgement",async()=>{
  await expect(deliverStagedMetadata(endpoint,event,cred,async()=>{throw Error("offline")})).rejects.toThrow("offline");
 });
 it("rejects invalid credentials before network call",async()=>{
  const send=vi.fn();
  await expect(deliverStagedMetadata(endpoint,event,{capability:"",session:""},send)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
 });
});
