// 검색기회 테이블 (PRD §23) — 생성 → 채점 → 초안 생성

import { db } from "@/lib/db";
import { draftAction, generateOpportunitiesAction, qualifyAction, qualifyAllAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";
import type { OpportunityStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<OpportunityStatus, { label: string; tone: "green" | "yellow" | "red" | "gray" | "blue" }> = {
  candidate: { label: "채점 대기", tone: "gray" },
  auto_draft: { label: "초안 가능 (80+)", tone: "green" },
  review_queue: { label: "검토 필요 (65~79)", tone: "yellow" },
  needs_data: { label: "데이터 보강 (50~64)", tone: "yellow" },
  rejected: { label: "생성 금지 (<50)", tone: "red" },
  drafted: { label: "초안 생성됨", tone: "blue" },
  published: { label: "발행됨", tone: "blue" },
};

export default async function OpportunitiesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [site, opps] = await Promise.all([db.sites.get(siteId), db.opportunities.bySite(siteId)]);
  const candidates = opps.filter((o) => o.status === "candidate");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          조합 가능 ≠ 발행 가능 — 모든 후보는 100점 채점을 거칩니다. (자동초안 {site?.thresholds.autoDraft}+ / 검토 {site?.thresholds.reviewQueue}+ / 보강 {site?.thresholds.enrich}+)
        </p>
        <div className="flex gap-2">
          <form action={generateOpportunitiesAction.bind(null, siteId)}>
            <SubmitButton pendingText="AI 발굴 중…">검색기회 발굴 (AI)</SubmitButton>
          </form>
          {candidates.length > 0 && (
            <form action={qualifyAllAction.bind(null, siteId)}>
              <SubmitButton pendingText={`채점 중… (${candidates.length}건)`} variant="secondary">
                전체 채점 ({candidates.length})
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {opps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          사업 지식과 Entity를 먼저 준비한 뒤 &quot;검색기회 발굴&quot;을 실행하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">검색어</th>
                <th className="px-4 py-3">의도</th>
                <th className="px-4 py-3">페이지 타입</th>
                <th className="px-4 py-3">점수</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {opps.map((o) => {
                const st = STATUS_LABEL[o.status];
                return (
                  <tr key={o.id} className="align-top hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.query}</div>
                      <div className="mt-0.5 max-w-md text-xs text-zinc-400">{o.evidence.slice(0, 2).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{o.intent}</td>
                    <td className="px-4 py-3 text-xs">{o.recommendedPageType}</td>
                    <td className="px-4 py-3 font-bold">
                      {o.opportunityScore ?? "—"}
                      {o.scores && (
                        <div className="mt-0.5 text-[10px] font-normal text-zinc-400">
                          의도{o.scores.intentClarity} 연관{o.scores.serviceRelevance} 전환{o.scores.conversionPotential} 데이터{o.scores.uniqueData}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {o.status === "candidate" && (
                          <form action={qualifyAction.bind(null, siteId, o.id)}>
                            <SubmitButton pendingText="채점…" variant="secondary">채점</SubmitButton>
                          </form>
                        )}
                        {(o.status === "auto_draft" || o.status === "review_queue") && (
                          <form action={draftAction.bind(null, siteId, o.id)}>
                            <SubmitButton pendingText="Fact Pack + 초안 생성 중…">초안 생성</SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
