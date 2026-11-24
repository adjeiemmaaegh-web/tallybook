// Development-server fixtures use the same hashed PIN and session services as the staff UI.
// WebKit can still be running the app's own start-up work (it takes the exclusive cross-tab data lock) when the fixture
// starts. The product then refuses with "Another tab is editing ... no data was changed" by design, so the fixture waits
// until the page is lock-quiet and retries only that safe refusal (bounded). Root cause of the intermittent WebKit failures
// recorded in docs/release/WEBKIT_STAFF_UNLOCK_INVESTIGATION_2026-11-19.md (recurrence 3, 2026-11-24).
const quiet = page => page.evaluate(async () => {
  if (!navigator.locks?.query) return;
  let clean = 0; const deadline = Date.now() + 20000;
  while (clean < 3 && Date.now() < deadline) {
    const {held = [], pending = []} = await navigator.locks.query();
    clean = held.length === 0 && pending.length === 0 ? clean + 1 : 0;
    await new Promise(r => setTimeout(r, 120));
  }
});
export async function unlockFixtureOwner(page) {
  for (let attempt = 0; ; attempt++) {
    await quiet(page);
    try {
      await page.evaluate(async () => {
        const {createStaff, listStaff, unlockStaff} = await import('/src/features/staff/staff.ts');
        const owner = (await listStaff()).find(member => member.role === 'owner') ??
          await createStaff('Browser QA owner', 'owner', '392761');
        await unlockStaff(owner.id, '392761');
      });
      return;
    } catch (error) {
      if (attempt >= 4 || !/Another tab is editing/.test(String(error))) throw error;
    }
  }
}
