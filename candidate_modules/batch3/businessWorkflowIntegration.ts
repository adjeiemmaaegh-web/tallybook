/** State-transition checks for proposed workflow handoffs; never performs a transition. */
export type WorkflowKind='sale'|'return'|'purchase'|'sync';
export type WorkflowStatus='draft'|'approved'|'posted'|'cancelled'|'acknowledged';
export type WorkflowTransition={companyId:string;recordId:string;kind:WorkflowKind;from:WorkflowStatus;to:WorkflowStatus;authorized:boolean};
export type WorkflowFinding={code:string;recordId:string};
const allowed:Record<WorkflowKind,Record<string,readonly string[]>>={
 sale:{draft:['approved','cancelled'],approved:['posted','cancelled'],posted:[],cancelled:[],acknowledged:[]},
 return:{draft:['approved','cancelled'],approved:['posted','cancelled'],posted:[],cancelled:[],acknowledged:[]},
 purchase:{draft:['approved','cancelled'],approved:['posted','cancelled'],posted:[],cancelled:[],acknowledged:[]},
 sync:{draft:['approved','cancelled'],approved:['posted','cancelled'],posted:['acknowledged'],cancelled:[],acknowledged:[]}};
export function validateWorkflowTransitions(events:readonly WorkflowTransition[]):WorkflowFinding[]{const out:WorkflowFinding[]=[];
 for(const e of events){if(!e.companyId||!e.recordId)out.push({code:'MISSING_ID',recordId:e.recordId});
  if(!e.authorized)out.push({code:'UNAUTHORIZED',recordId:e.recordId});
  if(!allowed[e.kind]?.[e.from]?.includes(e.to))out.push({code:'INVALID_TRANSITION',recordId:e.recordId});
 }return out;}
