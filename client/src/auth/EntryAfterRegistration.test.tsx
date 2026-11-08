/**
 * 2026-11-05 owner report: after registering a business, "Open this device's ledger" and
 * "Open workspace" did nothing. The entry gate refused browsers that already held a local
 * business (or were last used by another sign-in) and re-rendered the whole account page,
 * links included, under one small heading — so every click landed back on the same screen.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FriendsTestGate, allowOfflineReturn } from './FriendsTestGate';

const mock = vi.hoisted(() => ({ list: vi.fn(), status: 'signed-in' as string, profiles: [] as Array<{ name: string }>, cachedUser: null as string | null }));
vi.mock('./verifyDeviceOwner', () => ({verifyDeviceOwner: async (pin:string) => pin === '392761'}));
vi.mock('../cloud/cloudMembership', () => ({ listVerifiedCloudBusinesses: mock.list }));
vi.mock('./useRun4CloudSession', () => ({ useRun4CloudSession: () => ({ state: { status: mock.status, userId: mock.status === 'signed-in' ? 'owner-1' : null } }) }));
vi.mock('@/db/TallybookDB', () => ({ db: { businessProfiles: { count: async () => mock.profiles.length, toArray: async () => mock.profiles } } }));
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: mock.cachedUser ? { user: { id: mock.cachedUser } } : null } }), signOut: async () => ({}) } }) }));
vi.mock('wouter', () => ({ Redirect: ({ to }: { to: string }) => <span>Redirected to {to}</span>, Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));

const OWNER = [{ role: 'owner', owner_id: 'owner-1' }];
function visit() { render(<FriendsTestGate><span>Device ledger</span></FriendsTestGate>); }

beforeEach(() => { localStorage.clear(); mock.status = 'signed-in'; mock.profiles = []; mock.cachedUser = null; mock.list.mockReset(); });

it('opens a fresh browser for the verified owner and binds it', async () => {
  mock.list.mockResolvedValue(OWNER); visit();
  await screen.findByText('Device ledger');
  expect(localStorage.getItem('friendsTestVerifiedAuthUserId')).toBe('owner-1');
});

it('offers to open a ledger that was on this browser before sign-in, instead of a dead end', async () => {
  mock.list.mockResolvedValue(OWNER); mock.profiles = [{ name: 'Ama Local Shop' }]; visit();
  await screen.findByText('Use the ledger already on this device?');
  expect(screen.queryByText('Ama Local Shop')).toBeNull();
  fireEvent.change(screen.getByLabelText('Local owner PIN'), {target:{value:'000000'}});
  fireEvent.click(screen.getByRole('button', {name:'Open it with my account'}));
  await screen.findByText(/Could not verify the local owner/);
  expect(localStorage.getItem('friendsTestVerifiedAuthUserId')).toBeNull();
  fireEvent.change(screen.getByLabelText('Local owner PIN'), {target:{value:'392761'}});
  expect(screen.queryByText('Device ledger')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open it with my account' }));
  await screen.findByText('Device ledger');
  expect(localStorage.getItem('friendsTestVerifiedAuthUserId')).toBe('owner-1');
});

it('explains a browser bound to another account and offers a way out, without the account page links', async () => {
  localStorage.setItem('friendsTestVerifiedAuthUserId', 'someone-else');
  mock.list.mockResolvedValue(OWNER); visit();
  await screen.findByText("This device's ledger belongs to another account");
  expect(screen.getByRole('link', { name: 'Open shared shop' }).getAttribute('href')).toBe('/shop');
  expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
  expect(screen.queryByText(/Open this device's ledger/)).toBeNull();
  expect(screen.queryByText('Device ledger')).toBeNull();
});

it('sends someone who does not own a business to account setup', async () => {
  mock.list.mockResolvedValue([]); visit();
  await screen.findByText('Redirected to /account');
});

it('sends a signed-out visitor to the sign-in page rather than showing it inline', () => {
  mock.status = 'signed-out'; visit();
  expect(screen.getByText('Redirected to /welcome')).toBeTruthy();
});

it('lets the verified owner of this browser return offline', async () => {
  localStorage.setItem('friendsTestVerifiedAuthUserId', 'owner-1');
  localStorage.setItem('tallybook.entry.verifiedOwner.v1', 'owner-1');
  mock.cachedUser = 'owner-1'; mock.status = 'offline'; visit();
  await screen.findByText('Device ledger');
  expect(mock.list).not.toHaveBeenCalled();
});

it('keeps an offline browser closed when it was never verified online, or the cached sign-in differs', async () => {
  mock.status = 'offline'; visit();
  await screen.findByText('Connect once to open Tallybook');
  localStorage.setItem('friendsTestVerifiedAuthUserId', 'owner-1');
  localStorage.setItem('tallybook.entry.verifiedOwner.v1', 'owner-1');
  expect(await allowOfflineReturn(async () => 'intruder')).toBe(false);
  expect(await allowOfflineReturn(async () => null)).toBe(false);
  expect(await allowOfflineReturn(async () => 'owner-1')).toBe(true);
  localStorage.setItem('tallybook.entry.verifiedOwner.v1', 'someone-else');
  expect(await allowOfflineReturn(async () => 'owner-1')).toBe(false);
});

it('records the verified owner after an online check so a later offline visit can open', async () => {
  localStorage.setItem('friendsTestVerifiedAuthUserId', 'owner-1');
  mock.list.mockResolvedValue(OWNER); visit();
  await screen.findByText('Device ledger');
  await waitFor(() => expect(localStorage.getItem('tallybook.entry.verifiedOwner.v1')).toBe('owner-1'));
});
