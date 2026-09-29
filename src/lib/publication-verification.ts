import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { verifyLivePage } from './live-verification';
import { readPublicHttp } from './public-http';
import type { HttpReader, HttpDocument } from './public-http';
import type { PageDoc, Site } from './types';

/** Normalize block boundaries, not just whitespace, so SSR tag layout does not alter the comparison. */
export function contentText(html: string, document = false): string {
  const $ = cheerio.load(html);
  const scope = document
    ? ($('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body'))
    : $('body');
  scope.find('script,style,noscript,nav,footer,header').remove();
  scope.find('br,h1,h2,h3,h4,h5,h6,p,li,td,th,pre,blockquote,div,section').each((_, element) => { $(element).after(' '); });
  return scope.text().replace(/\s+/g, ' ').trim();
}

/** The title and summary can stay unchanged while the body is stale. Verify the full intended body too. */
export async function verifyPublishedRevision(
  site: Pick<Site, 'domain'>,
  page: Pick<PageDoc, 'canonicalUrl' | 'slug' | 'seoTitle' | 'h1' | 'summary' | 'body'>,
  reader: HttpReader = readPublicHttp
) {
  const url = new URL(page.canonicalUrl ?? '/' + page.slug, site.domain).href;
  const documents = new Map<string, HttpDocument>();
  const capture: HttpReader = async target => {
    const document = await reader(target);
    documents.set(target, document);
    return document;
  };
  const report = await verifyLivePage(site.domain, url, { title: page.seoTitle, h1: page.h1, answer: page.summary }, capture);
  const document = documents.get(url);
  const expected = contentText(await marked.parse(page.body));
  const observed = document ? contentText(document.text, true) : '';
  const matches = expected.length > 0 && observed.includes(expected);
  report.checks.push({
    code: 'full_body_revision', lane: 'SEO', status: matches ? 'pass' : 'fail',
    detail: matches ? `현재 초안 본문 ${expected.length}자의 텍스트를 대상 HTML에서 확인` : '제목/직답과 별개로 현재 본문 전체를 대상 HTML에서 확인하지 못했습니다.',
    remedy: '캐시·수신 API·배포 버전을 확인하세요. 이전 본문이 남아 있으면 게시 완료로 처리하지 않습니다.',
  });
  if (!matches) report.status = 'blocked';
  return report;
}
