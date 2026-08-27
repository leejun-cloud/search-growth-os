// Growth Agent (PRD §19, DECISIONS §11)
// 성과 데이터를 보고 다음 액션을 결정하는 규칙 엔진.
// 규칙은 결정적(deterministic) — 같은 데이터면 같은 제안. AI는 쓰지 않는다.

import { db } from "./db";
import { newId, nowIso } from "./types";
import type { GrowthAction, GrowthActionType } from "./types";

// 게재순위별 기대 CTR (대략적 업계 곡선 — 판단 기준선으로만 사용)
function expectedCtr(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 3) return 0.11;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.025;
  return 0.01;
}

export async function runGrowthAgent(siteId: string): Promise<GrowthAction[]> {
  const metrics = await db.searchMetrics.bySite(siteId);
  const pages = await db.pages.bySite(siteId);
  const opportunities = await db.opportunities.bySite(siteId);

  const queries = metrics.filter((m) => m.dimension === "query");
  const pageMetrics = metrics.filter((m) => m.dimension === "page");
  const actions: Omit<GrowthAction, "id" | "createdAt">[] = [];

  // 규칙 1: 노출은 있는데 순위가 낮다 (11~30위) → UPDATE (본문/근거 보강)
  for (const m of queries) {
    if (m.impressions >= 100 && m.avgPosition > 10 && m.avgPosition <= 30) {
      actions.push({
        siteId, action: "UPDATE", target: m.metricKey, status: "proposed",
        reason: `노출 ${m.impressions}회, 평균 ${m.avgPosition.toFixed(1)}위 — 2페이지권. 본문 보강/고유 데이터 추가로 1페이지 진입 여지.`,
      });
    }
  }

  // 규칙 2: 순위는 좋은데 CTR이 기대치 미달 → TITLE_TEST
  for (const m of queries) {
    if (m.impressions >= 200 && m.avgPosition <= 10 && m.ctr < expectedCtr(m.avgPosition) * 0.5) {
      actions.push({
        siteId, action: "TITLE_TEST", target: m.metricKey, status: "proposed",
        reason: `${m.avgPosition.toFixed(1)}위인데 CTR ${(m.ctr * 100).toFixed(1)}% (기대 ${(expectedCtr(m.avgPosition) * 100).toFixed(1)}%) — title/description 개선 필요.`,
      });
    }
  }

  // 규칙 3: 한 페이지가 많은 쿼리에서 노출 → EXPAND (클러스터 확장)
  //  page 지표가 있을 때: 노출 상위 페이지 기준
  for (const m of pageMetrics) {
    if (m.impressions >= 500) {
      actions.push({
        siteId, action: "EXPAND", target: m.metricKey, status: "proposed",
        reason: `노출 ${m.impressions}회의 성과 페이지 — 관련 하위 주제(비용/절차/FAQ) 페이지로 클러스터 확장 후보.`,
      });
    }
  }

  // 규칙 4: 같은 검색어를 노리는 페이지가 2개 이상 → MERGE (서로 경쟁 방지)
  const byQuery = new Map<string, string[]>();
  for (const p of pages) {
    if (p.status === "blocked") continue;
    byQuery.set(p.targetQuery, [...(byQuery.get(p.targetQuery) ?? []), p.slug]);
  }
  for (const [query, slugs] of byQuery) {
    if (slugs.length > 1) {
      actions.push({
        siteId, action: "MERGE", target: query, status: "proposed",
        reason: `"${query}"를 노리는 페이지가 ${slugs.length}개 (${slugs.join(", ")}) — 서로 순위를 갉아먹으므로 병합 검토.`,
      });
    }
  }

  // 규칙 5: 발행 60일 경과 + 노출 데이터 있음 + 이 페이지 노출 0 → NOINDEX 검토
  if (pageMetrics.length > 0) {
    const measured = new Set(pageMetrics.map((m) => m.metricKey));
    const now = Date.now();
    for (const p of pages) {
      if (p.status !== "published" || !p.publishedAt) continue;
      const ageDays = (now - new Date(p.publishedAt).getTime()) / 86400_000;
      const url = p.canonicalUrl ?? p.slug;
      if (ageDays > 60 && ![...measured].some((u) => u.includes(p.slug))) {
        actions.push({
          siteId, action: "NOINDEX", target: p.slug, status: "proposed",
          reason: `발행 ${Math.round(ageDays)}일 경과했지만 노출 기록 없음 (${url}) — 가치 없으면 noindex/삭제로 사이트 품질 방어.`,
        });
      }
    }
  }

  // 규칙 6: 노출되는 쿼리인데 대응 페이지/기회가 없음 → CREATE
  const knownQueries = new Set([
    ...pages.map((p) => p.targetQuery),
    ...opportunities.map((o) => o.query),
  ]);
  for (const m of queries) {
    if (m.impressions >= 50 && !knownQueries.has(m.metricKey)) {
      actions.push({
        siteId, action: "CREATE", target: m.metricKey, status: "proposed",
        reason: `"${m.metricKey}" 노출 ${m.impressions}회 발생 중이나 전담 페이지 없음 — 새 검색기회로 등록 후 채점 권장.`,
      });
    }
  }

  // 저장 (기존 proposed 제안은 새 분석으로 교체)
  await db.growthActions.clearProposed(siteId);
  const saved: GrowthAction[] = [];
  // 같은 (action, target) 중복 제거
  const seen = new Set<string>();
  for (const a of actions) {
    const key = `${a.action}:${a.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const full: GrowthAction = { ...a, id: newId("ga"), createdAt: nowIso() };
    await db.growthActions.put(full);
    saved.push(full);
  }
  return saved;
}

export type { GrowthActionType };
