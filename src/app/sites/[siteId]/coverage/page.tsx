import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasOperatorAccess } from '@/lib/operator-access';
import { loadCoverageData } from '@/lib/coverage-data';
import {
  APPLICATION_LABELS, CAPABILITY_LABELS, buildAreaCoverage, buildWorkflowCoverage,
} from '@/lib/coverage-model';
import type { ApplicationState, CoverageItem } from '@/lib/coverage-model';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '영역별 적용 현황 | Search Growth OS',
  robots: { index: false, follow: false },
};

const section = 'rounded-xl border border-zinc-200 bg-white p-5 sm:p-6';
const stateStyles: Record<ApplicationState, string> = {
  confirmed: 'bg-emerald-50 text-emerald-800',
  recorded: 'bg-blue-50 text-blue-800',
  attention: 'bg-amber-50 text-amber-900',
  blocked: 'bg-red-50 text-red-800',
  unmeasured: 'bg-zinc-100 text-zinc-600',
  stale: 'bg-orange-50 text-orange-900',
  unsupported: 'bg-zinc-100 text-zinc-600',
};
const configLabels = { configured: '설정 존재', missing: '설정 부족', invalid: '설정 형식·범위 확인 필요' };

function Timestamp({ value }: { value: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>시각 미확인</span>;
  const iso = new Date(value).toISOString();
  return <time dateTime={iso}>{iso.slice(0, 19).replace('T', ' ')} UTC</time>;
}
function SourceItem({ item }: { item: CoverageItem }) {
  const source = 'https://github.com/leejun-cloud/search-growth-os/blob/main/' +
    item.sourcePath.split('/').map(encodeURIComponent).join('/');
  return (
    <article className="py-4 first:pt-0 last:pb-0" data-coverage-item={item.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900">{item.label}</h4>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-zinc-200 px-2 py-1">소스: {CAPABILITY_LABELS[item.capability]}</span>
          <span className={`rounded px-2 py-1 ${stateStyles[item.state]}`}>
            적용: {APPLICATION_LABELS[item.state]}
          </span>
        </div>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-zinc-600">{item.detail}</p>
      <details className="mt-2 text-xs text-zinc-600">
        <summary className="cursor-pointer py-1 font-medium">근거·관련 소스·남은 조치 보기</summary>
        <dl className="mt-2 grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-[90px_1fr]">
          <dt>관측 시각</dt><dd><Timestamp value={item.checkedAt} /></dd>
          <dt>근거 ID</dt><dd className="break-all font-mono">{item.evidenceId ?? '저장된 근거 없음'}</dd>
          <dt>관련 소스</dt><dd className="break-all"><a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{item.sourcePath}</a></dd>
          <dt>남은 조치</dt><dd className="leading-5">{item.nextStep}</dd>
        </dl>
      </details>
    </article>
  );
}

type Props = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ target?: string | string[] }>;
};

