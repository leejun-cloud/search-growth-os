// pSEO Quality Gate (PRD §14, DECISIONS §7)
// AI를 쓰지 않는 결정적(deterministic) 검사 — 같은 입력이면 항상 같은 판정.
// 개별 페이지 검사 + Template Family(같은 페이지 타입 묶음) 단위 상호 비교가 핵심.
// 참고: ouranos-labs/pseolint의 "페이지 관계 검사" 접근.

import { db } from "./db";
import { newId, nowIso } from "./types";
import type { CheckSeverity, QualityCheckItem, QualityReport } from "./types";

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

// ---------- 주제 중복: 제목의 희귀 단어 겹침 ----------
//
// 본문 셔글은 복붙을 잡는다. 그런데 AI 대량 생성의 실제 실패 모드는 복붙이
// 아니라 **같은 주제를 다시 쓰는 것**이다. 같은 말을 다른 문장으로 하면
// 문자 5-gram 은 거의 안 겹친다.
//
// 실측(블로그 24편, 제목이 사실상 같은 중복 3무리):
//
//   여름 가이드 3편   본문 셔글 0.244   제목 0.847
//   한류 순례 3편     본문 셔글 0.192   제목 0.497
//   쇼핑 가이드 2편   본문 셔글 0.222   제목 1.000
//   서로 다른 주제    본문 셔글 0.127   제목 0.000
//
// 셔글 기준(0.6)으로는 세 무리 모두 통과한다 — 못 잡는다.
//
// 흔한 단어는 저절로 무시된다. 사이트 전체에서 몇 페이지가 쓰는지로
// 가중치를 매기기 때문이다(IDF). 불용어 목록을 손으로 관리하지 않아도 되고
// 한국어 조사도 흔하면 알아서 깎인다.

/** 제목을 비교용 토큰으로. 한글·영문·숫자만 남긴다. */
export function titleTokens(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .split(/[^0-9a-z가-힣]+/)
        .filter((w) => w.length >= 2)
    ),
  ];
}

/** 말뭉치 전체에서 각 단어의 가중치(IDF)를 만든다. */
export function tokenWeights(titles: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const title of titles) {
    for (const w of titleTokens(title)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  return new Map([...df].map(([w, n]) => [w, Math.log(titles.length / n)] as const));
}

/** 두 제목이 같은 검색어를 노리는 정도. 0~1. */
export function topicSimilarity(a: string, b: string, weight: Map<string, number>): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  const setB = new Set(tb);
  const shared = ta.filter((w) => setB.has(w));
  if (shared.length === 0) return 0;
  const sum = (ws: string[]) => ws.reduce((n, w) => n + (weight.get(w) ?? 0), 0);
  const denom = Math.sqrt(sum(ta) * sum(tb));
  return denom === 0 ? 0 : sum(shared) / denom;
}

// ---------- 개별 검사 규칙 ----------

function check(rule: string, pass: boolean, severity: CheckSeverity, detail: string): QualityCheckItem {
  return { rule, pass, severity, detail };
}

export function keywordDensity(body: string, query: string): number {
  if (!query.trim()) return 0;
  const clean = body.replace(/\s+/g, " ");
  const count = clean.split(query).length - 1;
  const queryChars = count * query.length;
  return clean.length > 0 ? queryChars / clean.length : 0;
}

