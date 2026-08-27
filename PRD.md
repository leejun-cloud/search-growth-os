# Search Growth OS — 상세 제품 기획서

## 1. 제품 개요

- 제품명(가칭): **Search Growth OS**
- 목적: 고객 홈페이지를 단순 제작물에서 **지속적으로 검색 유입을 만들어내는 성장 시스템**으로 전환한다.
- 첫 실험 대상: `db.nolgong.app`
- 2차 실험 대상: 병원동행처럼 자체 데이터가 거의 없는 신규 전국 확장형 로컬 서비스
- 최종 형태: 여러 고객 사이트를 중앙에서 운영하는 **멀티테넌트 Search Growth SaaS**

핵심 루프:

```text
사이트 연결
→ 사업/서비스 이해
→ Entity/Intent Map 생성
→ 검색기회 발견
→ 페이지 후보 생성
→ Page Qualification
→ Research/Fact Pack
→ Page Factory
→ Quality Gate
→ SSR/SSG Publish
→ Internal Linking
→ Sitemap/RSS/Schema
→ Google/Naver 성과 수집
→ Growth Agent
→ CREATE/UPDATE/EXPAND/MERGE/NOINDEX 판단
→ 반복
```

---

## 2. 해결하려는 문제

1. 홈페이지 제작 후 검색 유입 성장이 자동화되지 않는다.
2. 기존 AI 블로그 자동화는 글 수 증가에 치우쳐 검색수요와 전환을 반영하지 못한다.
3. AI로 페이지를 대량 생성하면 thin content, near-duplicate, doorway-page 위험이 커진다.
4. 신규 서비스는 자체 데이터가 없어 전국 지역/기관 페이지를 만들 근거가 부족하다.
5. 검색성과가 다음 콘텐츠 기획에 다시 반영되지 않는다.
6. 여러 고객 사이트를 운영하면 SEO/콘텐츠 운영비가 선형적으로 증가한다.

이 제품의 핵심은 **글쓰기 AI가 아니라 ‘어떤 페이지를 왜 만들어야 하는지 판단하는 엔진’**이다.

---

## 3. 제품 원칙

1. **Search Intent First** — 글 개수보다 실제 검색 의도를 우선한다.
2. **Entity First** — 서비스, 지역, 기관, 문제, 질문, 사례, 데이터포인트를 Entity로 관리한다.
3. **Evidence First** — 공공데이터, 실제 서비스 정보, 공식 자료, 자체 데이터를 근거로 사용한다.
4. **Quality Gate First** — 조합 가능한 모든 페이지를 발행하지 않는다.
5. **SSR/SSG First** — 주요 SEO 콘텐츠는 초기 HTML에서 읽혀야 한다.
6. **Internal Link by Design** — 새 페이지는 사이트 구조 안에서 고립되지 않는다.
7. **Feedback Loop** — 노출/클릭/CTR/순위/전환 데이터를 다음 액션에 반영한다.
8. **Multi-tenant by Default** — 한 고객용 도구가 아니라 여러 고객 사이트용 중앙 엔진으로 설계한다.
9. **Platform Adapter** — Next.js, WordPress, custom CMS에 동일 엔진을 연결한다.
10. **Human Approval Optional** — 위험도가 높은 페이지는 사람 승인, 검증된 타입은 자동발행 가능.

---

## 4. 시스템 구성

```text
Customer Sites
   ├─ db.nolgong.app
   ├─ 병원동행
   ├─ 요양/돌봄
   ├─ 교육/학원
   └─ 기타 고객사
        │
        ▼
Site Adapter Layer
        │
        ▼
SEARCH GROWTH OS
   ├─ Site Manager
   ├─ Business Knowledge Seeder
   ├─ Public Data Connector
   ├─ Entity Graph
   ├─ Search Opportunity Engine
   ├─ Intent/Topic Cluster Engine
   ├─ Page Qualification Engine
   ├─ Research Agent
   ├─ Content/Page Factory
   ├─ SEO Metadata & Schema Engine
   ├─ Internal Link Engine
   ├─ pSEO Quality Gate
   ├─ Sitemap/RSS Engine
   ├─ Publisher
   ├─ Search Analytics Collector
   └─ Growth Agent
        │
        └──── feedback loop ────┐
                               └→ Search Opportunity Engine
```

