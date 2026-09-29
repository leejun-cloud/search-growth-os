import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublishedRevision } from './publication-verification';
import type { HttpReader } from './public-http';
const site = { domain: 'https://example.com' };
const page = { slug: 'page', seoTitle: 'Test', h1: 'Question', summary: 'Same answer', body: '## Details\n\nNew body with corrected facts.' };
const reader = (body: string): HttpReader => async url => ({ url, status: 200, headers: { 'content-type': 'text/html' }, text:
  url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : url.endsWith('sitemap.xml') ? '<urlset><url><loc>https://example.com/page</loc></url></urlset>' :
  `<html><head><title>Test</title><link rel="canonical" href="https://example.com/page"></head><body><main><h1>Question</h1><p>Same answer</p><h2>Details</h2><p>${body}</p></main></body></html>` });
test('unchanged title and summary cannot hide a stale published body', async () => {
  const report = await verifyPublishedRevision(site, page, reader('Old body.'));
  assert.equal(report.status, 'blocked');
  assert.equal(report.checks.find(c => c.code === 'full_body_revision')?.status, 'fail');
});
test('the actual intended body passes despite different HTML whitespace', async () => {
  const report = await verifyPublishedRevision(site, page, reader('New body with corrected facts.'));
  assert.equal(report.status, 'verified');
  assert.equal(report.checks.find(c => c.code === 'full_body_revision')?.status, 'pass');
});
