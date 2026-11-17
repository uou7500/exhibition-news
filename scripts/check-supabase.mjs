#!/usr/bin/env node
// Supabase 연결 점검: 익명 로그인 → 리뷰 쓰기 → 평균 읽기 → 리뷰 지우기 → 등록 요청 보내기(검사용, 바로 rejected 처리 불가하므로 제목에 [점검] 표시)
// 실행: node scripts/check-supabase.mjs  (GitHub Actions '연결 점검' 워크플로)
const URL = "https://jlepwfegozysnwanmyqc.supabase.co";
const KEY = "sb_publishable_r-nasuzQsKuItr5GlZ1BQw_R32DoDSB";
const H = { apikey: KEY, "Content-Type": "application/json" };

async function call(name, url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`${res.ok ? "✅" : "❌"} ${name}: HTTP ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) process.exitCode = 1;
  return text ? JSON.parse(text) : null;
}

const s = await call("익명 로그인", `${URL}/auth/v1/signup`, { method: "POST", headers: H, body: JSON.stringify({ data: {} }) });
if (!s?.access_token) process.exit(1);
const A = { ...H, Authorization: `Bearer ${s.access_token}` };
const ex = "check-supabase-test";
await call("평균 별점 읽기", `${URL}/rest/v1/exhibition_ratings?select=*`, { headers: H });
await call("리뷰 쓰기", `${URL}/rest/v1/reviews?on_conflict=exhibition_id,user_id`, {
  method: "POST", headers: { ...A, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ exhibition_id: ex, user_id: s.user.id, rating: 5, body: "연결 점검", nickname: "점검" }),
});
await call("리뷰 고치기(같은 전시 다시)", `${URL}/rest/v1/reviews?on_conflict=exhibition_id,user_id`, {
  method: "POST", headers: { ...A, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ exhibition_id: ex, user_id: s.user.id, rating: 4, body: "연결 점검 수정", nickname: "점검" }),
});
await call("리뷰 읽기", `${URL}/rest/v1/reviews?select=rating,body&exhibition_id=eq.${ex}`, { headers: H });
await call("평균 다시 읽기", `${URL}/rest/v1/exhibition_ratings?select=*&exhibition_id=eq.${ex}`, { headers: H });
await call("리뷰 지우기", `${URL}/rest/v1/reviews?exhibition_id=eq.${ex}&user_id=eq.${s.user.id}`, { method: "DELETE", headers: A });
await call("승인된 등록 요청 읽기", `${URL}/rest/v1/approved_submissions?select=id&limit=1`, { headers: H });
// 보안 확인: 등록 요청 원본(연락처 포함)은 읽히면 안 된다 → 빈 목록이어야 정상
const raw = await call("등록 요청 원본 읽기(빈 목록이어야 정상)", `${URL}/rest/v1/submissions?select=contact&limit=1`, { headers: A });
if (Array.isArray(raw) && raw.length) { console.log("❌ 연락처가 보입니다!"); process.exitCode = 1; }