---

## 5. Site Manager

### 목적
고객 사이트 연결, 진단, 설정, 성과 관리를 담당한다.

### 사이트 필드

- site_id
- site_name
- domain
- platform (`nextjs`, `wordpress`, `custom`)
- primary_language
- target_regions
- primary_services
- audiences
- conversion_goals
- publishing_policy
- auto_publish_allowed
- sitemap_url
- rss_url
- google_search_console_status
- naver_searchadvisor_status

### 초기 진단

- URL inventory
- SSR/CSR 여부
- title/description 중복
- canonical
- robots/noindex
- sitemap 존재 여부
- RSS 존재 여부
- broken link
- orphan page
- structured data
- 내부링크 깊이
- 서비스 페이지 분리 상태
- 블로그 상세 URL 구조

---

## 6. Business Knowledge Seeder

신규 프로젝트의 Cold Start용 핵심 모듈.

### 입력

- 업종
- 서비스
- 서비스 지역
- 고객 유형
- 가격/요금
- FAQ
- 회사/기관 소개
- 서비스 프로세스
- 기존 사이트 URL
- 기존 문서/PDF
- 상담 기록/문의 로그(선택)
- 실제 사례(선택)

### 출력 Entity

- Service
- Audience
- Problem
- Region
- Institution
- Question
- Intent
- Topic
- Case
- DataPoint

---

## 7. Public Data Connector

신규 서비스의 초기 콘텐츠 기반을 만든다.

병원동행 예시:

- 전국 시/도
- 시/군/구
- 병원/의원
- 병원 유형
- 진료과
- 주소
- 위치
- 공공기관 식별자
- 데이터 갱신일

### 원칙

공공데이터는 **페이지 숫자를 늘리는 도구가 아니라 고유한 사실과 구조를 제공하는 데이터층**으로 사용한다.

---

## 8. Entity Graph

핵심 Entity:

```text
Site
Service
Audience
Problem
Region
Institution
Question
Intent
Topic
Case
DataPoint
Page
SearchQuery
```

예시 관계:

```text
병원동행
 ├─ serves → 노인
 ├─ serves → 보호자
 ├─ available_in → 대전
 ├─ applies_to → 충남대학교병원
 ├─ solves → 보호자 부재
 └─ related_question → 병원동행 비용은 얼마인가요?
```

이 Graph는 페이지 생성, 내부링크, 추천, Topic Cluster의 공통 기반으로 사용한다.

---

## 9. Search Opportunity Engine

제품의 핵심 두뇌.

### 입력

1. Business Knowledge DB
2. 기존 사이트 콘텐츠
3. Google Search Console Query
4. Naver 검색 성과 데이터(가능 범위)
5. 경쟁사이트 구조
6. 고객 FAQ
7. 공공데이터
8. 실제 상담/문의 데이터
9. 기존 페이지 성과

### 출력 예시

```json
{
  "query": "대전 병원동행 비용",
  "intent": "commercial_information",
  "entities": ["대전", "병원동행", "비용"],
  "recommended_page_type": "cost_guide",
  "opportunity_score": 88,
  "evidence": [
    "service available in region",
    "pricing data available",
    "high conversion relevance"
  ]
}
```

---

## 10. Page Qualification Engine

후보 페이지를 모두 만들지 않는다.

### 기본 점수

| 항목 | 점수 |
|---|---:|
| 검색 의도 명확성 | 20 |
| 서비스 연관성 | 20 |
| 전환 가능성 | 15 |
| 고유 데이터 보유 | 15 |
| 예상 검색수요 | 15 |
| 콘텐츠 차별성 | 10 |
| 내부링크 가치 | 5 |
| 합계 | 100 |

### 기본 정책

- 80+: Draft 자동 생성
- 65~79: 관리자 검토 Queue
- 50~64: 데이터 보강 후 재평가
- 0~49: 생성 금지

사이트별 Threshold 조정 가능.

---

## 11. Page Type System

블로그 하나로 모든 검색 의도를 처리하지 않는다.

페이지 타입:

