/** Review is an immutable staff attestation, never an accounting journal edit.
 * Do not let the cashier approve their own count or silently reprice a closed shift.
 */
export function validateShiftReview(shift,reviewer,decision,note,reconstructedExpected) {
 if(!shift?.id||!shift?.closedAt||!shift?.staffId||!shift?.businessProfileId ||
    !Number.isSafeInteger(shift.expectedCashMinor)||shift.expectedCashMinor<0 ||
    !Number.isSafeInteger(shift.countedCashMinor)||shift.countedCashMinor<0 ||
    !Number.isSafeInteger(shift.varianceMinor)||
    shift.countedCashMinor-shift.expectedCashMinor!==shift.varianceMinor)
   throw Error("The shift has no complete reconciled cash count.");
 if(shift.reviewedAt||shift.reviewedByStaffId||shift.reviewDecision)
   throw Error("This shift already has a supervisor review and cannot be reviewed twice.");
 if(!reviewer?.id||reviewer.businessProfileId!==shift.businessProfileId||
    reviewer.disabledAt||reviewer.id===shift.staffId||
    !["owner","supervisor"].includes(reviewer.role))
   throw Error("A different, authorized supervisor or owner must review this shift.");
 if(!["accepted","attention"].includes(decision))throw Error("Choose accepted or attention for the shift review.");
 if(!Number.isSafeInteger(reconstructedExpected)||reconstructedExpected!==shift.expectedCashMinor)
   throw Error("Recorded shift cash movement no longer matches the amount recorded at close.");
 if(typeof note!=="string"||note.length>240)throw Error("Review note is invalid.");
 const reason=note.trim();
 if((shift.varianceMinor!==0||decision==="attention")&&reason.length<4)
   throw Error("Document the cash variance or concern before reviewing this shift.");
 return {decision,reason};
}
