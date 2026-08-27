# Search Growth OS — 참고 레포 및 공식 가이드

이 문서는 다음 개발자가 기능을 구현할 때 **어떤 오픈소스와 공식 문서를 어디에 참고해야 하는지**를 빠르게 파악하기 위한 레퍼런스 맵이다.

> 원칙: 오픈소스 레포를 통째로 제품 기반으로 삼지 않는다. 좋은 아이디어/구현 패턴/테스트 전략만 선별해서 가져온다.

---

## 1. 핵심 pSEO / Search Growth 참고 레포

### 1.1 swarmclawai/pseo-ai-kit

GitHub: `https://github.com/swarmclawai/pseo-ai-kit`

### 참고할 부분

- 키워드/페이지 대량 생성 파이프라인
- programmatic SEO용 content generation flow
- sitemap 자동화
- JSON-LD 생성
- 내부링크 그래프
- thin content 검사
- agent-friendly CLI/automation 아이디어

### 우리 제품에 적용

- `Page Factory`
- `Metadata & Schema Engine`
- `Sitemap Engine`
- `Internal Link Engine`
- 초기 Quality Rule 아이디어

### 주의

- 프로젝트 규모가 작으므로 제품 핵심 의존성으로 삼지 않는다.
- 코드 복사보다 구조/패턴 참조 중심.

---

### 1.2 mahdibrr/nextjs-seo-content-engine

GitHub: `https://github.com/mahdibrr/nextjs-seo-content-engine`

### 참고할 부분

- Google Search Console 기반 콘텐츠 기회 탐지
- topic map / pillar-cluster 구조
- scoring 기반 콘텐츠 추천
- internal-link recommendation
- 성과 기반 refresh queue
- 기존 콘텐츠 개선 중심 사고방식

### 우리 제품에 적용

- `Search Opportunity Engine`
- `Topic Cluster Engine`
- `Growth Agent`
- `Refresh / Expand / Merge` 판단

### 핵심 해석

이 프로젝트의 가치가 가장 큰 부분은 **새 글을 만드는 기능보다 기존 검색성과를 보고 다음 액션을 결정하는 구조**다.

---

### 1.3 ouranos-labs/pseolint

GitHub: `https://github.com/ouranos-labs/pseolint`

### 중요도

**매우 높음.**

대량 페이지 생성 시 가장 위험한 영역인 near-duplicate, doorway, thin-content 문제를 막기 위한 핵심 참고 레포.

### 참고할 부분

- template family / cluster 단위 검사
- near-duplicate detection
- thin content detection
- doorway-like pattern detection
- SEO quality linting
- 대규모 테스트 전략
- CI 단계 품질검사 아이디어

### 우리 제품에 적용

- `pSEO Quality Gate`
- `Template Family QA`
- `Pre-Publish Blocking Rule`
- CI Quality Check

### 특히 병원동행에 필요한 이유

다음과 같은 페이지를 만들 때:

```text
대전 병원동행
광주 병원동행
부산 병원동행
충남대학교병원 병원동행
건양대학교병원 병원동행
...
```

지역명/기관명만 바뀌고 본문이 거의 같아지는 것을 자동으로 감지해야 한다.

---

## 2. Next.js SEO 구현 참고 레포

### 2.1 garmeeh/next-seo

GitHub: `https://github.com/garmeeh/next-seo`

### 참고할 부분

- Next.js SEO metadata 패턴
- JSON-LD helpers
- OpenGraph/Twitter metadata
- structured-data component 설계

### 우리 제품에 적용

- `Technical SEO Engine`
- `Schema Generator`

### 참고 방식

Next.js 최신 Metadata API와 함께 비교해서 필요한 부분만 사용한다.

---

### 2.2 google/schema-dts

GitHub: `https://github.com/google/schema-dts`

### 참고할 부분

- schema.org TypeScript typing
- JSON-LD 타입 안정성

### 우리 제품에 적용

- `Schema Engine`
- `Article`, `FAQPage`, `BreadcrumbList`, `Organization`, `LocalBusiness` 등 schema typing

