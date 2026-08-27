// Page Review (PRD §23) — 미리보기 + Fact Pack + 품질검사 + 발행

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publishAction, qualityAction } from "@/app/actions";
import { Badge, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PageReview({
  params,
}: {
  params: Promise<{ siteId: string; pageId: string }>;
}) {
  const { siteId, pageId } = await params;
  const page = await db.pages.get(pageId);
  if (!page || page.siteId !== siteId) notFound();
  const [report, factPack] = await Promise.all([
    db.qualityReports.byPage(pageId),
    page.factPackId ? db.factPacks.get(page.factPackId) : null,
  ]);

  const verdictTone = report?.verdict === "pass" ? "green" : report?.verdict === "warn" ? "yellow" : "red";

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* 미리보기 */}
      <div className="space-y-4 lg:col-span-3">
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="mb-4 border-b border-zinc-100 pb-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-400">/{page.slug} · {page.pageType} · 목표: {page.targetQuery}</div>
              <a
                href={`/p/${siteId}/${page.slug}`}
                target="_blank"
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50"
              >
                🌐 실제 페이지로 보기
              </a>
            </div>
            <h2 className="mt-1 text-xl font-bold">{page.h1}</h2>
            <p className="mt-1 text-sm text-zinc-500">{page.summary}</p>
          </div>
          <div className="mb-4 rounded-md bg-zinc-50 p-3 text-xs">
            <div><span className="font-semibold">SEO Title:</span> {page.seoTitle} <span className="text-zinc-400">({page.seoTitle.length}자)</span></div>
            <div className="mt-1"><span className="font-semibold">Description:</span> {page.metaDescription} <span className="text-zinc-400">({page.metaDescription.length}자)</span></div>
            <div className="mt-1"><span className="font-semibold">Canonical:</span> {page.canonicalUrl}</div>
          </div>
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-6">{page.body}</article>

          {page.faq.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-4">
              <h3 className="mb-2 font-semibold">FAQ</h3>
              {page.faq.map((f, i) => (
                <details key={i} className="mb-2 rounded-md bg-zinc-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">{f.question}</summary>
                  <p className="mt-2 text-zinc-600">{f.answer}</p>
                </details>
              ))}
            </div>
          )}

          {page.internalLinks.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-4 text-sm">
              <h3 className="mb-2 font-semibold">내부링크 ({page.internalLinks.length})</h3>
              <ul className="list-inside list-disc text-blue-700">
                {page.internalLinks.map((l) => <li key={l.slug}>{l.anchor} → /{l.slug}</li>)}
              </ul>
            </div>
          )}
        </section>

        <details className="rounded-lg border border-zinc-200 bg-white p-4 text-xs">
          <summary className="cursor-pointer font-medium">JSON-LD 구조화 데이터</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-zinc-900 p-3 text-zinc-100">{JSON.stringify(page.schemaJsonld, null, 2)}</pre>
        </details>
      </div>

      {/* 검수 패널 */}
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">품질검사 (Quality Gate)</h3>
            <form action={qualityAction.bind(null, siteId, pageId)}>
              <SubmitButton variant="secondary" pendingText="검사 중…">재검사</SubmitButton>
            </form>
          </div>
          {!report ? (
            <p className="text-sm text-zinc-400">아직 검사 기록이 없습니다.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-3xl font-bold">{report.score}</span>
                <Badge tone={verdictTone}>{report.verdict.toUpperCase()}</Badge>
              </div>
              <ul className="space-y-1.5">
                {report.checks.map((c) => (
                  <li key={c.rule} className="flex items-start gap-2 text-xs">
                    <span>{c.pass ? "✅" : c.severity === "block" ? "⛔" : "⚠️"}</span>
                    <span>
                      <span className="font-medium">{c.rule}</span>
                      <span className="ml-1 text-zinc-500">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="mb-3 font-semibold">발행</h3>
          {page.status === "published" ? (
            <p className="text-sm text-green-700">✅ {page.publishedAt?.slice(0, 16).replace("T", " ")}에 발행됨</p>
          ) : report?.verdict === "block" ? (
            <p className="text-sm text-red-600">품질검사 차단 상태 — 문제 해결 후 재검사가 필요합니다.</p>
          ) : (
            <form action={publishAction.bind(null, siteId, pageId)}>
              <SubmitButton pendingText="발행 중…">발행 (Quality Gate 통과분만)</SubmitButton>
            </form>
          )}
        </section>

        {factPack && (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 text-xs">
            <h3 className="mb-3 text-sm font-semibold">Fact Pack (사실 근거)</h3>
            {([
              ["확인된 사실", factPack.verifiedFacts],
              ["서비스 사실", factPack.serviceFacts],
              ["주의 필요 주장", factPack.claimsRequiringCaution],
              ["금지 사항", factPack.prohibitedAssumptions],
              ["경쟁 공백(추정)", factPack.competitorGaps],
            ] as const).map(([title, items]) =>
              items.length ? (
                <div key={title} className="mb-2">
                  <div className="font-medium text-zinc-600">{title}</div>
                  <ul className="mt-0.5 list-inside list-disc text-zinc-500">
                    {items.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              ) : null
            )}
          </section>
        )}
      </div>
    </div>
  );
}