1. Pillar Page
2. Service Page
3. Industry Page
4. Region Page
5. Institution/Entity Page
6. Question/FAQ Page
7. Guide/How-to Page
8. Comparison Page
9. Cost/Price Page
10. Case Study
11. Data/Research Page
12. News/Update Page

각 타입별로 Template, Required Data, Schema, QA Rule을 분리한다.

---

## 12. Research Agent / Fact Pack

페이지 작성 전에 반드시 Fact Pack을 만든다.

### Fact Pack 필드

- target query
- target intent
- entities
- verified facts
- public data
- official sources
- service-specific facts
- claims requiring caution
- prohibited assumptions
- competitor gaps
- internal source pages
- recommended links

가짜 통계, 가짜 사례, 존재하지 않는 서비스 범위 생성 금지.

---

## 13. Content/Page Factory

```text
Opportunity
→ Fact Pack
→ Outline
→ Draft
→ Metadata
→ Schema
→ Internal Link Candidates
→ Quality Gate
→ Human Approval(optional)
→ Publish
```

생성 필드:

- title
- seo_title
- meta_description
- slug
- h1
- summary
- body
- faq
- sources
- related_services
- related_pages
- schema_jsonld
- canonical_url
- og metadata
- publish_at
- refresh_at

---

## 14. pSEO Quality Gate

### 검사 항목

- near duplicate
- exact duplicate
- duplicated title
- duplicated description
- repeated template ratio
- thin content
- doorway pattern
- location-name-only substitution
- unsupported factual claims
- fake case/review
- keyword stuffing
- orphan page
- broken internal links
- index/noindex conflict
- canonical conflict
- schema validation

### Cluster QA

개별 페이지뿐 아니라 같은 Template Family 전체를 분석한다.

예:

```text
대전 병원동행
광주 병원동행
부산 병원동행
...
```

고유 데이터/본문 차별성이 기준 이하이면 발행을 차단한다.

---

## 15. Internal Link Engine

구조:

```text
Pillar
  ↓
Service
  ↓
Region / Industry
  ↓
Question / Guide / Entity
  ↓
Case / Data
```

규칙:

- 신규 페이지에서 기존 관련 페이지 3~8개 링크
- 기존 페이지에서 신규 페이지로 backlink 후보 생성
- orphan page 0 목표
- anchor text 다양화
- 중요 페이지는 depth 3 이하 권장
- 성과 좋은 페이지에서 관련 신규 페이지로 link equity 전달

---

## 16. Technical SEO Engine

자동 생성/검사:

- metadata
- unique title
- meta description
- canonical
- OpenGraph
- robots directives
- JSON-LD
- Breadcrumb JSON-LD
- sitemap
- sitemap index/sharding
- RSS
- robots.txt
- llms.txt(optional)

### Rendering Gate

SEO 대상 페이지는 초기 HTTP HTML에서 다음이 보여야 한다.

- `<title>`
- description
- `<h1>`
- 핵심 본문
- crawlable `<a href>`
- structured data

SEO 핵심 콘텐츠가 JS 실행 후에만 표시되는 구조는 기본적으로 실패 처리한다.

---

## 17. Site Adapter

```ts
interface SiteAdapter {
  getSiteInfo(): Promise<SiteInfo>
  listPages(): Promise<Page[]>
  getPage(slug: string): Promise<Page>
  publishPage(page: GeneratedPage): Promise<PublishResult>
  updatePage(id: string, page: GeneratedPage): Promise<PublishResult>
  deletePage(id: string): Promise<void>
  revalidatePath(path: string): Promise<void>
  getSitemapStatus(): Promise<SitemapStatus>
}
```

초기 Adapter:

1. Next.js Adapter
2. WordPress REST Adapter
3. Generic Webhook Adapter

---

## 18. Search Analytics Collector

지표:

- indexed
- impressions
- clicks
- CTR
- average_position
- query_count
- top_queries
- conversions
- leads

기본 기간:

- 7일
- 28일
- 90일

---

## 19. Growth Agent

가능 Action:

```text
CREATE
UPDATE
EXPAND
MERGE
REDIRECT
NOINDEX
DELETE
ADD_INTERNAL_LINK
REQUEST_MORE_DATA
```

예:

```text
AI 홈페이지 제작 비용
노출: 8,100
평균 위치: 11.8
CTR: 0.7%

Recommended Actions
- title 개선
- 비용 FAQ 강화
- 실제 견적 범위/사례 추가
- Pillar 페이지에서 내부링크 추가
- 관련 Cost Cluster 후보 3개 생성
```

---

## 20. db.nolgong.app Pilot

### Phase A — Technical SEO Fix

- `/blog` SSR/SSG
- blog detail SSR/SSG
- 페이지별 unique title/description
- sitemap
- RSS
- robots
- canonical
- JSON-LD
- crawlable internal links

### Phase B — Service Pillars

```text
/services/ai-homepage
/services/ai-chatbot
/services/business-automation
/services/content-automation
/services/blog-automation
/services/ax-consulting
```

### Phase C — Industry Pages

```text
/industries/hospital
/industries/care
/industries/education
/industries/ngo
/industries/sme
```

### Phase D — Case Pages

기존 Portfolio를 독립 Case Study로 전환.

### Phase E — Initial Cluster

처음부터 수천 페이지를 만들지 않는다.

초기 30~50개 페이지로 다음을 측정한다.

- index rate
- query count
- impressions
- clicks
- CTR
- inquiries
- conversions

성과 좋은 Page Type만 확대한다.

---

## 21. 병원동행 Pilot

### Cold Start 구성

```text
Public Data
+ Service Policy
+ Region DB
+ Hospital DB
+ FAQ
+ Search Intent DB
```

### 계층

```text
National
↓
Province/City
↓
District
↓
Hospital
↓
Situation/Question
```

예시 URL:

```text
/hospital-companion
/regions/daejeon/hospital-companion
/regions/daejeon/yuseong/hospital-companion
/hospitals/chungnam-national-university-hospital/companion
/guides/hospital-companion-cost
```

### 지역/기관 페이지 발행 조건

지역명만 바꾼 페이지 금지.

다음 중 최소 2개 이상의 고유 데이터가 있어야 한다.

- 고유 병원 데이터
- 지역 서비스 정책
- 실제 서비스 가능 범위
- 고유 FAQ
- 교통/이동 정보
- 서비스 가격/시간 규칙
- 실제 사례
- 실제 통계

---

## 22. 자체 데이터 성장

초기에는 공공데이터 비중이 높지만 서비스 운영과 함께 다음 데이터포인트를 축적한다.

- 평균 동행시간
- 평균 대기시간
- 많이 이용되는 요일
- 지역별 요청량
- 병원별 요청량
- 진료과별 요청량
- 평균 이동거리
- 예약 lead time
- 재이용률

개인정보를 제거하고 Data/Research 콘텐츠로 전환한다.

---

## 23. 관리자 UI

### Global Dashboard

- Sites
- Indexed Pages
- 28d Impressions
- Clicks
- CTR
- Conversions
- Open Opportunities
- Quality Alerts

### Site Detail Tabs

1. Overview
2. Knowledge
3. Entities
4. Opportunities
5. Pages
6. Content Queue
7. Internal Links
8. Technical SEO
9. Analytics
10. Growth Actions
11. Settings

### Opportunity Table

- Query/Topic
- Intent
- Page Type
- Opportunity Score
- Evidence
- Available Data
- Status
- Action

### Page Review

- Preview
- Fact Pack
- Quality Score
- Duplicate Risk
- SEO Score
- Sources
- Internal Links
- Publish/Schedule

---

## 24. AI Agent 구성

MVP는 6개 Agent로 제한한다.

1. **Discovery Agent** — 검색기회 발견
2. **Planner Agent** — Topic Cluster/Page Type 설계
3. **Research Agent** — Fact Pack 생성
4. **Writer Agent** — 페이지 작성
5. **Quality/SEO Agent** — 중복/SEO/내부링크 검수
6. **Growth Agent** — 성과 기반 다음 액션 결정

Agent 숫자보다 Input/Output Contract를 엄격하게 정의하는 것을 우선한다.

---

## 25. 권장 기술 스택

### App

- Next.js 15+
- React 19
- TypeScript
- Tailwind CSS

### DB

권장:

- PostgreSQL
- pgvector
- Supabase 또는 Neon

Entity/Relation/Search Performance 데이터는 관계형 DB 중심으로 관리한다.

### Queue / Job

- Trigger.dev 또는 Inngest

### AI Provider Layer

Adapter 구조:

- OpenAI
- Anthropic
- Gemini
- OpenRouter(optional)

### Crawl / Parse

- Playwright
- Cheerio
- Firecrawl(optional adapter)

### Search Data

- Google Search Console API
- Naver Search Advisor: 제공 가능 범위 내 API/수동 import/CSV connector

---

## 26. 데이터 모델 초안

핵심 테이블:

```text
sites
business_profiles
services
audiences
regions
institutions
entities
entity_relations
search_queries
search_opportunities
page_types
pages
page_versions
fact_packs
sources
internal_links
quality_checks
publishing_jobs
search_metrics
conversions
growth_actions
public_data_sources
public_data_records
```

### pages 핵심 필드

```text
id
site_id
page_type
slug
status
target_query
primary_intent
opportunity_score
quality_score
canonical_url
index_policy
published_at
refresh_at
```

---

## 27. MVP 범위

### MUST

- site registration
- site audit
- business knowledge input
- entity creation
- opportunity generation
- page scoring
- research/fact pack
- draft generation
- quality checks
- internal link suggestions
- metadata/schema
- Next.js publish adapter
- sitemap support
- Search Console import
- dashboard
- growth recommendation

### SHOULD

- public data connectors
- WordPress adapter
- automatic content refresh
- competitor gap analysis
- conversion tracking

### LATER

- full autonomous publishing
- multi-language international SEO
- advanced GEO/AEO citation tracking
- proprietary keyword dataset
- agency white-label billing

---

## 28. 성공 지표

### 제품 KPI

- site onboarding time
- opportunity → publish conversion
- QA rejection rate
- duplicate risk rate
- avg pages managed per operator
- publish cost per page

### 고객 KPI

- indexed pages
- unique search queries
- impressions
- clicks
- organic leads
- conversion rate
- cost per organic lead

### 핵심 North Star

**Organic Qualified Leads / Site / Month**

노출량 자체가 아니라 실제 사업 기회로 연결되는 검색 유입을 핵심 성과로 본다.

---

## 29. 개발 순서

### Sprint 1 — Foundation

- DB schema
- auth/site management
- site crawler
- technical audit
- business profile

### Sprint 2 — Intelligence

- Entity Graph
- Opportunity Engine
- Page Qualification
- Topic Cluster

### Sprint 3 — Factory

- Fact Pack
- Page Factory
- Metadata/Schema
- Internal Linking
- Quality Gate

### Sprint 4 — Publish

- Next.js Adapter
- sitemap/RSS
- revalidation
- publishing queue

### Sprint 5 — Feedback

- Search Console integration
- metrics warehouse
- Growth Agent
- update/expand recommendations

### Sprint 6 — Pilot

- db.nolgong.app 적용
- 30~50 initial pages
- 측정
- QA threshold 조정

### Sprint 7 — Local Service

- 병원동행
- Region/Institution/Public Data
- Page Qualification for local pSEO

---

## 30. 절대 하지 않을 것

1. 지역명만 바꾼 페이지 수천 개 자동발행
2. 검색수요/사업가치 없이 키워드 조합만으로 페이지 생성
3. 가짜 통계/가짜 후기/가짜 사례 생성
4. JS 실행 후에만 핵심 본문이 나타나는 SEO 페이지
5. 동일 title/description 대량 반복
6. 내부링크 없는 orphan page 양산
7. llms.txt/AEO/GEO를 기본 SEO보다 우선시
8. Agent 수를 늘리는 것을 제품 발전으로 착각
9. 오픈소스 프로젝트 하나에 제품 전체 아키텍처를 종속
10. 노출량만 KPI로 판단

---

## 31. 참고 문서

- `REFERENCES.md` — 참고할 GitHub 레포와 공식 SEO 문서, 가져올 기능
- `DECISIONS.md` — 이번 기획 과정에서 확정된 설계 결정과 대화 맥락

이 두 파일은 개발 전에 반드시 함께 읽는다.