export async function runQualityGate(pageId: string): Promise<QualityReport> {
  const page = await db.pages.get(pageId);
  if (!page) throw new Error("page not found");
  const site = await db.sites.get(page.siteId);
  // 사이트별 기준 조정(PR #2, onyouk0327-coder) — 기본값은 기존과 동일
  const q = site?.thresholds?.quality ?? {
    minBodyChars: 800, thinBlockChars: 500, maxSimilarity: 0.6, maxFamilySimilarity: 0.45, maxKeywordDensity: 0.05,
  };
  const siblings = (await db.pages.bySite(page.siteId)).filter((p) => p.id !== page.id);

  const checks: QualityCheckItem[] = [];
  const bodyLen = page.body.replace(/\s+/g, "").length;

  // 1) thin content — 본문 분량
  checks.push(check("thin_content", bodyLen >= q.minBodyChars, bodyLen < q.thinBlockChars ? "block" : "warn",
    `본문 ${bodyLen}자 (기준: ${q.minBodyChars}자 이상 권장, ${q.thinBlockChars}자 미만 차단)`));

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
  checks.push(check("near_duplicate", worstSim < q.maxSimilarity, worstSim >= q.maxSimilarity ? "block" : "info",
    worstSim > 0 ? `최대 유사도 ${(worstSim * 100).toFixed(0)}% (vs ${worstSlug}) — ${Math.round(q.maxSimilarity * 100)}% 이상 차단` : "유사 페이지 없음"));

  // 4-b) 주제 중복 — 같은 검색어를 노리는 형제 페이지
  //      본문 셔글(4번)이 놓치는 "다시 쓴 같은 글"을 제목으로 잡는다.
  //      실측에서 셔글 0.19~0.24 로 전부 통과하던 중복 3무리가 여기서 잡힌다.
  const titles = [page.seoTitle, ...siblings.map((p) => p.seoTitle)];
  const weight = tokenWeights(titles);
  let worstTopic = 0;
  let worstTopicSlug = "";
  for (const p of siblings) {
    const sim = topicSimilarity(page.seoTitle, p.seoTitle, weight);
    if (sim > worstTopic) { worstTopic = sim; worstTopicSlug = p.slug; }
  }
  checks.push(check("topic_duplicate", worstTopic < 0.5, worstTopic >= 0.5 ? "block" : "info",
    worstTopic > 0
      ? `제목 주제 유사도 최대 ${(worstTopic * 100).toFixed(0)}% (vs ${worstTopicSlug}) — 50% 이상이면 같은 검색어를 노려 서로 순위를 갉아먹는다`
      : "같은 주제를 노리는 형제 페이지 없음"));

  // 5) Template Family QA — 같은 페이지 타입 묶음의 평균 상호 유사도
  //    "대전 병원동행 / 부산 병원동행"처럼 지역명만 바꾼 대량 생성 감지 (DECISIONS §7)
  const family = siblings.filter((p) => p.pageType === page.pageType);
  if (family.length >= 2) {
    const sims = family.map((p) => similarity(page.body, p.body));
    const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
    checks.push(check("template_family_similarity", avg < q.maxFamilySimilarity, "block",
      `같은 타입(${page.pageType}) ${family.length}개 페이지와 평균 유사도 ${(avg * 100).toFixed(0)}% — ${Math.round(q.maxFamilySimilarity * 100)}% 이상이면 지역명 치환형 대량 생성으로 판단해 차단`));
  }

  // 6) keyword stuffing — 목표 검색어 과다 반복
  const density = keywordDensity(page.body, page.targetQuery);
  checks.push(check("keyword_stuffing", density < q.maxKeywordDensity, density >= q.maxKeywordDensity + 0.03 ? "block" : "warn",
    `검색어 밀도 ${(density * 100).toFixed(1)}% (${Math.round(q.maxKeywordDensity * 100)}% 미만 권장)`));

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
  // 표기가 달라도 같은 사실이면 통과시킨다.
  //
  // 문자열 포함으로만 보면 Fact Pack 과 본문이 같은 수치를 다르게 적었을 때
  // "근거 없음" 이 된다. 실제로 걸린 예: Fact Pack "813번 간선" ↔ 본문
  // "813(간선)". 같은 버스인데 오탐이다. 천 단위 구분(1,200 ↔ 1200),
  // 공백(30 % ↔ 30%), 소수점 표기(3.0배 ↔ 3배)도 같은 문제를 만든다.
  //
  // 그래서 숫자와 단위만 남겨 비교한다. 근거를 느슨하게 보는 게 아니라
  // **표기 차이를 사실 차이로 착각하지 않으려는 것**이다.
  const canon = (s: string) =>
    s.replace(/[,\s]/g, "").replace(/(\d)\.0+(?!\d)/g, "$1");
  const factCanon = canon(factText);
  const unsupported = numericClaims.filter((c) => !factCanon.includes(canon(c)));
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
