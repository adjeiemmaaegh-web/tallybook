export interface CentralDeviceServices {
  enabled?:boolean;
  allowedOrigin?:string;
  staffService?:{provision(input:unknown):Promise<unknown>};
  deviceService?:{
    issueInvite(input:unknown):Promise<unknown>;
    redeemKeyInvite(input:unknown):Promise<unknown>;
    revokeDeviceKey(input:unknown):Promise<unknown>;
  };
  limiter?:{allow(key:string):boolean};
}
export function createCentralDeviceHandler(options?:CentralDeviceServices):
  (request:unknown,response:unknown)=>Promise<void>;
export function mountCentralDeviceRoutes(app:Pick<Express,'post'>,
  jsonParser:(options:{limit:string;type:string})=>RequestHandler,
  options?:CentralDeviceServices):void;
import type {Express,RequestHandler} from 'express';
