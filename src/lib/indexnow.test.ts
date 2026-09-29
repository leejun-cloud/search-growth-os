import {test} from 'node:test';import assert from 'node:assert/strict';import {submitIndexNow} from './indexnow';import type {Site} from './types';
test('IndexNow verifies the key and never labels accepted as indexed',async()=>{
 const previous=process.env.SGO_INDEXNOW_SITES;process.env.SGO_INDEXNOW_SITES=JSON.stringify({'example.com':{key:'abcd1234'}});
 try{
 const reader=async(url:string)=>({url,status:200,text:'abcd1234',headers:{}});
 let calls=0;const fetcher=(async()=>{calls++;return new Response('',{status:202});}) as typeof fetch;
 const r=await submitIndexNow({domain:'https://example.com'} as Site,'https://example.com/page',reader,fetcher);
 assert.equal(r.status,'key_validation_pending');assert.equal(calls,1);
 await assert.rejects(()=>submitIndexNow({domain:'https://example.com'} as Site,'https://other.com/page',reader,fetcher));
 await assert.rejects(()=>submitIndexNow({domain:'https://example.com'} as Site,'https://example.com/page',async url=>({...await reader(url),text:'wrong'}),fetcher));
 assert.equal(calls,1);
 }finally{if(previous===undefined)delete process.env.SGO_INDEXNOW_SITES;else process.env.SGO_INDEXNOW_SITES=previous;}
});
