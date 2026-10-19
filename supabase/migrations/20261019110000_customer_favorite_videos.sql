create table if not exists public.customer_favorite_videos (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('video', 'song')),
  content_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, content_type, content_id)
);

alter table public.customer_favorite_videos enable row level security;

grant select, insert, delete on public.customer_favorite_videos to authenticated;
revoke all on public.customer_favorite_videos from anon;

drop policy if exists "Users can view their own favorite videos" on public.customer_favorite_videos;
create policy "Users can view their own favorite videos"
  on public.customer_favorite_videos for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own favorite videos" on public.customer_favorite_videos;
create policy "Users can add their own favorite videos"
  on public.customer_favorite_videos for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own favorite videos" on public.customer_favorite_videos;
create policy "Users can remove their own favorite videos"
  on public.customer_favorite_videos for delete to authenticated
  using ((select auth.uid()) = user_id);

