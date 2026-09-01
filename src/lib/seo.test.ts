// PR #2 (onyouk0327-coder) — node:test 방식으로 변환

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildJsonLd, toSlug } from "./seo";
import type { PageDoc, Site } from "./types";

const site: Site = {
  id: "s1",
  name: "nolgong",
  domain: "https://db.nolgong.app",
  platform: "nextjs",
  primaryLanguage: "ko",
  targetRegions: [],
  primaryServices: ["ai-homepage"],
  audiences: [],
  conversionGoals: ["inquiry"],
  autoPublishAllowed: false,
  thresholds: {
    autoDraft: 80,
    reviewQueue: 65,
    enrich: 50,
    quality: {
      minBodyChars: 800,
      thinBlockChars: 500,
      maxSimilarity: 0.6,
      maxFamilySimilarity: 0.45,
      maxKeywordDensity: 0.05,
    },
  },
  pilotCriteria: { weeks: 8, minIndexRate: 70, minQueryCount: 50 },
  createdAt: "2026-01-01",
};

const page: PageDoc = {
  id: "p1",
  siteId: "s1",
  pageType: "cost",
  slug: "guides/ai-homepage-cost",
  status: "draft",
  targetQuery: "ai homepage cost",
  primaryIntent: "commercial_information",
  title: "AI homepage cost guide",
  seoTitle: "AI homepage cost | nolgong",
  metaDescription: "cost guide based on real service",
  h1: "AI homepage cost",
  summary: "",
  body: "body",
  faq: [{ question: "how to get quote?", answer: "contact us" }],
  sources: [],
  internalLinks: [],
  indexPolicy: "index",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

describe("toSlug", () => {
  it("한글/영숫자만 남기고 특수문자 제거", () => {
    assert.equal(toSlug("AI homepage cost!", "guide"), "guides/ai-homepage-cost");
  });

  it("페이지 타입별 접두어", () => {
    assert.equal(toSlug("daejeon companion", "region"), "regions/daejeon-companion");
    assert.equal(toSlug("univ hospital companion", "institution"), "places/univ-hospital-companion");
  });
});

describe("buildJsonLd", () => {
  it("Article + FAQPage + BreadcrumbList 생성", () => {
    const blocks = buildJsonLd(site, page);
    assert.equal(blocks.length, 3);
    assert.equal((blocks[0] as { "@type": string })["@type"], "Article");
    assert.equal((blocks[2] as { "@type": string })["@type"], "BreadcrumbList");
  });

  it("FAQ가 없으면 FAQPage를 생략", () => {
    const blocks = buildJsonLd(site, { ...page, faq: [] });
    assert.equal(blocks.length, 2);
  });
});
