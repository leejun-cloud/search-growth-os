// The first write adapter is deliberately bound to the existing DreamBridge blog receiver.
// It never creates pages or overwrites an article body, title, slug or index policy.
import * as cheerio from 'cheerio';
import { readPublicHttp } from './public-http';
export const BLOG_ORIGIN = 'https://db.nolgong.app';
export interface BlogAnswer { directAnswer: string; sources: string[]; dataAsOf: string; reviewer: string }
export interface BlogSnapshot {
  version: 1; slug: string; url: string; revision: string; title: string; description: string; bodyText: string;
  currentAnswer: (BlogAnswer & { operationId: string; appliedAt: string }) | null;
}
export interface BlogReceipt {
  version: 1; status: 'applied'; mode: 'apply' | 'rollback'; operationId: string;
  slug: string; url: string; revision: string; appliedAt: string; replay: boolean; bodyPreserved: true;
}
export interface BlogProof { status: 'verified' | 'pending'; checkedAt: string; checks: { code: string; pass: boolean }[]; error?: string }
export class BlogBridgeError extends Error {
  constructor(public code: string, message: string, public httpStatus = 0) { super(message); }
}
export function blogTarget(domain: string, target: string): { url: string; slug: string } {
  const base = new URL(domain), url = new URL(target, base);
  if (base.origin !== BLOG_ORIGIN || url.origin !== BLOG_ORIGIN || url.username || url.password || url.search || url.hash) {
    throw new BlogBridgeError('WRONG_SITE', '이 실행기는 db.nolgong.app의 기존 블로그만 지원합니다.');
  }
  const match = url.pathname.match(/^\/blog\/([^/]+)$/);
  let slug = '';
  try { slug = match ? decodeURIComponent(match[1]) : ''; } catch { /* rejected below */ }
  if (!/^[a-zA-Z0-9가-힣_-]{1,160}$/.test(slug)) throw new BlogBridgeError('WRONG_PATH', '기존 /blog/글주소를 입력하세요.');
  return { url: `${BLOG_ORIGIN}/blog/${encodeURIComponent(slug)}`, slug };
}
export function blogBridgeConfigured(domain: string): boolean {
  return new URL(domain).origin === BLOG_ORIGIN && (process.env.SGO_DB_BLOG_UPDATE_SECRET?.length ?? 0) >= 32;
}
function secret(): string {
  const value = process.env.SGO_DB_BLOG_UPDATE_SECRET;
  if (!value || value.length < 32) throw new BlogBridgeError('NOT_CONFIGURED', '서버에 SGO_DB_BLOG_UPDATE_SECRET 연결이 필요합니다.');
  return value;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function validateBlogAnswer(value: unknown): BlogAnswer {
  const raw = object(value), take = (key: string, min: number, max: number) => {
    const text = typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
    if (text.length < min || text.length > max) throw new BlogBridgeError('INVALID_PATCH', `${key} 입력 길이를 확인하세요.`);
    return text;
  };
  const directAnswer = take('directAnswer', 40, 1600), reviewer = take('reviewer', 1, 100), dataAsOf = take('dataAsOf', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf) || !Number.isFinite(Date.parse(dataAsOf)) || new Date(dataAsOf).toISOString().slice(0, 10) !== dataAsOf || dataAsOf > new Date().toISOString().slice(0, 10)) {
    throw new BlogBridgeError('INVALID_DATE', '오늘 날짜를 임의로 넣지 말고 실제 자료 기준일을 입력하세요.');
  }
  if (!Array.isArray(raw.sources) || raw.sources.length > 8) throw new BlogBridgeError('INVALID_SOURCES', '출처는 8개까지 입력하세요.');
  const sources = [...new Set(raw.sources.map((v: unknown) => {
    if (typeof v !== 'string' || v.length > 2000) throw new BlogBridgeError('INVALID_SOURCES', '출처 URL을 확인하세요.');
    const url = new URL(v);
    if (url.protocol !== 'https:' || url.username || url.password) throw new BlogBridgeError('INVALID_SOURCES', '출처는 HTTPS URL이어야 합니다.');
    return url.href;
  }))];
  return { directAnswer, sources, dataAsOf, reviewer };
}
async function request(slug: string, body?: object): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${BLOG_ORIGIN}/api/seo/blog-update${body ? '' : '?slug=' + encodeURIComponent(slug)}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${secret()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof BlogBridgeError) throw error;
    throw new BlogBridgeError('RESULT_UNKNOWN', '응답을 받지 못했습니다. 새 작업을 만들지 말고 같은 작업을 재확인하세요.');
  }
  const text = await response.text();
  if (text.length > 100000) throw new BlogBridgeError('INVALID_RESPONSE', '응답 크기 제한을 초과했습니다.');
  let data: Record<string, unknown>;
  try { data = object(JSON.parse(text)); } catch { throw new BlogBridgeError('INVALID_RESPONSE', '대상 사이트의 연결 API 응답을 확인하지 못했습니다.', response.status); }
  if (!response.ok) {
    const code = typeof data.code === 'string' && /^[A-Z_]{1,50}$/.test(data.code) ? data.code : 'HTTP_ERROR';
    const message = response.status === 409 ? '글 버전 또는 작업 기록이 달라졌습니다. 덮어쓰지 않았습니다.'
      : response.status === 401 || response.status === 403 ? '두 시스템의 서버 인증 설정을 확인하세요.'
      : response.status === 503 ? '대상 사이트의 수정 API 활성화·Firebase 설정을 확인하세요.' : '대상 사이트 요청을 완료하지 못했습니다.';
    throw new BlogBridgeError(code, `${message} (HTTP ${response.status})`, response.status);
  }
  return data;
}
export async function readBlogSnapshot(domain: string, target: string): Promise<BlogSnapshot> {
  const expected = blogTarget(domain, target), raw = await request(expected.slug);
  if (raw.version !== 1 || raw.url !== expected.url || raw.slug !== expected.slug || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || typeof raw.bodyText !== 'string' || typeof raw.title !== 'string' || typeof raw.description !== 'string') {
    throw new BlogBridgeError('INVALID_SNAPSHOT', '사이트·글 버전 스냅샷을 확인할 수 없습니다.');
  }
  let currentAnswer: BlogSnapshot['currentAnswer'] = null;
  if (raw.currentAnswer !== null && raw.currentAnswer !== undefined) {
    const answer = object(raw.currentAnswer);
    if (typeof answer.operationId !== 'string' || typeof answer.appliedAt !== 'string') throw new BlogBridgeError('INVALID_SNAPSHOT', '현재 답변의 작업 기록이 유효하지 않습니다.');
    currentAnswer = { ...validateBlogAnswer(answer), operationId: answer.operationId, appliedAt: answer.appliedAt };
  }
  return { version: 1, ...expected, revision: raw.revision, title: raw.title, description: raw.description, bodyText: raw.bodyText.slice(0, 24000), currentAnswer };
}
export async function sendBlogUpdate(domain: string, target: string, input: {
  mode: 'apply' | 'rollback'; operationId: string; expectedRevision: string; patch?: BlogAnswer; restoresOperationId?: string;
}): Promise<BlogReceipt> {
  const expected = blogTarget(domain, target);
  const raw = await request(expected.slug, { version: 1, slug: expected.slug, ...input });
  if (raw.version !== 1 || raw.status !== 'applied' || raw.operationId !== input.operationId || raw.mode !== input.mode || raw.url !== expected.url || raw.bodyPreserved !== true || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || typeof raw.appliedAt !== 'string' || !Number.isFinite(Date.parse(raw.appliedAt))) {
    throw new BlogBridgeError('RESULT_UNKNOWN', '적용 영수증을 확인하지 못했습니다. 같은 작업 ID로 재확인해야 합니다.');
  }
  return raw as unknown as BlogReceipt;
}
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim();
export async function verifyBlogAnswer(url: string, operationId: string, patch: BlogAnswer): Promise<BlogProof> {
  const checkedAt = new Date().toISOString();
  try {
    blogTarget(BLOG_ORIGIN, url);
    const doc = await readPublicHttp(url), $ = cheerio.load(doc.text);
    const block = $('[data-sgo-update]').filter((_, node) => $(node).attr('data-sgo-update') === operationId);
    const sources = block.find('a[data-source]').toArray().map(node => $(node).attr('href') ?? '').sort();
    const directives = $('meta[name="robots"],meta[name="googlebot"]').toArray().map(node => $(node).attr('content') ?? '').join(',') + ',' + (doc.headers['x-robots-tag'] ?? '');
    const checks = [
      { code: 'http_html', pass: doc.status === 200 && /text\/html/i.test(doc.headers['content-type'] ?? '') },
      { code: 'operation_marker', pass: block.length === 1 },
      { code: 'exact_answer', pass: normalized(block.find('[data-direct-answer]').text()) === normalized(patch.directAnswer) },
      { code: 'sources', pass: JSON.stringify(sources) === JSON.stringify([...patch.sources].sort()) },
      { code: 'data_as_of', pass: block.find('[data-asof]').attr('data-asof') === patch.dataAsOf },
      { code: 'canonical', pass: $('link[rel="canonical"]').length === 1 && new URL($('link[rel="canonical"]').attr('href') ?? '', url).href === url },
      { code: 'index_allowed', pass: !/(?:^|[\s,:])(?:noindex|none)(?:$|[\s,])/i.test(directives) },
    ];
    return { status: checks.every(check => check.pass) ? 'verified' : 'pending', checkedAt, checks };
  } catch { return { status: 'pending', checkedAt, checks: [], error: '공개 URL 확인 실패. 적용 실패나 검색 유입 0으로 해석하지 않습니다.' }; }
}
