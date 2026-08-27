// 직접 서빙 모드용 실시간 sitemap — /p/{siteId}/sitemap.xml

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const site = await db.sites.get(siteId);
  if (!site) return new Response("not found", { status: 404 });
  const pages = await db.pages.published(siteId);
  const origin = site.domain.replace(/\/$/, "");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages
      .filter((p) => p.indexPolicy === "index")
      .map((p) => `  <url><loc>${origin}/${p.slug}</loc><lastmod>${(p.updatedAt ?? "").slice(0, 10)}</lastmod></url>`)
      .join("\n") +
    `\n</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
