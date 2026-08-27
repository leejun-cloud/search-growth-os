// 페이지 목록 — 상태/품질점수와 함께

import Link from "next/link";
import { db } from "@/lib/db";
import { regenerateFeedsAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";
import type { PageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS: Record<PageStatus, { label: string; tone: "green" | "yellow" | "red" | "gray" | "blue" }> = {
  draft: { label: "초안", tone: "gray" },
  review: { label: "검토 대기", tone: "yellow" },
  approved: { label: "승인됨", tone: "blue" },
  published: { label: "발행됨", tone: "green" },
  noindex: { label: "noindex", tone: "gray" },
  blocked: { label: "품질 차단", tone: "red" },
};

export default async function PagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const pages = await db.pages.bySite(siteId);
  const publishedCount = pages.filter((p) => p.status === "published").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          발행물과 sitemap/RSS/robots/llms.txt는 <code className="rounded bg-zinc-100 px-1">data/published/</code>에 생성됩니다.
        </p>
        {publishedCount > 0 && (
          <form action={regenerateFeedsAction.bind(null, siteId)}>
            <SubmitButton variant="secondary" pendingText="생성 중…">sitemap/RSS 재생성</SubmitButton>
          </form>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          검색기회 탭에서 채점을 통과한 후보의 초안을 생성하면 여기에 나타납니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">페이지</th>
                <th className="px-4 py-3">타입</th>
                <th className="px-4 py-3">목표 검색어</th>
                <th className="px-4 py-3">기회점수</th>
                <th className="px-4 py-3">품질점수</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pages.map((p) => {
                const st = STATUS[p.status];
                return (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/sites/${siteId}/pages/${p.id}`} className="font-medium text-blue-700 hover:underline">
                        {p.title}
                      </Link>
                      <div className="text-xs text-zinc-400">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{p.pageType}</td>
                    <td className="px-4 py-3 text-xs">{p.targetQuery}</td>
                    <td className="px-4 py-3">{p.opportunityScore ?? "—"}</td>
                    <td className="px-4 py-3">{p.qualityScore ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
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
