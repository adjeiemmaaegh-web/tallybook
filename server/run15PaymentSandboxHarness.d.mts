import type {Run15SignedMockEvent} from "./run15SignedMockCallback.mjs";
export interface Run15MockGatewayIntent {
 companyId:string;submissionKey:string;amountMinor:number;currency:string;method:"mobile"|"card"
}
export interface Run15MockGatewayState extends Run15MockGatewayIntent{
 provider:"mock";status:"pending"|"succeeded"|"failed"|"refunded"|"charged-back";
 refundedMinor:number;simulated:true;authoritativeSettlement:false;financialPostingPerformed:false
}
export function createRun15MockSandboxHarness(config?:{key:string;environment?:"local-test"|"local-development"}):Readonly<{
 createIntent(input:Run15MockGatewayIntent):Readonly<Run15MockGatewayState>;
 inspect(companyId:string,submissionKey:string):Readonly<Run15MockGatewayState>;
 applySignedMockEvent(body:string,signature:string,companyId:string,now?:number):Readonly<Run15MockGatewayState>;
}>;
