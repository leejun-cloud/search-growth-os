import type { LiveReport } from './live-verification';

export const COVERAGE_LANES = ['SEO', 'AEO', 'GEO', 'LLMO', 'NEO'] as const;
export type CoverageLane = (typeof COVERAGE_LANES)[number];
export type Implementation = 'implemented' | 'partial' | 'not_implemented' | 'not_observable';
export type ObservationState = 'pass' | 'warn' | 'fail' | 'unknown' | 'unmeasured' | 'stale' | 'unavailable';
export interface Capability {
  id: string;
  lane: CoverageLane;
  title: string;
  implementation: Implementation;
  mode: 'on_demand' | 'operator' | 'unavailable';
  checkCodes: string[];
  source: string | null;
  description: string;
  limitation: string;
}

// This is a versioned inventory of real code paths, not a search-engine ranking checklist.
// Never change an entry to implemented without adding its implementation and evidence contract.
export const CAPABILITIES: Capability[] = [
  { id: 'html', lane: 'SEO', title: '공개 HTML·서버 본문', implementation: 'implemented', mode: 'on_demand', checkCodes: ['http', 'content_type', 'ssr_body'], source: 'src/lib/live-verification.ts', description: '실제 URL의 HTTP 응답과 초기 HTML 본문을 검사합니다.', limitation: '본문 존재 확인이지 콘텐츠 품질·색인 성공 판정은 아닙니다.' },
  { id: 'headings', lane: 'SEO', title: '제목·H1·메타 설명', implementation: 'implemented', mode: 'on_demand', checkCodes: ['title', 'h1', 'description'], source: 'src/lib/live-verification.ts', description: '공개 페이지에서 title, H1, 설명을 읽습니다.', limitation: '검색 클릭률 개선은 GSC 자료로 별도 관찰해야 합니다.' },
  { id: 'canonical', lane: 'SEO', title: '정본 URL·검색 허용', implementation: 'implemented', mode: 'on_demand', checkCodes: ['canonical', 'index_directive', 'robots_Googlebot'], source: 'src/lib/live-verification.ts', description: 'canonical, noindex, Googlebot robots 규칙을 검사합니다.', limitation: 'CDN/WAF 통과와 실제 검색엔진 색인은 확인하지 않습니다.' },
  { id: 'sitemap', lane: 'SEO', title: '사이트맵 포함 여부', implementation: 'implemented', mode: 'on_demand', checkCodes: ['sitemap_discovery'], source: 'src/lib/live-verification.ts', description: '공개 사이트맵에서 검사 URL을 찾습니다.', limitation: '현재 검사기는 사이트맵 5개까지 읽습니다. 한도 초과는 확인 불가입니다.' },
  { id: 'schema', lane: 'SEO', title: '구조화 데이터 문법', implementation: 'implemented', mode: 'on_demand', checkCodes: ['structured_data'], source: 'src/lib/live-verification.ts', description: '페이지 JSON-LD의 존재와 JSON 문법을 확인합니다.', limitation: '스키마 의미 검증·리치 결과 노출까지 보장하지 않습니다.' },
  { id: 'gsc', lane: 'SEO', title: '실제 검색 노출·클릭', implementation: 'implemented', mode: 'on_demand', checkCodes: [], source: 'src/lib/searchconsole.ts', description: 'GSC의 확정 기간, 검색어, 페이지, 검색어×페이지를 수집합니다.', limitation: '서버 자격증명과 해당 속성 읽기 권한이 필요합니다. 연결 현황은 아래에서 확인합니다.' },
  { id: 'index', lane: 'SEO', title: '검색엔진 실제 색인 판정', implementation: 'not_implemented', mode: 'unavailable', checkCodes: [], source: null, description: 'URL Inspection 결과를 연결하는 작업이 남아 있습니다.', limitation: '사이트맵 포함·HTTP 200·노출 행 누락을 색인 판정으로 사용하지 않습니다.' },
  { id: 'answer', lane: 'AEO', title: '첫 문단 직답 표시', implementation: 'implemented', mode: 'on_demand', checkCodes: ['direct_answer'], source: 'src/lib/live-verification.ts', description: '명시된 직답 요소 또는 기대한 답변이 실제 HTML에 표시되는지 확인합니다.', limitation: '일반 첫 문단은 후보로만 표시합니다. 답변의 정확성은 별도 검토입니다.' },
  { id: 'answer-edit', lane: 'AEO', title: '직답 편집·원본 보관', implementation: 'implemented', mode: 'operator', checkCodes: [], source: 'src/app/sites/[siteId]/operations/actions.ts', description: '직답·자료 기준일·검토자를 저장하고 미리보기에서 확인합니다.', limitation: '엔진 콘텐츠 수정과 외부 운영 사이트 배포는 서로 다른 단계입니다.' },
  { id: 'faq', lane: 'AEO', title: 'FAQ 표시·JSON-LD 일치', implementation: 'partial', mode: 'operator', checkCodes: [], source: 'src/app/p/[siteId]/[...slug]/page.tsx', description: '엔진 페이지에는 FAQ와 구조화 데이터를 렌더링합니다.', limitation: '외부 페이지의 가시 FAQ와 JSON-LD 일치 자동 검사는 아직 없습니다.' },
  { id: 'answer-placement', lane: 'AEO', title: '검색 답변 영역 채택', implementation: 'not_implemented', mode: 'unavailable', checkCodes: [], source: null, description: '검색 답변 영역에서 실제 채택됐는지 자동 수집하는 기능은 없습니다.', limitation: '직답 표시 확인을 AI 답변 노출 성과로 바꾸지 않습니다.' },
  { id: 'sources', lane: 'GEO', title: '원출처 링크 표시', implementation: 'implemented', mode: 'on_demand', checkCodes: ['source_links'], source: 'src/lib/live-verification.ts', description: '출처로 명시된 외부 HTTP(S) 링크를 구분합니다.', limitation: '링크가 주장을 실제로 뒷받침하는지는 검토자가 확인해야 합니다.' },
  { id: 'asof', lane: 'GEO', title: '자료 기준일 표시', implementation: 'implemented', mode: 'on_demand', checkCodes: ['data_date'], source: 'src/lib/live-verification.ts', description: 'data-asof에 표시된 자료 기준일을 확인합니다.', limitation: '게시일과 자료 기준일은 다릅니다. 데이터 최신성을 자동 보증하지 않습니다.' },
  { id: 'ai-bots', lane: 'GEO', title: 'AI 검색봇 robots 정책', implementation: 'implemented', mode: 'on_demand', checkCodes: ['robots_OAI-SearchBot', 'robots_PerplexityBot'], source: 'src/lib/live-verification.ts', description: 'OAI-SearchBot·PerplexityBot에 적용되는 robots 규칙을 확인합니다.', limitation: '실제 봇 방문 로그나 AI 인용 발생을 의미하지 않습니다.' },
  { id: 'citation', lane: 'GEO', title: 'AI 인용·언급 증거 기록', implementation: 'implemented', mode: 'operator', checkCodes: [], source: 'src/lib/growth-operations.ts', description: '질문·엔진·답변 발췌·증거 URL·관측 시각을 보관합니다.', limitation: '운영자가 입력한 관측 기록입니다. 자동 다중엔진 검색 기능은 아닙니다.' },
  { id: 'auto-citation', lane: 'GEO', title: '다중엔진 인용 자동 추적', implementation: 'not_implemented', mode: 'unavailable', checkCodes: [], source: null, description: '같은 질문을 여러 검색 엔진에 보내 자동 비교하는 기능이 남아 있습니다.', limitation: '수동 기록의 수를 자동 측정 횟수로 표시하지 않습니다.' },
  { id: 'entity', lane: 'LLMO', title: '브랜드·서비스 지식 연결', implementation: 'partial', mode: 'operator', checkCodes: [], source: 'src/lib/knowledge.ts', description: '엔진 내부의 사업 지식과 Entity Graph는 구축되어 있습니다.', limitation: '외부 웹의 브랜드 일관성 검사나 모델 내부 학습 확인은 아닙니다.' },
  { id: 'identity', lane: 'LLMO', title: '공식 채널·동일 주체 검증', implementation: 'not_implemented', mode: 'unavailable', checkCodes: [], source: null, description: '공식 프로필·sameAs·조직 식별자의 교차 검증 기능이 남아 있습니다.', limitation: 'JSON-LD 존재만으로 동일 브랜드 검증을 완료 처리하지 않습니다.' },
  { id: 'training', lane: 'LLMO', title: '모델 내부 학습·기억 여부', implementation: 'not_observable', mode: 'unavailable', checkCodes: [], source: null, description: '현재 시스템이 직접 확인할 수 없는 영역입니다.', limitation: '학습 완료율이나 브랜드 기억 점수를 만들어 표시하지 않습니다.' },
  { id: 'yeti', lane: 'NEO', title: '네이버 Yeti robots 정책', implementation: 'implemented', mode: 'on_demand', checkCodes: ['robots_Yeti'], source: 'src/lib/live-verification.ts', description: 'Yeti에 적용되는 공개 robots 규칙을 검사합니다.', limitation: '네이버 수집·색인·상위 노출 완료와는 다릅니다.' },
  { id: 'indexnow', lane: 'NEO', title: 'IndexNow URL 제출', implementation: 'implemented', mode: 'operator', checkCodes: [], source: 'src/lib/indexnow.ts', description: '공개 키와 URL을 확인한 뒤 운영자가 제출합니다.', limitation: '접수와 실제 색인은 다릅니다. 제출 이력을 따로 표시합니다.' },
  { id: 'rss', lane: 'NEO', title: 'RSS 생성·공개 배포', implementation: 'partial', mode: 'operator', checkCodes: [], source: 'src/lib/publish.ts', description: '엔진이 RSS 파일을 내보내고 기존 진단기가 피드 존재를 검사합니다.', limitation: '외부 사이트 RSS 설치와 네이버 제출을 자동 완료하지 않습니다.' },
  { id: 'search-advisor', lane: 'NEO', title: '서치어드바이저 성과 연결', implementation: 'not_implemented', mode: 'unavailable', checkCodes: [], source: null, description: '네이버 전용 성과 수집·권한 확인 화면은 아직 없습니다.', limitation: 'Google 검색 데이터를 네이버 성과로 대신 표시하지 않습니다.' },
  { id: 'naver-ai', lane: 'NEO', title: '네이버 AI 답변 인용', implementation: 'partial', mode: 'operator', checkCodes: [], source: 'src/lib/growth-operations.ts', description: '공통 인용 기록 양식에 실제 관측한 네이버 답변을 보관할 수 있습니다.', limitation: '네이버 답변의 자동 수집과 전용 인용률 집계는 미구현입니다.' },
];

