# 앙데팡당 (exhibition-news)

앱 이름: **앙데팡당** — 1884년 파리 앙데팡당전(심사·상 없이 누구나 출품)에서 따옴. 소개글: "누구의 전시든, 지도 위에 평등하게". (2026-11-17, 예전 이름 '전시지도')

전국에서 열리는 미술 전시를 지도에서 찾아보는 웹앱. 지도에서 전시를 고르면 상세 정보가 나오고, 유료 전시는 예매처로 연결한다.

## 일하는 방식

- 사용자는 비개발자이며 아이패드·휴대폰만 쓴다. 설명은 한국어로, 쉬운 말로 한다. 터미널 명령을 시키지 않는다.
- 기능 하나 = 브랜치 하나 = PR 하나. `main`에 직접 푸시하지 않는다.
- PR 설명에는 "무엇이 바뀌었는지 / 확인하는 방법(미리보기 링크에서 어디를 눌러 보면 되는지)"을 쓴다.
- 작업을 마치면 `docs/ROADMAP.md`의 체크 상태를 갱신한다.
- 사용자가 직접 해야 하는 일(가입, 키 발급, 결제, 본인 인증)은 단계별로 안내하고, 키는 채팅이 아니라 GitHub Secrets / Netlify 환경변수에 넣도록 한다.

## 구조

