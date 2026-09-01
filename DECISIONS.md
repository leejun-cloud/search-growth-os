# Search Growth OS — 설계 결정 및 대화 맥락

이 문서는 향후 개발 시 제품 방향이 흔들리지 않도록, 지금까지 논의에서 확정된 핵심 판단을 기록한다.

---

## 1. 제품의 본질

이 제품은 **AI 블로그 자동생성기**가 아니다.

핵심은:

```text
검색기회 발견
→ 어떤 페이지를 만들지 판단
→ 사실 근거 확보
→ 품질 기준을 통과한 페이지 생성
→ 검색성과 수집
→ 다음 액션 결정
```

이다.

즉, `Content Generator`보다 `Search Growth Decision Engine`이 상위 개념이다.

---

## 2. 첫 실험 사이트

`db.nolgong.app`을 첫 Pilot으로 사용한다.

현재 검색 관점에서 확인한 주요 문제:

- 블로그 목록이 크롤러 관점에서 실제 포스트보다 로딩 문구 중심으로 보이는 구조
- 검색 핵심 콘텐츠의 SSR/SSG 보강 필요
- 서비스가 한 페이지에 묶여 있어 검색의도별 독립 URL이 부족
- 페이지별 title/description 차별화 필요
- 사례/포트폴리오가 독립 Case Study 페이지로 충분히 확장되지 않음

따라서 Pilot의 첫 목표는 대량 콘텐츠가 아니라 **검색 가능한 사이트 구조 복구**다.

---

## 3. db.nolgong.app 권장 정보구조

```text
HOME
├─ SERVICES
│  ├─ AI 홈페이지
│  ├─ AI 상담봇
│  ├─ 업무 자동화
│  ├─ 콘텐츠 자동화
│  ├─ 블로그 자동화
│  └─ AX 컨설팅
├─ INDUSTRIES
│  ├─ 병원
│  ├─ 요양/돌봄
│  ├─ 교육
│  ├─ NGO
│  └─ 중소기업
├─ CASES
└─ INSIGHTS
```

검색 의도는 블로그 하나로 모두 처리하지 않는다.

---

## 4. 병원동행 같은 신규 서비스 Cold Start

자체 데이터가 없더라도 시작할 수 있다.

초기 데이터는:

```text
공공데이터
+ 실제 서비스 정책
+ 서비스 가능 지역
+ 실제 병원/기관 Entity
+ FAQ
+ 검색의도
```

로 구성한다.

이후 실제 운영 데이터가 쌓이면 자체 데이터 비중을 높인다.

---

## 5. 전국 확대 방식

전국 확대를 원한다고 해서 가능한 조합을 모두 페이지로 만들지 않는다.

계층 구조는 사용할 수 있다.

```text
전국
→ 시/도
→ 시/군/구
→ 병원/기관
→ 상황/질문
```

하지만 각 단계는 `Page Qualification Engine`을 통과해야 한다.

특히 지역명/기관명만 바꾼 페이지는 금지한다.

---

## 6. 검색 페이지 생성 기준

다음 요소를 조합해 후보를 만들 수 있다.

- Service
- Audience
- Problem
- Region
- Institution
- Intent
- Question
- Case
- Data

그러나 `조합 가능 = 발행 가능`이 아니다.

반드시 다음을 평가한다.

- 검색 의도
- 사업 연관성
- 전환 가능성
- 고유 데이터
- 차별성
- 내부링크 가치

---

## 7. 페이지 대량 생성의 핵심 안전장치

가장 중요한 품질 기능 중 하나는 **페이지 단위가 아니라 Template Family 단위 검사**다.

예:

```text
대전 병원동행
광주 병원동행
부산 병원동행
```

이 세 페이지를 각각 검사하는 것만으로는 부족하다.

서로 비교해:

- 본문 유사도
- 고유 데이터 비율
- template 반복 비율
- 지역명 치환 여부

를 측정해야 한다.

이 때문에 `pseolint` 계열 접근을 핵심 참고로 삼는다.

