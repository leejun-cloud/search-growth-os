import 'server-only';
import { sql } from './sqldb';
import { listEvidence } from './growth-store';
import { gscConfig } from './searchconsole';
import type { Site } from './types';

export interface CoverageUrlRow {
  url: string;
  page_id: string | null;
  page_title: string | null;
  page_status: string | null;
  evidence_id: string | null;
  checked_at: string | null;
  report: unknown;
}
export interface EvidenceCount { kind: string; count: number; latest_at: string }
export interface ConnectionInfo { name: string; state: 'configured' | 'missing' | 'invalid'; detail: string }
export interface CoverageData {
  rows: CoverageUrlRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  evidence: EvidenceCount[];
  connections: ConnectionInfo[];
  recent: Array<{ kind: string; target: string; created_at: string; stage: string | null }>;
}

function objectMap(raw: string | undefined, host: string): Record<string, unknown> | null {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid settings map');
  const entry = (parsed as Record<string, unknown>)[host];
  if (entry === undefined) return null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid site settings');
  return entry as Record<string, unknown>;
}

// Return configuration states only. No private key, token, shared secret or raw config reaches JSX.
export function coverageConnections(site: Site): ConnectionInfo[] {
  const host = new URL(site.domain).hostname;
  const result: ConnectionInfo[] = [];
  try {
    const configured = Boolean(gscConfig(site));
    result.push({ name: 'Google Search Console', state: configured ? 'configured' : 'missing', detail: configured ? '사이트 범위 설정 있음. 현재 접근 권한·수집 성공은 실행 결과로 확인하세요.' : '서비스 계정 또는 사이트 범위 설정이 필요합니다.' });
  } catch { result.push({ name: 'Google Search Console', state: 'invalid', detail: '사이트 범위 또는 설정 형식을 확인하세요.' }); }
  try {
    const config = objectMap(process.env.SGO_ANALYTICS_SITES, host);
    const valid = typeof config?.propertyId === 'string' && /^\d+$/.test(config.propertyId);
    result.push({ name: 'GA4·문의 이벤트', state: !config ? 'missing' : valid ? 'configured' : 'invalid', detail: valid ? `사이트별 속성 설정 있음 · 문의 이벤트 ${typeof config?.leadEvent === 'string' && config.leadEvent.trim() ? '지정됨' : '미지정'}. 실제 수집은 별도 확인입니다.` : '해당 호스트의 GA4 숫자 속성 ID를 설정하세요.' });
  } catch { result.push({ name: 'GA4·문의 이벤트', state: 'invalid', detail: '사이트별 GA4 설정 형식을 확인하세요.' }); }
  try {
    const config = objectMap(process.env.SGO_INDEXNOW_SITES, host);
    const valid = typeof config?.key === 'string' && config.key.length > 0 && typeof config.keyLocation === 'string' && new URL(config.keyLocation).origin === new URL(site.domain).origin;
    result.push({ name: 'IndexNow', state: !config ? 'missing' : valid ? 'configured' : 'invalid', detail: valid ? '사이트별 키 설정 있음. 공개 키 파일 검증·제출 접수는 실행 시 확인합니다.' : '사이트별 키와 해당 사이트의 공개 키 파일 URL이 필요합니다.' });
  } catch { result.push({ name: 'IndexNow', state: 'invalid', detail: '키 위치 또는 사이트별 설정 형식을 확인하세요.' }); }
  try {
    const endpoint = process.env.SGO_PUBLISH_ENDPOINT;
    const url = endpoint ? new URL(endpoint) : null;
    const valid = url?.origin === new URL(site.domain).origin && url?.protocol === 'https:' && !url.username && !url.password && Boolean(process.env.SGO_PUBLISH_SECRET);
    result.push({ name: '외부 사이트 게시 API', state: !endpoint ? 'missing' : valid ? 'configured' : 'invalid', detail: valid ? '발행 대상·시크릿 설정 있음. API 수락·공개 본문 확인은 게시 이력을 확인하세요.' : '미연결 시 로컬 파일 내보내기만 가능합니다. 외부 배포 완료가 아닙니다.' });
  } catch { result.push({ name: '외부 사이트 게시 API', state: 'invalid', detail: '선택한 사이트의 HTTPS 게시 엔드포인트를 확인하세요.' }); }
  return result;
}

