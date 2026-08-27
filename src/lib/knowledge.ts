// Business Knowledge Seeder (PRD §6)
// 사업 지식 입력 → Entity 추출 (Service/Audience/Problem/Region/Question/Intent/Topic 등)

import { generateJson } from "./ai";
import { db } from "./db";
import { newId, nowIso } from "./types";
import type { BusinessProfile, Entity, EntityType } from "./types";

const VALID_TYPES: EntityType[] = [
  "service", "audience", "problem", "region", "institution",
  "question", "intent", "topic", "case", "datapoint",
];

interface ExtractedEntity {
  type: EntityType;
  name: string;
  description?: string;
  data?: Record<string, string | number>;
}

export async function seedEntities(siteId: string): Promise<Entity[]> {
  const site = await db.sites.get(siteId);
  const profile = await db.businessProfiles.getBySite(siteId);
  if (!site) throw new Error("site not found");
  if (!profile) throw new Error("사업 지식(Business Profile)을 먼저 입력하세요.");

  const prompt = `당신은 SEO 전략가다. 아래 사업 정보를 읽고 Entity 목록을 추출하라.

## 사업 정보
- 사이트: ${site.name} (${site.domain})
- 업종: ${profile.industry}
- 서비스: ${profile.services}
- 서비스 지역: ${profile.regions}
- 고객 유형: ${profile.customerTypes}
- 가격/요금: ${profile.pricing}
- FAQ: ${profile.faq}
- 회사 소개: ${profile.companyIntro}
- 서비스 프로세스: ${profile.process}
- 기타: ${profile.extraNotes}

## 규칙
- type은 반드시 다음 중 하나: service, audience, problem, region, institution, question, intent, topic, case, datapoint
- 사업 정보에 명시된 사실만 사용하라. 추측으로 지역/서비스/가격을 만들지 마라.
- 가격/통계처럼 수치가 있으면 data 필드에 넣어라.
- 15~40개 사이로 추출하라.

## 출력 (JSON만, 설명 금지)
{"entities": [{"type": "service", "name": "...", "description": "...", "data": {"가격": "..."}}]}

<<<MOCK_FALLBACK>>>
{"entities": [
 {"type":"service","name":"AI 홈페이지 제작","description":"중소기업 대상 AI 기반 홈페이지 제작"},
 {"type":"audience","name":"중소기업 대표"},
 {"type":"region","name":"대전"},
 {"type":"problem","name":"홈페이지 검색 노출 부족"},
 {"type":"question","name":"AI 홈페이지 제작 비용은 얼마인가요?"},
 {"type":"datapoint","name":"제작 기간","data":{"기간":"2주"}}
]}
<<</MOCK_FALLBACK>>>`;

  const result = await generateJson<{ entities: ExtractedEntity[] }>(prompt);
  const saved: Entity[] = [];
  const existing = await db.entities.bySite(siteId);
  const existingKeys = new Set(existing.map((e) => `${e.type}:${e.name}`));

  for (const raw of result.entities ?? []) {
    if (!VALID_TYPES.includes(raw.type) || !raw.name?.trim()) continue;
    if (existingKeys.has(`${raw.type}:${raw.name}`)) continue; // 중복 방지
    const entity: Entity = {
      id: newId("ent"),
      siteId,
      type: raw.type,
      name: raw.name.trim(),
      description: raw.description,
      data: raw.data,
      createdAt: nowIso(),
    };
    await db.entities.put(entity);
    saved.push(entity);
  }
  return saved;
}

export async function saveBusinessProfile(
  siteId: string,
  input: Omit<BusinessProfile, "id" | "siteId" | "updatedAt">
): Promise<BusinessProfile> {
  const existing = await db.businessProfiles.getBySite(siteId);
  const profile: BusinessProfile = {
    id: existing?.id ?? newId("bp"),
    siteId,
    ...input,
    updatedAt: nowIso(),
  };
  await db.businessProfiles.put(profile);
  return profile;
}
