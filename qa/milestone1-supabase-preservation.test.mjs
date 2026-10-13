import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("existing Supabase Google sign-in remains the default outside the opt-in preview", () => {
  const app = read("client/src/App.tsx");
  const legacy = read("client/src/pages/GoogleSignInPage.tsx");
  assert.match(app, /isSupabaseAuthPreviewEnabled \? SupabaseSignInPage : GoogleSignInPage/);
  assert.match(legacy, /auth\.signInWithOAuth/);
  assert.match(legacy, /onAuthStateChange/);
  assert.doesNotMatch(legacy, /tallybook\.google-auth\.v1/);
});

test("Supabase preview requires explicit feature flag and defaults to disabled", () => {
  assert.match(read("client/src/lib/supabaseAuthPreview.ts"), /VITE_TALLYBOOK_SUPABASE_AUTH_PREVIEW === "true"/);
  assert.match(read(".env.example"), /VITE_TALLYBOOK_SUPABASE_AUTH_PREVIEW=false/);
});

test("prior Supabase session persistence, refreshing and OAuth detection are preserved", () => {
  const client = read("client/src/lib/supabase.ts");
  assert.match(client, /persistSession: true/);
  assert.match(client, /autoRefreshToken: true/);
  assert.match(client, /detectSessionInUrl: true/);
  assert.match(client, /getSupabaseClient/);
});

test("optional sign-in maintains session listener cleanup and safe redirect", () => {
  const page = read("client/src/pages/SupabaseSignInPage.tsx");
  assert.match(page, /onAuthStateChange/);
  assert.match(page, /subscription\.unsubscribe\(\)/);
  assert.match(page, /auth\.signInWithOAuth/);
  assert.match(page, /redirectTo: `\$\{window\.location\.origin\}\/signin`/);
});

test("no cloud sync or auth gate is enabled in app routing", () => {
  const app = read("client/src/App.tsx");
  assert.doesNotMatch(app, /<AuthGate\b/);
  const page = read("client/src/pages/SupabaseSignInPage.tsx");
  assert.doesNotMatch(page, /\.from\(/);
  assert.doesNotMatch(page, /supabase\.storage/);
});

test("Vercel automatic deployments are disabled in the isolated V19 candidate", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.git.deploymentEnabled, false);
});
