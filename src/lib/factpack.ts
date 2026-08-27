// Research Agent — Fact Pack 생성 (PRD §12)
// 페이지 작성 전 반드시 사실 자료집을 만든다. 가짜 통계/사례/서비스 범위 생성 금지.

import { generateJson } from "./ai";
import { db } from "./db";
import { newId, nowIso } from "./types";
import type { FactPack } from "./types";

export async function buildFactPack(opportunityId: string): Promise<FactPack> {
  const opp = await db.opportunities.get(opportunityId);
  if (!opp) throw new Error("opportunity not found");
  const site = await db.sites.get(opp.siteId);
  if (!site) throw new Error("site not found");
  const profile = await db.businessProfiles.getBySite(opp.siteId);
  const entities = await db.entities.bySite(opp.siteId);
  const pages = await db.pages.bySite(opp.siteId);

  const relatedEntities = entities.filter(
    (e) => opp.entityNames.includes(e.name) || e.type === "service" || e.type === "datapoint"
  );
  const existingSlugs = pages.map((p) => `${p.slug} (${p.title})`).join("\n") || "없음";

  const prompt = `당신은 신중한 리서치 담당자다. 아래 검색기회에 대한 Fact Pack(사실 자료집)을 만들어라.

## 절대 규칙
- 아래 제공된 정보에 명시된 사실만 verifiedFacts에 넣어라.
- 제공되지 않은 통계/사례/가격을 지어내지 마라. 모르면 claimsRequiringCaution에 "확인 필요"로 넣어라.
- prohibitedAssumptions에는 이 글에서 절대 주장하면 안 되는 것들을 적어라 (예: 근거 없는 효과 수치).

## 검색기회
- 검색어: "${opp.query}" / 의도: ${opp.intent} / 페이지 타입: ${opp.recommendedPageType}

## 제공된 사업 정보 (유일한 사실 출처)
- 서비스: ${profile?.services ?? ""}
- 가격: ${profile?.pricing ?? ""}
- FAQ: ${profile?.faq ?? ""}
- 프로세스: ${profile?.process ?? ""}
- 회사 소개: ${profile?.companyIntro ?? ""}
- Entity: ${relatedEntities.map((e) => `[${e.type}] ${e.name}${e.data ? " " + JSON.stringify(e.data) : ""}${e.description ? " — " + e.description : ""}`).join("\n")}

## 기존 페이지 (내부링크 후보)
${existingSlugs}

## 출력 (JSON만)
{
 "verifiedFacts": ["제공 정보에서 확인된 사실"],
 "publicData": [],
 "officialSources": [],
 "serviceFacts": ["서비스 고유 사실"],
 "claimsRequiringCaution": ["주의가 필요한 주장"],
 "prohibitedAssumptions": ["금지 사항"],
 "competitorGaps": ["경쟁 콘텐츠가 못 다루는 지점 (추정임을 명시)"],
 "internalSourcePages": ["기존 페이지 slug"],
 "recommendedLinks": ["링크할 페이지 slug"]
}

<<<MOCK_FALLBACK>>>
{"verifiedFacts":["AI 홈페이지 제작 서비스 제공","제작 기간 2주"],"publicData":[],"officialSources":[],"serviceFacts":["중소기업 대상"],"claimsRequiringCaution":["구체적 가격은 견적 필요"],"prohibitedAssumptions":["근거 없는 성과 수치 금지","가짜 후기 금지"],"competitorGaps":["실제 제작 프로세스 상세 공개(추정)"],"internalSourcePages":[],"recommendedLinks":[]}
<<</MOCK_FALLBACK>>>`;

  const result = await generateJson<Omit<FactPack, "id" | "siteId" | "opportunityId" | "targetQuery" | "targetIntent" | "entities" | "createdAt">>(prompt);

  const pack: FactPack = {
    id: newId("fp"),
    siteId: opp.siteId,
    opportunityId: opp.id,
    targetQuery: opp.query,
    targetIntent: opp.intent,
    entities: opp.entityNames,
    verifiedFacts: result.verifiedFacts ?? [],
    publicData: result.publicData ?? [],
    officialSources: result.officialSources ?? [],
    serviceFacts: result.serviceFacts ?? [],
    claimsRequiringCaution: result.claimsRequiringCaution ?? [],
    prohibitedAssumptions: [
      ...(result.prohibitedAssumptions ?? []),
      "가짜 통계 금지", "가짜 후기/사례 금지", "존재하지 않는 서비스 범위 금지",
    ],
    competitorGaps: result.competitorGaps ?? [],
    internalSourcePages: result.internalSourcePages ?? [],
    recommendedLinks: result.recommendedLinks ?? [],
    createdAt: nowIso(),
  };
  await db.factPacks.put(pack);
  return pack;
}