const INVENTORY = [
  ['knowledge', 'business_profiles'], ['entities', 'entities'], ['relations', 'entity_relations'],
  ['opportunities', 'search_opportunities'], ['facts', 'fact_packs'], ['pages', 'pages'],
  ['quality', 'quality_checks'], ['growth', 'growth_actions'],
] as const;

/** Pages + all saved verification targets; pagination never silently drops older URLs. */
export async function loadAreaCoverage(site: Site, requestedPage: number, query = ''): Promise<CoverageData> {
  // Reuse the existing additive evidence-table initialization, without writing any evidence record.
  await listEvidence(site.id, 'verification', 1);
  const base = `WITH registered AS (
    SELECT id, title, status, COALESCE(NULLIF(canonical_url,''), $2::text || '/' || ltrim(slug,'/')) AS url
    FROM pages WHERE site_id=$1
  ), urls AS (
    SELECT url FROM registered
    UNION SELECT target FROM growth_evidence WHERE site_id=$1 AND kind='verification'
  ), scoped AS (
    SELECT url FROM urls WHERE strpos(lower(url),lower($3::text))>0
  )`;
  const params = [site.id, site.domain.replace(/\/$/, ''), query.slice(0, 240)];
  const countQuery = sql<{ total: number; known: number; inspected: number }>(`${base}
    SELECT (SELECT count(*) FROM scoped)::int AS total,
      (SELECT count(*) FROM urls)::int AS known,
      (SELECT count(DISTINCT target) FROM growth_evidence WHERE site_id=$1 AND kind='verification')::int AS inspected`, params);
  const statsQuery = sql<{ key: string; count: number }>(INVENTORY.map(([key, table]) => `SELECT '${key}' AS key, count(*)::int AS count FROM ${table} WHERE site_id=$1`).join(' UNION ALL '), [site.id]);
  const evidenceQuery = sql<EvidenceCount>(`SELECT kind,count(*)::int AS count,max(created_at)::text AS latest_at
    FROM growth_evidence WHERE site_id=$1 GROUP BY kind ORDER BY kind`, [site.id]);
  const recentQuery = sql<CoverageData['recent'][number]>(`SELECT kind,target,created_at::text,
    CASE WHEN kind='delivery' THEN payload->>'stage' WHEN kind='indexnow' THEN payload->>'status' ELSE NULL END AS stage
    FROM growth_evidence WHERE site_id=$1 AND kind IN ('delivery','indexnow','content_profile','citation','experiment','operation')
    ORDER BY created_at DESC,id DESC LIMIT 15`, [site.id]);
  const [summary, stats, evidence, recent] = await Promise.all([countQuery, statsQuery, evidenceQuery, recentQuery]);
  const total = summary.rows[0]?.total ?? 0;
  const pageSize = 10;
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), Math.max(1, Math.ceil(total / pageSize)));
  const records = await sql<CoverageUrlRow>(`${base}
    SELECT s.url, p.id AS page_id, p.title AS page_title, p.status AS page_status,
      e.id AS evidence_id, e.created_at::text AS checked_at, e.payload AS report
    FROM scoped s
    LEFT JOIN LATERAL (SELECT id,title,status FROM registered WHERE url=s.url ORDER BY id LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT id,created_at,payload FROM growth_evidence
      WHERE site_id=$1 AND kind='verification' AND target=s.url
      ORDER BY created_at DESC,id DESC LIMIT 1) e ON true
    ORDER BY s.url LIMIT $4 OFFSET $5`, [...params, pageSize, (page - 1) * pageSize]);
  return { rows: records.rows, total, page, pageSize,
    counts: { ...Object.fromEntries(stats.rows.map(row => [row.key, row.count])), known: summary.rows[0]?.known ?? 0, inspected: summary.rows[0]?.inspected ?? 0 },
    evidence: evidence.rows, recent: recent.rows, connections: coverageConnections(site) };
}
