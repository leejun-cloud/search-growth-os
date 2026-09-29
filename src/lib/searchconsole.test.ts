import { test } from 'node:test';import assert from 'node:assert/strict';
import { assertProperty,validateGscRows,readGscReport } from './searchconsole';
import type { Site } from './types';
test('GSC property binding forbids cross-site reports',()=>{assert.doesNotThrow(()=>assertProperty('https://db.nolgong.app','sc-domain:nolgong.app'));assert.throws(()=>assertProperty('https://db.nolgong.app','sc-domain:evil.app'));assert.throws(()=>assertProperty('https://db.nolgong.app','https://other.nolgong.app/'));});
test('malformed GSC data does not silently turn into zero',()=>{assert.throws(()=>validateGscRows([{keys:['x'],clicks:'3',impressions:20,position:1}],1));assert.deepEqual(validateGscRows(undefined,1),[]);});
test('actual totals, page and query dimensions are separately collected with exact final periods',async()=>{
 const calls:Array<{dimensions:string[];startDate:string;endDate:string;dataState:string;startRow:number;dimensionFilterGroups:unknown[]}>=[];
 const fake=(async(_url,options)=>{const b=JSON.parse(String(options?.body));calls.push(b);const keys=b.dimensions.map((d:string)=>d==='date'?'2026-09-25':d==='page'?'https://db.nolgong.app/services/test':'test');return new Response(JSON.stringify({rows:[{keys,clicks:3,impressions:300,position:8}]}));}) as typeof fetch;
 const report=await readGscReport({domain:'https://db.nolgong.app'} as Site,{clientEmail:'test',privateKey:'test',siteUrl:'sc-domain:nolgong.app'},'fake-token',28,fake,new Date('2026-09-29T01:00:00Z'));
 assert.equal(calls.length,8);assert.ok(calls.every(c=>c.dataState==='final'));assert.ok(calls.every(c=>c.dimensionFilterGroups.length===1));assert.equal(report.current.totals?.clicks,3);assert.equal(report.queryPages[0].keys[1],'https://db.nolgong.app/services/test');assert.equal(report.coverage,'API_TOP_ROWS_ONLY');assert.equal(report.lastObservedDate,'2026-09-25');assert.equal(report.current.pages.length,1);
});
test('authentication/API failure rejects instead of clearing existing data',async()=>{const fake=(async()=>new Response('',{status:403})) as typeof fetch;await assert.rejects(()=>readGscReport({domain:'https://example.com'} as Site,{clientEmail:'',privateKey:'',siteUrl:'https://example.com/'},'fake',28,fake));});
