// 사이트 개요 — 기술 진단(Site Auditor) 실행과 결과

import { db } from "@/lib/db";
import { runAuditAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const severityTone = { block: "red", warn: "yellow", info: "gray" } as const;

export default async function SiteOverview({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [audit, pages, opps, entities] = await Promise.all([
    db.auditReports.latest(siteId),
    db.pages.bySite(siteId),
    db.opportunities.bySite(siteId),
    db.entities.bySite(siteId),
  ]);

  const stat = (label: string, value: string | number) => (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat("Entity", entities.length)}
        {stat("검색기회", opps.length)}
        {stat("페이지", pages.length)}
        {stat("발행됨", pages.filter((p) => p.status === "published").length)}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">기술 SEO 진단</h2>
            <p className="text-sm text-zinc-500">
              검색로봇 관점(초기 HTML)에서 사이트를 크롤링해 title 중복, SSR 여부, sitemap 등을 검사합니다.
            </p>
          </div>
          <form action={runAuditAction.bind(null, siteId)}>
            <SubmitButton pendingText="크롤링/진단 중… (최대 수 분)">
              {audit ? "재진단" : "진단 실행"}
            </SubmitButton>
          </form>
        </div>

        {!audit ? (
          <p className="text-sm text-zinc-400">아직 진단 기록이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="gray">크롤링 {audit.crawledCount}페이지</Badge>
              <Badge tone={audit.hasSitemap ? "green" : "red"}>sitemap {audit.hasSitemap ? "있음" : "없음"}</Badge>
              <Badge tone={audit.hasRss ? "green" : "yellow"}>RSS {audit.hasRss ? "있음" : "없음"}</Badge>
              <Badge tone={audit.hasRobotsTxt ? "green" : "yellow"}>robots.txt {audit.hasRobotsTxt ? "있음" : "없음"}</Badge>
              <Badge tone={audit.hasLlmsTxt ? "green" : "gray"}>llms.txt {audit.hasLlmsTxt ? "있음" : "없음"}</Badge>
              <span className="text-xs text-zinc-400">진단: {audit.createdAt.slice(0, 16).replace("T", " ")}</span>
            </div>

            {audit.issues.length === 0 ? (
              <p className="text-sm text-green-700">발견된 문제가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {audit.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md bg-zinc-50 p-3 text-sm">
                    <Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge>
                    <div>
                      <div>{issue.message}</div>
                      {issue.urls && (
                        <div className="mt-1 text-xs text-zinc-400">{issue.urls.slice(0, 5).join(" · ")}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-zinc-600">페이지별 상세 ({audit.pages.length})</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-left text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">URL</th>
                      <th className="px-2 py-2">title</th>
                      <th className="px-2 py-2">본문(자)</th>
                      <th className="px-2 py-2">렌더링 위험</th>
                      <th className="px-2 py-2">JSON-LD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {audit.pages.map((p) => (
                      <tr key={p.url}>
                        <td className="max-w-[240px] truncate px-2 py-1.5">{p.url}</td>
                        <td className="max-w-[200px] truncate px-2 py-1.5">{p.title ?? <span className="text-red-600">없음</span>}</td>
                        <td className="px-2 py-1.5">{p.wordCount}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={p.renderingRisk === "high" ? "red" : p.renderingRisk === "medium" ? "yellow" : "green"}>
                            {p.renderingRisk}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5">{p.jsonLdTypes.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
