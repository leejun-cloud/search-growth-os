// Search Growth OS — 도메인 타입 (PRD §26 데이터 모델 기준)

export type Platform = "nextjs" | "wordpress" | "custom";

export type PageType =
  | "pillar"
  | "service"
  | "industry"
  | "region"
  | "institution"
  | "faq"
  | "guide"
  | "comparison"
  | "cost"
  | "case_study"
  | "data_research"
  | "news";

export const PAGE_TYPES: PageType[] = [
  "pillar", "service", "industry", "region", "institution", "faq",
  "guide", "comparison", "cost", "case_study", "data_research", "news",
];

export type Intent =
  | "informational"
  | "commercial_information"
  | "transactional"
  | "navigational"
  | "local";

export interface Site {
  id: string;
  name: string;
  domain: string; // https:// 포함 origin
  platform: Platform;
  primaryLanguage: string;
  targetRegions: string[];
  primaryServices: string[];
  audiences: string[];
  conversionGoals: string[];
  autoPublishAllowed: boolean;
  // Page Qualification 정책 (PRD §10) — 사이트별 조정 가능
  thresholds: {
    autoDraft: number; // 기본 80
    reviewQueue: number; // 기본 65
    enrich: number; // 기본 50
  };
  // 파일럿 합격/불합격 기준
  pilotCriteria: {
    weeks: number; // 판정 기간
    minIndexRate: number; // 색인률 % (예: 70)
    minQueryCount: number; // 노출 쿼리 수 (예: 50)
  };
  createdAt: string;
}

export type EntityType =
  | "service" | "audience" | "problem" | "region" | "institution"
  | "question" | "intent" | "topic" | "case" | "datapoint";

export interface Entity {
  id: string;
  siteId: string;
  type: EntityType;
  name: string;
  description?: string;
  /** 고유 데이터 (가격, 주소, 통계 등 사실 근거) */
  data?: Record<string, string | number>;
  createdAt: string;
}

export interface EntityRelation {
  id: string;
  siteId: string;
  fromEntityId: string;
  toEntityId: string;
  relation: string; // serves | available_in | applies_to | solves | related_question ...
}

export type OpportunityStatus =
  | "candidate" | "auto_draft" | "review_queue" | "needs_data"
  | "rejected" | "drafted" | "published";

export interface QualificationScores {
  intentClarity: number; // /20
  serviceRelevance: number; // /20
  conversionPotential: number; // /15
  uniqueData: number; // /15
  expectedDemand: number; // /15
  contentDifferentiation: number; // /10
  internalLinkValue: number; // /5
}

export interface Opportunity {
  id: string;
  siteId: string;
  query: string;
  intent: Intent;
  entityNames: string[];
  recommendedPageType: PageType;
  evidence: string[];
  scores?: QualificationScores;
  opportunityScore?: number; // 0~100
  status: OpportunityStatus;
  createdAt: string;
}

export interface FactPack {
  id: string;
  siteId: string;
  opportunityId: string;
  targetQuery: string;
  targetIntent: Intent;
  entities: string[];
  verifiedFacts: string[];
  publicData: string[];
  officialSources: string[];
  serviceFacts: string[];
  claimsRequiringCaution: string[];
  prohibitedAssumptions: string[];
  competitorGaps: string[];
  internalSourcePages: string[]; // slug 목록
  recommendedLinks: string[]; // slug 목록
  createdAt: string;
}

export type PageStatus = "draft" | "review" | "approved" | "published" | "noindex" | "blocked";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PageDoc {
  id: string;
  siteId: string;
  pageType: PageType;
  slug: string;
  status: PageStatus;
  targetQuery: string;
  primaryIntent: Intent;
  opportunityId?: string;
  factPackId?: string;
  opportunityScore?: number;
  qualityScore?: number;
  title: string;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  summary: string;
  body: string; // markdown
  faq: FaqItem[];
  sources: string[];
  internalLinks: { slug: string; anchor: string }[];
  schemaJsonld?: object[];
  canonicalUrl?: string;
  indexPolicy: "index" | "noindex";
  publishedAt?: string;
  refreshAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CheckSeverity = "info" | "warn" | "block";

export interface QualityCheckItem {
  rule: string;
  pass: boolean;
  severity: CheckSeverity;
  detail: string;
}

export interface QualityReport {
  id: string;
  siteId: string;
  pageId: string;
  checks: QualityCheckItem[];
  score: number; // 0~100
  verdict: "pass" | "warn" | "block";
  createdAt: string;
}

export interface AuditPage {
  url: string;
  httpStatus: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  jsonLdTypes: string[];
  internalLinkCount: number;
  wordCount: number;
  /** 초기 HTML에 본문이 없어 JS 렌더링에 의존하는 것으로 보이는 위험도 */
  renderingRisk: "low" | "medium" | "high";
}

export interface AuditIssue {
  severity: CheckSeverity;
  code: string;
  message: string;
  urls?: string[];
}

export interface AuditReport {
  id: string;
  siteId: string;
  startUrl: string;
  crawledCount: number;
  hasSitemap: boolean;
  hasRss: boolean;
  hasRobotsTxt: boolean;
  hasLlmsTxt: boolean;
  pages: AuditPage[];
  issues: AuditIssue[];
  createdAt: string;
}

export interface SearchMetric {
  id: string;
  siteId: string;
  source: "gsc_csv" | "gsc_api" | "naver_csv";
  dimension: "query" | "page";
  metricKey: string; // query 문자열 또는 page URL (SQL 예약어 회피)
  clicks: number;
  impressions: number;
  ctr: number; // 0~1
  avgPosition: number; // position은 SQL 예약어라 avg_position 사용
  importedAt: string;
  periodLabel: string; // 예: "2026-08 28d"
}

export type GrowthActionType =
  | "CREATE" | "UPDATE" | "EXPAND" | "MERGE" | "REDIRECT"
  | "NOINDEX" | "DELETE" | "ADD_INTERNAL_LINK" | "REQUEST_MORE_DATA" | "TITLE_TEST";

export interface GrowthAction {
  id: string;
  siteId: string;
  action: GrowthActionType;
  target: string; // 관련 query 또는 page slug/url
  reason: string;
  status: "proposed" | "accepted" | "done" | "dismissed";
  createdAt: string;
}

export interface BusinessProfile {
  id: string; // siteId와 동일하게 사용
  siteId: string;
  industry: string;
  services: string;
  regions: string;
  customerTypes: string;
  pricing: string;
  faq: string;
  companyIntro: string;
  process: string;
  extraNotes: string;
  updatedAt: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
