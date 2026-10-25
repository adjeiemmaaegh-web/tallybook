import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCompanyIsolation} from '../stage1-audit-candidate/tallybook-integrity/tallybook-adapter/companyIsolation.mjs';
const fixture = () => ({customers:[{id:'c1',businessProfileId:'a'},{id:'c2',businessProfileId:'b'}],sales:[{id:'s1',businessProfileId:'a',customerId:'c1'}],saleLines:[{id:'l1',businessProfileId:'a',saleId:'s1'}]});
test('valid same-company references',()=>assert.equal(assessCompanyIsolation(fixture()).status,'clean'));
test('cross-company customer detected',()=>{const f=fixture();f.sales[0].customerId='c2';assert.equal(assessCompanyIsolation(f).issues[0].code,'CROSS_COMPANY_REFERENCE')});
test('cross-company sale line detected',()=>{const f=fixture();f.saleLines[0].businessProfileId='b';assert.equal(assessCompanyIsolation(f).issues[0].code,'CROSS_COMPANY_REFERENCE')});
test('missing reference detected',()=>{const f=fixture();f.sales[0].customerId='absent';assert.equal(assessCompanyIsolation(f).issues[0].code,'MISSING_REFERENCE')});
test('audit does not modify input',()=>{const f=fixture(),before=structuredClone(f);assessCompanyIsolation(f);assert.deepEqual(f,before)});
