export interface Run19CapabilityPreview{
 checkedAt:string;apiPresenceOnly:true;hardwareVerificationPerformed:false;
 offlineRouteCheckPerformed:false;livePaymentPerformed:false;
 results:ReadonlyArray<Readonly<{label:string;detected:boolean}>>
}
export function inspectRun19DeviceCapabilities(env?:typeof globalThis):Readonly<Run19CapabilityPreview>;
export function printRun19Diagnostic(documentRef?:Document):true;