export const IMPLEMENTATION_LABEL: Record<Implementation, string> = {
  implemented: '구현됨', partial: '부분 구현', not_implemented: '미구현', not_observable: '직접 확인 불가',
};
export const OBSERVATION_LABEL: Record<ObservationState, string> = {
  pass: '검사 확인', warn: '보강 필요', fail: '차단 발견', unknown: '확인 불가',
  unmeasured: '미검사', stale: '재확인 필요', unavailable: '자동 검사 없음',
};
export const FRESHNESS_DAYS = 7;

export function safeSiteUrl(value: string, domain: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== new URL(domain).origin) return null;
    return url.href;
  } catch { return null; }
}

export function observationState(report: LiveReport | null, codes: readonly string[], now = new Date()): ObservationState {
  if (!codes.length) return 'unavailable';
  if (!report) return 'unmeasured';
  const checked = Date.parse(report.checkedAt);
  if (!Number.isFinite(checked) || checked > now.getTime() + 300_000) return 'unknown';
  if (now.getTime() - checked > FRESHNESS_DAYS * 86_400_000) return 'stale';
  const checks = codes.map(code => report.checks.find(check => check.code === code));
  if (checks.some(check => check?.status === 'fail')) return 'fail';
  if (checks.some(check => !check || check.status === 'unknown')) return 'unknown';
  if (checks.some(check => check?.status === 'warn')) return 'warn';
  return checks.every(check => check?.status === 'pass') ? 'pass' : 'unknown';
}

export function laneState(report: LiveReport | null, lane: CoverageLane, now = new Date()): ObservationState {
  return observationState(report, CAPABILITIES.filter(item => item.lane === lane).flatMap(item => item.checkCodes), now);
}

/** Evidence is not trusted just because a JSONB row exists. Invalid rows remain visible as unknown. */
export function readableReport(value: unknown, expectedUrl: string, domain: string): LiveReport | null {
  if (!value || typeof value !== 'object') return null;
  const report = value as Partial<LiveReport>;
  if (typeof report.url !== 'string' || !safeSiteUrl(report.url, domain) || report.url !== expectedUrl || typeof report.checkedAt !== 'string' || !Array.isArray(report.checks)) return null;
  if (report.checks.some(check => !check || typeof check.code !== 'string' || typeof check.detail !== 'string' || typeof check.remedy !== 'string' || !['pass', 'warn', 'fail', 'unknown'].includes(check.status))) return null;
  return report as LiveReport;
}

export function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000) : 1;
}
