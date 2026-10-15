/**
 * Static guardrails for the premium settings UI.
 * These are source-contract checks, NOT browser execution or financial-service tests.
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const staffUI = readFileSync(new URL("../client/src/pages/StaffPage.tsx", import.meta.url), "utf8");
const staffService = readFileSync(new URL("../client/src/features/staff/staff.ts", import.meta.url), "utf8");
const businessUI = readFileSync(new URL("../client/src/pages/BusinessSetup.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("../client/src/pages/SettingsWorkspace.css", import.meta.url), "utf8");

test("enable/disable buttons use the service's disable flag in the correct direction", () => {
  assert.match(staffService, /changeStaffStatus\(id:string,disable:boolean/);
  assert.match(staffUI, /changeStaffStatus\(person\.id, false\), person\.name \+ " enabled\."/);
  assert.match(staffUI, /changeStaffStatus\(person\.id, true\), person\.name \+ " disabled\."/);
  assert.match(staffUI, /Confirm disable/);
});

test("role changes require confirmation because the service resets permissions to defaults", () => {
  assert.match(staffService, /permissions:undefined/);
  assert.match(staffUI, /Confirm role change/);
  assert.match(staffUI, /resets custom permissions to the new role defaults/);
});

test("create and unlock PINs and per-user PIN reset inputs cannot share UI state", () => {
  assert.match(staffUI, /const \[newPin, setNewPin\]/);
  assert.match(staffUI, /const \[unlockPin, setUnlockPin\]/);
  assert.match(staffUI, /const \[resetPins, setResetPins\]/);
  assert.match(staffUI, /key=\{companyId\}/);
  assert.match(staffUI, /setUnlockPin\(""\); setNewPin\(""\); setResetPins\(\{\}\)/);
});

test("business record, tax, provider and company management services remain wired", () => {
  for (const token of [
    "businessProfileSchema", "preferredPaymentMethod", "mobileMoneyProviderName",
    "cardProviderName", "name=\"country\"", "name=\"currency\"", "<TaxSettings",
    "getMobileMoneyProviders", "setMobileMoneyProviderActive", "createCompany",
    "switchCompany", "clearCompany", "lastBackupCompanyId",
  ]) assert.ok(businessUI.includes(token), "Missing business workflow: " + token);
});

test("premium styling stays scoped to business and staff pages", () => {
  assert.match(style, /\.settings-business-page/);
  assert.match(style, /\.settings-workspace/);
  assert.doesNotMatch(style, /\.home-workspace\s*\{/);
  assert.doesNotMatch(style, /\.sales-page\s*\{/);
  assert.doesNotMatch(style, /\.reports-page\s*\{/);
});
