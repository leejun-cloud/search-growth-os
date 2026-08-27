// pSEO Quality Gate (PRD §14, DECISIONS §7)
// AI를 쓰지 않는 결정적(deterministic) 검사 — 같은 입력이면 항상 같은 판정.
// 개별 페이지 검사 + Template Family(같은 페이지 타입 묶음) 단위 상호 비교가 핵심.
// 참고: ouranos-labs/pseolint의 "페이지 관계 검사" 접근.

import { db } from "./db";
import { newId, nowIso } from "./types";
import type { CheckSeverity, PageDoc, QualityCheckItem, QualityReport } from "./types";

// ---------- 유사도: 문자 5-gram 셔글(shingle) 자카드 계수 ----------
// 한국어는 공백 단어 단위가 부정확해 문자 n-gram을 쓴다.

function shingles(text: string, n = 5): Set<string> {
  const clean = text.replace(/\s+/g, " ").trim();
  const set = new Set<string>();
  for (let i = 0; i <= clean.length - n; i++) set.add(clean.slice(i, i + n));
  return set;
}

export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter); // Jaccard
}

// ---------- 개별 검사 규칙 ----------

function check(rule: string, pass: boolean, severity: CheckSeverity, detail: string): QualityCheckItem {
  return { rule, pass, severity, detail };
}

function keywordDensity(body: string, query: string): number {
  if (!query.trim()) return 0;
  const clean = body.replace(/\s+/g, " ");
  const count = clean.split(query).length - 1;
  const queryChars = count * query.length;
  return clean.length > 0 ? queryChars / clean.length : 0;
}

