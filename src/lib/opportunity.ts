// Search Opportunity Engine (PRD §9) + Page Qualification Engine (PRD §10)
// "조합 가능 = 발행 가능"이 아니다 — 모든 후보는 100점 채점을 통과해야 한다.

import { generateJson } from "./ai";
import { db } from "./db";
import { newId, nowIso, PAGE_TYPES } from "./types";
import type {
  Intent, Opportunity, OpportunityStatus, PageType, QualificationScores, Site,
} from "./types";

const VALID_INTENTS: Intent[] = [
  "informational", "commercial_information", "transactional", "navigational", "local",
];

interface RawOpportunity {
  query: string;
  intent: Intent;
  entities: string[];
  recommended_page_type: PageType;
  evidence: string[];
}

/** 사업지식 + Entity + 진단결과를 근거로 검색기회 후보를 생성한다. */
export async function generateOpportunities(siteId: string, count = 15): Promise<Opportunity[]> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found");
  const profile = await db.businessProfiles.getBySite(siteId);
  const entities = await db.entities.bySite(siteId);
  const audit = await db.auditReports.latest(siteId);
  const existing = await db.opportunities.bySite(siteId);

  if (entities.length === 0) throw new Error("Entity가 없습니다. 사업 지식을 먼저 입력하고 Entity를 생성하세요.");

  const entitySummary = entities
    .map((e) => `- [${e.type}] ${e.name}${e.data ? " " + JSON.stringify(e.data) : ""}`)
    .join("\n");

  const prompt = `당신은 검색 성장 전략가다. 아래 사업의 검색기회(사람들이 실제로 검색할 만한 검색어와 그에 맞는 페이지)를 발굴하라.

## 사업 정보
- 사이트: ${site.name} (${site.domain}), 언어: ${site.primaryLanguage}
- 업종: ${profile?.industry ?? "미입력"}
- 전환 목표: ${site.conversionGoals.join(", ") || "문의"}

## 보유 Entity (이것만 근거로 사용)
${entitySummary}

## 기존 사이트 상태
${audit ? `크롤링된 페이지 ${audit.crawledCount}개, 주요 이슈: ${audit.issues.map((i) => i.code).join(", ")}` : "진단 없음"}

## 이미 있는 검색기회 (중복 생성 금지)
${existing.map((o) => o.query).join(", ") || "없음"}

## 규칙
- 실제 한국 사용자가 검색창에 입력할 법한 구체적 검색어만. 아무도 검색하지 않을 조합 금지.
- 경쟁이 심한 초광범위 키워드(예: "홈페이지")보다 전환 가능성 있는 롱테일 우선.
- intent: ${VALID_INTENTS.join(" | ")}
- recommended_page_type: ${PAGE_TYPES.join(" | ")}
- entities: 위 Entity 목록의 name만 사용
- evidence: 이 검색어를 노릴 근거 (보유 데이터/서비스 연관성)
- ${count}개 생성.

## 출력 (JSON만)
{"opportunities": [{"query":"...","intent":"commercial_information","entities":["..."],"recommended_page_type":"cost","evidence":["..."]}]}

<<<MOCK_FALLBACK>>>
{"opportunities": [
 {"query":"AI 홈페이지 제작 비용","intent":"commercial_information","entities":["AI 홈페이지 제작"],"recommended_page_type":"cost","evidence":["가격 데이터 보유","전환 직결"]},
 {"query":"대전 홈페이지 제작 업체","intent":"local","entities":["AI 홈페이지 제작","대전"],"recommended_page_type":"region","evidence":["서비스 지역"]},
 {"query":"홈페이지 검색 노출 안될 때","intent":"informational","entities":["홈페이지 검색 노출 부족"],"recommended_page_type":"guide","evidence":["문제 Entity 보유"]}
]}
<<</MOCK_FALLBACK>>>`;

  const result = await generateJson<{ opportunities: RawOpportunity[] }>(prompt);
  const saved: Opportunity[] = [];
  const existingQueries = new Set(existing.map((o) => o.query));

  for (const raw of result.opportunities ?? []) {
    if (!raw.query?.trim() || existingQueries.has(raw.query.trim())) continue;
    const opp: Opportunity = {
      id: newId("opp"),
      siteId,
      query: raw.query.trim(),
      intent: VALID_INTENTS.includes(raw.intent) ? raw.intent : "informational",
      entityNames: raw.entities ?? [],
      recommendedPageType: PAGE_TYPES.includes(raw.recommended_page_type) ? raw.recommended_page_type : "guide",
      evidence: raw.evidence ?? [],
      status: "candidate",
      createdAt: nowIso(),
    };
    await db.opportunities.put(opp);
    saved.push(opp);
  }
  return saved;
}

