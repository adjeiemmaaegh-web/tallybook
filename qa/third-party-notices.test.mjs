import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {OUT,prodPackages,renderNotices} from "../scripts/generate-third-party-notices.mjs";

const committed=()=>readFileSync(new URL("../"+OUT,import.meta.url),"utf8");

test("the shipped notices file lists EVERY production dependency version (regenerate with scripts/generate-third-party-notices.mjs when dependencies change)",()=>{
 const text=committed();
 for(const p of prodPackages())assert.ok(text.includes(`\n${p.name} ${p.version}\nLicence: ${p.licence}`),`missing or stale notice for ${p.name}@${p.version}`);
 assert.match(text,new RegExp(`\\n${prodPackages().length} production components\\.`));
});

test("the file is byte-identical to a fresh generation: no drift, no timestamps, no machine paths",()=>{
 assert.equal(committed(),renderNotices(prodPackages()));
 assert.doesNotMatch(committed(),/\/home\/|\/Users\/|node_modules\/\.pnpm|[A-Z]:\\/);
});

test("licences that carry obligations ship their full text: the OFL font and Apache-2.0 libraries",()=>{
 const text=committed();
 const font=text.slice(text.indexOf("@fontsource-variable/plus-jakarta-sans "));
 assert.match(font.slice(0,6000),/SIL OPEN FONT LICENSE Version 1\.1/);
 const dexie=text.slice(text.indexOf("\ndexie "));assert.match(dexie.slice(0,4000),/Apache License/);
});

test("packages that ship no licence file are stated honestly, and the patched wouter is called out",()=>{
 const text=committed();
 assert.match(text,/does not ship a licence file\. Its package metadata declares: (MIT|Unlicense)/);
 assert.match(text,/locally PATCHED copy of wouter/);
});

test("the app links to the notices and the service worker does not swallow the file",()=>{
 assert.match(readFileSync(new URL("../client/src/components/TallybookWelcome.tsx",import.meta.url),"utf8"),/href="\/third-party-notices\.txt"/);
 assert.match(readFileSync(new URL("../vite.config.ts",import.meta.url),"utf8"),/navigateFallbackDenylist:\s*\[\/\^\\\/third-party-notices\\\.txt\$\/\]/);
});
