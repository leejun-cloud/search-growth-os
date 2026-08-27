-- ============================================================
-- Search Growth OS — PostgreSQL 스키마 (PRD §26)
--
-- [SQL 학습 노트]
-- - CREATE TABLE IF NOT EXISTS: 테이블이 없을 때만 생성 (있으면 무시)
-- - TEXT: 글자 데이터. PRIMARY KEY: 행을 유일하게 식별하는 값(중복 불가)
-- - BOOLEAN: 참/거짓. INTEGER: 정수. REAL: 소수
-- - TIMESTAMPTZ: 시간대 포함 날짜시간
-- - JSONB: JSON 데이터를 통째로 저장하는 칸 (목록/중첩 구조에 사용)
-- - REFERENCES 다른테이블(id): 외래키. 존재하지 않는 id를 넣으면 에러
--   ON DELETE CASCADE: 부모 행이 지워지면 자식 행도 함께 삭제
-- - CREATE INDEX: 특정 칸으로 자주 검색할 때 빨리 찾도록 색인을 만듦
-- ============================================================

-- 고객 사이트 (멀티테넌트의 기준 — 모든 데이터가 site_id로 이 테이블을 가리킨다)
CREATE TABLE IF NOT EXISTS sites (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,           -- NOT NULL: 비워둘 수 없음
  domain               TEXT NOT NULL,           -- 예: https://db.nolgong.app
  platform             TEXT NOT NULL,           -- nextjs | wordpress | custom
  primary_language     TEXT NOT NULL DEFAULT 'ko',
  target_regions       JSONB NOT NULL DEFAULT '[]',
  primary_services     JSONB NOT NULL DEFAULT '[]',
  audiences            JSONB NOT NULL DEFAULT '[]',
  conversion_goals     JSONB NOT NULL DEFAULT '[]',
  auto_publish_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  thresholds           JSONB NOT NULL,          -- Page Qualification 기준점수 (PRD §10)
  pilot_criteria       JSONB NOT NULL,          -- 파일럿 합격/불합격 기준
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사업 지식 입력 (Business Knowledge Seeder, PRD §6)
CREATE TABLE IF NOT EXISTS business_profiles (
  id             TEXT PRIMARY KEY,
  site_id        TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  industry       TEXT NOT NULL DEFAULT '',
  services       TEXT NOT NULL DEFAULT '',
  regions        TEXT NOT NULL DEFAULT '',
  customer_types TEXT NOT NULL DEFAULT '',
  pricing        TEXT NOT NULL DEFAULT '',
  faq            TEXT NOT NULL DEFAULT '',
  company_intro  TEXT NOT NULL DEFAULT '',
  process        TEXT NOT NULL DEFAULT '',
  extra_notes    TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entity Graph의 노드 (PRD §8): 서비스/지역/기관/질문/데이터포인트 등
CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,     -- service|audience|problem|region|institution|question|intent|topic|case|datapoint
  name        TEXT NOT NULL,
  description TEXT,
  data        JSONB,             -- 고유 사실 데이터 (가격, 주소, 통계 등)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entities_site ON entities (site_id);

-- Entity 사이의 관계 (예: 병원동행 --available_in--> 대전)
CREATE TABLE IF NOT EXISTS entity_relations (
  id             TEXT PRIMARY KEY,
  site_id        TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation       TEXT NOT NULL   -- serves | available_in | applies_to | solves | related_question ...
);

-- 검색기회 (Search Opportunity Engine, PRD §9) + 채점 결과 (PRD §10)
CREATE TABLE IF NOT EXISTS search_opportunities (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  query                 TEXT NOT NULL,      -- 목표 검색어
  intent                TEXT NOT NULL,      -- 검색 의도
  entity_names          JSONB NOT NULL DEFAULT '[]',
  recommended_page_type TEXT NOT NULL,
  evidence              JSONB NOT NULL DEFAULT '[]',
  scores                JSONB,              -- 7개 항목별 점수
  opportunity_score     INTEGER,            -- 합계 0~100
  status                TEXT NOT NULL DEFAULT 'candidate',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opps_site ON search_opportunities (site_id);

-- 사실 자료집 (Research Agent / Fact Pack, PRD §12) — 글쓰기 전 근거 확보
CREATE TABLE IF NOT EXISTS fact_packs (
  id                        TEXT PRIMARY KEY,
  site_id                   TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  opportunity_id            TEXT NOT NULL REFERENCES search_opportunities(id) ON DELETE CASCADE,
  target_query              TEXT NOT NULL,
  target_intent             TEXT NOT NULL,
  entities                  JSONB NOT NULL DEFAULT '[]',
  verified_facts            JSONB NOT NULL DEFAULT '[]',
  public_data               JSONB NOT NULL DEFAULT '[]',
  official_sources          JSONB NOT NULL DEFAULT '[]',
  service_facts             JSONB NOT NULL DEFAULT '[]',
  claims_requiring_caution  JSONB NOT NULL DEFAULT '[]',
  prohibited_assumptions    JSONB NOT NULL DEFAULT '[]',
  competitor_gaps           JSONB NOT NULL DEFAULT '[]',
  internal_source_pages     JSONB NOT NULL DEFAULT '[]',
  recommended_links         JSONB NOT NULL DEFAULT '[]',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 생성/발행되는 페이지 (Page Factory, PRD §13)
CREATE TABLE IF NOT EXISTS pages (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_type         TEXT NOT NULL,
  slug              TEXT NOT NULL,      -- URL 경로 (예: guides/hospital-companion-cost)
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft|review|approved|published|noindex|blocked
  target_query      TEXT NOT NULL,
  primary_intent    TEXT NOT NULL,
  opportunity_id    TEXT REFERENCES search_opportunities(id),
  fact_pack_id      TEXT REFERENCES fact_packs(id),
  opportunity_score INTEGER,
  quality_score     INTEGER,
  title             TEXT NOT NULL,
  seo_title         TEXT NOT NULL,
  meta_description  TEXT NOT NULL,
  h1                TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  body              TEXT NOT NULL,      -- 마크다운 본문
  faq               JSONB NOT NULL DEFAULT '[]',
  sources           JSONB NOT NULL DEFAULT '[]',
  internal_links    JSONB NOT NULL DEFAULT '[]',
  schema_jsonld     JSONB,
  canonical_url     TEXT,
  index_policy      TEXT NOT NULL DEFAULT 'index',
  published_at      TIMESTAMPTZ,
  refresh_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)  -- 같은 사이트 안에서 slug 중복 금지
);
CREATE INDEX IF NOT EXISTS idx_pages_site ON pages (site_id);

-- 품질검사 결과 (pSEO Quality Gate, PRD §14)
CREATE TABLE IF NOT EXISTS quality_checks (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  checks     JSONB NOT NULL,     -- 규칙별 통과/실패 목록
  score      INTEGER NOT NULL,
  verdict    TEXT NOT NULL,      -- pass | warn | block
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사이트 기술 진단 결과 (Site Auditor, PRD §5/§16)
CREATE TABLE IF NOT EXISTS audit_reports (
  id             TEXT PRIMARY KEY,
  site_id        TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  start_url      TEXT NOT NULL,
  crawled_count  INTEGER NOT NULL,
  has_sitemap    BOOLEAN NOT NULL,
  has_rss        BOOLEAN NOT NULL,
  has_robots_txt BOOLEAN NOT NULL,
  has_llms_txt   BOOLEAN NOT NULL,
  pages          JSONB NOT NULL,  -- 페이지별 진단 상세
  issues         JSONB NOT NULL,  -- 발견된 문제 목록
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 검색 성과 지표 (Search Analytics Collector, PRD §18) — GSC CSV import
-- 주의: position은 SQL 예약어라 avg_position으로, key도 혼동을 피해 metric_key로 명명
CREATE TABLE IF NOT EXISTS search_metrics (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,       -- gsc_csv | gsc_api | naver_csv
  dimension    TEXT NOT NULL,       -- query | page
  metric_key   TEXT NOT NULL,       -- 검색어 또는 페이지 URL
  clicks       INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  ctr          REAL NOT NULL DEFAULT 0,
  avg_position REAL NOT NULL DEFAULT 0,
  period_label TEXT NOT NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_site ON search_metrics (site_id);

-- Growth Agent가 제안한 다음 액션 (PRD §19)
CREATE TABLE IF NOT EXISTS growth_actions (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,      -- CREATE|UPDATE|EXPAND|MERGE|REDIRECT|NOINDEX|DELETE|ADD_INTERNAL_LINK|REQUEST_MORE_DATA|TITLE_TEST
  target     TEXT NOT NULL,      -- 대상 검색어 또는 페이지
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
