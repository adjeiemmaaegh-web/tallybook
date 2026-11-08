export interface ReviewableShift {id:string;businessProfileId:string;staffId:string;closedAt?:string;expectedCashMinor?:number;countedCashMinor?:number;varianceMinor?:number;reviewedAt?:string;reviewedByStaffId?:string;reviewDecision?:string}
export interface ShiftReviewer {id:string;businessProfileId:string;role:string;disabledAt?:string}
export declare function validateShiftReview(shift:ReviewableShift,reviewer:ShiftReviewer,decision:"accepted"|"attention",note:string,reconstructedExpected:number):{decision:"accepted"|"attention";reason:string};