---

### 2.3 iamvishnusankar/next-sitemap

GitHub: `https://github.com/iamvishnusankar/next-sitemap`

### 참고할 부분

- sitemap generation
- sitemap index
- dynamic sitemap
- robots integration

### 우리 제품에 적용

- `Sitemap/RSS Engine`
- 대량 URL sitemap sharding

### 주의

Next.js 자체 sitemap route로 충분한 경우 외부 의존성을 추가하지 않아도 된다. 구현 패턴 참고용.

---

## 3. 크롤링 / 사이트 분석 참고 기술

### Playwright

GitHub: `https://github.com/microsoft/playwright`

### 역할

- CSR/SSR 차이 확인
- rendered DOM 검사
- metadata 검사
- broken UI / JS rendering 확인
- 실제 HTML과 브라우저 렌더 결과 비교

### 우리 제품에 적용

`Site Auditor`에서:

```text
HTTP HTML 검사
vs
Browser-rendered DOM 검사
```

비교.

핵심 본문이 브라우저 JS 실행 후에만 나타나는 경우 SEO 경고.

---

### Cheerio

GitHub: `https://github.com/cheeriojs/cheerio`

### 역할

HTML parsing, metadata, heading, link, structured-data 분석.

Playwright가 필요 없는 페이지는 Cheerio로 빠르게 분석하여 비용 절감.

---

## 4. Job / Automation 참고

### Trigger.dev

GitHub: `https://github.com/triggerdotdev/trigger.dev`

### 참고할 부분

- long-running job
- retries
- scheduled refresh
- background AI workflow
- job observability

### 적용

- content generation queue
- public data refresh
- sitemap update
- Search Console import
- Growth Agent periodic analysis

---

### Inngest

GitHub: `https://github.com/inngest/inngest`

Trigger.dev 대안.

두 기술을 모두 넣지 말고 MVP 시점에 하나 선택.

---

## 5. Database / Vector Search

### PostgreSQL + pgvector

Entity/검색성과/페이지 관계는 PostgreSQL 중심.

Vector는 다음에 제한적으로 사용:

- 콘텐츠 유사도
- near-duplicate 후보 탐지
- related pages
- semantic entity matching

Vector DB가 전체 데이터 모델의 중심이 되어서는 안 된다.

---

## 6. 공식 Google SEO 자료

### Google Search Essentials / Spam Policies

`https://developers.google.com/search/docs/essentials/spam-policies`

개발 전 반드시 확인할 항목:

- scaled content abuse
- doorway abuse
- scraped content
- misleading functionality

### 우리 제품의 대응

- Page Qualification
- Template Family QA
- Evidence requirement
- duplicate blocking

---

### Google AI Search / AI Features Guidance

`https://developers.google.com/search/docs/fundamentals/ai-optimization-guide`

핵심 원칙:

- 별도의 마법 같은 GEO 기술보다 기본 SEO/고유하고 유용한 콘텐츠가 우선
- AI 검색도 크롤링/색인 가능한 페이지가 기반

### 제품 결정

`llms.txt`는 optional.

SSR, 콘텐츠 품질, entity clarity, schema, internal link보다 우선하지 않는다.

---

### Google Sitemap Guide

`https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`

참고:

- 50,000 URL / sitemap
- sitemap index
- large-site sharding

---

## 7. 네이버 Search Advisor 공식 자료

### JavaScript / SPA SEO

`https://searchadvisor.naver.com/guide/seo-advanced-javascript`

핵심:

- 중요 콘텐츠는 서버에서 HTML로 제공하는 구조를 우선
- JS rendering 의존을 줄인다.

### 우리 제품 대응

Rendering Gate에서 SEO 페이지의 초기 HTML 검증.

---

### SEO 기본

`https://searchadvisor.naver.com/guide/seo-basic-intro`

참고:

- crawlable `<a href>` 내부 링크
- 검색로봇이 URL 발견 가능한 구조

---

### SEO Help / Title & Description

`https://searchadvisor.naver.com/guide/seo-help`

