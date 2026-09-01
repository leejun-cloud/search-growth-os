"use server";

// 대시보드에서 호출하는 서버 액션 — 각 엔진 모듈을 실행한다.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { runAudit } from "@/lib/audit";
import { saveBusinessProfile, seedEntities } from "@/lib/knowledge";
import { generateOpportunities, qualifyOpportunity } from "@/lib/opportunity";
import { buildFactPack } from "@/lib/factpack";
import { generateDraft } from "@/lib/factory";
import { runQualityGate } from "@/lib/quality";
import { publishPage, regenerateFeeds } from "@/lib/publish";
import { importGscCsv } from "@/lib/analytics";
import { importGscApi } from "@/lib/searchconsole";
import { runGrowthAgent } from "@/lib/growth";
import { newId, nowIso } from "@/lib/types";
import type { Intent, Opportunity, Site } from "@/lib/types";

export async function createSiteAction(formData: FormData): Promise<void> {
  const site: Site = {
    id: newId("site"),
    name: String(formData.get("name") ?? "").trim(),
    domain: String(formData.get("domain") ?? "").trim().replace(/\/$/, ""),
    platform: (String(formData.get("platform")) as Site["platform"]) || "nextjs",
    primaryLanguage: "ko",
    targetRegions: splitList(formData.get("targetRegions")),
    primaryServices: splitList(formData.get("primaryServices")),
    audiences: [],
    conversionGoals: splitList(formData.get("conversionGoals")),
    autoPublishAllowed: false,
    thresholds: {
      autoDraft:80, reviewQueue:65, enrich:50,
      quality: { minBodyChars:800, thinBlockChars:500, maxSimilarity:0.6, maxFamilySimilarity:0.45, maxKeywordDensity:0.05 },
    },
    pilotCriteria: { weeks: 8, minIndexRate: 70, minQueryCount: 50 },
    createdAt: nowIso(),
  };
  if (!site.name || !site.domain) throw new Error("사이트 이름과 도메인은 필수입니다.");
  if (!/^https?:\/\//.test(site.domain)) site.domain = "https://" + site.domain;
  await db.sites.put(site);
  redirect(`/sites/${site.id}`);
}

function splitList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function runAuditAction(siteId: string): Promise<void> {
  await runAudit(siteId);
  revalidatePath(`/sites/${siteId}`);
}

export async function saveKnowledgeAction(siteId: string, formData: FormData): Promise<void> {
  await saveBusinessProfile(siteId, {
    industry: String(formData.get("industry") ?? ""),
    services: String(formData.get("services") ?? ""),
    regions: String(formData.get("regions") ?? ""),
    customerTypes: String(formData.get("customerTypes") ?? ""),
    pricing: String(formData.get("pricing") ?? ""),
    faq: String(formData.get("faq") ?? ""),
    companyIntro: String(formData.get("companyIntro") ?? ""),
    process: String(formData.get("process") ?? ""),
    extraNotes: String(formData.get("extraNotes") ?? ""),
  });
  revalidatePath(`/sites/${siteId}/knowledge`);
}

export async function seedEntitiesAction(siteId: string): Promise<void> {
  await seedEntities(siteId);
  revalidatePath(`/sites/${siteId}/knowledge`);
}

export async function deleteEntityAction(siteId: string, entityId: string): Promise<void> {
  await db.entities.remove(entityId);
  revalidatePath(`/sites/${siteId}/knowledge`);
}

export async function generateOpportunitiesAction(siteId: string): Promise<void> {
  await generateOpportunities(siteId);
  revalidatePath(`/sites/${siteId}/opportunities`);
}

export async function qualifyAction(siteId: string, opportunityId: string): Promise<void> {
  await qualifyOpportunity(opportunityId);
  revalidatePath(`/sites/${siteId}/opportunities`);
}

export async function qualifyAllAction(siteId: string): Promise<void> {
  const opps = await db.opportunities.bySite(siteId);
  for (const o of opps.filter((o) => o.status === "candidate")) {
    await qualifyOpportunity(o.id);
  }
  revalidatePath(`/sites/${siteId}/opportunities`);
}

export async function draftAction(siteId: string, opportunityId: string): Promise<void> {
  await buildFactPack(opportunityId);
  const page = await generateDraft(opportunityId);
  await runQualityGate(page.id);
  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}/pages/${page.id}`);
}

export async function qualityAction(siteId: string, pageId: string): Promise<void> {
  await runQualityGate(pageId);
  revalidatePath(`/sites/${siteId}/pages/${pageId}`);
}

export async function publishAction(siteId: string, pageId: string): Promise<void> {
  const result = await publishPage(pageId);
  if (!result.ok) throw new Error(result.message ?? "발행 실패");
  revalidatePath(`/sites/${siteId}/pages/${pageId}`);
}

export async function regenerateFeedsAction(siteId: string): Promise<void> {
  await regenerateFeeds(siteId);
  revalidatePath(`/sites/${siteId}/pages`);
}

export async function importCsvAction(siteId: string, formData: FormData): Promise<void> {
  const file = formData.get("csv") as File | null;
  const period = String(formData.get("period") ?? "").trim() || new Date().toISOString().slice(0, 7);
  if (!file || file.size === 0) throw new Error("CSV 파일을 선택하세요.");
  const text = await file.text();
  await importGscCsv(siteId, text, period);
  revalidatePath(`/sites/${siteId}/analytics`);
}

export async function importGscApiAction(siteId: string, formData: FormData): Promise<void> {
  const days = Math.max(7, Math.min(90, Number(formData.get("days")) || 28));
  await importGscApi(siteId, days);
  revalidatePath(`/sites/${siteId}/analytics`);
}

export async function runGrowthAction(siteId: string): Promise<void> {
  await runGrowthAgent(siteId);
  revalidatePath(`/sites/${siteId}/growth`);
}

export async function acceptCreateOpportunityAction(siteId: string, actionId: string): Promise<void> {
  const actions = await db.growthActions.bySite(siteId);
  const action = actions.find((a) => a.id === actionId);
  if (!action || action.action !== "CREATE") throw new Error("CREATE 제안이 아닙니다.");
  const opp: Opportunity = {
    id: newId("opp"),
    siteId,
    query: action.target,
    intent: "informational" as Intent,
    entityNames: [],
    recommendedPageType: "guide",
    evidence: ["GSC 실측: " + action.reason],
    status: "candidate",
    createdAt: nowIso(),
  };
  await db.opportunities.put(opp);
  await db.growthActions.put({ ...action, status: "accepted" });
  revalidatePath(`/sites/${siteId}/growth`);
  revalidatePath(`/sites/${siteId}/opportunities`);
}

export async function dismissGrowthAction(siteId: string, actionId: string): Promise<void> {
  const actions = await db.growthActions.bySite(siteId);
  const action = actions.find((a) => a.id === actionId);
  if (action) await db.growthActions.put({ ...action, status: "dismissed" });
  revalidatePath(`/sites/${siteId}/growth`);
}
