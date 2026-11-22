#!/usr/bin/env node
// Generates client/public/third-party-notices.txt from the PRODUCTION dependency tree (ST31-10). Deterministic (no timestamps, no absolute
// paths). Each package contributes its own licence text when it ships one; otherwise the declared SPDX licence, author and homepage are
// stated plainly. Run: node scripts/generate-third-party-notices.mjs   Check drift: qa/third-party-notices.test.mjs
import {execFileSync} from "node:child_process";
import {readFileSync,readdirSync,writeFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

export const OUT = "client/public/third-party-notices.txt";
const MAX_LICENCE_BYTES = 24 * 1024;
const PATCHED = new Map([["wouter", "This product bundles a locally PATCHED copy of wouter (see patches/). The patch is a modification of an Unlicense (public-domain dedication) work."]]);

export function prodPackages() {
  const raw = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024}));
  const out = [];
  for (const [licence, pkgs] of Object.entries(raw)) for (const p of pkgs) p.versions.forEach((version, i) => out.push({name: p.name, version, licence, author: p.author ?? null, homepage: p.homepage ?? null, path: p.paths?.[i] ?? p.paths?.[0]}));
  return out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1);
}
function licenceText(path) {
  if (!path || !existsSync(path)) return null;
  const file = readdirSync(path).filter(n => /^(licen[cs]e|copying)(\.|$)/i.test(n)).sort()[0];
  if (!file) return null;
  const buf = readFileSync(join(path, file));
  return buf.subarray(0, MAX_LICENCE_BYTES).toString("utf8").replace(/\r\n/g, "\n").trim();
}
export function renderNotices(packages) {
  const lines = [
    "THIRD-PARTY NOTICES", "",
    "Tallybook includes the open-source software listed below. Each component is used under its own licence. Licence texts are reproduced as shipped by",
    "each package; where a package ships no licence file, its declared licence and author are stated instead.", "",
    `${packages.length} production components.`, "", "=".repeat(78), "",
  ];
  for (const p of packages) {
    lines.push(`${p.name} ${p.version}`, `Licence: ${p.licence}`);
    if (p.author) lines.push(`Author: ${p.author}`);
    if (p.homepage) lines.push(`Home: ${p.homepage}`);
    if (PATCHED.has(p.name)) lines.push(PATCHED.get(p.name));
    const text = licenceText(p.path);
    lines.push("", text ?? `(This package does not ship a licence file. Its package metadata declares: ${p.licence}.)`, "", "-".repeat(78), "");
  }
  return lines.join("\n");
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const pkgs = prodPackages(); writeFileSync(OUT, renderNotices(pkgs));
  console.log(`Wrote ${OUT}: ${pkgs.length} components`);
}
