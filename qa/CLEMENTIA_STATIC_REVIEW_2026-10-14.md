# Clementia maximize/minimize — static code review

**Date:** 2026-10-14  
**Pull request:** #10 (`fix/clementia-maximize-minimize-2026-10-14`)  
**Status:** CODE PREPARED / STATICALLY REVIEWED / RUNTIME TESTING **DEFERRED**

This is a **source inspection**, not a successful automated test result, operational release approval, or guarantee of zero defects.

## Scope

Reviewed the Clementia launcher and CSS, the existing assistant UI, legacy route handoff, AppShell hide logic, the added Playwright scenarios, and the Windows local QA plan.

Changed files do **not** change business database schemas, payment pathways or financial computation routines. Conversation processing still uses the pre-existing AssistantPage implementation.

## Findings and corrections

| Severity | Finding from source inspection | Resolution |
| --- | --- | --- |
| High, original defect | The old maximize icon was a one-way `/assistant` link with no reverse control. | Maximize **in place**, toggle minimize; preserve the live assistant component. |
| Medium | Header resize button lost the old link's right alignment. | Restored a right-aligned, focus-visible resize button. |
| Medium, accessibility | Fullscreen focus trap omitted native `<summary>` controls. | Included `summary` and content-editable nodes; added a future forward/backward Tab regression. |
| Medium | Legacy full-screen `/assistant` route still had no minimize control. | Added a UI-only in-memory handoff to Home and the floating assistant. |
| Low/medium | A user without a configured business could visit the full Assistant gate but not see minimize. | Added the same minimize action in the no-profile gate. |
| Low/medium | In a long legacy Assistant conversation, the minimize control could scroll out of view. | Made the control sticky on the standalone page. |
| Medium, modal accessibility | Fullscreen declared `aria-modal` but left the page behind the assistant focusable, clickable and scrollable. | Temporarily mark sibling UI regions inert, lock document scroll, redirect escaped focus into the dialog, and restore previous state on minimize/close. |
| Medium, keyboard conflicts | In floating (nonmodal) mode, document-wide Escape could dismiss Clementia while focus was in another part of Tallybook or its mobile navigation. | Scope floating Escape handling to focus inside Clementia; defer to controls that already prevented the key event. |
| High, cross-company UI confidentiality | Same assistant component could display stale company conversation and saved-shortcut state while asynchronous operations completed after a company switch. | Key the assistant's child session by active company ID, ignore stale shortcut responses, and catch load failures. |
| Medium, reliability | A failure in loading local workflows/aliases/history previously produced an unhandled rejected promise. | Show an explicit local-tools warning and clear the failed list state. |
| Coverage | Resize state, Escape, focus, route, draft, background isolation and mobile behavior lacked comprehensive assertions. | Added browser-test scenarios at six screen sizes, including backdrop inert/scroll cleanup and direct fullscreen close; **not executed yet**. |

## Static design checks (not runtime passes)

- React hooks remain unconditional in the launcher.
- Maximizing toggles a CSS class and does **not** navigate or unmount `<AssistantPage />`; its in-memory conversation/draft should be retained across this toggle.
- Escape prioritizes minimize when maximized and closes otherwise.
- The resize control receives a proper accessible name, pressed state and focus styling.
- The maximized panel has `aria-modal` and a keyboard Tab trap that includes disclosure summaries.
- On maximize, sibling navigation/content are made inert and root/body scrolling is locked; cleanup restores each sibling's prior inert state and previous inline overflow values even when closing directly from fullscreen.
- Floating panel Escape handling is scoped to focus within its own dialog to avoid conflicting with unrelated app overlays.
- The standalone `/assistant` route can navigate back to a floating panel via a one-shot, in-memory marker. The **legacy** page's existing unsent draft and conversation are not transferred to Home, because that old route navigation remounts the assistant. The normal new in-place maximize/minimize path avoids that limitation.
- Full-height layouts use dynamic viewport units and include a small-screen override.
- No new application or ledger write operations were introduced in the changed paths.

## Provisional risk score

