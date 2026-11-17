// 공개해도 되는 설정값.
// 카카오 JavaScript 키는 브라우저에 그대로 실리는 키이고, 카카오 개발자 콘솔에 등록한 도메인에서만 작동한다.
// (REST API 키·Admin 키 같은 비밀 키는 절대 여기에 넣지 않는다.)
// Netlify 환경변수 NEXT_PUBLIC_KAKAO_MAP_KEY가 있으면 그 값을 먼저 쓴다.
export const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || "01e4743bb752d220bed66635d3ab12cd";

// Supabase (리뷰·전시 등록 요청 저장). 둘 다 공개용 값이다(anon 키는 보안 규칙 안에서만 동작).
// 비어 있으면 리뷰·등록 기능은 '준비 중'으로 보인다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
