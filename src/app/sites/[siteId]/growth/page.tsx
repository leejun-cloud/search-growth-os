// Growth Agent 탭 — 성과 데이터 기반 다음 액션 제안

import { db } from "@/lib/db";
import { acceptCreateOpportunityAction, dismissGrowthAction, runGrowthAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const ACTION_DESC: Record<string, string> = {
  CREATE: "새 페이지 기회",
  UPDATE: "본문 보강",
  EXPAND: "클러스터 확장",
  MERGE: "페이지 병합",
  NOINDEX: "색인 제외 검토",
  TITLE_TEST: "제목/설명 개선",
  REDIRECT: "리다이렉트",
  DELETE: "삭제 검토",
  ADD_INTERNAL_LINK: "내부링크 추가",
  REQUEST_MORE_DATA: "데이터 요청",
};

export default async function GrowthPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const actions = await db.growthActions.bySite(siteId);
  const proposed = actions.filter((a) => a.status === "proposed");
  const handled = actions.filter((a) => a.status !== "proposed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          성과 데이터(GSC)를 규칙으로 분석해 UPDATE / TITLE_TEST / EXPAND / MERGE / NOINDEX / CREATE를 제안합니다.
        </p>
        <form action={runGrowthAction.bind(null, siteId)}>
          <SubmitButton pendingText="분석 중…">Growth 분석 실행</SubmitButton>
        </form>
      </div>

      {proposed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          제안이 없습니다. 성과 탭에서 GSC CSV를 가져온 뒤 분석을 실행하세요.
        </div>
      ) : (
        <ul className="space-y-2">
          {proposed.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
              <Badge tone={a.action === "NOINDEX" || a.action === "MERGE" ? "red" : a.action === "CREATE" ? "green" : "blue"}>
                {a.action}
              </Badge>
              <div className="flex-1">
                <div className="text-sm font-medium">{a.target} <span className="ml-1 text-xs font-normal text-zinc-400">{ACTION_DESC[a.action]}</span></div>
                <div className="mt-0.5 text-xs text-zinc-500">{a.reason}</div>
              </div>
              <div className="flex gap-2">
                {a.action === "CREATE" && (
                  <form action={acceptCreateOpportunityAction.bind(null, siteId, a.id)}>
                    <SubmitButton variant="secondary" pendingText="등록…">검색기회로 등록</SubmitButton>
                  </form>
                )}
                <form action={dismissGrowthAction.bind(null, siteId, a.id)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600">무시</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {handled.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">처리된 제안 ({handled.length})</summary>
          <ul className="mt-2 space-y-1">
            {handled.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                <Badge tone="gray">{a.status}</Badge> [{a.action}] {a.target}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
