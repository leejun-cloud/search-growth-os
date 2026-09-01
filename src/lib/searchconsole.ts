// Search Analytics Collector — Google Search Console API 연동 (PRD §18)
// 서비스 계정(Service Account) JWT 인증으로 실측 검색수요 데이터를 가져온다.
// CSV 업로드(analytics.ts)와 같은 search_metrics 테이블을 사용한다 — source='gsc_api'.
//
// 필요 환경변수 (.env.local):
//   SGO_GSC_CLIENT_EMAIL  서비스 계정 이메일 (예: sgo@project.iam.gserviceaccount.com)
//   SGO_GSC_PRIVATE_KEY   서비스 계정 비공개키 PEM (따옴표 안에 \n 포함 가능)
//   SGO_GSC_SITE          (선택) GSC 속성 URL. 없으면 사이트 도메인에서 추정
//                         도메인 속성: sc-domain:db.nolgong.app
//                         URL 접두부: https://db.nolgong.app/
// 준비: GSC 속성에 서비스 계정 이메일을 '사용자'로 추가해야 API 접근이 허용된다.

import crypto from "crypto";
import { db } from "./db";
import { newId, nowIso } from "./types";
import type { SearchMetric, Site } from "./types";

const AUTH_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export interface GscConfig {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
}

export function gscConfig(site: Site): GscConfig | null {
  const clientEmail = process.env.SGO_GSC_CLIENT_EMAIL;
  const privateKey = process.env.SGO_GSC_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;
  // PEM은 환경변수에 줄바꿈이 들어가므로 복원한다
  const pem = privateKey.includes("-----BEGIN") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  const siteUrl = process.env.SGO_GSC_SITE || site.domain;
  return { clientEmail, privateKey: pem, siteUrl };
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function signJwt(privateKeyPem: string, unsigned: string): string {
  return crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKeyPem, "base64url");
}

async function getAccessToken(cfg: GscConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    Buffer.from(JSON.stringify({
      iss: cfg.clientEmail,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: AUTH_URL,
      iat: now,
      exp: now + 3600,
    }))
  );
  const unsigned = `${header}.${claims}`;
  const assertion = `${unsigned}.${signJwt(cfg.privateKey, unsigned)}`;

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`GSC 토큰 발급 실패: ${res.status} ${data.error ?? JSON.stringify(data)}`);
  }
  return data.access_token;
}

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function fetchQueryRows(cfg: GscConfig, startDate: string, endDate: string): Promise<GscRow[]> {
  const token = await getAccessToken(cfg);
  const res = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(cfg.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 5000,
        aggregationType: "auto",
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC 검색분석 API 오류: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: GscRow[] };
  return data.rows ?? [];
}

/** GSC API로 최근 N일 쿼리 실적을 가져와 search_metrics에 저장한다. (source='gsc_api') */
export async function importGscApi(siteId: string, days = 28): Promise<{ imported: number; periodLabel: string }> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error("site not found");
  const cfg = gscConfig(site);
  if (!cfg) throw new Error("SGO_GSC_CLIENT_EMAIL / SGO_GSC_PRIVATE_KEY 환경변수가 필요합니다. (CSV 업로드도 계속 사용 가능)");

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const periodLabel = `${fmt(start)} ~ ${fmt(end)} ${days}d`;

  const rows = await fetchQueryRows(cfg, fmt(start), fmt(end));
  await db.searchMetrics.clearPeriod(siteId, periodLabel);

  let imported = 0;
  for (const row of rows) {
    const key = row.keys?.[0];
    if (!key) continue;
    const metric: SearchMetric = {
      id: newId("met"),
      siteId,
      source: "gsc_api",
      dimension: "query",
      metricKey: key,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      avgPosition: row.position ?? 0,
      periodLabel,
      importedAt: nowIso(),
    };
    await db.searchMetrics.put(metric);
    imported++;
  }
  return { imported, periodLabel };
}
