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
- `components/map/SvgMapView.tsx` — 키가 없을 때 쓰는 임시 윤곽 지도. `components/map/types.ts`의 `MapViewProps`를 두 지도가 같이 따른다.
- `components/Welcome.tsx` — 시작 화면(세션마다 한 번): 오늘 열려 있는 전시 수, 대중픽/예술의 미래 탭, 내 주변/전국 버튼.
- `lib/picks.ts` — `data/popularity.json`(대중픽) 읽기.
- `lib/future.ts` — '예술의 미래' 분류(졸업전시·실험전시·작가전): `tags`가 있으면 우선, 없으면 제목·장소·소개글 키워드로 추정. 큰 기관(미술관·문화재단 등) 개인전은 작가전에서 뺀다.
- `lib/spaces.ts` + `data/spaces.json` — 독립공간 목록. 지도에 보라색 마름모 핀. 좌표가 없으면 브라우저에서 카카오 장소 검색(`search`)으로 찾되 주소에 `area` 글자가 있을 때만 쓴다.
- `data/manual-exhibitions.json` — 공공데이터에 없는 전시를 직접 넣는 곳(졸업전시, 독립공간 전시). `Exhibition` 형태, `source: "manual"`, `tags`로 분류 지정. `lib/data.ts`가 합친다.
- `components/Poster.tsx` — 썸네일이 없을 때 장르별 생성 포스터.
- `lib/types.ts` — `Exhibition` 타입. 모든 데이터는 이 형태를 따른다.
- `lib/data.ts` — 데이터 읽기. `data/exhibitions.json`이 비어 있으면 `lib/sample-exhibitions.ts` 예시 데이터를 쓴다. DB로 옮길 때 이 파일만 바꾼다.
- `lib/korea-map.ts` — 임시 SVG 지도 윤곽 (SvgMapView 전용).
- `scripts/fetch-exhibitions.mjs` — 공공데이터 수집기 (의존성 없음, Node 20+).
- `scripts/fetch-popularity.mjs` — 대중픽: 네이버 블로그 검색 API로 전시별 최근 30일 글 수. GitHub Secrets `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 없으면 건너뜀.
- `.github/workflows/fetch-exhibitions.yml` — 한국시간 9·12·15·18·24시에 수집 후 `data/` 커밋 → 끝나면 Pages 재배포.
- `lib/remote.ts` — 앱이 열릴 때 GitHub raw(`DATA_BASE`)에서 최신 `data/*.json`을 받아 화면을 바꾼다. 실패하면 배포 때 묶인 데이터를 쓴다. (저장소가 공개여야 동작)
- `lib/clean.ts` — 깨진 HTML 글자 정리 (서버·브라우저 공용).
- `lib/paintings.ts` + `data/paintings.json` + `public/paintings/` — 시작 화면 제목 '앙데팡당' 글자 안의 오늘의 그림. 8개 분류(흐림·비·눈·화창·봄·여름·가을·겨울) × 10장, 가로 720px 사본을 우리 사이트에 저장. 서울 날씨(Open-Meteo)로 분류를 정함: 비·뇌우→비, 흐림·안개→흐림, 눈→눈, 맑음→화창+지금 계절. 한국 날짜로 후보를 번갈아 고름. 빌드할 때(`app/page.tsx`) 날씨로 오늘 그림을 미리 정해 페이지에 넣고(preload), 화면에서는 10분마다·앱으로 돌아올 때 다시 확인해 바뀌었을 때만 교체.
- `scripts/fetch-paintings.mjs` + `scripts/paintings.candidates.json` — 후보(분류별 10장+예비)를 위키미디어 공용에서 찾아 퍼블릭 도메인만 남기고 사본 저장·색 비중 계산. `.github/workflows/paintings.yml`(수동·매월) 실행 후 Pages 재배포.
- 그림은 퍼블릭 도메인만 쓴다(모네, 1930년 이전 마티스). 살아 있는 작가(예: 데이비드 호크니)의 그림은 저작권 때문에 넣지 않는다.

## 데이터

- 출처: 한국문화정보원 '한눈에보는문화정보' (공공데이터포털 15138937). 분야 `미술`/`전시`만 사용.
- 키: GitHub Secret `DATA_GO_KR_KEY` (공공데이터포털의 Decoding 키).
- 엔드포인트: `https://apis.data.go.kr/B553457/cultureinfo/realm2`(분야 코드 D000=전시), `detail2?seq=`. 응답 필드: seq, title, startDate, endDate, place, realmName, area, sigungu, thumbnail, gpsX(경도), gpsY(위도) / 상세: price, url, contents1, placeAddr, phone, placeUrl. (2026-11 실제 응답으로 확인)
- 좌표 없는 항목은 현재 버린다 → 카카오 로컬 API 주소 검색으로 보완 예정.

## 결정 사항

- 시작 화면 탭: 대중픽 = 최근 30일 네이버 블로그 언급 수(진행 중 전시, 상위 10). 예술의 미래 = 졸업전시·실험전시·소규모 작가전 (전문가 픽은 2026-11 사용자 요청으로 없앰).
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
