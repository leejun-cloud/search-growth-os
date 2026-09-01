# Search Growth OS — 개발노트

> 작성일: 2026-09-01
> 브랜치 기반: `main` (f2f69e1)
> 대상: OpenRouter 통합 · GSC API 연동 · 품질 기준 사이트별 조정 · 단위 테스트 · 파일럿 스크립트

---

## 1. 이번 작업 개요

이전 평가에서 지적된 다음 단계를 실제 구현했다:

1. **실측 검색수요 데이터 연결** — 기존에 LLM 추정에만 의존하던 검색기회 후보를, Google Search Console API로 **실제 노출/클릭/순위**로 검증할 수 있게 했다.
2. **품질 기준 사이트별 조정** — `800자/500자 차단`, 유사도 60%, Template Family 45%, 밀도 5%를 사이트별 `thresholds.quality`로 보정 가능하게 했다.

3. **단위 테스트 도입** — 결정적 규칙(유사도·밀도·CSV 파서·slug·JSON-LD)에 vitest 테스트 15개를 붙였다.

4. **파일럿 스크립트** — 초기 30~50페이지를 채점→Fact Pack→초안→품질검사까지 일괄 생성하는 `npm run pilot`을 추가했다.


5. **OpenRouter AI 프로바이더** — 기존 claude-cli/codex-cli/mock에 더해 OpenRouter API 직접 호출을 지원한다.



6. **버그 수정** — `layout.tsx`의 잘못된 `LayoutProps` 타입, `quality.ts` 미사용 import, 데모/액션의 문법 오류를 수정했다.



---

## 2. 주요 변경 파일

| 파일 | 변경 | 내용 |
|---|---|---|
| `src/lib/searchconsole.ts` | **신규** | GSC 서비스 계정 JWT 인증 → `searchAnalytics/query` 호출 → `search_metrics` 저장 |
| `src/lib/ai.ts` | 수정 | `OpenRouterProvider` 추가 (`SGO_AI=openrouter`) |
| `src/lib/quality.ts` | 수정 | 품질 기준을 사이트 `thresholds.quality`에서 읽음 + 순수 함수 export |
| `src/lib/types.ts` | 수정 | `Site.thresholds.quality` 필드 추가 |
| `src/app/actions.ts` | 수정 | `importGscApiAction` 추가, 기본 thresholds에 quality 포함 |
| `src/app/sites/[siteId]/analytics/page.tsx` | 수정 | GSC API 가져오기 UI (7/28/90일) |
| `scripts/pilot.ts` | **신규** | 파일럿 일괄 생성 스크립트 |
| `tests/*.test.ts` | **신규** | vitest 단위 테스트 15개 |
| `package.json` | 수정 | `test`/`pilot` 스크립트, `vitest` devDependency |
| `매뉴얼.md` | 수정 | AI 설정·GSC 인증·품질 기준·명령어 갱신 |


---

## 3. 설계 결정 및 근거


### 3.1 GSC API는 CSV 업로드와 같은 테이블을 쓴다

기존 `importGscCsv`가 쓰는 `search_metrics` 테이블을 그대로 사용한다.
- `source = 'gsc_csv'` vs `'gsc_api'` 로만 구분 — 기존 Growth Agent·파일럿 판정 로직은 무수정 재사용한다.
- CSV 경로와 API 경로가 공존하므로, 자격증명이 없어도(API 불가 환경) CSV 업로드로 동작을 유지한다.


### 3.2 JWT는 `crypto`로만 서명한다


외부 OAuth 라이브러리 없이 `crypto.createSign('RSA-SHA256')` + base64url로 자체 서명한다.
- 의존성 추가 최소화, PEM 문자열은 환경변수에서 `\n`을 복원한다.


### 3.3 품질 기준은 "기본값 + 사이트별 오버라이드" 패턴

`quality.ts`는 `site?.thresholds?.quality ?? {기본값}` 형태로 읽는다.
- 신규 사이트·기존 DB(스키마 마이그레이션 없음)는 자동으로 기본값이 적용된다.


- 파일럿 데이터가 쌓이면 사이트 설정에서만 값을 바꾸면 된다 (코드 수정 불필요).


### 3.4 테스트는 순수 함수에만 집중한다

`similarity`·`keywordDensity`·`parseCsv`·`toSlug`·`buildJsonLd`처럼 DB·네트워크가 없는 함수만 테스트해, CI에서도 결정적(deterministic)으로 통과한다。


---

## 4. 검증 결과

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 |
| `npx eslint .` | ✅ 통과 |
| `npm test` (vitest 15개) | ✅ 15/15 통과 |
| `npm run build` | ✅ 성공 |
| `SGO_AI=mock npm run demo` | ✅ 전체 파이프라인 정상 동작 |
| 특수문자(깨진 유니코드) 검사 | ✅ 통과 |


---

## 5. 배포/운영 시 필요한 환경변수


```bash
# AI
SGO_AI=openrouter                    # openrouter | claude-cli | codex-cli | mock
OPENROUTER_API_KEY=sk-or-...        # SGO_AI=openrouter일 때 필수
OPENROUTER_MODEL=openai/gpt-4o-mini # (선택)

# GSC 실측 성과 (선택)
SGO_GSC_CLIENT_EMAIL=your-sa@project.iam.gserviceaccount.com
SGO_GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
SGO_GSC_SITE=                          # (선택) 없으면 사이트 도메인 사용

# 발행 (선택)
SGO_PUBLISH_ENDPOINT=
SGO_PUBLISH_SECRET=
```



GSC 준비 절차: Google Cloud에서 서비스 계정 생성 → GSC 속성에 **사용자**로 이메일 추가(전체 보기 권한) → `.env.local`에 위 값 설정 → 성과 탭에서 "GSC API 가져오기".



---

## 6. 다음 단계 (미반영)

- GSC API의 **검색량·난이도**(키워드 도구) 연동으로 Opportunity 채점 `expectedDemand`를 실측화
- `unsupported_claims`를 단순 문자열 포함에서 **사실 검증(LLM 교차 확인)**으로 강화
- 고객 사이트(웹훅 발행) 후 SSR 재확인(재크롤링) 로직
- 멀티테넌트 SaaS 전환 시 인증/권한
- Neon 전환 시 동시 접속 지원 (현재 PGlite는 단일 프로세스)