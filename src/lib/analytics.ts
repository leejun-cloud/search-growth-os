// Search Analytics Collector — GSC CSV import (PRD §18)
// Google Search Console → 실적 → 내보내기 → CSV 파일을 업로드하면 지표로 저장한다.
// (GSC API 연동은 자격증명 확보 후 추가 — import 경로는 동일한 테이블을 사용)

import { db } from "./db";
import { newId, nowIso } from "./types";
import type { SearchMetric, Site } from "./types";

/** 간단 CSV 파서 (따옴표 필드 지원) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM 제거
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
  return rows;
}

// GSC CSV 헤더는 언어에 따라 다르다 (한국어/영어 모두 지원)
const HEADER_MAP: { key: string; patterns: RegExp }[] = [
  { key: "dim", patterns: /상위 쿼리|검색어|쿼리|query|queries|상위 페이지|페이지|page/i },
  { key: "clicks", patterns: /클릭|click/i },
  { key: "impressions", patterns: /노출|impression/i },
  { key: "ctr", patterns: /ctr|클릭률/i },
  { key: "position", patterns: /게재\s*순위|평균 게재순위|position/i },
];

function parseNumber(v: string): number {
  const n = parseFloat(v.replace(/[%,\s]/g, "").replace(/^</, ""));
  return isNaN(n) ? 0 : n;
}

export async function importGscCsv(
  siteId: string,
  csvText: string,
  periodLabel: string
): Promise<{ imported: number; dimension: "query" | "page" }> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found");

  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("CSV에 데이터가 없습니다.");

  const header = rows[0];
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    for (const { key, patterns } of HEADER_MAP) {
      if (patterns.test(h) && colIndex[key] === undefined) colIndex[key] = i;
    }
  });
  if (colIndex.dim === undefined || colIndex.impressions === undefined) {
    throw new Error(`CSV 헤더를 인식하지 못했습니다: ${header.join(", ")} — GSC 실적 내보내기의 '쿼리' 또는 '페이지' CSV를 사용하세요.`);
  }

  const dimension: "query" | "page" = /페이지|page/i.test(header[colIndex.dim]) ? "page" : "query";

  // 같은 기간 재업로드 시 기존 데이터 교체
  await db.searchMetrics.clearPeriod(siteId, periodLabel);

  let imported = 0;
  for (const row of rows.slice(1)) {
    const key = row[colIndex.dim]?.trim();
    if (!key) continue;
    const clicks = colIndex.clicks !== undefined ? parseNumber(row[colIndex.clicks]) : 0;
    const impressions = parseNumber(row[colIndex.impressions]);
    const ctrRaw = colIndex.ctr !== undefined ? parseNumber(row[colIndex.ctr]) : 0;
    const metric: SearchMetric = {
      id: newId("met"),
      siteId,
      source: "gsc_csv",
      dimension,
      metricKey: key,
      clicks: Math.round(clicks),
      impressions: Math.round(impressions),
      ctr: ctrRaw > 1 ? ctrRaw / 100 : ctrRaw, // "1.2%" → 0.012
      avgPosition: colIndex.position !== undefined ? parseNumber(row[colIndex.position]) : 0,
      periodLabel,
      importedAt: nowIso(),
    };
    await db.searchMetrics.put(metric);
    imported++;
  }
  return { imported, dimension };
}

// ---------- 파일럿 판정 ----------

export interface PilotVerdict {
  criteria: Site["pilotCriteria"];
  publishedCount: number;
  queryCount: number;
  totalImpressions: number;
  totalClicks: number;
  passed: boolean | null; // null = 데이터 부족으로 판정 불가
  note: string;
}

export async function evaluatePilot(siteId: string): Promise<PilotVerdict> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found");
  const pages = await db.pages.published(siteId);
  const metrics = await db.searchMetrics.bySite(siteId);
  const queries = metrics.filter((m) => m.dimension === "query");

  const queryCount = new Set(queries.map((m) => m.metricKey)).size;
  const totalImpressions = queries.reduce((a, m) => a + m.impressions, 0);
  const totalClicks = queries.reduce((a, m) => a + m.clicks, 0);

  let passed: boolean | null = null;
  let note = "";
  if (metrics.length === 0) {
    note = "GSC 데이터가 아직 없습니다. CSV를 import하면 판정합니다.";
  } else {
    passed = queryCount >= site.pilotCriteria.minQueryCount;
    note = passed
      ? `노출 쿼리 ${queryCount}개 ≥ 기준 ${site.pilotCriteria.minQueryCount}개 — 성과 있는 Page Type 확대를 검토하세요.`
      : `노출 쿼리 ${queryCount}개 < 기준 ${site.pilotCriteria.minQueryCount}개 — ${site.pilotCriteria.weeks}주 경과 시점이라면 확장을 멈추고 원인을 분석하세요.`;
  }

  return {
    criteria: site.pilotCriteria,
    publishedCount: pages.length,
    queryCount,
    totalImpressions,
    totalClicks,
    passed,
    note,
  };
}
