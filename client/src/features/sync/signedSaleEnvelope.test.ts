import {describe,it,expect} from 'vitest';
import {createPublicKey,verify,webcrypto} from 'node:crypto';
import {signLocalSaleEvent} from './signedSaleEnvelope';
import type {CentralSaleEvent} from './centralSaleEvent';

const event={id:'sale:s1',businessProfileId:'localA',operationId:'sale:s1',entityId:'s1',
  kind:'sale.completed',createdAt:'2026-10-27T00:00:00.000Z',shopId:'shopA',staffId:'staffA',
  shiftId:'shiftA',deviceId:null,deliveryStatus:'local_only',payloadVersion:1,
  payload:{sale:{id:'s1',businessProfileId:'localA',storeId:'shopA',staffId:'staffA',
    shiftId:'shiftA',createdAt:'2026-10-27T00:00:00.000Z',receiptNumber:'R1',
    totalMinor:100,amountPaidMinor:100,outstandingMinor:0},
    lines:[{id:'line1',saleId:'s1',businessProfileId:'localA',lineTotalMinor:100}],
    payment:{id:'payment1',saleId:'s1',businessProfileId:'localA',amountMinor:100},
    receipt:{id:'receipt1',saleId:'s1',businessProfileId:'localA',receiptNumber:'R1'}}} as CentralSaleEvent;

describe('signed sale upload claim',()=>{
  it('uses the server signing domain and a non-extractable Ed25519 key',async()=>{
    const keys=await webcrypto.subtle.generateKey('Ed25519',false,['sign','verify']);
    const envelope=await signLocalSaleEvent(event,'deviceA',keys.privateKey,
      webcrypto.subtle as unknown as SubtleCrypto);
    expect(envelope).toMatchObject({version:1,eventId:'sale:s1',businessId:'localA',
      shopId:'shopA',staffId:'staffA',deviceId:'deviceA'});
    const signedBytes=Buffer.from(['tallybook.central.sale.v1',envelope.eventId,
      envelope.operationId,envelope.businessId,envelope.shopId,envelope.staffId,
      envelope.deviceId,envelope.payloadBase64].join('\n'));
    const publicSpki=await webcrypto.subtle.exportKey('spki',keys.publicKey);
    expect(verify(null,signedBytes,createPublicKey({key:Buffer.from(publicSpki),
      format:'der',type:'spki'}),Buffer.from(envelope.signature,'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(envelope.payloadBase64,'base64url').toString())).toEqual(event);
  });
  it('rejects missing shop provenance and extractable private keys',async()=>{
    const safe=await webcrypto.subtle.generateKey('Ed25519',false,['sign','verify']);
    await expect(signLocalSaleEvent({...event,shopId:null},'deviceA',safe.privateKey,
      webcrypto.subtle as unknown as SubtleCrypto)).rejects.toThrow();
    const extractable=await webcrypto.subtle.generateKey('Ed25519',true,['sign','verify']);
    await expect(signLocalSaleEvent(event,'deviceA',extractable.privateKey,
      webcrypto.subtle as unknown as SubtleCrypto)).rejects.toThrow();
  });
});
