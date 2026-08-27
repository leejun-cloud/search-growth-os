// 저장소(Repository) 계층 — 각 함수가 실행하는 SQL이 그대로 보인다.
// [SQL 학습 노트]
//  SELECT * FROM 테이블 WHERE 조건    → 조회
//  ORDER BY 칸 DESC                  → 정렬 (DESC 내림차순)
//  $1, $2                            → 파라미터 자리표시자 (SQL 주입 공격 방지)

import { sql, rowToObj, upsert } from "./sqldb";
import type {
  Site, Entity, EntityRelation, Opportunity, FactPack, PageDoc,
  QualityReport, AuditReport, SearchMetric, GrowthAction, BusinessProfile,
} from "./types";

async function listBySite<T>(table: string, siteId: string, orderBy = "created_at DESC"): Promise<T[]> {
  const r = await sql(`SELECT * FROM ${table} WHERE site_id = $1 ORDER BY ${orderBy}`, [siteId]);
  return r.rows.map((row) => rowToObj<T>(row));
}

async function getById<T>(table: string, id: string): Promise<T | null> {
  const r = await sql(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return r.rows[0] ? rowToObj<T>(r.rows[0]) : null;
}

export const db = {
  sites: {
    all: async (): Promise<Site[]> => {
      const r = await sql(`SELECT * FROM sites ORDER BY created_at DESC`);
      return r.rows.map((row) => rowToObj<Site>(row));
    },
    get: (id: string) => getById<Site>("sites", id),
    put: (site: Site) => upsert("sites", site as unknown as Record<string, unknown>),
    remove: async (id: string) => {
      // ON DELETE CASCADE 덕분에 이 사이트의 모든 하위 데이터가 함께 삭제된다
      await sql(`DELETE FROM sites WHERE id = $1`, [id]);
    },
  },

  businessProfiles: {
    getBySite: async (siteId: string): Promise<BusinessProfile | null> => {
      const r = await sql(`SELECT * FROM business_profiles WHERE site_id = $1`, [siteId]);
      return r.rows[0] ? rowToObj<BusinessProfile>(r.rows[0]) : null;
    },
    put: (p: BusinessProfile) => upsert("business_profiles", p as unknown as Record<string, unknown>),
  },

  entities: {
    bySite: (siteId: string) => listBySite<Entity>("entities", siteId),
    byType: async (siteId: string, type: string): Promise<Entity[]> => {
      const r = await sql(
        `SELECT * FROM entities WHERE site_id = $1 AND type = $2 ORDER BY name`,
        [siteId, type]
      );
      return r.rows.map((row) => rowToObj<Entity>(row));
    },
    put: (e: Entity) => upsert("entities", e as unknown as Record<string, unknown>),
    remove: async (id: string) => { await sql(`DELETE FROM entities WHERE id = $1`, [id]); },
  },

  entityRelations: {
    bySite: (siteId: string) => listBySite<EntityRelation>("entity_relations", siteId, "id"),
    put: (r: EntityRelation) => upsert("entity_relations", r as unknown as Record<string, unknown>),
  },

  opportunities: {
    bySite: (siteId: string) =>
      listBySite<Opportunity>("search_opportunities", siteId, "opportunity_score DESC NULLS LAST, created_at DESC"),
    get: (id: string) => getById<Opportunity>("search_opportunities", id),
    put: (o: Opportunity) => upsert("search_opportunities", o as unknown as Record<string, unknown>),
    remove: async (id: string) => { await sql(`DELETE FROM search_opportunities WHERE id = $1`, [id]); },
  },

  factPacks: {
    get: (id: string) => getById<FactPack>("fact_packs", id),
    byOpportunity: async (opportunityId: string): Promise<FactPack | null> => {
      const r = await sql(
        `SELECT * FROM fact_packs WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [opportunityId]
      );
      return r.rows[0] ? rowToObj<FactPack>(r.rows[0]) : null;
    },
    put: (f: FactPack) => upsert("fact_packs", f as unknown as Record<string, unknown>),
  },

  pages: {
    bySite: (siteId: string) => listBySite<PageDoc>("pages", siteId),
    get: (id: string) => getById<PageDoc>("pages", id),
    bySlug: async (siteId: string, slug: string): Promise<PageDoc | null> => {
      const r = await sql(`SELECT * FROM pages WHERE site_id = $1 AND slug = $2`, [siteId, slug]);
      return r.rows[0] ? rowToObj<PageDoc>(r.rows[0]) : null;
    },
    published: async (siteId: string): Promise<PageDoc[]> => {
      const r = await sql(
        `SELECT * FROM pages WHERE site_id = $1 AND status = 'published' ORDER BY published_at DESC`,
        [siteId]
      );
      return r.rows.map((row) => rowToObj<PageDoc>(row));
    },
    put: (p: PageDoc) => upsert("pages", p as unknown as Record<string, unknown>),
    remove: async (id: string) => { await sql(`DELETE FROM pages WHERE id = $1`, [id]); },
  },

  qualityReports: {
    byPage: async (pageId: string): Promise<QualityReport | null> => {
      const r = await sql(
        `SELECT * FROM quality_checks WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [pageId]
      );
      return r.rows[0] ? rowToObj<QualityReport>(r.rows[0]) : null;
    },
    put: (q: QualityReport) => upsert("quality_checks", q as unknown as Record<string, unknown>),
  },

  auditReports: {
    latest: async (siteId: string): Promise<AuditReport | null> => {
      const r = await sql(
        `SELECT * FROM audit_reports WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [siteId]
      );
      return r.rows[0] ? rowToObj<AuditReport>(r.rows[0]) : null;
    },
    put: (a: AuditReport) => upsert("audit_reports", a as unknown as Record<string, unknown>),
  },

  searchMetrics: {
    bySite: (siteId: string) => listBySite<SearchMetric>("search_metrics", siteId, "impressions DESC"),
    put: (m: SearchMetric) => upsert("search_metrics", m as unknown as Record<string, unknown>),
    clearPeriod: async (siteId: string, periodLabel: string) => {
      await sql(`DELETE FROM search_metrics WHERE site_id = $1 AND period_label = $2`, [siteId, periodLabel]);
    },
  },

  growthActions: {
    bySite: (siteId: string) => listBySite<GrowthAction>("growth_actions", siteId),
    put: (g: GrowthAction) => upsert("growth_actions", g as unknown as Record<string, unknown>),
    clearProposed: async (siteId: string) => {
      await sql(`DELETE FROM growth_actions WHERE site_id = $1 AND status = 'proposed'`, [siteId]);
    },
  },
};
