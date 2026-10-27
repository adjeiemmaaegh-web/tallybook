import {describe,expect,it} from 'vitest';
import {decideFriendsWorkspaceBinding} from './FriendsTestGate';

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
