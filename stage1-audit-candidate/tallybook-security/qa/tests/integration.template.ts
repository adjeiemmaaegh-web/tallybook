/** Copy to integration.test.ts and supply a sandbox-only fixture from actual Tallybook adapters. */
import {runScenarios,failureReport} from '../src/scenarios.js';
import type {FixtureFactory} from '../src/contracts.js';
export async function runTallybookQa(factory:FixtureFactory):Promise<void>{
 const results=await runScenarios(factory);
 const report=failureReport(results);
 if(results.some(r=>!r.passed))throw new Error(report);
}
