-- 앙데팡당: 방명록에 추천·비추천 더하기 (2026-11-27)
-- Supabase 대시보드 → SQL Editor → New query 에 통째로 붙여넣고 Run. 한 번만 실행하면 된다.
-- 실행 전에도 앱은 그대로 돌아간다(추천 버튼은 보이지만 저장은 SQL 실행 후부터).

-- 1 = 추천, -1 = 비추천, 비워 두면 고르지 않음. 기기 하나가 전시 하나에 글 하나라 한 표씩.
alter table public.reviews add column if not exists vote smallint;
alter table public.reviews drop constraint if exists reviews_vote_check;
alter table public.reviews add constraint reviews_vote_check check (vote in (-1, 1));

-- 추천·비추천만 눌러도 저장되게 (한마디·태그·추천 중 하나만 있으면 됨)
alter table public.reviews drop constraint if exists reviews_not_empty;
alter table public.reviews add constraint reviews_not_empty
  check (char_length(coalesce(body, '')) > 0 or cardinality(tags) > 0 or vote is not null) not valid;

-- 전시별 추천·비추천 수 (숨긴 글은 빼고 센다). 지도 핀에 추천 수를 보여 줄 때 쓴다.
create or replace view public.exhibition_votes as
  select exhibition_id,
         count(*) filter (where vote = 1)  as up,
         count(*) filter (where vote = -1) as down
  from public.reviews
  where hidden = false and vote is not null
  group by exhibition_id;
grant select on public.exhibition_votes to anon, authenticated;
