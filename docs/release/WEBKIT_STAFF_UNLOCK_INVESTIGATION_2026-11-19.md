# macOS WebKit failure — "owner explicitly configures tax…" (run 44053229960)

**Status: hardening shipped; root cause NOT proven; WebKit verification pending CI.**

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
