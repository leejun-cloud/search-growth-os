# Search Growth OS

검색 콘텐츠 생성뿐 아니라 **실제 URL 검증 → 검색/방문 관측 → 기존 페이지 개선 → 변경 이력/전후 비교**를 수행하는 운영 엔진입니다.

## 이번에 실제 구현된 화면

사이트를 선택하면 **성과 검증** 탭(`/sites/{siteId}/operations`)이 나타납니다.

- 검사할 실제 URL/경로 입력 → 본문, title/H1, canonical, noindex, robots, sitemap 확인.
- GSC 확정 기간의 최근 28일/직전 28일 비교. 사이트 전체 범위 합계와 검색어 행 합계를 혼동하지 않습니다.
- GA4 검색 유입 세션과 명시적으로 설정한 문의 이벤트를 별도 표시. 이벤트 수를 유효 고객 수로 바꾸지 않습니다.
- 실제 검색어×페이지 자료로 **기존 페이지** 개선 후보 표시. 누락 행으로 삭제/noindex/대량 발행을 추천하지 않습니다.
- 직답/근거 URL/자료 기준일/검토자 저장 → 원본 버전 보관 → 콘텐츠 반영 → 품질 재검사.
- 적용한 변경의 커밋/배포 증거와 기준선 저장. 기간이 겹치면 전후 비교를 보류합니다.
- AI 검색 답변의 인용 증거 기록. 이 기능은 운영자 관측 기록이며 자동 다중 모델 검색이 아닙니다.
- 공개 키 파일과 검사 URL을 검증한 뒤 IndexNow 명시적 제출. 접수는 색인 완료가 아닙니다.

## 실행

```bash
npm ci
npm run dev
# 기존 사이트 레코드를 선택하고 '성과 검증' 탭을 여세요.
# CLI: 기존 DB에 등록된 siteId 사용
npx tsx scripts/operate.ts <siteId> /services/ai-website
```

DB는 기존 설정을 유지합니다. `DATABASE_URL`이 있으면 PostgreSQL, 없으면 로컬 PGlite입니다. 새 근거 테이블은 기존 데이터를 지우지 않고 추가됩니다. 장기 운영/다중 프로세스에서는 영속 PostgreSQL을 사용하세요.

## 서버 환경변수 (실제 값은 저장소에 커밋하지 않음)

```dotenv
SGO_OPERATOR_TOKEN=<충분히-긴-운영자-암호>
SGO_GSC_CLIENT_EMAIL=<읽기-권한이-있는-서비스계정>
SGO_GSC_PRIVATE_KEY=<비공개키-PEM>
SGO_GSC_SITES={"db.nolgong.app":"sc-domain:db.nolgong.app"}
SGO_ANALYTICS_SITES={"db.nolgong.app":{"propertyId":"실제-GA4-숫자-ID","leadEvent":"실제로-수집하는-문의완료-이벤트명"}}
SGO_INDEXNOW_SITES={"db.nolgong.app":{"key":"실제공개키","keyLocation":"https://db.nolgong.app/실제공개키.txt"}}
# 실제 발행은 해당 사이트에 이미 구현된 수신 API가 있어야 합니다.
SGO_PUBLISH_ENDPOINT=https://db.nolgong.app/<실제-인증된-수신-API>
SGO_PUBLISH_SECRET=<수신-API와-동일한-시크릿>
```

`SGO_GSC_SITE` 단일 속성 설정도 지원합니다. 사이트 도메인과 맞지 않는 속성은 거부합니다. GSC/GA4 서비스 계정은 각 속성의 읽기 권한이 필요합니다. 미설정/권한 오류는 0이 아니라 미측정으로 표시합니다.

`SGO_OPERATOR_TOKEN`은 신규 운영 화면의 단일 운영자 접근 게이트입니다. **기존 전체 앱의 멀티테넌트 인증을 대신하지 않습니다.** 전체 관리자 앱은 신뢰된 네트워크/상위 접근 제어 뒤에서 운영하세요. HTTPS 환경에서는 로그인 쿠키가 Secure로 설정됩니다.

## 발행 완료의 의미

1. 현재 본문으로 품질검사를 다시 실행합니다.
2. 발행 API가 없으면 파일만 내보내고 `exported` 이력을 남깁니다. `published`로 변경하지 않습니다.
3. API 응답 성공 후 대상 URL을 다시 GET합니다. title/H1/직답/canonical/검색 차단을 확인합니다.
4. 실제 URL 검증이 통과해야 `published`로 변경합니다. 검증 실패/시간 초과는 `unverified`로 남깁니다.
5. 피드 파일 생성은 로컬 출력입니다. 대상 사이트의 sitemap 배포까지 자동으로 했다고 해석하지 않습니다.

이미 과거에 `published`로 저장된 항목은 이 업데이트가 소급해 보증하지 않습니다. 실제 URL로 다시 검사하세요.

## 데이터 신뢰성

- 0.5%는 0.005로 저장됩니다.
- 동일 기간 검색어 CSV 업로드가 페이지 지표나 API 지표를 삭제하지 않습니다.
- 데이터 교체는 단일 SQL 원자적 연산입니다. 실패 시 마지막 정상 지표를 보존합니다.
- 중첩되는 7/28/90일 기간과 서로 다른 공급자 지표를 합산하지 않습니다.
- GSC의 누락/상위 행 제한을 기록합니다. 누락을 무노출/미색인의 확정 근거로 쓰지 않습니다.
- 전후 비교는 관측 변화이며 SEO 변경의 인과효과를 보장하지 않습니다.

## 검증

```bash
npm test
npx tsc --noEmit
npm run build
```

CI는 회귀 테스트, 타입검사, 프로덕션 빌드에 더해 실제 `db.nolgong.app` URL을 읽기 전용으로 검사하고, 운영 화면을 브라우저로 확인합니다. 스크린샷/검사 JSON/테스트 로그는 `verified-growth-evidence` 아티팩트에 저장됩니다. CI 검사는 실제 GSC/GA4 계정 데이터 없이 실행하므로 방문 수와 문의 수는 미측정으로 표시됩니다.

## 참고와 구현 범위

`leopard627/fire-your-seo-agency`의 직답/근거/기준선/재측정 운영 아이디어를 참고하되, 코드 구현에는 날짜 검증·사이트 범위 검증·원자적 저장·게시 영수증·미측정 상태·회귀 테스트를 추가했습니다. 문구나 코드를 통째로 복제하지 않았습니다.

공식 API 기준: Google Search Console Search Analytics API, Google AI features and your website, IndexNow protocol documentation.

상세 설계 배경은 `PRD.md`, `DECISIONS.md`, `REFERENCES.md`를 확인하세요. 이번 업데이트 대상은 이 엔진 저장소입니다. 연결 대상 `homepage` 저장소나 운영 도메인에 자동 배포됐다는 뜻은 아닙니다.
