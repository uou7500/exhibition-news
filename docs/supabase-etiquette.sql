-- 앙데팡당: 방명록 에티켓 (욕설 막기) + 신고 (2026-11-18)
-- Supabase SQL Editor → New query 에 통째로 붙여넣고 Run. 한 번만 실행하면 된다.

-- 1) 욕설 막기: 앱(lib/etiquette.ts)과 같은 규칙. 띄어쓰기·기호·숫자를 지우고 찾는다
create or replace function public.has_bad_words(t text) returns boolean
language sql immutable as $$
  select coalesce(
    replace(replace(replace(
      regexp_replace(lower(t), '[^가-힣ㄱ-ㅎㅏ-ㅣa-z]', '', 'g'),
      '시발점', ''), '시발역', ''), '시바견', '')
    ~ '(시발|씨발|씨빨|시빨|씨바|시바새|ㅅㅂ|ㅆㅂ|ㅅㅃ|썅|병신|븅신|ㅂㅅ|ㅄ|좆|존나|졸라|ㅈㄴ|ㅈ같|개새끼|개새기|개색|개세끼|ㄱㅅㄲ|새끼야|지랄|ㅈㄹ|미친놈|미친년|미친새|닥쳐|꺼져|엿먹|fuck|shit|bitch|tlqkf|qudtls)',
    false)
$$;

create or replace function public.reviews_etiquette() returns trigger
language plpgsql as $$
begin
  if public.has_bad_words(new.body) or public.has_bad_words(new.nickname) then
    raise exception 'bad_words' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists reviews_etiquette on public.reviews;
create trigger reviews_etiquette before insert or update on public.reviews
  for each row execute function public.reviews_etiquette();

-- 2) 신고: 누구나(기기마다) 한 글에 한 번. 신고 내용은 운영자만 본다
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) <= 40),
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);
alter table public.review_reports enable row level security;
drop policy if exists "reports_insert_own" on public.review_reports;
create policy "reports_insert_own" on public.review_reports for insert to authenticated
  with check (auth.uid() = user_id);

-- 3) 신고가 3번 쌓이면 자동으로 숨김 (운영자가 hidden=false로 되살릴 수 있음)
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.review_reports where review_id = new.review_id) >= 3 then
    update public.reviews set hidden = true where id = new.review_id;
  end if;
  return new;
end $$;
drop trigger if exists review_reports_auto_hide on public.review_reports;
create trigger review_reports_auto_hide after insert on public.review_reports
  for each row execute function public.auto_hide_reported();
