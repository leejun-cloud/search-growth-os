// Publisher — Site Adapter (PRD §17) + Sitemap/RSS/robots/llms.txt (PRD §16)
// LocalFileAdapter: 발행물을 data/published/{siteId}/ 아래 파일로 출력 (기본)
// NextjsWebhookAdapter: 대상 사이트의 수신 엔드포인트로 POST (환경변수 설정 시)

import { promises as fs } from "fs";
import path from "path";
import { db } from "./db";
import { nowIso } from "./types";
import type { PageDoc, Site } from "./types";

export interface PublishResult {
  ok: boolean;
  adapter: string;
  location: string;
  message?: string;
}

interface SiteAdapter {
  name: string;
  publishPage(site: Site, page: PageDoc): Promise<PublishResult>;
}

// ---------- Local File Adapter ----------

function publishDir(siteId: string): string {
  return path.join(process.cwd(), "data", "published", siteId);
}

const localFileAdapter: SiteAdapter = {
  name: "local-file",
  async publishPage(site, page) {
    const dir = publishDir(site.id);
    const fileBase = page.slug.replace(/\//g, "__");
    await fs.mkdir(dir, { recursive: true });

    // 발행 번들: 프론트매터 포함 마크다운 + 전체 JSON
    const frontmatter = [
      "---",
      `title: ${JSON.stringify(page.seoTitle)}`,
      `description: ${JSON.stringify(page.metaDescription)}`,
      `slug: ${page.slug}`,
      `canonical: ${page.canonicalUrl ?? ""}`,
      `pageType: ${page.pageType}`,
      `targetQuery: ${JSON.stringify(page.targetQuery)}`,
      "---",
    ].join("\n");
    const faqMd = page.faq.length
      ? "\n\n## 자주 묻는 질문\n\n" + page.faq.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")
      : "";
    const linksMd = page.internalLinks.length
      ? "\n\n## 관련 페이지\n\n" + page.internalLinks.map((l) => `- [${l.anchor}](/${l.slug})`).join("\n")
      : "";

    await fs.writeFile(path.join(dir, `${fileBase}.md`), `${frontmatter}\n\n# ${page.h1}\n\n${page.body}${faqMd}${linksMd}\n`, "utf-8");
    await fs.writeFile(path.join(dir, `${fileBase}.json`), JSON.stringify(page, null, 2), "utf-8");

    return { ok: true, adapter: "local-file", location: path.join(dir, `${fileBase}.md`) };
  },
};

// ---------- Next.js Webhook Adapter ----------
// 대상 사이트에 발행 수신 API가 있을 때 사용.
// 환경변수: SGO_PUBLISH_ENDPOINT (URL), SGO_PUBLISH_SECRET (인증 시크릿)

const nextjsWebhookAdapter: SiteAdapter = {
  name: "nextjs-webhook",
  async publishPage(_site, page) {
    const endpoint = process.env.SGO_PUBLISH_ENDPOINT;
    const secret = process.env.SGO_PUBLISH_SECRET;
    if (!endpoint) {
      return {
        ok: false, adapter: "nextjs-webhook", location: "",
        message: "SGO_PUBLISH_ENDPOINT가 설정되지 않았습니다. local-file로 발행하거나 대상 사이트 엔드포인트를 설정하세요.",
      };
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret ?? ""}` },
      body: JSON.stringify(page),
    });
    return {
      ok: res.ok, adapter: "nextjs-webhook", location: endpoint,
      message: res.ok ? undefined : `대상 사이트 응답 ${res.status}`,
    };
  },
};

function getAdapter(site: Site): SiteAdapter {
  if (site.platform === "nextjs" && process.env.SGO_PUBLISH_ENDPOINT) return nextjsWebhookAdapter;
  return localFileAdapter;
}

// ---------- 발행 실행 ----------

export async function publishPage(pageId: string): Promise<PublishResult> {
  const page = await db.pages.get(pageId);
  if (!page) throw new Error("page not found");
  const site = await db.sites.get(page.siteId);
  if (!site) throw new Error("site not found");

  // Quality Gate 통과 없이는 발행 금지 (Quality Gate First 원칙)
  const report = await db.qualityReports.byPage(page.id);
  if (!report) return { ok: false, adapter: "-", location: "", message: "품질검사를 먼저 실행하세요." };
  if (report.verdict === "block") return { ok: false, adapter: "-", location: "", message: "품질검사 차단(block) 상태입니다. 문제를 해결한 뒤 재검사하세요." };

  const result = await getAdapter(site).publishPage(site, page);
  if (result.ok) {
    await db.pages.put({ ...page, status: "published", publishedAt: nowIso(), updatedAt: nowIso() });
    await regenerateFeeds(site.id);
  }
  return result;
}

// ---------- Sitemap / RSS / robots / llms.txt ----------

export async function regenerateFeeds(siteId: string): Promise<string[]> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found");
  const pages = await db.pages.published(siteId);
  const origin = site.domain.replace(/\/$/, "");
  const dir = publishDir(siteId);
  await fs.mkdir(dir, { recursive: true });

  const urls = pages
    .filter((p) => p.indexPolicy === "index")
    .map((p) => ({
      loc: `${origin}/${p.slug}`,
      lastmod: (p.updatedAt ?? p.publishedAt ?? nowIso()).slice(0, 10),
      title: p.seoTitle,
      description: p.metaDescription,
    }));

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  const rss =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
    `<title>${escapeXml(site.name)}</title>\n<link>${escapeXml(origin)}</link>\n<description>${escapeXml(site.name)} 콘텐츠 피드</description>\n` +
    urls.map((u) =>
      `<item><title>${escapeXml(u.title)}</title><link>${escapeXml(u.loc)}</link><description>${escapeXml(u.description)}</description></item>`
    ).join("\n") +
    `\n</channel></rss>\n`;

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;

  const llms =
    `# ${site.name}\n\n> ${site.primaryServices.join(", ")} 서비스를 제공합니다.\n\n## 주요 페이지\n\n` +
    urls.map((u) => `- [${u.title}](${u.loc}): ${u.description}`).join("\n") + "\n";

  const files = [
    ["sitemap.xml", sitemap],
    ["rss.xml", rss],
    ["robots.txt", robots],
    ["llms.txt", llms],
  ] as const;

  const written: string[] = [];
  for (const [name, content] of files) {
    const p = path.join(dir, name);
    await fs.writeFile(p, content, "utf-8");
    written.push(p);
  }
  return written;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string)
  );
}
