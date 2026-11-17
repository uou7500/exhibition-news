-- 앙데팡당: Supabase 테이블과 보안 규칙
-- Supabase 대시보드 → SQL Editor → New query 에 이 내용을 통째로 붙여넣고 Run.
-- (Authentication → Sign In / Providers 에서 "Allow anonymous sign-ins"도 켜야 한다)

-- ===== 리뷰 =====
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  exhibition_id text not null check (char_length(exhibition_id) between 1 and 120),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text check (char_length(nickname) <= 20),
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 500),
  hidden boolean not null default false,          -- 운영자가 숨길 때 true
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exhibition_id, user_id)                  -- 한 기기(사용자)당 전시 하나에 리뷰 하나
);
alter table public.reviews enable row level security;

drop policy if exists "reviews_read" on public.reviews;
create policy "reviews_read" on public.reviews for select using (hidden = false);
drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check (auth.uid() = user_id and hidden = false);
drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and hidden = false);
drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews for delete to authenticated using (auth.uid() = user_id);

-- 전시별 평균 별점과 리뷰 수
create or replace view public.exhibition_ratings as
  select exhibition_id, round(avg(rating)::numeric, 1) as avg, count(*)::int as n
  from public.reviews where hidden = false group by exhibition_id;
grant select on public.exhibition_ratings to anon, authenticated;

-- ===== 전시 등록 요청 =====
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist text check (char_length(artist) <= 120),
  venue text not null check (char_length(venue) between 1 and 80),
  address text not null check (char_length(address) between 4 and 160),
  lat double precision,
  lon double precision,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  price int check (price >= 0),                    -- 0 = 무료, null = 모름
  kind text check (kind in ('졸업전시','실험전시','작가전','기타')),
  link text check (char_length(link) <= 300),
  poster_url text check (char_length(poster_url) <= 500),
  description text check (char_length(description) <= 1000),
  contact text check (char_length(contact) <= 120),  -- 운영자만 봄 (공개 안 함)
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.submissions enable row level security;
drop policy if exists "submissions_insert" on public.submissions;
create policy "submissions_insert" on public.submissions for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
-- 읽기 정책은 일부러 없음: 연락처가 공개되지 않게, 승인된 것만 아래 보기(view)로 공개

create or replace view public.approved_submissions as
  select id, title, artist, venue, address, lat, lon, start_date, end_date, price, kind, link, poster_url, description
  from public.submissions where status = 'approved';
grant select on public.approved_submissions to anon, authenticated;