**7.5 / 10 — source-review confidence in this isolated Clementia fix after modal-isolation hardening.**

This is a subjective assessment of implementation logic, expected integration behavior and documented browser checks. It is **not** a score for successfully executed tests. Runtime tests run for this candidate: **none**. GitHub's Actions budget block prevented its jobs from starting, and the owner deferred full PC testing.

Strengths: direct root-cause correction, same-component resizing, background inert/scroll cleanup, scoped keyboard handling, backwards-compatible recovery, locally documented acceptance test suite. Deductions: no runtime browser or TypeScript results on the latest commit, unverified device/browser interactions, and legacy route navigation cannot preserve its old live conversation.

**Whole Tallybook product:** not rated as production-ready by this review. Existing accounting, authorization, backups, crash recovery, real-data and platform release gates must still be independently verified. Do not infer a product-wide 7.5/10 from the feature-only score.

## Required acceptance before merge or release

1. On a separate Windows clone, run the exact commands in [LOCAL_WINDOWS_TEST_PLAN.md](./LOCAL_WINDOWS_TEST_PLAN.md) on the final feature commit.
2. Confirm TypeScript check, focused visual Playwright tests, Vitest, Node tests, build, IndexedDB and offline Playwright flows.
3. Manually test Clementia on a phone and desktop; verify maximize/minimize, drafts, Escape, scroll, and the legacy `/assistant` recovery.
4. Review any failures with their logs; fix and rerun. Obtain explicit owner approval before merging; do not authorize deployment or commercial use from a static review.

**No claim of bug-free software is made.**

## Additional source-only increment — modal isolation and Escape scoping

Review commits: `997f412` (background inert/scroll/focus handling), `d9b7f21` (modal assertions), `18ad373` (scoped Escape), `601bdda` (cleanup/Escape regression cases).

The added `inert` property relies on modern browsers. While the code restores the initial state on effect cleanup and prevents background scroll, no browser session has yet confirmed timing, fullscreen viewport dimensions or focus behavior on Windows/mobile browsers. Review confidence stays **7.5/10** rather than claiming a higher executed-test score.

**Automation status:** 0 runtime test commands executed for this increment. Tallybook V19 commercial release remains NO-GO.

## Additional source-only increment — per-company assistant UI state

**Root cause identified:** The prior AssistantPage mounted once and tried to clear its chat via a passive effect on `activeCompanyId`. Concurrent assistant replies and three asynchronous stored-shortcut reads could settle in a different company session, while an individual failed IndexedDB read generated an unhandled promise rejection.

**Fix in `client/src/pages/AssistantPage.tsx`:**
- A narrow `AssistantPage` wrapper keys `CompanyScopedAssistant` by active company **and currency**. Selecting another company or changing the currency discards the previous assistant session before the new assistant renders. Draft input, confirmation previews, conversation turns, pending UI promises, saved shortcuts, and voice recognition component state start fresh.
- Stored workflow/alias/history loads check an effect-local `current` flag before publishing results. Cleanup marks stale operations inactive.
- Failed loads are caught, local shortcut results cleared and a visible warning presented rather than producing an unhandled promise rejection.

**Deferred regression cases:** `client/src/pages/AssistantPage.companyIsolation.test.tsx` (1) unsent Alpha draft cleared on switching to Beta, (2) changing a company's currency discards a previous-currency draft, (3) delayed Alpha reply never appears in Beta chat, and (4) delayed Alpha saved-workflow results cannot overwrite Beta shortcuts. All four tests are **authored but not executed**.

**Scope/limitations:** This is **UI isolation**. The assistant runtime captures currency when created, so currency changes now reset the component to prevent stale-currency drafts and previews. A transaction already confirmed and underway can still finish; this fix neither cancels it nor claims to establish backend transaction serializability across rapid company switches. Stored assistant data operations already independently validate company scope, but full cross-company financial write authorization remains a separate release gate.

**Assessment:** This specific change is **7.5/10 static-review confidence**, with no runtime TypeScript, unit, browser, or financial-safety pass to support a higher rating. The whole Tallybook release remains NO-GO.
