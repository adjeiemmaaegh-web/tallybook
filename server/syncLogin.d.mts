/** Server-only development login and issuance adapter. */
export declare function validateLoginDirectory(data: unknown): Array<{id:string;status:'active'|'disabled';salt:string;passwordHash:string}>;
export declare function hashLoginPassword(password:string,salt?:string): Promise<{salt:string;passwordHash:string}>;
export declare function authenticateLocalUser(userId:string,password:string,directoryFile:string): Promise<string>;
export declare function createSessionIssuer(config:{directoryFile:string;sessionFile:string;secret:string;clock?:()=>number}): {issue(userId:string,password:string):Promise<{token:string;expiresAt:number;sessionId:string}>};
