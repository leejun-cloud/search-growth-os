import { db } from './db';
import { sql } from './sqldb';
import { newId, nowIso } from './types';
import { listEvidence, saveEvidence } from './growth-store';
import type { GscReport, GscRow } from './searchconsole';
import { BlogBridgeError, blogTarget, readBlogSnapshot, sendBlogUpdate, validateBlogAnswer, verifyBlogAnswer } from './blog-bridge';
import type { BlogAnswer, BlogSnapshot, BlogReceipt, BlogProof } from './blog-bridge';

export interface PageBaseline {
  site: string; property: string; startDate: string; endDate: string; measuredAt: string;
  metrics: GscRow | null; queries: GscRow[]; coverage: string;
}
export interface BlogImprovement {
  id: string; siteId: string; url: string; createdAt: string; original: BlogSnapshot;
  patch: BlogAnswer; baseline: PageBaseline | null; draftMethod: 'operator' | 'source_excerpt';
}
export interface ImprovementEvent {
  planId: string; stage: 'approved' | 'applied' | 'verified' | 'verification_pending' | 'blocked' | 'result_unknown' | 'rolled_back';
  at: string; note: string; receipt?: BlogReceipt; proof?: BlogProof;
}
const PLAN_KIND = 'blog_improvement';
const EVENT_KIND = 'blog_improvement_event';
const DAY = 86400000;
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Only the selected URL's metrics are retained. Site-wide totals are never attributed to one edit. */
export async function pageBaseline(siteId: string, url: string): Promise<PageBaseline | null> {
  const site = await db.sites.get(siteId);
  const [record] = await listEvidence<GscReport>(siteId, 'gsc', 1);
  if (!site || !record) return null;
  const report = record.payload, age = Date.now() - Date.parse(report.measuredAt);
  if (!Number.isFinite(age) || age < -300000 || age > 7 * DAY || report.site !== new URL('/', site.domain).href) return null;
  const period = report.current.period;
  const endAge = Date.now() - Date.parse(period.endDate + 'T23:59:59Z');
  if (!Number.isFinite(endAge) || endAge > 7 * DAY || endAge < -DAY) return null;
  return { site: report.site, property: report.property, ...period, measuredAt: report.measuredAt,
    metrics: report.current.pages.find(row => row.keys[0] === url) ?? null,
    queries: report.queryPages.filter(row => row.keys[1] === url).sort((a, b) => b.impressions - a.impressions).slice(0, 5), coverage: report.coverage };
}
/** A low-cost first draft copies real sentences; it never fabricates statistics or external research. */
export function excerptAnswer(snapshot: BlogSnapshot, query: string): string {
  const tokens = norm(query).toLowerCase().split(/[^a-z0-9가-힣]+/).filter(token => token.length > 1);
  const sentences = snapshot.bodyText.split(/(?<=[.!?。])\s+/).map(norm).filter(text => text.length >= 40 && text.length <= 1400);
  const candidates = [...(snapshot.description.length >= 40 ? [snapshot.description] : []), ...sentences];
  const scored = candidates.map((text, order) => ({ text, order, score: tokens.filter(token => text.toLowerCase().includes(token)).length }));
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored[0]?.text.slice(0, 1600) ?? snapshot.bodyText.slice(0, 600);
}
export async function prepareBlogImprovement(siteId: string, input: { target: string; directAnswer: string; sources: string[]; dataAsOf: string; reviewer: string }): Promise<BlogImprovement> {
  const site = await db.sites.get(siteId);
  if (!site) throw new BlogBridgeError('SITE_MISSING', '사이트가 없습니다.');
  const { url } = blogTarget(site.domain, input.target);
  const original = await readBlogSnapshot(site.domain, url), baseline = await pageBaseline(siteId, url);
  const supplied = input.directAnswer.trim();
  const patch = validateBlogAnswer({ ...input, directAnswer: supplied || excerptAnswer(original, baseline?.queries[0]?.keys[0] ?? original.title),
    sources: input.sources.length ? input.sources : [url] });
  const plan: BlogImprovement = { id: newId('improve'), siteId, url, createdAt: nowIso(), original, patch, baseline,
    draftMethod: supplied ? 'operator' : 'source_excerpt' };
  await saveEvidence({ id: plan.id, siteId, kind: PLAN_KIND, target: url, createdAt: plan.createdAt, payload: plan });
  return plan;
}
export async function getBlogImprovement(siteId: string, id: string): Promise<BlogImprovement> {
  const result = await sql<{ payload: BlogImprovement }>('SELECT payload FROM growth_evidence WHERE site_id=$1 AND id=$2 AND kind=$3', [siteId, id, PLAN_KIND]);
  const plan = result.rows[0]?.payload;
  if (!plan || plan.siteId !== siteId || plan.id !== id) throw new BlogBridgeError('PLAN_MISSING', '이 사이트의 수정안을 찾을 수 없습니다.');
  return plan;
}
export async function improvementEvents(siteId: string, planId: string): Promise<ImprovementEvent[]> {
  const result = await sql<{ payload: ImprovementEvent }>('SELECT payload FROM growth_evidence WHERE site_id=$1 AND kind=$2 AND target=$3 ORDER BY created_at DESC,id DESC LIMIT 30', [siteId, EVENT_KIND, planId]);
  return result.rows.map(row => row.payload);
}
async function event(plan: BlogImprovement, item: Omit<ImprovementEvent, 'planId' | 'at'>): Promise<ImprovementEvent> {
  const payload = { ...item, planId: plan.id, at: nowIso() };
  await saveEvidence({ id: newId('improvement_event'), siteId: plan.siteId, kind: EVENT_KIND, target: plan.id, createdAt: payload.at, payload });
  return payload;
}
export async function applyBlogImprovement(siteId: string, id: string, reviewed: boolean, allowUnmeasured: boolean): Promise<ImprovementEvent> {
  if (!reviewed) throw new BlogBridgeError('REVIEW_REQUIRED', '표시된 수정안의 내용·출처·기준일을 검토한 뒤 승인하세요.');
  const plan = await getBlogImprovement(siteId, id), site = await db.sites.get(siteId);
  if (!site) throw new BlogBridgeError('SITE_MISSING', '사이트가 없습니다.');
  const events = await improvementEvents(siteId, id);
  if (events.some(row => row.stage === 'rolled_back')) throw new BlogBridgeError('ALREADY_ROLLED_BACK', '복원된 작업입니다. 새 수정안을 작성하세요.');
  const prior = events.find(row => row.receipt?.mode === 'apply')?.receipt;
  if (prior) return checkBlogImprovement(siteId, id);
  if (!events.some(row => row.stage === 'approved') && Date.now() - Date.parse(plan.createdAt) > DAY) {
    throw new BlogBridgeError('PLAN_EXPIRED', '24시간이 지난 미승인 초안입니다. 최신 글로 다시 작성하세요.');
  }
  if ((!plan.baseline?.metrics || Date.now() - Date.parse(plan.baseline.measuredAt) > 7 * DAY) && !allowUnmeasured) {
    throw new BlogBridgeError('BASELINE_REQUIRED', '실측 기준선이 없거나 오래됐습니다. 측정 후 새 초안을 만들거나 미측정 한계를 명시적으로 승인하세요.');
  }
  // An intent record survives a dropped response. Retries reuse this immutable plan/operation ID.
  await event(plan, { stage: 'approved', note: allowUnmeasured ? '수정안 승인. 기준선 한계도 확인함.' : '표시된 수정안과 기준선을 승인함.' });
  let receipt: BlogReceipt;
  try {
    receipt = await sendBlogUpdate(site.domain, plan.url, { mode: 'apply', operationId: plan.id,
      expectedRevision: plan.original.revision, patch: plan.patch });
  } catch (error) {
    const blocked = error instanceof BlogBridgeError && [400, 401, 403, 404, 409, 413, 415].includes(error.httpStatus);
    return event(plan, { stage: blocked ? 'blocked' : 'result_unknown', note: error instanceof BlogBridgeError ? error.message : '요청 결과 미확인. 같은 작업 ID로 재확인하세요.' });
  }
  await event(plan, { stage: 'applied', receipt, note: '대상 DB 적용 응답 수신. 공개 HTML 확인은 별도입니다.' });
  return checkBlogImprovement(siteId, id);
}
export async function checkBlogImprovement(siteId: string, id: string): Promise<ImprovementEvent> {
  const plan = await getBlogImprovement(siteId, id), site = await db.sites.get(siteId);
  if (!site) throw new BlogBridgeError('SITE_MISSING', '사이트가 없습니다.');
  const events = await improvementEvents(siteId, id);
  if (events.some(row => row.stage === 'rolled_back')) return event(plan, { stage: 'rolled_back', note: '복원된 작업입니다. 검색 증가 비교에서 제외합니다.' });
  let receipt = events.find(row => row.receipt?.mode === 'apply')?.receipt;
  if (!receipt) {
    const snapshot = await readBlogSnapshot(site.domain, plan.url), answer = snapshot.currentAnswer;
    if (!answer || answer.operationId !== plan.id || norm(answer.directAnswer) !== norm(plan.patch.directAnswer) || answer.dataAsOf !== plan.patch.dataAsOf || JSON.stringify(answer.sources) !== JSON.stringify(plan.patch.sources)) {
      return event(plan, { stage: 'result_unknown', note: '이 수정안의 적용 증거가 없습니다. 동일 작업을 재전송하거나 서버 상태를 확인하세요.' });
    }
    receipt = { version: 1, status: 'applied', mode: 'apply', operationId: plan.id, slug: snapshot.slug, url: plan.url,
      revision: snapshot.revision, appliedAt: answer.appliedAt, replay: true, bodyPreserved: true };
  }
  const proof = await verifyBlogAnswer(plan.url, plan.id, plan.patch);
  return event(plan, { stage: proof.status === 'verified' ? 'verified' : 'verification_pending', receipt, proof,
    note: proof.status === 'verified' ? '공개 페이지에서 승인한 답변·출처·기준일·정본 URL 확인. 색인·방문 증가는 별도입니다.' : '적용 응답은 있지만 공개 페이지의 동일 버전 확인은 대기 중입니다.' });
}
export async function rollbackBlogImprovement(siteId: string, id: string, approved: boolean): Promise<ImprovementEvent> {
  if (!approved) throw new BlogBridgeError('REVIEW_REQUIRED', '이 답변 블록의 복원을 승인해야 합니다.');
  const plan = await getBlogImprovement(siteId, id), site = await db.sites.get(siteId);
  if (!site) throw new BlogBridgeError('SITE_MISSING', '사이트가 없습니다.');
  const events = await improvementEvents(siteId, id);
  if (events.some(row => row.stage === 'rolled_back')) return events.find(row => row.stage === 'rolled_back')!;
  const receipt = events.find(row => row.receipt?.mode === 'apply')?.receipt;
  if (!receipt) throw new BlogBridgeError('NO_RECEIPT', '먼저 적용 상태를 재확인하여 작업 영수증을 확보하세요.');
  const restored = await sendBlogUpdate(site.domain, plan.url, { mode: 'rollback', operationId: `rollback_${id}`,
    restoresOperationId: id, expectedRevision: receipt.revision });
  return event(plan, { stage: 'rolled_back', receipt: restored, note: '이전 답변 블록 복원 응답 수신. 기존 글 본문은 변경하지 않았습니다. 공개 캐시 확인은 별도입니다.' });
}
export interface PageOutcome { status: string; before: GscRow | null; after: GscRow | null; clickDelta: number | null; note: string }
export function comparePageOutcome(plan: BlogImprovement, receipt: BlogReceipt | undefined, after: PageBaseline | null): PageOutcome {
  const before = plan.baseline;
  const empty = (status: string): PageOutcome => ({ status, before: before?.metrics ?? null, after: after?.metrics ?? null, clickDelta: null,
    note: '페이지별 관측 변화입니다. 검색어 행 누락은 0이 아니며, 전후 차이만으로 인과효과를 입증하지 않습니다.' });
  if (!receipt || receipt.mode !== 'apply') return empty('적용 확인 전');
  if (!before || !after || !before.metrics || !after.metrics) return empty('비교 자료 부족');
  const changedDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(receipt.appliedAt));
  const duration = (p: PageBaseline) => Date.parse(p.endDate) - Date.parse(p.startDate);
  if (before.property !== after.property || before.site !== after.site || before.metrics.keys[0] !== plan.url || after.metrics.keys[0] !== plan.url || before.endDate >= changedDate || after.startDate <= changedDate || duration(before) !== duration(after)) {
    return empty('동일 길이의 변경 후 기간 대기');
  }
  return { ...empty('변경 전후 관측'), clickDelta: after.metrics.clicks - before.metrics.clicks };
}
