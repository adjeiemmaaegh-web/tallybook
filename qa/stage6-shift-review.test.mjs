import test from "node:test";
import assert from "node:assert/strict";
import {validateShiftReview} from "../client/src/features/staff/shiftReviewRules.mjs";
const shift={id:"shift",businessProfileId:"business",staffId:"cashier",closedAt:"2026-11-08T11:10:00Z",expectedCashMinor:1500,countedCashMinor:1400,varianceMinor:-100};
const owner={id:"owner",businessProfileId:"business",role:"owner"};
test("a different owner/supervisor can document variance but cannot change cash records",()=>{
 assert.deepEqual(validateShiftReview(shift,owner,"attention","Drawer short by 1.00",1500),{decision:"attention",reason:"Drawer short by 1.00"});
 assert.throws(()=>validateShiftReview(shift,owner,"accepted","",1500),/Document/);
 assert.throws(()=>validateShiftReview(shift,{...owner,id:"cashier"},"attention","note",1500),/different/);
 assert.throws(()=>validateShiftReview(shift,{...owner,role:"cashier"},"attention","note",1500),/different/);
 assert.throws(()=>validateShiftReview(shift,{...owner,businessProfileId:"foreign"},"attention","note",1500),/different/);
 assert.throws(()=>validateShiftReview(shift,owner,"attention","note",1499),/no longer matches/);
 assert.throws(()=>validateShiftReview({...shift,reviewedAt:"now"},owner,"attention","note",1500),/already/);
});
