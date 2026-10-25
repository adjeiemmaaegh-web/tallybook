import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCompanyIsolation} from '../tallybook-adapter/companyIsolation.mjs';
const relations=[['saleLines','saleId','sales'],['saleLines','productId','products']];
const fixture=(productCompany='a')=>({sales:[{id:'s',businessProfileId:'a'}],saleLines:[{id:'l',saleId:'s',productId:'p'}],products:[{id:'p',businessProfileId:productCompany}]});
test('sale line inherits company from sale rather than falsely flagging missing direct scope',()=>assert.deepEqual(assessCompanyIsolation(fixture(),relations).issues,[]));
test('sale line linked to another company product is detected',()=>assert.equal(assessCompanyIsolation(fixture('b'),relations).issues[0].code,'CROSS_COMPANY_REFERENCE'));
test('unverifiable company scope is not called cross-company',()=>assert.equal(assessCompanyIsolation({sales:[{id:'s'}],saleLines:[{id:'l',saleId:'s'}]},[relations[0]]).issues[0].code,'UNVERIFIABLE_COMPANY_SCOPE'));
test('missing parent is detected',()=>assert.equal(assessCompanyIsolation({saleLines:[{id:'l',saleId:'missing'}]},[relations[0]]).issues[0].code,'MISSING_REFERENCE'));
