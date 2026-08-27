// 전체 파이프라인 관통 테스트 (E2E)
// 사용법: SGO_AI=mock npm run demo   (mock: AI 없이 구조 검증)
//        npm run demo               (claude-cli 사용 — 실제 AI 생성)

import { db } from "../src/lib/db";
import { saveBusinessProfile, seedEntities } from "../src/lib/knowledge";
import { generateOpportunities, qualifyOpportunity } from "../src/lib/opportunity";
import { buildFactPack } from "../src/lib/factpack";
import { generateDraft } from "../src/lib/factory";
import { runQualityGate } from "../src/lib/quality";
import { publishPage } from "../src/lib/publish";
import { importGscCsv } from "../src/lib/analytics";
import { runGrowthAgent } from "../src/lib/growth";
import { newId, nowIso } from "../src/lib/types";
import type { Site } from "../src/lib/types";

async function main() {
  console.log(`\n=== Search Growth OS 데모 (AI: ${process.env.SGO_AI ?? "claude-cli"}) ===\n`);

  // 1. 사이트 등록
  const site: Site = {
    id: newId("site"),
    name: "데모: 놀공 드림브릿지",
    domain: "https://db.nolgong.app",
    platform: "nextjs",
    primaryLanguage: "ko",
    targetRegions: ["대전", "전국"],
    primaryServices: ["AI 홈페이지 제작", "AI 상담봇"],
    audiences: ["중소기업"],
    conversionGoals: ["상담 문의"],
    autoPublishAllowed: false,
    thresholds: { autoDraft: 80, reviewQueue: 65, enrich: 50 },
    pilotCriteria: { weeks: 8, minIndexRate: 70, minQueryCount: 50 },
    createdAt: nowIso(),
  };
  await db.sites.put(site);
  console.log("1. 사이트 등록 ✅", site.id);

  // 2. 사업 지식 입력
  await saveBusinessProfile(site.id, {
    industry: "AI 홈페이지 제작 및 업무 자동화",
    services: "AI 홈페이지 제작(2주 내 완성, 반응형), AI 상담봇 구축, 콘텐츠 자동화",
    regions: "대전 기반, 전국 온라인 대응",
    customerTypes: "중소기업, 병원, 교육기관, NGO",
    pricing: "홈페이지 제작 기본형은 상담 후 견적, 유지보수 월 계약",
    faq: "Q: 제작 기간은? A: 평균 2주. Q: 수정 요청은? A: 유지보수 계약 시 월 단위 대응.",
    companyIntro: "드림브릿지는 AI 기반 웹 제작·자동화 스튜디오",
    process: "상담 → 기획 → 제작 → 검수 → 오픈 → 검색 성장 운영",
    extraNotes: "",
  });
  console.log("2. 사업 지식 저장 ✅");

  // 3. Entity 추출
  const entities = await seedEntities(site.id);
  console.log(`3. Entity 추출 ✅ ${entities.length}개`);

  // 4. 검색기회 발굴
  const opps = await generateOpportunities(site.id, 5);
  console.log(`4. 검색기회 발굴 ✅ ${opps.length}개:`, opps.map((o) => o.query).join(" / "));

  // 5. 채점
  let best = null;
  for (const o of opps) {
    const q = await qualifyOpportunity(o.id);
    console.log(`5. 채점: "${q.query}" → ${q.opportunityScore}점 (${q.status})`);
    if (!best || (q.opportunityScore ?? 0) > (best.opportunityScore ?? 0)) best = q;
  }
  if (!best || best.status === "rejected") throw new Error("채점 통과 후보가 없습니다.");

  // 6. Fact Pack → 초안 → 품질검사
  const pack = await buildFactPack(best.id);
  console.log(`6. Fact Pack ✅ 확인된 사실 ${pack.verifiedFacts.length}건, 금지 ${pack.prohibitedAssumptions.length}건`);
  const page = await generateDraft(best.id);
  console.log(`7. 초안 생성 ✅ "${page.title}" (/${page.slug}, 본문 ${page.body.length}자)`);
  const report = await runQualityGate(page.id);
  console.log(`8. 품질검사 ✅ ${report.score}점 / ${report.verdict}`);
  for (const c of report.checks.filter((c) => !c.pass)) console.log(`   ⚠ ${c.rule}: ${c.detail}`);

  // 9. 발행 (block이면 발행이 거부되는 것까지가 정상 동작)
  const pub = await publishPage(page.id);
  console.log(`9. 발행 ${pub.ok ? "✅ " + pub.location : "⛔ 거부됨 (정상 동작): " + pub.message}`);

  // 10. GSC CSV import (샘플)
  const sampleCsv = `상위 쿼리,클릭수,노출수,CTR,게재순위
AI 홈페이지 제작 비용,12,850,1.4%,12.3
대전 홈페이지 제작,3,420,0.7%,8.1
홈페이지 검색 노출,0,150,0%,25.4
AI 상담봇 구축,5,600,0.8%,6.2`;
  const imported = await importGscCsv(site.id, sampleCsv, "demo 28d");
  console.log(`10. GSC CSV import ✅ ${imported.imported}행 (${imported.dimension})`);

  // 11. Growth Agent
  const actions = await runGrowthAgent(site.id);
  console.log(`11. Growth Agent ✅ 제안 ${actions.length}건:`);
  for (const a of actions) console.log(`   [${a.action}] ${a.target} — ${a.reason}`);

  console.log("\n=== 전체 파이프라인 정상 동작 ===\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("데모 실패:", e);
  process.exit(1);
});
