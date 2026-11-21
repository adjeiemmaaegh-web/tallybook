# macOS WebKit failure — "owner explicitly configures tax…" (run 44053229960)

**Status: hardening shipped; root cause NOT proven; one clean WebKit CI pass recorded (below).**

Evidence retrieved: job log only (failure at `qa/browser-release.spec.mjs:60`, `Lock this session` never visible
for 60 s after `unlockFixtureOwner`; 15 other WebKit cases passed; Chrome/Firefox/Edge passed).
The trace.zip artifact (id 14313824144) could not be downloaded here (blob host blocked by the session network
policy) and no WebKit binary exists in this environment, so the trace was NOT inspected.

Finding from source: `StaffPage.refresh()` had no ordering guard, so an older refresh (mount-time, slow storage read
that decided "locked") could finish after the post-unlock refresh and overwrite `unlocked` with `false`.
Fix: newest-refresh-wins sequence guard (`client/src/pages/StaffPage.tsx`).
Regression test `StaffPage.refreshOrdering.test.tsx` fails without the guard and passes with it.
Chrome run of the real spec passes locally. This does not establish that this race was the WebKit cause;
the assertions and timeouts were not weakened. Next: run the Device browser engines workflow on the new SHA and,
if WebKit still fails, inspect trace.zip (`pnpm exec playwright show-trace`).

## CI evidence (added 2026-11-20)
- Device browser engines run 44569214789 on 2dea87e (workflow_dispatch): chrome, edge, firefox and macOS WebKit all succeeded;
  the WebKit job installed WebKit and ran the 16-case selection successfully.
- Release validation run 44569221263 on 2dea87e: success.
- This is ONE pass. The original failure was a single occurrence and may be timing dependent, so a pass neither proves the
  race fixed it nor rules out recurrence. Repeat runs on later SHAs are the evidence to accumulate; if WebKit fails again,
  download trace.zip first (artifact host is blocked in the agent sandbox; the owner can download it).
