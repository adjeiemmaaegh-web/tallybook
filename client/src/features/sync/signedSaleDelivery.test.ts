import {describe,it,expect,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import type {TallybookDB} from '@/db/TallybookDB';
import type {CentralSaleEvent} from './centralSaleEvent';
import type {SyncOutboxEvent} from './syncFoundation';

const {enqueue,staff}=vi.hoisted(()=>({enqueue:vi.fn(),staff:{id:'staffA'}}));
vi.mock('@/features/staff/staff',()=>({currentStaffId:()=>staff.id}));
vi.mock('./syncFoundation',()=>({enqueueSyncEvent:enqueue}));
import {queueSignedLocalSale,createSignedSaleUploadAdapter,
  validateSignedSaleEndpoint} from './signedSaleDelivery';

const event={id:'sale:s1',businessProfileId:'localA',operationId:'sale:s1',entityId:'s1',
  kind:'sale.completed',createdAt:'2026-10-27T00:00:00.000Z',shopId:'shopA',staffId:'staffA',
  shiftId:'shiftA',deviceId:null,deliveryStatus:'local_only',payloadVersion:1,
  payload:{sale:{id:'s1',businessProfileId:'localA',storeId:'shopA',staffId:'staffA',
    shiftId:'shiftA',createdAt:'2026-10-27T00:00:00.000Z',receiptNumber:'R1',
    totalMinor:100,amountPaidMinor:100,outstandingMinor:0},
    lines:[{id:'line1',saleId:'s1',businessProfileId:'localA',lineTotalMinor:100}],
    payment:{id:'payment1',saleId:'s1',businessProfileId:'localA',amountMinor:100},
    receipt:{id:'receipt1',saleId:'s1',businessProfileId:'localA',receiptNumber:'R1'}}} as CentralSaleEvent;
const sha256=createHash('sha256').update(JSON.stringify(event)).digest('hex');
const pending:SyncOutboxEvent={id:event.id,businessProfileId:'localA',deviceId:'deviceA',
  operationId:event.operationId,entityType:'sale',entityId:'s1',payloadDigest:sha256,
  createdAt:event.createdAt,status:'pending'};
const endpoint='https://tallybook.example/api/central/sales';

describe('explicit signed sale delivery',()=>{
  it('rebuilds missing queue metadata and keeps matching receipts intact',async()=>{
    enqueue.mockReset();
    const db={centralSaleEvents:{get:async()=>event},syncOutbox:{get:async()=>undefined}} as unknown as TallybookDB;
    const queued=await queueSignedLocalSale(db,'localA',event.id,'deviceA',
      webcrypto.subtle as unknown as SubtleCrypto);
    expect(queued).toEqual(pending);
    expect(enqueue).toHaveBeenCalledWith(db,pending);
    const existing={...pending,status:'acknowledged' as const,acknowledgedAt:'2026-10-27T01:00:00.000Z'};
    const db2={centralSaleEvents:{get:async()=>event},syncOutbox:{get:async()=>existing}} as unknown as TallybookDB;
    expect(await queueSignedLocalSale(db2,'localA',event.id,'deviceA',
      webcrypto.subtle as unknown as SubtleCrypto)).toEqual(existing);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it('signs the persisted payload, uses credential-free HTTPS and checks the receipt transport',async()=>{
    const keys=await webcrypto.subtle.generateKey('Ed25519',false,['sign','verify']);
    const db={centralSaleEvents:{get:async()=>event}} as unknown as TallybookDB;
    let calls=0;
    const adapter=createSignedSaleUploadAdapter({database:db,deviceId:'deviceA',
      privateKey:keys.privateKey,endpoint,accessToken:'x'.repeat(30),
      subtle:webcrypto.subtle as unknown as SubtleCrypto,
      transport:async(url,init)=>{calls++;
        expect(url).toBe(endpoint);
        expect(init.credentials).toBe('omit');
        expect((JSON.parse(init.body as string) as {envelope:{payloadBase64:string}}).envelope.payloadBase64).toBeTruthy();
        return {status:200,redirected:false,type:'basic',url,headers:new Headers({'content-type':'application/json'}),
          text:async()=>JSON.stringify({businessId:'localA',deviceId:'deviceA',operationId:'sale:s1',
            payloadDigest:sha256,receivedAtUtc:'2026-10-27T01:00:00.000Z',status:'accepted'})} as Response;
      }});
    const prepared=await adapter.prepare(pending);
    expect(prepared.sha256).toBe(sha256);
    staff.id='staffB';
    await expect(adapter.send(prepared)).rejects.toThrow();
    staff.id='staffA';
    expect((await adapter.send(prepared)).status).toBe('accepted');
    expect(calls).toBe(1);
    await expect(adapter.prepare({...pending,payloadDigest:'f'.repeat(64)})).rejects.toThrow();
    expect(()=>validateSignedSaleEndpoint('http://tallybook.example/api/central/sales')).toThrow();
  });
});
