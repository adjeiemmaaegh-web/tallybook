export function readBoundedResponseBytes(response:Pick<Response,'body'>,limitBytes:number,label?:string):Promise<Uint8Array>;
export function readBoundedResponseText(response:Pick<Response,'body'>,limitBytes:number,label?:string):Promise<string>;
