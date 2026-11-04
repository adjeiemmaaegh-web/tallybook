import {describe,expect,it} from 'vitest';
import {checkTesterBinding,decideFriendsWorkspaceBinding} from './FriendsTestGate';

describe('friends website workspace binding',()=>{
  it('binds only an empty browser workspace to the first verified account',()=>{
    expect(decideFriendsWorkspaceBinding(undefined,false,'user-a')).toBe('bind');
    expect(decideFriendsWorkspaceBinding(undefined,true,'user-a')).toBe('deny');
  });
  it('does not open one account’s local company for a different account',()=>{
    expect(decideFriendsWorkspaceBinding('user-a',true,'user-a')).toBe('allow');
    expect(decideFriendsWorkspaceBinding('user-a',true,'user-b')).toBe('deny');
  });
});

it('prevents two accounts from claiming the same empty browser',async()=>{
  localStorage.clear();
  let release!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  const first=checkTesterBinding('a',()=>true,async()=>{await waiting;return false;});
  try{
    expect(await checkTesterBinding('b',()=>true,async()=>false)).toBe('deny');
  }finally{release();}
  expect(await first).toBe('allow');
  expect(await checkTesterBinding('b',()=>true)).toBe('deny');
  localStorage.clear();
});
it('rejects a claim cancelled while inspecting the database',async()=>{
  localStorage.clear();
  let current=true;
  expect(await checkTesterBinding('a',()=>current,async()=>{current=false;return false;})).toBe('deny');
  expect(localStorage.getItem('friendsTestVerifiedAuthUserId')).toBeNull();
});
