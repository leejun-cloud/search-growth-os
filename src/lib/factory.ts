// Content/Page Factory — Writer Agent (PRD §13)
// Fact Pack에 있는 사실만 사용해 초안을 생성한다.

import { generateJson } from "./ai";
import { db } from "./db";
import { buildJsonLd, suggestInternalLinks, toSlug } from "./seo";
import { newId, nowIso } from "./types";
import type { FaqItem, PageDoc } from "./types";

interface DraftResult {
  title: string;
  seo_title: string;
  meta_description: string;
  h1: string;
  summary: string;
  body: string;
  faq: FaqItem[];
}

export async function generateDraft(opportunityId: string): Promise<PageDoc> {
  const opp = await db.opportunities.get(opportunityId);
  if (!opp) throw new Error("opportunity not found");
  const site = await db.sites.get(opp.siteId);
  if (!site) throw new Error("site not found");

  let pack = await db.factPacks.byOpportunity(opp.id);
  if (!pack) {
    const { buildFactPack } = await import("./factpack");
    pack = await buildFactPack(opp.id);
  }

  const prompt = `당신은 SEO 콘텐츠 작성자다. 아래 Fact Pack만 근거로 페이지를 작성하라.

## 목표
- 검색어: "${opp.query}" / 의도: ${opp.intent} / 페이지 타입: ${opp.recommendedPageType}
- 사이트: ${site.name}, 언어: ${site.primaryLanguage === "ko" ? "한국어" : site.primaryLanguage}
- 전환 목표: ${site.conversionGoals.join(", ") || "문의"}

## Fact Pack (이것만 사실로 사용)
- 확인된 사실: ${pack.verifiedFacts.join(" / ")}
- 서비스 사실: ${pack.serviceFacts.join(" / ")}
- 주의 필요 주장: ${pack.claimsRequiringCaution.join(" / ")}
- 금지 사항: ${pack.prohibitedAssumptions.join(" / ")}

## 작성 규칙
- Fact Pack에 없는 통계/사례/가격을 지어내지 마라. 불확실하면 "상담을 통해 확인" 같은 정직한 표현을 써라.
- 검색자의 질문에 첫 문단에서 바로 답하라.
- 본문은 마크다운, 소제목(##) 3~6개, 1500자 이상.
- 검색어를 억지로 반복하지 마라 (자연스러운 밀도).
- seo_title은 60자 이내, meta_description은 80~155자.
- faq는 3~5개, Fact Pack 근거 내에서.

## 출력 (JSON만)
{"title":"...","seo_title":"...","meta_description":"...","h1":"...","summary":"...","body":"마크다운 본문","faq":[{"question":"...","answer":"..."}]}

<<<MOCK_FALLBACK>>>
{"title":"${opp.query} 안내","seo_title":"${opp.query} | ${site.name}","meta_description":"${opp.query}에 대해 실제 서비스 기준으로 정리했습니다. 확인된 정보만 담은 안내입니다.","h1":"${opp.query}","summary":"${opp.query}에 대한 핵심 안내","body":"## 개요\\n\\n${opp.query}에 대한 안내입니다. 이 문서는 mock provider로 생성된 테스트 본문입니다. 실제 운영에서는 Claude CLI가 Fact Pack 근거로 상세 본문을 작성합니다.\\n\\n## 서비스 기준\\n\\n확인된 사실 기반의 설명이 여기에 들어갑니다.\\n\\n## 자주 묻는 질문\\n\\n관련 FAQ가 이어집니다.","faq":[{"question":"${opp.query}은 어떻게 확인하나요?","answer":"상담을 통해 정확한 내용을 확인할 수 있습니다."}]}
<<</MOCK_FALLBACK>>>`;

  const draft = await generateJson<DraftResult>(prompt);

  const id = newId("pg");
  let slug = toSlug(draft.title || opp.query, opp.recommendedPageType);
  // slug 충돌 시 뒤에 식별자 부착
  if (await db.pages.bySlug(opp.siteId, slug)) slug = `${slug}-${id.slice(-4)}`;

  const internalLinks = await suggestInternalLinks(
    { id, siteId: opp.siteId, pageType: opp.recommendedPageType, targetQuery: opp.query, slug },
    opp.entityNames
  );

  const now = nowIso();
  const page: PageDoc = {
    id,
    siteId: opp.siteId,
    pageType: opp.recommendedPageType,
    slug,
    status: "draft",
    targetQuery: opp.query,
    primaryIntent: opp.intent,
    opportunityId: opp.id,
    factPackId: pack.id,
    opportunityScore: opp.opportunityScore,
    title: draft.title,
    seoTitle: (draft.seo_title || draft.title).slice(0, 60),
    metaDescription: (draft.meta_description || draft.summary).slice(0, 155),
    h1: draft.h1 || draft.title,
    summary: draft.summary ?? "",
    body: draft.body,
    faq: Array.isArray(draft.faq) ? draft.faq : [],
    sources: pack.officialSources,
    internalLinks,
    canonicalUrl: `${site.domain.replace(/\/$/, "")}/${slug}`,
    indexPolicy: "index",
    createdAt: now,
    updatedAt: now,
  };
  page.schemaJsonld = buildJsonLd(site, page);

  await db.pages.put(page);
  await db.opportunities.put({ ...opp, status: "drafted" });
  return page;
}