---

## 8. SSR/SSG 원칙

검색 대상 페이지의 주요 정보는 초기 HTML에 존재해야 한다.

최소:

- title
- description
- h1
- 핵심 본문
- 내부 링크
- structured data

블로그/콘텐츠가 JS 실행 후 API에서만 로딩되는 구조는 피한다.

---

## 9. 내부링크는 생성 후 장식이 아니다

페이지 생성 시점에 내부링크 구조를 함께 결정한다.

페이지는 Entity Graph와 Topic Cluster 안에서 생성되어야 한다.

새 페이지가 발행되면:

1. 새 페이지 → 기존 관련 페이지
2. 기존 권위 페이지 → 새 페이지

양방향 링크 후보를 만든다.

---

## 10. AEO / GEO에 대한 결정

AEO/GEO는 별도 마법 기능으로 취급하지 않는다.

우선순위:

1. crawlability
2. SSR/SSG
3. helpful unique content
4. entity clarity
5. structured data
6. internal linking
7. citations/source clarity
8. optional llms.txt

`llms.txt`는 비용이 낮으므로 지원할 수 있지만 성장 원인의 핵심으로 간주하지 않는다.

---

## 11. 콘텐츠 자동화 방향

매일 랜덤 블로그 1개 발행 방식은 채택하지 않는다.

Growth Agent가 다음을 판단해야 한다.

```text
현재 노출이 있는데 순위가 낮다
→ UPDATE

CTR이 낮다
→ TITLE/META TEST

한 페이지가 많은 Query를 얻는다
→ EXPAND CLUSTER

서로 경쟁하는 페이지가 있다
→ MERGE

가치가 없고 중복도가 높다
→ NOINDEX/DELETE

새로운 명확한 검색기회가 있다
→ CREATE
```

---

## 12. 사업 모델 방향

최종 제품은 고객 홈페이지 제작 사업에 붙는 공통 모듈이다.

기존:

```text
홈페이지 제작
→ 납품
→ 종료
```

목표:

```text
홈페이지 제작
+ Search Growth Engine
+ 월간 검색 성장 운영
```

즉 일회성 제작에서 반복 매출형 서비스로 확장한다.

---

## 13. 멀티테넌트 원칙

고객 사이트마다 엔진을 복제하지 않는다.

```text
Central Search Growth OS
├─ Site A Adapter
├─ Site B Adapter
├─ Site C Adapter
└─ Site D Adapter
```

중앙에서:

- Knowledge
- Opportunities
- Quality
- Analytics
- Growth Actions

를 관리한다.

---

## 14. 오픈소스 활용 원칙

`pseo-ai-kit`, `nextjs-seo-content-engine`, `pseolint` 등을 참고하지만 어느 하나를 제품 기반 전체로 사용하지 않는다.

좋은 부분을 기능 단위로 가져온다.

```text
pseo-ai-kit
→ 생산/배포 아이디어

nextjs-seo-content-engine
→ 검색성과 기반 의사결정

pseolint
→ 대량 페이지 품질 안전장치
```

최종 구조는 우리 요구에 맞는 멀티테넌트 제품으로 새로 설계한다.

---

## 15. Agent 설계 결정

처음부터 13개 Agent를 만드는 방향은 채택하지 않는다.

MVP는 약 6개:

- Discovery
- Planner
- Research
- Writer
- Quality/SEO
- Growth

로 시작한다.

Agent 개수보다 각 Agent의 입력/출력 스키마와 품질 기준을 엄격하게 한다.

---

## 16. 병원동행 페이지 예시

좋지 않은 페이지:

```text
OO병원 병원동행 서비스를 제공합니다.
친절하고 안전하게 동행합니다.
```

병원 이름만 바꾼 동일 본문 대량 생성.

좋은 페이지:

```text
병원 기본정보
실제 위치
진료과 정보
해당 병원 동행 가능 범위
이용 절차
필요 준비사항
비용 계산 방식
해당 지역 서비스 정책
관련 FAQ
관련 병원/지역
```