export async function runQualityGate(pageId: string): Promise<QualityReport> {
  const page = await db.pages.get(pageId);
  if (!page) throw new Error("page not found");
  const siblings = (await db.pages.bySite(page.siteId)).filter((p) => p.id !== page.id);

  const checks: QualityCheckItem[] = [];
  const bodyLen = page.body.replace(/\s+/g, "").length;

  // 1) thin content — 본문 분량
  checks.push(check("thin_content", bodyLen >= 800, bodyLen < 500 ? "block" : "warn",
    `본문 ${bodyLen}자 (기준: 800자 이상 권장, 500자 미만 차단)`));

  // 2) 제목/설명 길이와 존재
  checks.push(check("seo_title_length", page.seoTitle.length > 0 && page.seoTitle.length <= 60, "warn",
    `seo_title ${page.seoTitle.length}자 (1~60자)`));
  checks.push(check("meta_description_length",
    page.metaDescription.length >= 50 && page.metaDescription.length <= 155, "warn",
    `meta_description ${page.metaDescription.length}자 (50~155자)`));

  // 3) 사이트 내 title/description 중복
  const dupTitle = siblings.find((p) => p.seoTitle === page.seoTitle);
  checks.push(check("duplicate_title", !dupTitle, "block",
    dupTitle ? `"${dupTitle.slug}"와 seo_title 동일` : "고유 title"));
  const dupDesc = siblings.find((p) => p.metaDescription === page.metaDescription);
  checks.push(check("duplicate_description", !dupDesc, "warn",
    dupDesc ? `"${dupDesc.slug}"와 description 동일` : "고유 description"));

  // 4) 본문 중복 — 전체 페이지 대비 near-duplicate
  let worstSim = 0;
  let worstSlug = "";
  for (const p of siblings) {
    const sim = similarity(page.body, p.body);
    if (sim > worstSim) { worstSim = sim; worstSlug = p.slug; }
  }
  checks.push(check("near_duplicate", worstSim < 0.6, worstSim >= 0.8 ? "block" : worstSim >= 0.6 ? "block" : "info",
    worstSim > 0 ? `최대 유사도 ${(worstSim * 100).toFixed(0)}% (vs ${worstSlug}) — 60% 이상 차단` : "유사 페이지 없음"));

  // 5) Template Family QA — 같은 페이지 타입 묶음의 평균 상호 유사도
  //    "대전 병원동행 / 부산 병원동행"처럼 지역명만 바꾼 대량 생성 감지 (DECISIONS §7)
  const family = siblings.filter((p) => p.pageType === page.pageType);
  if (family.length >= 2) {
    const sims = family.map((p) => similarity(page.body, p.body));
    const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
    checks.push(check("template_family_similarity", avg < 0.45, "block",
      `같은 타입(${page.pageType}) ${family.length}개 페이지와 평균 유사도 ${(avg * 100).toFixed(0)}% — 45% 이상이면 지역명 치환형 대량 생성으로 판단해 차단`));
  }

  // 6) keyword stuffing — 목표 검색어 과다 반복
  const density = keywordDensity(page.body, page.targetQuery);
  checks.push(check("keyword_stuffing", density < 0.05, density >= 0.08 ? "block" : "warn",
    `검색어 밀도 ${(density * 100).toFixed(1)}% (5% 미만 권장)`));

  // 7) orphan 방지 — 내부링크 존재 (사이트 첫 페이지는 예외)
  const hasLinks = page.internalLinks.length >= 1 || siblings.length === 0;
  checks.push(check("orphan_page", hasLinks, "warn",
    `내부링크 ${page.internalLinks.length}개 (기존 페이지가 있으면 1개 이상, 3~8개 권장)`));

  // 8) 내부링크 대상 유효성
  const siblingSlugs = new Set(siblings.map((p) => p.slug));
  const broken = page.internalLinks.filter((l) => !siblingSlugs.has(l.slug));
  checks.push(check("broken_internal_links", broken.length === 0, "warn",
    broken.length ? `존재하지 않는 페이지로의 링크 ${broken.length}개: ${broken.map((b) => b.slug).join(", ")}` : "모든 내부링크 유효"));

  // 9) 구조화 데이터 존재
  checks.push(check("schema_present", (page.schemaJsonld?.length ?? 0) > 0, "warn",
    `JSON-LD ${page.schemaJsonld?.length ?? 0}개 블록`));

  // 10) 근거 없는 수치 주장 휴리스틱 — Fact Pack에 없는 % / 배 수치
  const factPack = page.factPackId ? await db.factPacks.get(page.factPackId) : null;
  const factText = factPack ? JSON.stringify(factPack) : "";
  const numericClaims = page.body.match(/\d+(?:\.\d+)?\s*(?:%|배|명|건|위)/g) ?? [];
  const unsupported = numericClaims.filter((c) => !factText.includes(c.replace(/\s/g, "")) && !factText.includes(c));
  checks.push(check("unsupported_claims", unsupported.length <= 2, unsupported.length > 5 ? "block" : "warn",
    unsupported.length ? `Fact Pack에서 확인되지 않는 수치 표현 ${unsupported.length}개: ${unsupported.slice(0, 5).join(", ")} — 사실 확인 필요` : "수치 주장 모두 근거 확인"));

  // ---------- 판정 ----------
  const failedBlocks = checks.filter((c) => !c.pass && c.severity === "block");
  const failedWarns = checks.filter((c) => !c.pass && c.severity === "warn");
  const verdict: QualityReport["verdict"] =
    failedBlocks.length > 0 ? "block" : failedWarns.length > 0 ? "warn" : "pass";
  const score = Math.max(0, Math.round(100 - failedBlocks.length * 30 - failedWarns.length * 8));

  const report: QualityReport = {
    id: newId("qc"),
    siteId: page.siteId,
    pageId: page.id,
    checks,
    score,
    verdict,
    createdAt: nowIso(),
  };
  await db.qualityReports.put(report);

  // 페이지 상태 반영: 차단이면 blocked, 통과면 review로 승격
  const nextStatus = verdict === "block" ? "blocked" : page.status === "draft" ? "review" : page.status;
  await db.pages.put({ ...page, qualityScore: score, status: nextStatus, updatedAt: nowIso() });

  return report;
}
