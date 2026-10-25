/** Pure Stage 1 gate policy. A missing prerequisite is not a pass. */
export function classifyGate({ready=true,error=null,status=null,signal=null}) {
  if (!ready) return 'BLOCKED';
  if (error || signal) return 'BLOCKED';
  return status === 0 ? 'PASS' : 'FAIL';
}

const requiredEvidence = [
  'dexie-app-schema-integration',
  'transaction-company-isolation',
  'windows-browser-recovery',
];

export function summarizeStage1(steps,environment={}) {
  const counts={PASS:0,FAIL:0,BLOCKED:0};
  for (const step of steps) {
    if (!(step.status in counts)) throw new Error(`Unknown gate status: ${step.status}`);
    counts[step.status]++;
  }
  const environmentReady=environment.node===environment.expectedNode && environment.pnpm===environment.expectedPnpm;
  const evidence=environment.evidence ?? {};
  const missingEvidence=requiredEvidence.filter(name=>evidence[name]!==true);
  const stageAccepted=counts.FAIL===0 && counts.BLOCKED===0 && environmentReady && missingEvidence.length===0;
  return {counts,environmentReady,missingEvidence,stageAccepted};
}
