/** Cloud auth events may revoke a local staff unlock, never grant one. */
export function createCloudStaffSessionBoundary(lockLocalStaff: () => void) {
  let lastAccountId: string | null = null;
  return (event: string, accountId: string | null) => {
    if (event === "INITIAL_SESSION") {
      lastAccountId = accountId;
      return;
    }
    if ((event === "SIGNED_OUT" && lastAccountId !== null) ||
        (event === "USER_UPDATED" && lastAccountId !== null) ||
        (event === "SIGNED_IN" && accountId !== lastAccountId)) lockLocalStaff();
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") lastAccountId = accountId;
  };
}