// ---------- Page Qualification (PRD §10 채점표) ----------

const SCORE_MAX: Record<keyof QualificationScores, number> = {
  intentClarity: 20,
  serviceRelevance: 20,
  conversionPotential: 15,
  uniqueData: 15,
  expectedDemand: 15,
  contentDifferentiation: 10,
  internalLinkValue: 5,
};

function statusFromScore(score: number, site: Site): OpportunityStatus {
  const t = site.thresholds;
  if (score >= t.autoDraft) return "auto_draft";
  if (score >= t.reviewQueue) return "review_queue";
  if (score >= t.enrich) return "needs_data";
  return "rejected";
}

/** 검색기회를 100점 만점으로 채점하고 정책에 따라 상태를 정한다. */
export async function qualifyOpportunity(opportunityId: string): Promise<Opportunity> {
  const opp = await db.opportunities.get(opportunityId);
  if (!opp) throw new Error("opportunity not found");
  const site = await db.sites.get(opp.siteId);
  if (!site) throw new Error("site not found");
  const entities = await db.entities.bySite(opp.siteId);
  const profile = await db.businessProfiles.getBySite(opp.siteId);

  const relatedEntities = entities.filter((e) => opp.entityNames.includes(e.name));
  const hasUniqueData = relatedEntities.some((e) => e.data && Object.keys(e.data).length > 0);

  const prompt = `당신은 엄격한 SEO 심사관이다. 아래 검색기회에 페이지를 만들 가치가 있는지 채점하라.
점수를 후하게 주지 마라. 근거 없는 항목은 낮게 채점하라.

## 검색기회
- 검색어: "${opp.query}"
- 의도: ${opp.intent}
- 페이지 타입: ${opp.recommendedPageType}
- 근거: ${opp.evidence.join("; ")}

## 사업 맥락
- 서비스: ${profile?.services ?? site.primaryServices.join(", ")}
- 전환 목표: ${site.conversionGoals.join(", ") || "문의"}
- 관련 Entity: ${relatedEntities.map((e) => `[${e.type}]${e.name}`).join(", ") || "없음"}
- 고유 데이터 보유: ${hasUniqueData ? "있음 — " + JSON.stringify(relatedEntities.filter((e) => e.data).map((e) => e.data)) : "없음"}

## 채점 항목 (항목별 최대점)
- intentClarity(20): 검색 의도가 명확하고 단일한가
- serviceRelevance(20): 우리 서비스와 직접 관련 있나
- conversionPotential(15): 검색자가 고객이 될 가능성
- uniqueData(15): 경쟁자에게 없는 고유 데이터로 쓸 수 있나 (고유 데이터 없으면 5 이하)
- expectedDemand(15): 실제 검색량이 있을 법한가
- contentDifferentiation(10): 기존 상위 결과 대비 차별화 가능한가
- internalLinkValue(5): 사이트 구조에 기여하는가

## 출력 (JSON만)
{"scores":{"intentClarity":0,"serviceRelevance":0,"conversionPotential":0,"uniqueData":0,"expectedDemand":0,"contentDifferentiation":0,"internalLinkValue":0},"rationale":"한 줄 근거"}

<<<MOCK_FALLBACK>>>
{"scores":{"intentClarity":18,"serviceRelevance":18,"conversionPotential":13,"uniqueData":10,"expectedDemand":11,"contentDifferentiation":7,"internalLinkValue":4},"rationale":"mock 채점"}
<<</MOCK_FALLBACK>>>`;

  const result = await generateJson<{ scores: QualificationScores; rationale: string }>(prompt);

  // AI 점수를 항목별 최대치로 강제 제한 (모델이 규칙을 어겨도 코드가 막는다)
  const scores = {} as QualificationScores;
  let total = 0;
  for (const key of Object.keys(SCORE_MAX) as (keyof QualificationScores)[]) {
    const v = Math.max(0, Math.min(SCORE_MAX[key], Math.round(Number(result.scores?.[key] ?? 0))));
    scores[key] = v;
    total += v;
  }
  // 고유 데이터가 실제로 없으면 uniqueData 상한 5 (Evidence First 원칙)
  if (!hasUniqueData && scores.uniqueData > 5) {
    total -= scores.uniqueData - 5;
    scores.uniqueData = 5;
  }

  const updated: Opportunity = {
    ...opp,
    scores,
    opportunityScore: total,
    evidence: result.rationale ? [...opp.evidence, `채점 근거: ${result.rationale}`] : opp.evidence,
    status: statusFromScore(total, site),
  };
  await db.opportunities.put(updated);
  return updated;
}
