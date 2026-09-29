import {test} from 'node:test';import assert from 'node:assert/strict';import {deliveryState,escapeXml} from './publish';
test('a local file export can never count as public publishing',()=>{assert.equal(deliveryState('local-file',true), 'exported');});
test('a successful webhook without live verification remains unverified',()=>{assert.equal(deliveryState('nextjs-webhook',true),'unverified');assert.equal(deliveryState('nextjs-webhook',true,{status:'blocked'}),'unverified');});
test('only accepted delivery with verified public content is verified',()=>{assert.equal(deliveryState('nextjs-webhook',true,{status:'verified'}),'verified');assert.equal(deliveryState('nextjs-webhook',false,{status:'verified'}),'blocked');});
test('feed values escape XML',()=>{assert.equal(escapeXml('A&B<C'), 'A&amp;B&lt;C');});
