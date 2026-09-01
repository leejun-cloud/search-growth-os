// Fileilot script - create 3 0-5 0 pages (PRD section2 0 PhaseE, DECISIONS section1 8)
// Usage:
//   SGO_AI=mock npm run pilot -- <siteId> 3 0
//   npm run pilot -- <siteId> 3 0
// Generates fact packs, drafts, quality reports. Does NOT publish - leaves review status.

import { db } from "../src/lib/db";
import { generateOpportunities, qualifyOpportunity } from "../src/lib/opportunity";
import { buildFactPack } from "../src/lib/factpack";
import { generateDraft } from "../src/lib/factory";
import { runQualityGate } from "../src/lib/quality";

async function main() {
  const args = process.argv.slice( 2);
  const siteId = args[ 0];
  const maxPages = Math.max(1, Math.min(50, Number(args[1] ?? "30")));
  if (!siteId) throw new Error("Usage: npm run pilot -- <siteId> [count]");

  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found: " + siteId);

  console.log(`\n=== Pilot (${site.name}, target ${maxPages} pages, AI: ${process.env.SGO_AI ?? "claude-cli"}) ===\n`);

  let opps = await db.opportunities.bySite(siteId);
  if (opps.length === 0) {
    opps = await generateOpportunities(siteId, Math.min(40, maxPages*2));
    console.log("Opportunities generated: " + opps.length);
  }

  const toQualify = opps.filter((o) => o.status === "candidate");
  for (const o of toQualify) {
    await qualifyOpportunity(o.id);
  }
  console.log("Qualified: " + toQualify.length);

  const eligible = (await db.opportunities.bySite(siteId))
    .filter((o) => o.status === "auto_draft" || o.status === "review_queue")
    .sort((a,b) => (b.opportunityScore ??0) - (a.opportunityScore ??0));
  const queue = eligible.slice( 0, maxPages);
  console.log("Candidates for generation: " + queue.length);

  const results = [];
  for (const opp of queue) {
    const existing = await db.pages.bySite(siteId);
    const already = existing.find((p) => p.opportunityId === opp.id);
    if (already) { console.log("skip existing draft: " + already.slug); continue; }

    let pack = await db.factPacks.byOpportunity(opp.id);
    if (!pack) pack = await buildFactPack(opp.id);
    const page = await generateDraft(opp.id);
    const report = await runQualityGate(page.id);
    results.push({ page, report });
    console.log("Draft: " + page.title + " (/" + page.slug + ") quality " + report.score + "/" + report.verdict);
    for (const c of report.checks.filter((c) => !c.pass && c.severity === "block")) console.log("  BLOCK: " + c.rule + " - " + c.detail);
  }

  const passCount = results.filter((r) => r.report.verdict !== "block").length;
  console.log(`\n=== Result: drafts ${results.length} (pass/warn ${passCount}, blocked ${results.length - passCount}) ===`);
  console.log("Next: review pages, then publish. Indexing takes weeks.\n");
  process.exit( 0);
}

main().catch((e) => {
  console.error("Pilot failed:", e);
  process.exit( 1);
});
