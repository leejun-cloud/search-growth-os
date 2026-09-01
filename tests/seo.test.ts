import { describe, expect, it } from "vitest";
import { buildJsonLd, toSlug } from "../src/lib/seo";
import type { PageDoc, Site } from "../src/lib/types";

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
      maxKeywordDensity: 0.05
    }
  },
  pilotCriteria: { weeks:8, minIndexRate:70, minQueryCount:50 },
  createdAt: "2026-01-01"
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
  updatedAt: "2026-01-01"
};

describe("toSlug", () => {
  it("keeps korean/alphanumeric, strips punctuation", () => {
    expect(toSlug("AI homepage cost!", "guide")).toBe("guides/ai-homepage-cost");
  });

  it("prefix by page type", () => {
    expect(toSlug("daejeon companion", "region")).toBe("regions/daejeon-companion");
    expect(toSlug("univ hospital companion", "institution")).toBe("places/univ-hospital-companion");
  });
});

describe("buildJsonLd", () => {
  it("emits Article + FAQPage + BreadcrumbList", () => {
    const blocks = buildJsonLd(site, page);
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as { "@type": string })["@type"]).toBe("Article");
    expect((blocks[2] as { "@type": string })["@type"]).toBe("BreadcrumbList");
  });

  it("omits FAQPage when no faq", () => {
    const blocks = buildJsonLd(site, { ...page, faq: [] });
    expect(blocks).toHaveLength(2);
  });
});
