// Pure presentation model. Source implementation, stored observations and outcomes are separate.
// This module never crawls, publishes, calls an AI provider or changes existing evidence.
export type CoverageArea = 'SEO' | 'AEO' | 'GEO' | 'LLMO' | 'NEO';
export type Capability = 'implemented' | 'partial' | 'manual' | 'not_implemented' | 'not_verifiable';
export type ApplicationState = 'confirmed' | 'recorded' | 'attention' | 'blocked' | 'unmeasured' | 'stale' | 'unsupported';
export interface CoverageEvidence {
  id: string;
  kind: string;
  target: string;
  createdAt: string;
  payload: Record<string, unknown>;
}
export interface CoverageItem {
  id: string;
  label: string;
  capability: Capability;
  state: ApplicationState;
  detail: string;
  nextStep: string;
  checkedAt: string | null;
  evidenceId: string | null;
  sourcePath: string;
}
export interface AreaCoverage {
  id: CoverageArea;
  description: string;
  items: CoverageItem[];
  confirmed: number;
  missing: number;
}
export const CAPABILITY_LABELS: Record<Capability, string> = {
  implemented: '구현됨', partial: '일부 구현', manual: '수동 기록',
  not_implemented: '미구현', not_verifiable: '직접 판정 불가',
};
export const APPLICATION_LABELS: Record<ApplicationState, string> = {
  confirmed: '검사 확인', recorded: '기록 있음', attention: '보강 필요',
  blocked: '차단 발견', unmeasured: '미확인', stale: '오래된 근거', unsupported: '지원 안 함',
};
export const AREA_DESCRIPTIONS: Record<CoverageArea, string> = {
  SEO: '검색엔진이 실제 페이지를 읽을 수 있는지',
  AEO: '질문에 대한 직답이 실제 본문에 표시되는지',
  GEO: '원출처·기준일·AI 검색 접근 근거가 있는지',
  LLMO: '브랜드 일관성과 모델 관련 측정의 구현 범위',
  NEO: '네이버 접근·제출·검색 성과가 어디까지 연결됐는지',
};
export function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function siteUrl(value: string, domain: string): string | null {
  try {
    const base = new URL(domain), url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export function evidenceAge(value: unknown, now: Date, maxDays = 7): 'fresh' | 'stale' | 'unknown' {
  if (typeof value !== 'string') return 'unknown';
  const time = Date.parse(value), age = now.getTime() - time;
  if (!Number.isFinite(time) || !Number.isFinite(age) || age < -300_000) return 'unknown';
  return age > maxDays * 86_400_000 ? 'stale' : 'fresh';
}
export function newest(records: CoverageEvidence[], kind: string, target?: string): CoverageEvidence | null {
  return records.filter(record => record.kind === kind && (target === undefined || record.target === target))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
}
function observedState(state: ApplicationState, date: unknown, now: Date): ApplicationState {
  if (state === 'unmeasured' || state === 'unsupported') return state;
  const age = evidenceAge(date, now);
  return age === 'unknown' ? 'unmeasured' : age === 'stale' ? 'stale' : state;
}
type CheckSpec = readonly [CoverageArea, string, string];
const CHECKS: CheckSpec[] = [
  ['SEO', 'http', '公開 URL 응답'], ['SEO', 'content_type', '실제 HTML 응답'],
  ['SEO', 'ssr_body', '초기 HTML 본문'], ['SEO', 'title', '페이지 제목'],
  ['SEO', 'h1', '본문 H1'], ['SEO', 'canonical', '정본 URL'],
  ['SEO', 'index_directive', 'noindex 차단 여부'], ['SEO', 'description', '검색 설명'],
  ['SEO', 'structured_data', 'JSON-LD 구문'], ['SEO', 'robots_Googlebot', 'Googlebot robots 정책'],
  ['SEO', 'sitemap_discovery', '사이트맵 URL 포함'],
  ['AEO', 'direct_answer', '직답 표시'],
  ['GEO', 'source_links', '출처 링크 표시'], ['GEO', 'data_date', '자료 기준일 표시'],
  ['GEO', 'robots_OAI-SearchBot', 'OAI-SearchBot robots 정책'],
  ['GEO', 'robots_PerplexityBot', 'PerplexityBot robots 정책'],
  ['NEO', 'robots_Yeti', '네이버 Yeti robots 정책'],
];
function unavailable(id: string, label: string, detail: string, nextStep: string, sourcePath: string,
  capability: Capability = 'not_implemented'): CoverageItem {
  return { id, label, capability, state: 'unsupported', detail, nextStep, checkedAt: null, evidenceId: null, sourcePath };
}
export function buildAreaCoverage(domain: string, target: string | null, records: CoverageEvidence[], now = new Date()): AreaCoverage[] {
  const report = records.filter(record => record.kind === 'verification' && target !== null &&
    siteUrl(textValue(record.payload.url), domain) === target && !!textValue(record.payload.url))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
  const rawChecks = Array.isArray(report?.payload.checks) ? report.payload.checks.map(objectValue) : [];
  const checkedAt = textValue(report?.payload.checkedAt) || null;
  const all = (['SEO', 'AEO', 'GEO', 'LLMO', 'NEO'] as CoverageArea[]).map(id => {
    const items = CHECKS.filter(spec => spec[0] === id).map(([, code, label]): CoverageItem => {
      const check = rawChecks.find(item => item.code === code && item.lane === id);
      const state: ApplicationState = check?.status === 'pass' ? 'confirmed' : check?.status === 'warn' ? 'attention'
        : check?.status === 'fail' ? 'blocked' : 'unmeasured';
      return {
        id: code, label, capability: 'implemented', state: observedState(state, checkedAt, now),
        detail: textValue(check?.detail) || '선택한 URL의 저장된 검사 근거가 없습니다. 소스 구현만으로 적용 완료를 표시하지 않습니다.',
        nextStep: textValue(check?.remedy) || '성과 검증 탭에서 이 URL을 명시적으로 검사하세요.',
        checkedAt, evidenceId: report?.id ?? null, sourcePath: 'src/lib/live-verification.ts',
      };
    });
    return { id, description: AREA_DESCRIPTIONS[id], items, confirmed: 0, missing: 0 };
  });
  const area = (id: CoverageArea) => all.find(item => item.id === id)!;
  area('SEO').items.push(unavailable('google_index', 'Google 실제 색인 판정',
    '사이트맵 포함·HTTP 200·검색 노출은 URL Inspection의 현재 색인 판정과 다릅니다.',
    'URL Inspection 결과를 저장하는 수집기를 연결해야 합니다.', 'src/lib/live-verification.ts'));
  area('AEO').items.push(unavailable('answer_semantics', '답변의 의미·사실 일치 자동 검증',
    '현재 검사는 직답의 표시를 확인합니다. 질문에 정확히 답하는지까지 자동 판정하지 않습니다.',
    '질문·주장·출처를 비교하는 평가기를 추가하기 전에는 사람이 검토하세요.', 'src/lib/live-verification.ts'));
  area('GEO').items.push(unavailable('ai_search_automatic', '다중 AI 검색 인용 자동 수집',
    '현재 AI 인용 기능은 운영자가 실제 답변 증거를 입력하는 방식입니다.',
    '공식 검색 API 수집기·원본 응답 저장·실패 구분을 별도로 구현해야 합니다.', 'src/lib/growth-operations.ts'));
  area('LLMO').items.push(
    unavailable('brand_consistency', '공식 브랜드·채널 일관성 자동 점검',
      '전역 브랜드 그래프와 외부 공식 채널을 대조하는 자동 점검기는 아직 없습니다.',
      '공식 브랜드·별칭·채널 목록을 기준으로 교차 검증을 추가하세요.', 'src/lib/seo.ts'),
    unavailable('model_benchmark', '고정 질문별 브랜드 응답 비교',
      '모델·질문·반복 횟수를 고정한 응답 비교 수집기는 아직 없습니다.',
      '검색 사용 여부와 모델 버전을 구분하는 관측 설계를 먼저 정의하세요.', 'src/lib/growth-operations.ts'),
    unavailable('training_membership', '모델 내부 학습 포함 여부',
      '브랜드가 답변에 나온다는 사실만으로 학습 데이터 포함 여부를 증명할 수 없습니다.',
      '학습 여부 점수 대신 실제 응답과 출처의 관측 결과만 사용하세요.', 'src/lib/growth-operations.ts', 'not_verifiable'),
  );
  area('NEO').items.push(unavailable('naver_performance', '네이버 노출·클릭 수집',
    '현재 수집기는 GSC와 GA4입니다. 네이버 검색 성과 수집 연결을 확인할 수 없습니다.',
    '네이버 성과 수집·파일 가져오기와 명확한 집계 기간을 구현해야 합니다.', 'src/lib/searchconsole.ts'));
  return all.map(item => ({ ...item, confirmed: item.items.filter(row => row.state === 'confirmed').length,
    missing: item.items.filter(row => row.capability === 'not_implemented' || row.capability === 'not_verifiable').length }));
}
export function buildWorkflowCoverage(records: CoverageEvidence[], now = new Date()): CoverageItem[] {
  const specs = [
    ['content_profile', '직답·출처·기준일 저장', 'implemented', 'src/app/sites/[siteId]/operations/actions.ts', '저장은 외부 게시와 다릅니다. 페이지 선택 후 콘텐츠 반영 기능을 사용하세요.'],
    ['page_version', '수정 전 원본 보관', 'implemented', 'src/app/sites/[siteId]/operations/actions.ts', '원본 보관은 구현됐지만 복원 실행 UI는 별도입니다.'],
    ['delivery', '발행·내보내기 결과', 'implemented', 'src/lib/publish.ts', '게시 수신 API와 인증을 연결하고 실제 URL에서 수정된 본문을 확인하세요.'],
    ['indexnow', 'IndexNow 제출 결과', 'implemented', 'src/lib/indexnow.ts', '검사 URL과 공개 키를 확인한 후 명시적으로 제출하세요. 접수는 색인 완료가 아닙니다.'],
    ['citation', 'AI 인용 증거 보관', 'manual', 'src/lib/growth-operations.ts', '실제 질문·엔진·답변 발췌·증거 URL을 기록하세요. 미관측은 인용 0이 아닙니다.'],
    ['experiment', '변경 기준선·전후 관찰', 'implemented', 'src/lib/growth-operations.ts', '변경 증거와 기준선을 연결하세요. 기록 수와 개선 성공 횟수는 다릅니다.'],
  ] as const;
  const items = specs.map(([kind, label, capability, sourcePath, nextStep]): CoverageItem => {
    const record = newest(records, kind);
    const payload = record?.payload ?? {};
    const at = kind === 'citation' ? textValue(payload.observedAt) : record?.createdAt ?? '';
    let state: ApplicationState = record ? 'recorded' : 'unmeasured';
    let detail = record ? `저장 기록: ${record.target}` : '이 사이트의 저장 기록이 없습니다.';
    if (record && kind === 'delivery') {
      const stage = textValue(payload.stage);
      state = stage === 'verified' ? 'confirmed' : stage === 'blocked' ? 'blocked' : stage === 'unverified' ? 'attention' : 'recorded';
      detail = `${stage || '상태 미상'}: ${textValue(payload.message) || '발행 결과 상세 없음'}`;
    } else if (record && kind === 'indexnow') {
      detail = textValue(payload.detail) || '제출 기록 있음. 실제 색인은 별도입니다.';
    } else if (record && kind === 'citation') {
      detail = `${textValue(payload.engine)} · ${textValue(payload.result)} · 운영자 관측 기록 (자동 검증 아님)`;
    }
    return { id: kind, label, capability, state: observedState(state, at, now), detail, nextStep,
      checkedAt: at || null, evidenceId: record?.id ?? null, sourcePath };
  });
  items.push(unavailable('automatic_optimization', '성과 기반 Refresh·Merge·Redirect 자동 실행',
    '현재 Growth Agent는 근거 기반 제안을 생성합니다. 자동 수정·병합·리디렉션 실행까지 구현된 것은 아닙니다.',
    '승인·수정 범위·되돌리기·배포 검증을 갖춘 실행기를 별도로 구현해야 합니다.', 'src/lib/growth.ts', 'partial'));
  return items;
}
