// Server-side data loader: stored DB evidence only. No API calls, crawls or configuration writes.
import { db } from './db';
import { sql } from './sqldb';
import { gscConfig } from './searchconsole';
import type { Site } from './types';
import { objectValue, textValue, siteUrl, newest, evidenceAge } from './coverage-model';
import type { CoverageEvidence } from './coverage-model';

export interface ConnectionCoverage {
  id: string;
  label: string;
  configuration: 'configured' | 'missing' | 'invalid';
  observation: string;
  checkedAt: string | null;
  settings: string[];
}
export interface InventoryCount { id: string; label: string; value: number | null; href: string }
export interface CoverageData {
  site: Site;
  records: CoverageEvidence[];
  inventory: InventoryCount[];
  connections: ConnectionCoverage[];
  urls: string[];
  target: string | null;
  warnings: string[];
  asOf: string;
}
const KINDS = ['verification', 'operation', 'gsc', 'content_profile', 'page_version', 'delivery', 'indexnow', 'citation', 'experiment'];

async function readEvidence(siteId: string): Promise<CoverageEvidence[]> {
  // A never-used evidence table is a legitimate empty state, not a reason to create tables on this screen.
  const exists = await sql<{ name: string | null }>("SELECT to_regclass('public.growth_evidence')::text AS name");
  if (!exists.rows[0]?.name) return [];
  const result = await sql<{
    id: string; kind: string; target: string; created_at: Date | string; payload: unknown;
  }>(`WITH latest_targets AS (
    SELECT DISTINCT ON (kind, target) id, kind, target, created_at,
      CASE
        WHEN kind='operation' THEN jsonb_build_object(
          'search', CASE WHEN jsonb_typeof(payload->'search')='object' THEN jsonb_build_object(
            'site', payload->'search'->'site', 'measuredAt', payload->'search'->'measuredAt',
            'lastObservedDate', payload->'search'->'lastObservedDate',
            'endDate', payload->'search'->'current'->'period'->'endDate',
            'totals', payload->'search'->'current'->'totals'
          ) ELSE NULL END,
          'analytics', payload->'analytics', 'errors', payload->'errors')
        WHEN kind='gsc' THEN jsonb_build_object(
          'site', payload->'site', 'measuredAt', payload->'measuredAt',
          'lastObservedDate', payload->'lastObservedDate',
          'endDate', payload->'current'->'period'->'endDate', 'totals', payload->'current'->'totals')
        WHEN kind='experiment' THEN payload - 'baseline'
        WHEN kind='page_version' THEN '{}'::jsonb
        ELSE payload
      END AS payload
    FROM growth_evidence WHERE site_id=$1 AND kind=ANY($2::text[])
    ORDER BY kind, target, created_at DESC, id DESC
  ), bounded AS (
    SELECT *, row_number() OVER (PARTITION BY kind ORDER BY created_at DESC, id DESC) AS rn
    FROM latest_targets
  ) SELECT id, kind, target, created_at, payload FROM bounded
    WHERE rn <= CASE WHEN kind='verification' THEN 100 WHEN kind IN ('operation','gsc') THEN 1 ELSE 10 END
    ORDER BY created_at DESC, id DESC`, [siteId, KINDS]);
  return result.rows.map(row => ({
    id: row.id, kind: row.kind, target: row.target, createdAt: new Date(row.created_at).toISOString(),
    payload: objectValue(row.payload),
  }));
}

