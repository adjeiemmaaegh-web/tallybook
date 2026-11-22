#!/usr/bin/env node
// Licence policy check (ST31-10). PURE evaluation of `pnpm licenses list --json [--prod]` output; the CLI runs pnpm and prints a verdict.
// Policy: permissive licences are allowed everywhere; weak-copyleft/attribution licences are allowed only as DEV-only (not shipped) or
// with a recorded obligation; strong copyleft, network copyleft, source-available and unknown/missing licences are refused.
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

export const PERMISSIVE = new Set(["MIT","MIT-0","ISC","BSD-2-Clause","BSD-3-Clause","0BSD","Unlicense","CC0-1.0","BlueOak-1.0.0","Apache-2.0","Python-2.0","(MIT OR CC0-1.0)"]);
/** Allowed only with an obligation recorded here (shipped) or when dev-only (not distributed to users). */
export const CONDITIONAL = new Map([
  ["OFL-1.1", "Fonts: keep the licence text with the font files; the font may not be sold on its own; do not use the Reserved Font Name for modified fonts."],
  ["MPL-2.0", "File-level copyleft: unmodified use is fine; any modification of those files must be published under MPL-2.0."],
  ["CC-BY-4.0", "Attribution required if the data is redistributed."],
]);
export const FORBIDDEN = /^(A?GPL|LGPL|SSPL|BUSL|Commons-Clause|EUPL|CPAL|OSL|RPL)|-only$|-or-later$|^UNLICENSED$|^SEE LICENSE|^UNKNOWN$/i;

export function evaluateLicences({prod, all}) {
  const shipped = new Set(); for (const [l, ps] of Object.entries(prod)) for (const p of ps) for (const v of p.versions) shipped.add(`${p.name}@${v}`);
  const problems = [], obligations = [], counts = {};
  for (const [licence, pkgs] of Object.entries(all)) {
    for (const p of pkgs) for (const v of p.versions) {
      const id = `${p.name}@${v}`, inProd = shipped.has(id);
      counts[licence] = (counts[licence] ?? 0) + 1;
      if (!licence || FORBIDDEN.test(licence)) { problems.push(`${id}: ${licence || "no licence"} is not allowed${inProd ? " (SHIPPED)" : ""}`); continue; }
      if (PERMISSIVE.has(licence)) continue;
      if (CONDITIONAL.has(licence)) { obligations.push({package: id, licence, shipped: inProd, obligation: CONDITIONAL.get(licence)}); continue; }
      problems.push(`${id}: licence "${licence}" is not on the reviewed list`);
    }
  }
  return {ok: problems.length === 0, problems: problems.sort(), obligations: obligations.sort((a, b) => a.package < b.package ? -1 : 1), counts, packageCount: Object.values(counts).reduce((a, b) => a + b, 0)};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const run = args => JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json", ...args], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024}));
  const r = evaluateLicences({prod: run(["--prod"]), all: run([])});
  console.log(`${r.packageCount} package versions; ${r.obligations.length} with recorded obligations; ${r.problems.length} problems`);
  for (const o of r.obligations) console.log(`  ${o.shipped ? "SHIPPED" : "dev-only"}  ${o.package}  ${o.licence}`);
  for (const p of r.problems) console.error("  PROBLEM " + p);
  process.exit(r.ok ? 0 : 1);
}
