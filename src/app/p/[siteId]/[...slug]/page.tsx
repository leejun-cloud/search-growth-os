// 실제 웹페이지 서빙/미리보기 라우트 — "직접 생성형" 모드
// 발행된 페이지: 검색엔진이 색인 가능한 실제 SSR HTML
// 초안/검토 페이지: noindex를 붙인 미리보기
// 초기 HTML에 title/description/h1/본문/내부링크/JSON-LD가 모두 포함된다 (Rendering Gate 원칙)

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ siteId: string; slug: string[] }> };

async function loadPage(siteId: string, slugParts: string[]) {
  const slug = slugParts.map(decodeURIComponent).join("/");
  return db.pages.bySlug(siteId, slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteId, slug } = await params;
  const page = await loadPage(siteId, slug);
  if (!page) return {};
  const indexable = page.status === "published" && page.indexPolicy === "index";
  return {
    title: page.seoTitle,
    description: page.metaDescription,
    alternates: { canonical: page.canonicalUrl },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title: page.seoTitle, description: page.metaDescription, type: "article" },
  };
}

export default async function PublicPage({ params }: Props) {
  const { siteId, slug } = await params;
  const [page, site] = await Promise.all([loadPage(siteId, slug), db.sites.get(siteId)]);
  if (!page || !site) notFound();

  const bodyHtml = await marked.parse(page.body);
  const isPreview = page.status !== "published";

  return (
    <>
      {/* JSON-LD 구조화 데이터 — 초기 HTML에 포함 */}
      {(page.schemaJsonld ?? []).map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }} />
      ))}

      {isPreview && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          🔍 미리보기 — 아직 발행되지 않은 페이지입니다 (검색엔진 색인 제외 noindex)
        </div>
      )}

      <article className="mx-auto max-w-2xl">
        <nav className="mb-4 text-xs text-zinc-500">
          <Link href={site.domain} className="hover:underline">{site.name}</Link>
          {" › "}{page.slug.split("/").slice(0, -1).join(" › ")}
        </nav>
        <h1 className="text-3xl font-bold leading-tight">{page.h1}</h1>
        {page.summary && <p className="mt-3 text-lg text-zinc-600">{page.summary}</p>}

        <div
          className="prose prose-zinc mt-8 max-w-none [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {page.faq.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">자주 묻는 질문</h2>
            {page.faq.map((f, i) => (
              <div key={i} className="mt-4">
                <h3 className="font-semibold">{f.question}</h3>
                <p className="mt-1 text-zinc-600">{f.answer}</p>
              </div>
            ))}
          </section>
        )}

        {page.internalLinks.length > 0 && (
          <section className="mt-10 border-t border-zinc-200 pt-6">
            <h2 className="text-sm font-semibold text-zinc-500">관련 페이지</h2>
            <ul className="mt-2 space-y-1">
              {page.internalLinks.map((l) => (
                <li key={l.slug}>
                  <Link href={`/p/${siteId}/${l.slug}`} className="text-blue-700 hover:underline">
                    {l.anchor}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {page.sources.length > 0 && (
          <section className="mt-8 text-xs text-zinc-400">
            출처: {page.sources.join(" · ")}
          </section>
        )}
      </article>
    </>
  );
}
