# 전시지도 (exhibition-news)

전국에서 열리는 미술 전시를 지도에서 찾아보는 웹앱. 지도에서 전시를 고르면 상세 정보가 나오고, 유료 전시는 예매처로 연결한다.

## 일하는 방식

- 사용자는 비개발자이며 아이패드·휴대폰만 쓴다. 설명은 한국어로, 쉬운 말로 한다. 터미널 명령을 시키지 않는다.
- 기능 하나 = 브랜치 하나 = PR 하나. `main`에 직접 푸시하지 않는다.
- PR 설명에는 "무엇이 바뀌었는지 / 확인하는 방법(미리보기 링크에서 어디를 눌러 보면 되는지)"을 쓴다.
- 작업을 마치면 `docs/ROADMAP.md`의 체크 상태를 갱신한다.
- 사용자가 직접 해야 하는 일(가입, 키 발급, 결제, 본인 인증)은 단계별로 안내하고, 키는 채팅이 아니라 GitHub Secrets / Vercel 환경변수에 넣도록 한다.

## 구조

- `app/` — Next.js App Router. `page.tsx`가 데이터를 읽어 `ExhibitionMap`에 넘긴다.
- `components/ExhibitionMap.tsx` — 지도, 필터, 목록 시트, 상세 패널 (클라이언트 컴포넌트).
- `components/Poster.tsx` — 썸네일이 없을 때 장르별 생성 포스터.
- `lib/types.ts` — `Exhibition` 타입. 모든 데이터는 이 형태를 따른다.
- `lib/data.ts` — 데이터 읽기. `data/exhibitions.json`이 비어 있으면 `lib/sample-exhibitions.ts` 예시 데이터를 쓴다. DB로 옮길 때 이 파일만 바꾼다.
- `lib/korea-map.ts` — 임시 SVG 지도 윤곽. 카카오맵 도입 시 삭제.
- `scripts/fetch-exhibitions.mjs` — 공공데이터 수집기 (의존성 없음, Node 20+).
- `.github/workflows/fetch-exhibitions.yml` — 매일 새벽 수집 후 `data/exhibitions.json` 커밋 → Vercel 자동 재배포.

## 데이터

- 출처: 한국문화정보원 '한눈에보는문화정보' (공공데이터포털 15138937). 분야 `미술`/`전시`만 사용.
- 키: GitHub Secret `DATA_GO_KR_KEY` (공공데이터포털의 Decoding 키).
- 응답 필드 이름은 문서 기준 추정치다. 첫 실제 실행 로그의 "첫 항목 원본 필드"를 보고 `FIELD` 매핑을 확정할 것.
- 좌표 없는 항목은 현재 버린다 → 카카오 로컬 API 주소 검색으로 보완 예정.

## 결정 사항

- 웹앱(PWA) 먼저, 앱스토어 앱은 나중 (같은 코드 재활용).
- 처음엔 DB 없이 저장소 안 JSON 파일로 운영. 사용자 기능(즐겨찾기, 로그인)이 생기면 Supabase 도입.
- 앱 내 결제는 사업자등록·PG 계약 이후. 그 전까지 예매는 외부 링크.
- 디자인: 지도 위 하단 시트(모바일) / 좌측 목록 + 우측 상세(데스크톱 900px 이상). 색은 `app/globals.css`의 `:root` 토큰만 사용, 다크 모드 지원.

## 개발 환경 메모

- Next.js·React는 보안 패치가 반영된 버전 범위(`^`)로 둔다. Netlify는 알려진 취약 버전(예: CVE-2025-55182)이면 배포를 막는다.
- 배포: Netlify (main 브랜치 자동 배포, PR마다 미리보기). Vercel은 계정 문제로 보류.
- Claude 클라우드 작업 공간에서 npm 저장소 접근이 막힐 수 있다. 그 경우 로컬 빌드 대신 Netlify 배포 로그로 확인한다.
