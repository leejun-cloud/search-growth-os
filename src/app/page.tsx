// Global Dashboard (PRD §23) — 사이트 목록과 핵심 지표

import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sites = await db.sites.all();

  const rows = await Promise.all(
    sites.map(async (site) => {
      const [pages, opps, metrics] = await Promise.all([
        db.pages.bySite(site.id),
        db.opportunities.bySite(site.id),
        db.searchMetrics.bySite(site.id),
      ]);
      const published = pages.filter((p) => p.status === "published").length;
      const impressions = metrics.filter((m) => m.dimension === "query").reduce((a, m) => a + m.impressions, 0);
      const clicks = metrics.filter((m) => m.dimension === "query").reduce((a, m) => a + m.clicks, 0);
      const openOpps = opps.filter((o) => ["candidate", "auto_draft", "review_queue"].includes(o.status)).length;
      return { site, pageCount: pages.length, published, openOpps, impressions, clicks };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">사이트</h1>
        <Link href="/sites/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          + 사이트 등록
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          <p className="mb-2 font-medium">아직 등록된 사이트가 없습니다.</p>
          <p className="text-sm">첫 사이트를 등록하면 진단 → 검색기회 발굴 → 페이지 생성 파이프라인이 시작됩니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">사이트</th>
                <th className="px-4 py-3">페이지</th>
                <th className="px-4 py-3">발행됨</th>
                <th className="px-4 py-3">열린 검색기회</th>
                <th className="px-4 py-3">노출</th>
                <th className="px-4 py-3">클릭</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map(({ site, pageCount, published, openOpps, impressions, clicks }) => (
                <tr key={site.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/sites/${site.id}`} className="font-medium text-blue-700 hover:underline">
                      {site.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{site.domain}</div>
                  </td>
                  <td className="px-4 py-3">{pageCount}</td>
                  <td className="px-4 py-3">{published}</td>
                  <td className="px-4 py-3">{openOpps > 0 ? <Badge tone="blue">{openOpps}</Badge> : "0"}</td>
                  <td className="px-4 py-3">{impressions.toLocaleString()}</td>
                  <td className="px-4 py-3">{clicks.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