export default async function CoveragePage({ params, searchParams }: Props) {
  const { siteId } = await params;
  const basePath = `/sites/${encodeURIComponent(siteId)}`;
  // Check access before reading evidence or environment configuration.
  if (!await hasOperatorAccess()) {
    return (
      <section className={section}>
        <h2 className="text-xl font-semibold">영역별 적용 현황</h2>
        <p className="my-3 text-sm leading-6 text-zinc-600">
          이 화면은 운영자 인증 후 볼 수 있습니다. 성과 검증에서 접속한 다음 ‘적용 현황’ 메뉴를 선택하세요.
        </p>
        <Link href={`${basePath}/operations`} className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
          운영자 접속 화면으로
        </Link>
      </section>
    );
  }
  const query = await searchParams;
  const requested = typeof query.target === 'string' ? query.target : undefined;
  const data = await loadCoverageData(siteId, requested);
  if (!data) notFound();
  const now = new Date(data.asOf);
  const areas = buildAreaCoverage(data.site.domain, data.target, data.records, now);
  const workflows = buildWorkflowCoverage(data.records, now);
  const incomplete = areas.flatMap(area => area.items.filter(item =>
    item.capability === 'not_implemented' || item.capability === 'not_verifiable',
  ).map(item => ({ area: area.id, item })));

  return (
    <div className="space-y-6" data-testid="area-coverage-dashboard">
      <header className="rounded-xl bg-zinc-900 px-6 py-7 text-white">
        <p className="text-xs font-semibold tracking-widest text-zinc-400">SEARCH GROWTH OS / 적용 현황</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">어디까지 구현됐고, 실제로 적용됐나요?</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
          소스 구현 · 설정 존재 · 실제 검사 기록 · 사업 성과를 구분합니다.
          이 화면은 저장된 근거만 조회하며 크롤링·AI 호출·콘텐츠 변경·외부 제출을 실행하지 않습니다.
        </p>
        <p className="mt-3 text-xs text-zinc-400">화면 조회 시각: <Timestamp value={data.asOf} /> · 새 검사 시각이 아닙니다.</p>
      </header>

      {data.warnings.length > 0 && (
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="status">
          <h3 className="font-semibold">자료 확인 필요</h3>
          {data.warnings.map(message => <p key={message} className="mt-1 text-sm leading-6">{message}</p>)}
        </aside>
      )}

      <section className={section} aria-labelledby="coverage-target-title">
        <h3 id="coverage-target-title" className="text-lg font-semibold">검사 근거를 볼 URL 선택</h3>
        <form method="get" action={`${basePath}/coverage`} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-72 text-sm" htmlFor="coverage-target">
            저장된 검사 URL
            <select id="coverage-target" name="target" defaultValue={data.target ?? ''}
              disabled={data.urls.length === 0} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2">
              <option value="" disabled>{data.urls.length ? 'URL을 선택하세요' : '저장된 URL 검사 기록이 없습니다'}</option>
              {data.urls.map(url => <option key={url} value={url}>{url}</option>)}
            </select>
          </label>
          <button type="submit" disabled={data.urls.length === 0}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">저장 근거 보기</button>
          <Link href={`${basePath}/operations`} className="py-2 text-sm text-blue-700 underline">새 검사는 성과 검증에서</Link>
        </form>
        <p className="mt-3 break-all text-sm text-zinc-700">선택 URL: {data.target ?? '선택된 근거 없음'}</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          URL별 최신 검사 기록을 최대 100개 표시합니다. 한 URL의 통과 결과를 사이트 전체 적용률로 확대하지 않습니다.
          7일보다 오래된 근거는 이전 기록으로 표시하며, 이 기간은 운영용 기준이지 검색엔진 규칙이 아닙니다.
        </p>
      </section>

      <nav aria-label="SEO 영역 바로가기" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {areas.map(area => (
          <a key={area.id} href={`#area-${area.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-500">
            <h3 className="font-semibold">{area.id}</h3>
            <p className="mt-2 text-sm leading-5 text-zinc-600">{area.description}</p>
            <p className="mt-3 text-sm font-medium">검사 확인 {area.confirmed}개 / 표시 항목 {area.items.length}개</p>
            <p className="mt-1 text-xs text-zinc-500">미구현·직접 판정 불가 {area.missing}개</p>
          </a>
        ))}
      </nav>
      <p className="text-xs leading-5 text-zinc-500">위 건수는 저장 근거의 표시 상태입니다. SEO 점수·순위·AI 인용 확률·방문 증가율이 아닙니다.</p>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {areas.map(area => (
          <section key={area.id} id={`area-${area.id}`} className={`${section} scroll-mt-6`} aria-labelledby={`area-title-${area.id}`}>
            <h3 id={`area-title-${area.id}`} className="text-lg font-semibold">{area.id} · 적용 항목</h3>
            <p className="mb-5 mt-1 text-sm text-zinc-500">{area.description}</p>
            <div className="divide-y divide-zinc-100">{area.items.map(item => <SourceItem key={item.id} item={item} />)}</div>
          </section>
        ))}
      </div>

      <section className={section} aria-labelledby="coverage-connections">
        <h3 id="coverage-connections" className="text-lg font-semibold">연결 설정과 실제 수집 상태</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">설정이 있다는 것과 인증·수집·게시가 성공했다는 것은 다릅니다. 비공개 키와 설정 값은 표시하지 않습니다.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {data.connections.map(connection => (
            <article key={connection.id} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">{connection.label}</h4>
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{configLabels[connection.configuration]}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{connection.observation}</p>
              <p className="mt-2 text-xs text-zinc-500">관측 기록: <Timestamp value={connection.checkedAt} /></p>
              <details className="mt-3 text-xs"><summary className="cursor-pointer">필요한 설정 이름</summary>
                <div className="mt-2 space-y-1">{connection.settings.map(name => <code key={name} className="block break-all">{name}</code>)}</div>
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className={section} aria-labelledby="coverage-inventory">
        <h3 id="coverage-inventory" className="text-lg font-semibold">엔진별 데이터·작업 현황</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.inventory.map(item => (
            <Link key={item.id} href={item.href} className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50">
              <p className="text-xs leading-5 text-zinc-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold">{item.value === null ? '미확인' : item.value.toLocaleString('ko-KR')}</p>
              <span className="mt-2 inline-block text-xs text-blue-700">관련 작업 화면으로 →</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          각 항목은 서로 다른 DB 집계이며 전환 퍼널 비율이 아닙니다.
          published·done 상태만으로 현재 공개 페이지의 정상 동작이나 사업 성과를 보증하지 않습니다.
        </p>
      </section>

      <section className={section} aria-labelledby="coverage-workflows">
        <h3 id="coverage-workflows" className="text-lg font-semibold">콘텐츠 수정·발행·재측정 연결 상태</h3>
        <p className="mb-5 mt-1 text-sm leading-6 text-zinc-500">
          아래는 선택 URL만이 아니라 이 사이트의 작업 종류별 최신 기록입니다.
          특정 페이지의 상세 변경은 성과 검증에서 확인하세요.
        </p>
        <div className="divide-y divide-zinc-100">{workflows.map(item => <SourceItem key={item.id} item={item} />)}</div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 sm:p-6" aria-labelledby="coverage-gaps">
        <h3 id="coverage-gaps" className="text-lg font-semibold">아직 구현되지 않았거나 직접 판정할 수 없는 부분</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {incomplete.map(({ area, item }) => (
            <article key={item.id} className="rounded-lg bg-white p-3">
              <h4 className="text-sm font-semibold">{area} · {item.label}</h4>
              <p className="mt-1 text-xs leading-5 text-zinc-600">{item.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm font-medium">기능이 없으면 ‘미구현’, 기록이 없으면 ‘미확인’으로 남깁니다. 빈칸을 임의의 성공 수치로 채우지 않습니다.</p>
      </section>
    </div>
  );
}
