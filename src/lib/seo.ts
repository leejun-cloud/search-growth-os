// SEO Metadata & Schema Engine + Internal Link Engine (PRD §15, §16)

import { db } from "./db";
import type { PageDoc, Site } from "./types";

// ---------- JSON-LD ----------

export function buildJsonLd(site: Site, page: PageDoc): object[] {
  const url = `${site.domain.replace(/\/$/, "")}/${page.slug}`;
  const blocks: object[] = [];

  blocks.push({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.h1,
    description: page.metaDescription,
    inLanguage: site.primaryLanguage,
    mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: site.name, url: site.domain },
  });

  if (page.faq.length > 0) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  const parts = page.slug.split("/");
  blocks.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: site.name, item: site.domain },
      ...parts.map((part, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: part,
        item: `${site.domain.replace(/\/$/, "")}/${parts.slice(0, i + 1).join("/")}`,
      })),
    ],
  });

  return blocks;
}

// ---------- Internal Link Engine ----------
// 새 페이지는 고립되면 안 된다 (orphan 금지). 관련 페이지 3~8개를 연결한다.
// 관련도 = 공유 Entity 수 + 페이지 타입 계층 관계 + 검색어 토큰 겹침

const TYPE_HIERARCHY: Record<string, number> = {
  pillar: 0, service: 1, industry: 2, region: 2, institution: 3,
  faq: 3, guide: 3, comparison: 3, cost: 3, case_study: 4, data_research: 4, news: 4,
};

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[\s,\/\-_]+/).filter((t) => t.length > 1));
}

export async function suggestInternalLinks(
  page: Pick<PageDoc, "id" | "siteId" | "pageType" | "targetQuery" | "slug">,
  entityNames: string[]
): Promise<{ slug: string; anchor: string }[]> {
  const others = (await db.pages.bySite(page.siteId)).filter(
    (p) => p.id !== page.id && p.status !== "blocked" && p.indexPolicy === "index"
  );
  const myTokens = tokenize(page.targetQuery);
  const myEntitySet = new Set(entityNames);

  const scored = others.map((p) => {
    let score = 0;
    // 검색어 토큰 겹침
    for (const t of tokenize(p.targetQuery)) if (myTokens.has(t)) score += 2;
    // 계층상 인접한 타입 (pillar↔service↔region 등)
    const diff = Math.abs((TYPE_HIERARCHY[p.pageType] ?? 3) - (TYPE_HIERARCHY[page.pageType] ?? 3));
    if (diff === 1) score += 2;
    if (diff === 0) score += 1;
    // Fact Pack 기반 Entity 겹침 (opportunity entityNames가 slug/title에 등장)
    for (const name of myEntitySet) {
      if (p.title.includes(name) || p.targetQuery.includes(name)) score += 3;
    }
    return { page: p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => ({ slug: s.page.slug, anchor: s.page.title }));
}

// ---------- slug ----------

export function toSlug(text: string, pageType: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const prefix: Record<string, string> = {
    pillar: "", service: "services", industry: "industries", region: "regions",
    institution: "places", faq: "faq", guide: "guides", comparison: "compare",
    cost: "guides", case_study: "cases", data_research: "data", news: "news",
  };
  const p = prefix[pageType] ?? "guides";
  return p ? `${p}/${base}` : base;
}