참고:

- 고유한 title
- 페이지 주제를 정확히 설명하는 description
- 반복 title 방지

---

### Structured Data

`https://searchadvisor.naver.com/guide/structured-data-intro`

참고:

- Schema.org
- JSON-LD

---

### Sitemap / RSS

`https://searchadvisor.naver.com/guide/request-feed`

참고:

- sitemap
- RSS
- 신규 콘텐츠 발견 지원

---

## 8. 공공데이터 — 병원동행 Cold Start

### 건강보험심사평가원 병원정보 API

공공데이터포털:

`https://www.data.go.kr/data/15001698/openapi.do`

참고 데이터:

- 의료기관
- 주소
- 기관 유형
- 기본 병원정보

### 국립중앙의료원 병·의원 정보

공공데이터포털에서 병·의원 정보 API 확인.

### 제품 활용 방식

공공데이터를 그대로 문장으로 재생산하지 않는다.

```text
공공 데이터
→ Entity DB
→ Service availability
→ Region/Institution context
→ unique page evidence
```

형태로 활용한다.

---

## 9. 현재 프로젝트 내 참고 Repo

### leejun-cloud/dreambridge

드림브릿지 메인 관련 저장소.

Search Growth OS는 별도 엔진으로 유지하고 Site Adapter로 연결하는 방향.

---

### leejun-cloud/dreambridge-agents

현재 `search-growth-os/` 문서가 위치한 저장소.

향후 독립 저장소 생성 시 폴더 전체를 새 repository로 이동 가능하도록 독립성을 유지한다.

---

### leejun-cloud/tr-nolgong

확인된 기술 스택:

- Next.js 15.3+
- React 19
- Firebase 11
- Tailwind 4
- Vitest

향후 놀공 계열 사이트에 Search Growth OS Adapter를 붙일 때 Next.js integration 참고 가능.

---

## 10. 개발 시 레퍼런스 우선순위

### Tier A — 반드시 확인

1. `ouranos-labs/pseolint`
2. `swarmclawai/pseo-ai-kit`
3. `mahdibrr/nextjs-seo-content-engine`
4. Google Spam Policies
5. Naver JavaScript SEO Guide

### Tier B — 구현 패턴 참고

6. `garmeeh/next-seo`
7. `google/schema-dts`
8. `iamvishnusankar/next-sitemap`
9. Playwright
10. Trigger.dev / Inngest

---

## 11. 좋은 부분만 합친 최종 설계

```text
pseo-ai-kit
  → Page Factory
  → sitemap/schema/internal-link

nextjs-seo-content-engine
  → Opportunity discovery
  → performance feedback
  → refresh/expand

pseolint
  → quality gate
  → cluster duplicate detection
  → doorway/thin content prevention

Google/Naver Guidelines
  → policy constraints
  → technical SEO acceptance rules

Search Growth OS
  = 위 기능들을 멀티테넌트 SaaS로 재설계
```

---

## 12. 개발자가 레포를 참고할 때 질문해야 할 것

코드를 가져오기 전에 반드시 다음을 확인한다.

1. 이 기능이 현재 Next.js 최신 구조에서도 필요한가?
2. 패키지를 설치할 것인가, 구현 패턴만 가져올 것인가?
3. 프로젝트 유지보수 상태는 어떤가?
4. 라이선스는 상업적 사용에 적합한가?
5. 우리 멀티테넌트 구조와 충돌하지 않는가?
6. 100페이지가 아니라 100만 페이지에서도 가능한 구조인가?
7. 품질검사와 롤백이 가능한가?

---

## 13. 추가 조사 대상

개발 단계마다 다음 카테고리의 최신 레포를 다시 조사한다.

- keyword clustering
- semantic internal linking
- content similarity / deduplication
- sitemap scaling
- Search Console analytics
- Naver search analytics automation
- local SEO
- schema validation
- content provenance / citation
- AI agent orchestration

레퍼런스는 고정 목록이 아니라 **계속 갱신되는 기술 조사 목록**으로 관리한다.
