# 전시지도

전국에서 열리는 미술 전시를 지도에서 찾아보는 웹앱입니다.

- 지도를 확대·축소하며 지역별 전시를 보고
- 핀을 누르면 기간·관람료·소개를 확인하고
- 유료 전시는 예매처로 바로 이동합니다.

데이터는 한국문화정보원 '한눈에보는문화정보' 공공 API에서 매일 새벽 자동으로 받아옵니다.
진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md)에 있습니다.

## 개발

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
DATA_GO_KR_KEY=... npm run fetch:exhibitions   # 전시 데이터 수집
```