- `app/` — Next.js App Router. `page.tsx`가 데이터를 읽어 `ExhibitionMap`에 넘긴다.
- `components/ExhibitionMap.tsx` — 필터, 목록 시트, 상세 패널, 지도 엔진 선택 (클라이언트 컴포넌트).
- `components/map/KakaoMapView.tsx` — 카카오맵 (환경변수 `NEXT_PUBLIC_KAKAO_MAP_KEY`가 있을 때). 전시 핀·묶음(clusterer)·주변 편의점/카페/지하철역(장소 카테고리 검색 CS2/CE7/SW8).
- `components/map/WorldMapView.tsx` + `data/overseas-exhibitions.json` — 해외(지금은 미국 서부) 전시. 카카오맵은 한국 밖이 거의 안 그려져서, 지도 위 '국내 / 미국 서부' 칩으로 고르면 Leaflet 1.9.4(unpkg에서 불러옴)+OpenStreetMap 바탕 지도로 바뀐다(출처 표시 필수). 해외 전시는 `country: "US"`, `city`는 한글 도시 이름, `address`는 영문 주소, 관람료는 `priceText`(예: "일반 $25")에 원문대로, 무료면 `price: 0`. 길찾기는 구글 지도. 국내 전시와 섞지 않는다: 시작 화면·전시 도우미·대중을 위한 탭은 국내만. 주변 장소·독립공간·동선은 국내 지도에만 있다.
- `components/map/SvgMapView.tsx` — 키가 없을 때 쓰는 임시 윤곽 지도. `components/map/types.ts`의 `MapViewProps`를 두 지도가 같이 따른다.
- `components/Welcome.tsx` — 시작 화면(세션마다 한 번): 오늘 열려 있는 전시 수, 대중픽/예술의 미래 탭, 내 주변/전국 버튼.
- 시작 화면 그림 띠(`PatternBand`, `public/pattern/01~11.jpg`): 사용자(앱 만든 사람) 본인 그림의 한 부분을 같은 크기 동그라미로 엇갈려 배치, 날마다 순서가 돌아감. 사람 얼굴·몸이 크게 나온 그림, 글자·상표가 든 그림은 넣지 않는다.
- `lib/picks.ts` — `data/popularity.json`(대중픽) 읽기.
- `lib/future.ts` — '예술의 미래' 분류(졸업전시·실험전시·작가전): `tags`가 있으면 우선, 없으면 제목·장소·소개글 키워드로 추정. 큰 기관(미술관·문화재단 등) 개인전은 작가전에서 뺀다.
- `lib/spaces.ts` + `data/spaces.json` — 독립공간 목록. 지도에 보라색 마름모 핀. 좌표가 없으면 브라우저에서 카카오 장소 검색(`search`)으로 찾되 주소에 `area` 글자가 있을 때만 쓴다.
- `data/manual-exhibitions.json` — 공공데이터에 없는 전시를 직접 넣는 곳(졸업전시, 독립공간 전시). `Exhibition` 형태, `source: "manual"`, `tags`로 분류 지정. `lib/data.ts`가 합친다.
- `components/Poster.tsx` — 썸네일이 없을 때 장르별 생성 포스터.
- `lib/types.ts` — `Exhibition` 타입. 모든 데이터는 이 형태를 따른다.
- `lib/data.ts` — 데이터 읽기. `data/exhibitions.json`이 비어 있으면 `lib/sample-exhibitions.ts` 예시 데이터를 쓴다. DB로 옮길 때 이 파일만 바꾼다.
- `lib/korea-map.ts` — 임시 SVG 지도 윤곽 (SvgMapView 전용).
- `scripts/fetch-exhibitions.mjs` — 공공데이터 수집기 (의존성 없음, Node 20+).
- `scripts/fetch-popularity.mjs` — 대중픽: 네이버 블로그 검색 API로 전시별 최근 30일 글 수. 검색 API는 NAVER API HUB(네이버 클라우드 플랫폼)로 이전됨: `https://naverapihub.apigw.ntruss.com/search/v1/blog`, 헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`. GitHub Secrets `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`(API HUB 키) 없으면 건너뜀.
- `.github/workflows/fetch-exhibitions.yml` — 한국시간 9·12·15·18·24시에 수집 후 `data/` 커밋 → 끝나면 Pages 재배포.
- `lib/remote.ts` — 앱이 열릴 때 GitHub raw(`DATA_BASE`)에서 최신 `data/*.json`을 받아 화면을 바꾼다. 실패하면 배포 때 묶인 데이터를 쓴다. (저장소가 공개여야 동작)
- `lib/clean.ts` — 깨진 HTML 글자 정리 (서버·브라우저 공용).
- **Supabase** (방명록·전시 등록 요청): `lib/supabase.ts`(라이브러리 없이 REST, 기기마다 익명 로그인), `lib/reviews.ts`, `lib/submissions.ts`, `components/Reviews.tsx`, `components/SubmitForm.tsx`. 테이블·보안 규칙은 `docs/supabase.sql`(SQL Editor에 붙여 실행). URL·anon 키는 `lib/config.ts`(공개용 값). 비어 있으면 리뷰·등록은 '준비 중'.
  - 방명록(표 이름 `reviews`): 감상 한마디 + 정보 태그(`lib/reviews.ts`의 `NOTE_TAGS`) + 추천(👍)/비추천(👎) 중 하나(`vote` 1/-1, 선택). 전시당 기기 하나에 글 하나(고치기·지우기 가능)라 한 기기 한 표. 숨기려면 `hidden=true`. 2026-11-18 별점을 없앰(`docs/supabase-guestbook.sql`), 2026-11-27 추천·비추천 추가(`docs/supabase-votes.sql`, 집계 보기 `exhibition_votes`). 지도 핀·목록에 👍 추천 수, 상세에 추천·비추천 수. 위에 안내문("예술에 높고 낮음은 없습니다")을 둔다.
  - 에티켓: 욕설 단어는 `lib/etiquette.ts`(앱)와 `docs/supabase-etiquette.sql`의 `has_bad_words`(서버)에 같이 있다. 바꿀 땐 두 곳 모두.
  - 신고: `review_reports`(운영자만 열람). 같은 글에 신고 3번이면 자동으로 `hidden=true`.
  - 등록 요청: `submissions`에 `pending`으로 들어감. 운영자가 `status`를 `approved`로 바꾸면 `approved_submissions` 보기로 공개돼 앱이 지도에 올린다(id `sub-…`). 연락처는 공개되지 않음.
- **홈 화면에 추가(PWA)**: `public/manifest.webmanifest`(경로는 상대 주소라 basePath와 무관), `public/icons/`(아이콘: 회색 기운의 밝은 파랑 세로 그라데이션 바탕에 오목하게 파인 음각 '앙' + 손으로 오린 듯한 노란 종이 별(마티스 컷아웃·사용자 본인 그림의 별에서 영감, 직접 그린 모양), Noto Sans CJK Black으로 생성. 아이폰은 투명 부분을 검게 칠하므로 바탕은 불투명으로), `public/sw.js`(같은 주소 파일만, 인터넷 먼저·실패 때 사본), `components/InstallApp.tsx`(시작 화면 아래 버튼: 안드로이드는 설치 창, 아이폰은 '공유 → 홈 화면에 추가' 안내, 이미 앱으로 열었으면 숨김). 앱 메타데이터는 `app/layout.tsx`.
- `components/Assistant.tsx` + `lib/assistant.ts` — 전시 도우미(AI 대화) 화면. 지도 오른쪽 아래 '✦ 물어보기' 버튼(데스크톱은 내 위치 버튼 옆). 답의 전시 카드를 누르면 휴대폰은 대화창이 아래로 내려가 띠(64px, `--ai-peek`)만 남고(누르면 다시 올라옴), 컴퓨터는 상세 창 왼쪽으로 비켜 선다. 지금은 미리보기(`assistantLive=false`): AI 없이 낱말 규칙(동네·날짜·장르·무료·졸업전시·인기)으로 앱 안 전시를 찾음. '인기'는 대중을 위한 탭과 같은 최근 블로그 언급 수로 답하고(좋고 나쁨의 순위가 아니라고 밝힘), '최고·가장 좋은'은 순위를 매기지 않는다고 답한다. 동선: '토요일 을지로 3곳 동선'처럼 물으면 그날 여는 전시를 가까운 순서로 묶고(다음 곳은 4km 안, '3곳'은 서로 다른 장소 3곳 — 같은 건물·50m 안은 한 번만 넣고 '같은 건물에 전시 N개 더'로 알림, 동네 주소만으로 모자라면 동네 전시에서 1.5km 안의 옆 동네 전시까지 넓힘, 작은 전시가 든 묶음 우선), '지도에서 동선 보기'로 지도에 번호·보라 점선(`route` prop, 두 지도 모두)을 그린다. 동선을 그리는 동안 동선 전시는 보라 핀(안에 순서 번호)+이름표로 크게, 나머지 핀·독립공간은 작고 흐리게(카카오 `.kmap.routing`, 임시 지도 `.mk.dim`). 작은 전시 함께 보기: 답에 '예술의 미래' 전시가 없으면 5km 안의 작은 전시 하나를 덧붙인다(큰 기관 제외, 날을 말하지 않으면 오늘 여는 곳만). 같은 전시가 공공데이터·직접 넣은 자료에 겹치면 하나만 보여 준다. AI를 붙일 땐 `askAssistant()`만 바꾸고, 키는 화면 코드가 아니라 서버(Supabase 함수)에 둔다. 순위·점수를 매기지 않고, 위치는 보내지 않는다.
- `lib/bookmarks.ts` — 관심 전시(♥) 저장. 로그인 없이 이 기기 localStorage에만.
- `lib/paintings.ts` + `data/paintings.json` + `public/paintings/` — 시작 화면 제목 '앙데팡당' 글자 안의 오늘의 그림. 8개 분류(흐림·비·눈·화창·봄·여름·가을·겨울) × 10장, 가로 720px 사본을 우리 사이트에 저장. 서울 날씨(Open-Meteo)로 분류를 정함: 비·뇌우→비, 흐림·안개→흐림, 눈→눈, 맑음→화창+지금 계절. 한국 날짜로 후보를 번갈아 고름. 빌드할 때(`app/page.tsx`) 날씨로 오늘 그림을 미리 정해 페이지에 넣고(preload), 화면에서는 10분마다·앱으로 돌아올 때 다시 확인해 바뀌었을 때만 교체.
- `scripts/fetch-paintings.mjs` + `scripts/paintings.candidates.json` — 후보(분류별 10장+예비)를 위키미디어 공용에서 찾아 퍼블릭 도메인만 남기고 사본 저장·색 비중 계산. `.github/workflows/paintings.yml`(수동·매월) 실행 후 Pages 재배포.
- 그림은 퍼블릭 도메인만 쓴다(모네, 1930년 이전 마티스). 살아 있는 작가(예: 데이비드 호크니)의 그림은 저작권 때문에 넣지 않는다.

## 데이터

- 출처: 한국문화정보원 '한눈에보는문화정보' (공공데이터포털 15138937). 분야 `미술`/`전시`만 사용.
- 키: GitHub Secret `DATA_GO_KR_KEY` (공공데이터포털의 Decoding 키).
- 엔드포인트: `https://apis.data.go.kr/B553457/cultureinfo/realm2`(분야 코드 D000=전시), `detail2?seq=`. 응답 필드: seq, title, startDate, endDate, place, realmName, area, sigungu, thumbnail, gpsX(경도), gpsY(위도) / 상세: price, url, contents1, placeAddr, phone, placeUrl. (2026-11 실제 응답으로 확인)
- 좌표 없는 항목은 현재 버린다 → 카카오 로컬 API 주소 검색으로 보완 예정.

- 시작 속도(앱을 열면 몇 초 터치가 안 되던 문제, 2026-11-27): 목록은 30개씩 나눠 그림(`LIST_PAGE`, 끝이 보이면 더), 생성 포스터는 화면 가까이 올 때 한 번만 그림, 최신 자료가 배포 자료와 같으면 바꾸지 않음(`sameExhibitions`), 필터 결과가 같으면 같은 배열 유지(지도 핀 재생성 방지), 카카오 핀은 저장된 주소 좌표로 처음부터 만들고 묶음 재계산은 모아서 한 번.

## 결정 사항

- 시작 화면 탭: '대중을 위한'(예전 이름 대중픽, 옆 탭과 이어 읽으면 "대중을 위한 예술의 미래") = 최근 30일 네이버 블로그 언급 수(진행 중 전시, 상위 10). 예술의 미래 = 졸업전시·실험전시·소규모 작가전 (전문가 픽은 2026-11 사용자 요청으로 없앰).
- 별점·순위처럼 전시에 등급을 매기는 장치는 넣지 않는다(앙데팡당 취지: 심사·상 없음). 관람객 글은 방명록으로. 예외(2026-11-27 사용자 결정): 방명록의 추천·비추천과 지도 핀·목록의 👍 추천 수는 둔다.
- 수동 데이터(manual-exhibitions, spaces)는 확인된 실제 정보만 넣는다. 주소·날짜를 추측해 넣지 않는다.

- 웹앱(PWA) 먼저, 앱스토어 앱은 나중 (같은 코드 재활용).
- 처음엔 DB 없이 저장소 안 JSON 파일로 운영. 사용자 기능(즐겨찾기, 로그인)이 생기면 Supabase 도입.
- 앱 내 결제는 사업자등록·PG 계약 이후. 그 전까지 예매는 외부 링크.
- 내 위치는 브라우저 안에서만 쓰고(거리 계산·지도 표시) 서버로 보내거나 저장하지 않는다. 반경 단계는 `lib/geo.ts`의 `RADIUS_STEPS`.
- 디자인: 지도 위 하단 시트(모바일) / 좌측 목록 + 우측 상세(데스크톱 900px 이상). 색은 `app/globals.css`의 `:root` 토큰만 사용, 다크 모드 지원.

## 개발 환경 메모

- **배포: GitHub Pages** (2026-11-17 Netlify에서 이전). 주소 https://uou7500.github.io/exhibition-news/ . `.github/workflows/pages.yml`이 main push와 데이터 수집 완료 때마다 `next build`(output: export, basePath `/exhibition-news`)로 정적 파일을 만들어 올린다. 비용·크레딧 없음(월 100GB 대역폭 소프트 한도).
- Netlify(joyful-fairy-96889b.netlify.app)는 크레딧 요금제라 빌드를 끔(`netlify.toml` ignore = exit 0). 삭제해도 된다.
- 서버 기능(API 라우트, 서버 렌더링)을 쓰면 정적 내보내기가 깨진다. 필요하면 Cloudflare 등 다른 방식을 먼저 정할 것.

- Next.js·React는 보안 패치가 반영된 버전 범위(`^`)로 둔다. Netlify는 알려진 취약 버전(예: CVE-2025-55182)이면 배포를 막는다.
- 카카오 JavaScript 키는 `lib/config.ts`에 들어 있다(공개 키, 도메인 제한). Netlify 환경변수 `NEXT_PUBLIC_KAKAO_MAP_KEY`가 있으면 그 값이 우선. 새 도메인(커스텀 도메인 등)을 쓰면 카카오 콘솔 [앱 > 플랫폼 키 > JavaScript 키 > JavaScript SDK 도메인]에 추가해야 한다. 카카오 개발자 콘솔에 사이트 도메인 등록 필수. 이 작업 공간에서는 카카오 SDK에 접속할 수 없어 실제 지도 확인은 사용자 화면으로 한다.
- Claude 클라우드 작업 공간에서 npm 저장소 접근이 막힐 수 있다. 그 경우 로컬 빌드 대신 GitHub Actions의 Pages 빌드 로그로 확인한다.
