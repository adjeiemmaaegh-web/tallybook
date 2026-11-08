// Development-server fixtures use the same hashed PIN and session services as the staff UI.
export async function unlockFixtureOwner(page) {
  await page.evaluate(async () => {
    const {createStaff, listStaff, unlockStaff} = await import('/src/features/staff/staff.ts');
    const owner = (await listStaff()).find(member => member.role === 'owner') ??
      await createStaff('Browser QA owner', 'owner', '392761');
    await unlockStaff(owner.id, '392761');
  });
}
