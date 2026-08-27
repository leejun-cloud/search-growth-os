// Site Auditor — 기술 SEO 진단 (PRD §5 초기 진단, §16 Rendering Gate)
// HTTP로 받은 "초기 HTML"만 분석한다. 검색로봇이 보는 것과 같은 관점.
// 핵심 본문이 JS 실행 후에만 나타나는 페이지는 renderingRisk로 표시한다.

import * as cheerio from "cheerio";
import { db } from "./db";
import { newId, nowIso } from "./types";
import type { AuditIssue, AuditPage, AuditReport } from "./types";

const MAX_PAGES = 30;
const FETCH_TIMEOUT_MS = 15_000;
const UA = "SearchGrowthOS-Auditor/0.1 (+seo-audit)";

async function fetchText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

async function exists(url: string): Promise<boolean> {
  const r = await fetchText(url);
  return !!r && r.status >= 200 && r.status < 300 && r.text.length > 0;
}

function normalizeUrl(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    if (u.origin !== base.origin) return null;
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|mp4|woff2?)($|\?)/i.test(u.pathname)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function analyzePage(url: string, status: number, html: string): AuditPage {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.length; // 한국어는 공백 단어수가 무의미해 글자수 기준

  const $full = cheerio.load(html);
  const jsonLdTypes: string[] = [];
  $full('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($full(el).text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) if (item["@type"]) jsonLdTypes.push(String(item["@type"]));
    } catch { /* 잘못된 JSON-LD는 타입 수집만 생략 */ }
  });

  // Rendering Gate 휴리스틱: 초기 HTML에 본문이 거의 없으면 JS 렌더링 의존 위험
  const loadingMarkers = /로딩|loading|불러오는 중|잠시만/i.test(bodyText.slice(0, 300));
  const h1 = $full("h1").first().text().trim() || null;
  let renderingRisk: AuditPage["renderingRisk"] = "low";
  if (wordCount < 200 || loadingMarkers) renderingRisk = "high";
  else if (wordCount < 600 && !h1) renderingRisk = "medium";

  return {
    url,
    httpStatus: status,
    title: $full("title").first().text().trim() || null,
    metaDescription: $full('meta[name="description"]').attr("content")?.trim() || null,
    h1,
    canonical: $full('link[rel="canonical"]').attr("href")?.trim() || null,
    robotsMeta: $full('meta[name="robots"]').attr("content")?.trim() || null,
    jsonLdTypes,
    internalLinkCount: $full("a[href]").length,
    wordCount,
    renderingRisk,
  };
}

function buildIssues(pages: AuditPage[], flags: { hasSitemap: boolean; hasRss: boolean; hasRobotsTxt: boolean }): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const byValue = (get: (p: AuditPage) => string | null) => {
    const map = new Map<string, string[]>();
    for (const p of pages) {
      const v = get(p);
      if (!v) continue;
      map.set(v, [...(map.get(v) ?? []), p.url]);
    }
    return [...map.entries()].filter(([, urls]) => urls.length > 1);
  };

  const dupTitles = byValue((p) => p.title);
  if (dupTitles.length)
    issues.push({
      severity: "block", code: "duplicate_title",
      message: `${dupTitles.length}개 title이 여러 페이지에서 중복됩니다. 페이지별 고유 title이 필요합니다.`,
      urls: dupTitles.flatMap(([, u]) => u).slice(0, 10),
    });

  const dupDesc = byValue((p) => p.metaDescription);
  if (dupDesc.length)
    issues.push({
      severity: "warn", code: "duplicate_description",
      message: `${dupDesc.length}개 meta description이 중복됩니다.`,
      urls: dupDesc.flatMap(([, u]) => u).slice(0, 10),
    });

  const noTitle = pages.filter((p) => !p.title);
  if (noTitle.length)
    issues.push({ severity: "block", code: "missing_title", message: `${noTitle.length}개 페이지에 title이 없습니다.`, urls: noTitle.map((p) => p.url) });

  const noDesc = pages.filter((p) => !p.metaDescription);
  if (noDesc.length)
    issues.push({ severity: "warn", code: "missing_description", message: `${noDesc.length}개 페이지에 meta description이 없습니다.`, urls: noDesc.map((p) => p.url).slice(0, 10) });

  const noH1 = pages.filter((p) => !p.h1);
  if (noH1.length)
    issues.push({ severity: "warn", code: "missing_h1", message: `${noH1.length}개 페이지에 h1이 없습니다.`, urls: noH1.map((p) => p.url).slice(0, 10) });

  const csr = pages.filter((p) => p.renderingRisk === "high");
  if (csr.length)
    issues.push({
      severity: "block", code: "rendering_gate_fail",
      message: `${csr.length}개 페이지의 초기 HTML에 본문이 거의 없습니다. 검색로봇에게 빈 페이지로 보일 수 있어 SSR/SSG 전환이 필요합니다.`,
      urls: csr.map((p) => p.url),
    });

  const noCanonical = pages.filter((p) => !p.canonical);
  if (noCanonical.length)
    issues.push({ severity: "info", code: "missing_canonical", message: `${noCanonical.length}개 페이지에 canonical이 없습니다.`, urls: noCanonical.map((p) => p.url).slice(0, 10) });

  const noSchema = pages.filter((p) => p.jsonLdTypes.length === 0);
  if (noSchema.length === pages.length && pages.length > 0)
    issues.push({ severity: "warn", code: "no_structured_data", message: "구조화 데이터(JSON-LD)가 전혀 없습니다." });

  if (!flags.hasSitemap) issues.push({ severity: "block", code: "no_sitemap", message: "sitemap.xml이 없습니다. 검색로봇의 URL 발견이 어렵습니다." });
  if (!flags.hasRss) issues.push({ severity: "warn", code: "no_rss", message: "RSS 피드가 없습니다. 네이버 신규 콘텐츠 발견에 불리합니다." });
  if (!flags.hasRobotsTxt) issues.push({ severity: "warn", code: "no_robots", message: "robots.txt가 없습니다." });

  return issues;
}

/** 사이트를 크롤링(BFS)하며 기술 SEO를 진단하고 결과를 저장한다. */
export async function runAudit(siteId: string): Promise<AuditReport> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found: " + siteId);

  const base = new URL(site.domain);
  const queue: string[] = [base.toString()];
  const seen = new Set<string>(queue);
  const pages: AuditPage[] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    const res = await fetchText(url);
    if (!res) continue;
    const page = analyzePage(url, res.status, res.text);
    pages.push(page);

    if (res.status >= 200 && res.status < 300) {
      const $ = cheerio.load(res.text);
      $("a[href]").each((_, el) => {
        const next = normalizeUrl($(el).attr("href") ?? "", base);
        if (next && !seen.has(next) && seen.size < MAX_PAGES * 4) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
  }

  const [hasSitemap, hasRss, hasRobotsTxt, hasLlmsTxt] = await Promise.all([
    exists(new URL("/sitemap.xml", base).toString()),
    (async () => (await exists(new URL("/rss.xml", base).toString())) || (await exists(new URL("/feed.xml", base).toString())))(),
    exists(new URL("/robots.txt", base).toString()),
    exists(new URL("/llms.txt", base).toString()),
  ]);

  const report: AuditReport = {
    id: newId("aud"),
    siteId,
    startUrl: base.toString(),
    crawledCount: pages.length,
    hasSitemap,
    hasRss,
    hasRobotsTxt,
    hasLlmsTxt,
    pages,
    issues: buildIssues(pages, { hasSitemap, hasRss, hasRobotsTxt }),
    createdAt: nowIso(),
  };
  await db.auditReports.put(report);
  return report;
}