사실 기반 고유 정보가 있어야 한다.

---

## 17. 자체 데이터 전략

서비스 운영을 통해 다음 데이터가 생기면 콘텐츠 경쟁력이 크게 올라간다.

- 평균 동행시간
- 대기시간
- 병원별 이용 건수
- 진료과별 요청
- 요일별 요청
- 평균 이동거리
- 예약 lead time
- 재이용률

개인정보를 제거하고 자체 리서치/데이터 페이지로 전환한다.

이 데이터는 경쟁사가 쉽게 복제하지 못하는 장기 SEO 자산이다.

---

## 18. MVP 성공 판단

처음부터 1만 페이지를 만들지 않는다.

첫 Pilot은 30~50개 정도의 의도 높은 페이지로 시작한다.

측정:

- index rate
- impressions
- query count
- clicks
- CTR
- leads
- conversions

성과가 검증된 Page Type만 확대한다.

---

## 19. 제품 KPI 결정

단순 `노출 수`가 최종 KPI가 아니다.

North Star:

> **Organic Qualified Leads / Site / Month**

검색 노출 → 클릭 → 실제 문의/예약/리드까지 연결되는 것을 목표로 한다.

---

## 20. 향후 개발자가 먼저 읽어야 할 파일

1. `PRD.md`
2. `DECISIONS.md`
3. `REFERENCES.md`

코드 작성 전 이 세 파일을 읽고 제품 방향과 충돌하는 구현을 피한다.

---

## 21-1. Page Factory / Quality Gate 보강 결정 (2026-08-27, db.nolgong.app 파일럿 중 확정)

pSEO Quality Gate는 개별 페이지의 근접 중복(near-duplicate)만 검사해서는 부족하다. **같은 배치 안에서 페이지 "구조" 자체가 반복되는 것도 대량생성 패턴으로 봐야 한다** — 문장이 달라도 히어로+카드3개+3단계+CTA 구조를 N번 복제하면 Template Family 유사도 검사와 별개로 "구조적 thin content"가 된다.

확정 사항:
1. **Page Factory는 페이지 타입마다 최소 3~4종의 서로 다른 레이아웃 셰이프를 가져야 한다** (예: 랜딩형, 산문 가이드형, 비교표형, 서사형 사례, FAQ 아코디언형). 같은 page_type이라도 항상 같은 셰이프를 쓰지 않는다.
2. **Research Agent는 Fact Pack을 만들 때 목표 검색어의 실제 상위노출 결과를 조사(웹서치)해서 competitorGaps 필드에 반영해야 한다** — 이미 PRD §12에 필드는 있었으나, "왜/언제 조사하는가"가 이번에 확정됐다: 배치 생성 시작 전, 대표 검색어 2~3개를 실제로 검색해 형식·다루는 내용을 확인한다. 외부에서 나온 통계/사례는 Fact Pack의 verifiedFacts가 아니라 별도로 "외부 사례(출처 명시)"로 태깅해서, Writer Agent가 우리 실적처럼 쓰지 않도록 한다.
3. Quality Gate에 향후 추가할 체크: 같은 배치 내 레이아웃 구조(섹션 순서/개수) 유사도 검사(현재는 본문 텍스트 유사도만 검사함 — `src/lib/quality.ts`의 `similarity()`는 텍스트 shingle 기반이라 구조 반복은 못 잡는다. TODO로 남김).

## 21. 다음 구현 단계에서 해야 할 일

1. 독립 repository 생성 가능 시 `search-growth-os/`를 별도 repo로 이동
2. DB schema 설계
3. Site Auditor 구현
4. db.nolgong.app 연결 Adapter 작성
5. Entity/Opportunity 데이터 모델 구현
6. Page Qualification Engine 구현
7. pSEO QA prototype 구현
8. 초기 30~50개 콘텐츠 Pilot 실행
9. Search Console 성과 수집
10. Growth Agent loop 구현
