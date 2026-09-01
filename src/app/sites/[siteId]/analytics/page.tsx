// 성과 탭 — GSC CSV import + 지표 테이블 + 파일럿 판정

import { db } from "@/lib/db";
import { evaluatePilot } from "@/lib/analytics";
import { importCsvAction, importGscApiAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [metrics, pilot] = await Promise.all([
    db.searchMetrics.bySite(siteId),
    evaluatePilot(siteId),
  ]);
  const queries = metrics.filter((m) => m.dimension === "query").slice(0, 50);
  const pagesM = metrics.filter((m) => m.dimension === "page").slice(0, 50);

  return (
    <div className="space-y-6">
      {/* 파일럿 판정 */}
      <section className={`rounded-lg border p-5 ${pilot.passed === true ? "border-green-300 bg-green-50" : pilot.passed === false ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"}`}>
        <h2 className="mb-1 font-semibold">
          파일럿 판정 {pilot.passed === true ? "✅ 합격" : pilot.passed === false ? "❌ 기준 미달" : "⏳ 데이터 대기"}
        </h2>
        <p className="text-sm text-zinc-600">{pilot.note}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <span>발행 페이지 <b>{pilot.publishedCount}</b></span>
          <span>노출 쿼리 <b>{pilot.queryCount}</b> / 기준 {pilot.criteria.minQueryCount}</span>
          <span>총 노출 <b>{pilot.totalImpressions.toLocaleString()}</b></span>
          <span>총 클릭 <b>{pilot.totalClicks.toLocaleString()}</b></span>
          <span className="text-zinc-400">판정 기간: 발행 후 {pilot.criteria.weeks}주</span>
        </div>
      </section>

      {/* GSC API 자동 import */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">Google Search Console API 가져오기 (실측 검색수요)</h2>
        <p className="mb-3 text-sm text-zinc-500">
          서비스 계정 인증(<code>SGO_GSC_CLIENT_EMAIL</code> / <code>SGO_GSC_PRIVATE_KEY</code>)이 설정되어 있으면
          검색어별 <b>실제 노출/클릭/순위</b>를 자동으로 가져옵니다. (미설정 시 CSV 업로드를 사용하세요.)
        </p>
        <form action={importGscApiAction.bind(null, siteId)} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            기간
            <select name="days" defaultValue="28" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              <option value="7">7일</option>
              <option value="28">28일</option>
              <option value="90">90일</option>
            </select>
          </label>
          <SubmitButton pendingText="GSC에서 가져오는 중…" variant="secondary">GSC API 가져오기</SubmitButton>
        </form>
      </section>

      {/* CSV import */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">Google Search Console CSV 가져오기</h2>
        <p className="mb-3 text-sm text-zinc-500">
          GSC → 실적 → 내보내기(CSV)의 <b>쿼리.csv</b> 또는 <b>페이지.csv</b>를 업로드하세요. (한국어/영어 헤더 모두 지원)
        </p>
        <form action={importCsvAction.bind(null, siteId)} className="flex flex-wrap items-center gap-3">
          <input type="file" name="csv" accept=".csv" required className="text-sm" />
          <input name="period" placeholder="기간 라벨 (예: 2026-08 28d)" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          <SubmitButton pendingText="가져오는 중…">가져오기</SubmitButton>
        </form>
      </section>

      {/* 지표 테이블 */}
      {[
        { title: "쿼리별 성과", rows: queries },
        { title: "페이지별 성과", rows: pagesM },
      ].map(({ title, rows }) =>
        rows.length ? (
          <section key={title} className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <h2 className="border-b border-zinc-100 px-4 py-3 font-semibold">{title} (상위 {rows.length})</h2>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">{title.startsWith("쿼리") ? "검색어" : "URL"}</th>
                  <th className="px-4 py-2">노출</th>
                  <th className="px-4 py-2">클릭</th>
                  <th className="px-4 py-2">CTR</th>
                  <th className="px-4 py-2">평균 순위</th>
                  <th className="px-4 py-2">기간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-[320px] truncate px-4 py-2">{m.metricKey}</td>
                    <td className="px-4 py-2">{m.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2">{m.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2">{(m.ctr * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2">{m.avgPosition ? m.avgPosition.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400">{m.periodLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null
      )}

      {metrics.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          아직 성과 데이터가 없습니다. 페이지 발행 후 GSC에 노출이 쌓이면 CSV를 가져오세요.
          <Badge tone="gray">발행 → 색인 → 노출까지 보통 수 주가 걸립니다</Badge>
        </div>
      )}
    </div>
  );
}
