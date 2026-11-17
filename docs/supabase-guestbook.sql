-- 앙데팡당: 별점 → 방명록으로 바꾸기 (2026-11-18)
-- Supabase 대시보드 → SQL Editor → New query 에 통째로 붙여넣고 Run. 한 번만 실행하면 된다.

-- 평균 별점 보기를 없애고 별점 칸을 지운다 (점수 없이 감상과 정보만 남김)
drop view if exists public.exhibition_ratings;
alter table public.reviews drop column if exists rating;

-- 정보 태그 (예: 조용해요, 사진 촬영 가능) — 최대 8개
alter table public.reviews add column if not exists tags text[] not null default '{}';
alter table public.reviews drop constraint if exists reviews_tags_check;
alter table public.reviews add constraint reviews_tags_check check (cardinality(tags) <= 8);

-- 한마디나 태그 중 하나는 있어야 한다 (예전 글은 검사하지 않음)
alter table public.reviews drop constraint if exists reviews_not_empty;
alter table public.reviews add constraint reviews_not_empty
  check (char_length(coalesce(body, '')) > 0 or cardinality(tags) > 0) not valid;
