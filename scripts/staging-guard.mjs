#!/usr/bin/env node
/** Staging safety guard for the six-migration rollout. PURE: no database or network access, never applies anything.
 *  Usage:  node scripts/staging-guard.mjs plan <stagingProjectRef> <hostedMigrationNamesFile>   -> prints the plan (or a refusal)
 *          node scripts/staging-guard.mjs no-live-data-sql                                      -> prints a read-only SQL check to run on staging */
import {readdirSync, readFileSync} from "node:fs";
import {pathToFileURL, fileURLToPath} from "node:url";

/** Production and any project that must never be a staging target. Extend with PRODUCTION_PROJECT_REFS (comma separated). */
export const KNOWN_PRODUCTION_REFS = Object.freeze(["qfyydfxwvifdvffdfgeu"]);
const REF = /^[a-z0-9]{20}$/;
export const SYNTHETIC = Object.freeze({businessPrefix: "STG ", emailDomain: "@staging.tallybook.invalid"});

export function assertStagingTarget(projectRef, extraProductionRefs = (process.env.PRODUCTION_PROJECT_REFS ?? "").split(",").filter(Boolean)) {
  if (typeof projectRef !== "string" || !REF.test(projectRef)) throw new Error("Staging project ref must be the 20-character Supabase project ref.");
  if ([...KNOWN_PRODUCTION_REFS, ...extraProductionRefs].includes(projectRef)) throw new Error("Refusing: this is the production project. Staging must be a new, isolated project.");
  return projectRef;
}

/** Hosted names differ from repository names: the connector records its own timestamp and sometimes a suffix/prefix. */
const ALIASES = {cloud_business_type: "phase_b_cloud_business_type"};
const strip = n => n.replace(/^\d+_/, "").replace(/\.sql$/, "");
const norm = n => n.replace(/_?20261115$/, "");
export function missingMigrations(repoFiles, hostedNames) {
  const hosted = new Set(hostedNames.map(h => norm(strip(h))));
  return repoFiles.filter(f => f.endsWith(".sql")).sort().filter(f => { const n = strip(f); return !hosted.has(norm(ALIASES[n] ?? n)) && !hosted.has(norm(n)); });
}

export function planMigrationRun({targetRef, repoFiles, hostedNames, productionNames}) {
  assertStagingTarget(targetRef);
  const missingOnStaging = missingMigrations(repoFiles, hostedNames);
  const missingOnProduction = productionNames ? missingMigrations(repoFiles, productionNames) : null;
  const steps = missingOnStaging.map((f, i) => ({order: i + 1, file: f, rollback: f.replace(/\.sql$/, "_down.sql"),
    verifyAfter: "run the migration's PGlite test, get_advisors (security, performance), call new RPCs as owner / non-member / anon"}));
  return {targetRef, executable: false, reason: "Plan only. Applying needs the owner's written approval of this exact plan; this tool never connects.",
    baselineRequired: missingOnProduction ? missingOnStaging.filter(f => !missingOnProduction.includes(f)).length > 0 : false, missingOnStaging, missingOnProduction, steps};
}

/** Read-only. Run on STAGING before and after loading test data and before any apply. Expect `ok = true`. */
export const noLiveDataSql = () => `-- READ ONLY: confirms staging holds only synthetic data.
select
  (select count(*) from public.businesses) as businesses,
  (select count(*) from public.businesses where name not like '${SYNTHETIC.businessPrefix}%') as non_synthetic_businesses,
  (select count(*) from auth.users) as users,
  (select count(*) from auth.users where email not like '%${SYNTHETIC.emailDomain}') as non_synthetic_users,
  (select count(*) from public.shop_sales) as shop_sales,
  (select count(*) from public.shop_customer_entries) as customer_entries;`;
export function evaluateNoLiveData(row) {
  const n = k => Number(row?.[k]);
  const problems = [];
  for (const k of ["businesses", "non_synthetic_businesses", "users", "non_synthetic_users", "shop_sales", "customer_entries"]) if (!Number.isFinite(n(k))) problems.push(`missing ${k}`);
  if (!problems.length) {
    if (n("non_synthetic_businesses") > 0) problems.push("a business without the synthetic name prefix exists");
    if (n("non_synthetic_users") > 0) problems.push("a user outside the synthetic email domain exists");
  }
  return {ok: problems.length === 0, problems};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ref, file] = process.argv.slice(2);
  const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  try {
    if (cmd === "plan") console.log(JSON.stringify(planMigrationRun({targetRef: ref, repoFiles: readdirSync(dir), hostedNames: readFileSync(file, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean)}), null, 2));
    else if (cmd === "no-live-data-sql") console.log(noLiveDataSql());
    else { console.error("usage: plan <ref> <namesFile> | no-live-data-sql"); process.exit(2); }
  } catch (e) { console.error(String(e.message)); process.exit(1); }
}
