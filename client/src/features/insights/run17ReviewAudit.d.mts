export interface Run17ReviewEvent {
 id:string;businessProfileId:string;findingId:string;staffId:string;
 submissionKey:string;sequence:number;period:"today"|"last7"|"all";
 evidenceKey:string;asOf:string;createdAt:string;
 action:"acknowledge"|"reopen";note:string;financialPostingPerformed:false
}
export interface Run17ReviewState {
 findingId:string;status:"unreviewed"|"acknowledged";evidenceKey:string;
 lastReviewedAt:string;lastStaffId:string;eventCount:number
}
export function validateRun17ReviewEvent(value:unknown):Readonly<Run17ReviewEvent>;
export function reconcileRun17Reviews(
 events:Run17ReviewEvent[],companyId:string
):ReadonlyArray<Readonly<Run17ReviewState>>;