async function readInventory(siteId: string): Promise<InventoryCount[]> {
  const result = await sql<Record<string, string | number>>(`SELECT
    (SELECT count(*) FROM entities WHERE site_id=$1) AS entities,
    (SELECT count(*) FROM search_opportunities WHERE site_id=$1) AS opportunities,
    (SELECT count(*) FROM fact_packs WHERE site_id=$1) AS facts,
    (SELECT count(*) FROM pages WHERE site_id=$1) AS pages,
    (SELECT count(DISTINCT page_id) FROM quality_checks WHERE site_id=$1) AS quality,
    (SELECT count(*) FROM pages WHERE site_id=$1 AND status='published') AS published,
    (SELECT count(*) FROM growth_actions WHERE site_id=$1 AND status='proposed') AS proposed,
    (SELECT count(*) FROM growth_actions WHERE site_id=$1 AND status='done') AS done`, [siteId]);
  return inventoryRows(siteId, result.rows[0] ?? {});
}
function inventoryRows(siteId: string, values: Record<string, string | number>): InventoryCount[] {
  const specs = [
    ['entities', '사업 지식·Entity', 'knowledge'], ['opportunities', '검색기회', 'opportunities'],
    ['facts', 'Fact Pack', 'opportunities'], ['pages', '등록 페이지', 'pages'],
    ['quality', '품질 검사 기록이 있는 페이지', 'pages'], ['published', 'DB의 published 상태', 'pages'],
    ['proposed', '검토 대기 개선 제안', 'growth'], ['done', 'DB의 done 제안', 'growth'],
  ];
  return specs.map(([id, label, tab]) => {
    const value = values[id] === undefined ? null : Number(values[id]);
    return { id, label, value: value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null,
      href: `/sites/${encodeURIComponent(siteId)}/${tab}` };
  });
}
function configuration(check: () => boolean): ConnectionCoverage['configuration'] {
  try { return check() ? 'configured' : 'missing'; } catch { return 'invalid'; }
}
function mappedSetting(name: string, host: string): Record<string, unknown> {
  const raw = process.env[name];
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings mapping');
  return objectValue(objectValue(value)[host]);
}
function connections(site: Site, records: CoverageEvidence[], now: Date): ConnectionCoverage[] {
  const root = new URL(site.domain);
  const operation = newest(records, 'operation');
  const imported = newest(records, 'gsc');
  const opSearch = objectValue(operation?.payload.search);
  const choices = [
    ...(textValue(opSearch.site) && siteUrl(textValue(opSearch.site), site.domain) ? [{ payload: opSearch, date: operation!.createdAt }] : []),
    ...(imported && siteUrl(textValue(imported.payload.site), site.domain) ? [{ payload: imported.payload, date: imported.createdAt }] : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const search = choices[0];
  const analytics = objectValue(operation?.payload.analytics);
  const errorList = Array.isArray(operation?.payload.errors) ? operation.payload.errors.filter((item): item is string => typeof item === 'string') : [];
  const gscError = errorList.some(item => item.startsWith('GSC'));
  const gaError = errorList.some(item => item.startsWith('GA4'));
  const observedDate = textValue(search?.payload.lastObservedDate);
  const age = evidenceAge(observedDate, now);
  const searchObservation = gscError ? '최근 실행에서 GSC 연결/수집 문제 기록'
    : !search ? '성공한 수집 증거 없음'
    : !observedDate ? '응답 기록 있음 · 관측 날짜 없음'
    : age === 'stale' ? `자료 기준 ${observedDate} · 오래된 관측`
    : age === 'unknown' ? '관측 날짜 확인 필요' : `자료 기준 ${observedDate} · 수집 기록 있음`;
  const recentAnalytics = operation ? evidenceAge(operation.createdAt, now) : 'unknown';
  return [
    { id: 'gsc', label: 'Google Search Console',
      configuration: configuration(() => !!gscConfig(site)),
      observation: searchObservation, checkedAt: search?.date ?? null,
      settings: ['SGO_GSC_CLIENT_EMAIL', 'SGO_GSC_PRIVATE_KEY', 'SGO_GSC_SITES / SGO_GSC_SITE'] },
    { id: 'ga4', label: 'GA4 검색 유입·문의 이벤트',
      configuration: configuration(() => /^\d+$/.test(textValue(mappedSetting('SGO_ANALYTICS_SITES', root.hostname).propertyId)) &&
        !!process.env.SGO_GSC_CLIENT_EMAIL && !!process.env.SGO_GSC_PRIVATE_KEY),
      observation: gaError ? '최근 실행에서 GA4 수집 문제 기록'
        : !textValue(analytics.status) || analytics.status === 'not_configured' ? '성공한 수집 증거 없음'
        : recentAnalytics !== 'fresh' ? '이전 응답 기록 · 최신성 확인 필요'
        : analytics.status === 'observed' ? '수집 기록 있음 · 이벤트는 유효 상담 건수와 다름'
        : analytics.status === 'limited' ? '응답 있음 · 샘플링/임계값 제한'
        : '응답 있음 · 관측 행 없음',
      checkedAt: textValue(analytics.status) ? operation?.createdAt ?? null : null,
      settings: ['SGO_ANALYTICS_SITES (propertyId, leadEvent)'] },
    { id: 'publish', label: '대상 사이트 게시 수신 API',
      configuration: configuration(() => {
        const value = process.env.SGO_PUBLISH_ENDPOINT;
        if (!value || !process.env.SGO_PUBLISH_SECRET) return false;
        const destination = new URL(value);
        if (destination.origin !== root.origin || destination.protocol !== 'https:' || destination.username || destination.password) throw new Error('Wrong publish scope');
        return true;
      }),
      observation: '설정 존재 여부만 읽음 · 수신 API 동작과 실제 게시는 아래 발행 증거에서 확인', checkedAt: null,
      settings: ['SGO_PUBLISH_ENDPOINT', 'SGO_PUBLISH_SECRET'] },
    { id: 'indexnow', label: 'IndexNow 공개 키·제출',
      configuration: configuration(() => {
        const setting = mappedSetting('SGO_INDEXNOW_SITES', root.hostname);
        const key = textValue(setting.key);
        if (!key) return false;
        if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('Invalid public key');
        const location = new URL(textValue(setting.keyLocation) || `/${key}.txt`, root);
        if (location.origin !== root.origin || location.username || location.password) throw new Error('Wrong key scope');
        return true;
      }),
      observation: '공개 키 파일은 이 화면에서 요청하지 않음 · 제출 접수와 실제 색인은 별도', checkedAt: null,
      settings: ['SGO_INDEXNOW_SITES'] },
  ];
}

export async function loadCoverageData(siteId: string, requestedTarget?: string): Promise<CoverageData | null> {
  const site = await db.sites.get(siteId);
  if (!site) return null;
  const warnings: string[] = [];
  const [evidenceResult, inventoryResult] = await Promise.allSettled([readEvidence(siteId), readInventory(siteId)]);
  const records = evidenceResult.status === 'fulfilled' ? evidenceResult.value : [];
  if (evidenceResult.status === 'rejected') warnings.push('저장된 적용 근거 조회에 실패했습니다. 미확인을 적용 안 됨 또는 0으로 해석하지 마세요.');
  if (inventoryResult.status === 'rejected') warnings.push('운영 단계별 집계에 실패했습니다. 건수는 미확인으로 표시합니다.');
  const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : inventoryRows(siteId, {});
  const urls = [...new Set(records.filter(record => record.kind === 'verification')
    .map(record => textValue(record.payload.url)).filter(Boolean)
    .map(url => siteUrl(url, site.domain)).filter((url): url is string => url !== null))];
  let target = urls[0] ?? null;
  if (requestedTarget) {
    const requested = siteUrl(requestedTarget, site.domain);
    if (requested && urls.includes(requested)) target = requested;
    else { target = null; warnings.push('선택한 URL의 저장된 근거가 없습니다. 다른 URL의 검사 결과로 대체하지 않았습니다.'); }
  }
  const now = new Date();
  return { site, records, inventory, connections: connections(site, records, now), urls, target, warnings, asOf: now.toISOString() };
}
