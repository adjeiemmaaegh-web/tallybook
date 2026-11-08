// A tab's storage names are fixed before Dexie is constructed. Changing accounts
// reloads the application so in-flight writes finish against their original DB.
const tabKey = 'tallybook.workspace.tab.v1';
const preference = (id: string) => 'tallybook.workspace.private.v1:' + id;

function currentSelection() {
  try { return sessionStorage.getItem(tabKey) || null; }
  catch { return null; }
}

export const workspaceOwner = currentSelection();
export function workspaceKey(key: string) {
  return workspaceOwner ? key + ':owner:' + encodeURIComponent(workspaceOwner) : key;
}
export function preferredWorkspace(userId: string) {
  return localStorage.getItem(preference(userId)) === '1' ? userId : null;
}
export function switchWorkspace(id: string | null) {
  if (id) sessionStorage.setItem(tabKey, id);
  else sessionStorage.removeItem(tabKey);
  window.location.reload();
}
export function openPrivateWorkspace(userId: string) {
  localStorage.setItem(preference(userId), '1');
  switchWorkspace(userId);
}

export function revisitOriginalLedger(userId: string) {
  localStorage.removeItem(preference(userId));
  sessionStorage.removeItem(tabKey);
  window.location.assign('/');
}
