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
| Coverage | Resize state, Escape, focus, route, draft and mobile behavior lacked comprehensive assertions. | Added browser-test scenarios at six screen sizes; **not executed yet**. |

## Static design checks (not runtime passes)

- React hooks remain unconditional in the launcher.
- Maximizing toggles a CSS class and does **not** navigate or unmount `<AssistantPage />`; its in-memory conversation/draft should be retained across this toggle.
- Escape prioritizes minimize when maximized and closes otherwise.
- The resize control receives a proper accessible name, pressed state and focus styling.
- The maximized panel has `aria-modal` and a keyboard Tab trap that includes disclosure summaries.
- The standalone `/assistant` route can navigate back to a floating panel via a one-shot, in-memory marker. The **legacy** page's existing unsent draft and conversation are not transferred to Home, because that old route navigation remounts the assistant. The normal new in-place maximize/minimize path avoids that limitation.
- Full-height layouts use dynamic viewport units and include a small-screen override.
- No new application or ledger write operations were introduced in the changed paths.

## Provisional risk score

**7.5 / 10 — source-review confidence in this isolated Clementia fix.**

This is a subjective assessment of implementation logic, expected integration behavior and documented browser checks. It is **not** a score for successfully executed tests. Runtime tests run for this candidate: **none**. GitHub's Actions budget block prevented its jobs from starting, and the owner deferred full PC testing.

Strengths: direct root-cause correction, same-component resizing, explicit focus behavior, backwards-compatible recovery, locally documented acceptance test suite. Deductions: no runtime browser or TypeScript results on the latest commit, unverified device/browser interactions, and legacy route navigation cannot preserve its old live conversation.

**Whole Tallybook product:** not rated as production-ready by this review. Existing accounting, authorization, backups, crash recovery, real-data and platform release gates must still be independently verified. Do not infer a product-wide 7.5/10 from the feature-only score.

## Required acceptance before merge or release

1. On a separate Windows clone, run the exact commands in [LOCAL_WINDOWS_TEST_PLAN.md](./LOCAL_WINDOWS_TEST_PLAN.md) on the final feature commit.
2. Confirm TypeScript check, focused visual Playwright tests, Vitest, Node tests, build, IndexedDB and offline Playwright flows.
3. Manually test Clementia on a phone and desktop; verify maximize/minimize, drafts, Escape, scroll, and the legacy `/assistant` recovery.
4. Review any failures with their logs; fix and rerun. Obtain explicit owner approval before merging; do not authorize deployment or commercial use from a static review.

**No claim of bug-free software is made.**
