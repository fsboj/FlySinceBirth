-- Customer-owned playlists and favorites. Music catalog data remains public;
-- customer activity is visible only to its owner.
create table if not exists public.customer_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_playlists_user_created_idx
  on public.customer_playlists (user_id, created_at);

alter table public.customer_playlists enable row level security;
revoke all on public.customer_playlists from public, anon;
grant select, insert, update, delete on public.customer_playlists to authenticated;

create policy "Customers can read their playlists"
  on public.customer_playlists for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can create their playlists"
  on public.customer_playlists for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Customers can rename their playlists"
  on public.customer_playlists for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Customers can delete their playlists"
  on public.customer_playlists for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.customer_playlist_songs (
  playlist_id uuid not null references public.customer_playlists(id) on delete cascade,
  song_id bigint not null references public.artist_songs(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

create index if not exists customer_playlist_songs_song_idx
  on public.customer_playlist_songs (song_id);

alter table public.customer_playlist_songs enable row level security;
revoke all on public.customer_playlist_songs from public, anon;
grant select, insert, delete on public.customer_playlist_songs to authenticated;

create policy "Customers can read songs in their playlists"
  on public.customer_playlist_songs for select to authenticated
  using (exists (
    select 1 from public.customer_playlists p
    where p.id = playlist_id and p.user_id = (select auth.uid())
  ));
create policy "Customers can add songs to their playlists"
  on public.customer_playlist_songs for insert to authenticated
  with check (exists (
    select 1 from public.customer_playlists p
    where p.id = playlist_id and p.user_id = (select auth.uid())
  ));
create policy "Customers can remove songs from their playlists"
  on public.customer_playlist_songs for delete to authenticated
  using (exists (
    select 1 from public.customer_playlists p
    where p.id = playlist_id and p.user_id = (select auth.uid())
  ));

create table if not exists public.customer_favorite_songs (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id bigint not null references public.artist_songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create index if not exists customer_favorite_songs_song_idx
  on public.customer_favorite_songs (song_id);

alter table public.customer_favorite_songs enable row level security;
revoke all on public.customer_favorite_songs from public, anon;
grant select, insert, delete on public.customer_favorite_songs to authenticated;

create policy "Customers can read their favorite songs"
  on public.customer_favorite_songs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Customers can favorite songs for themselves"
  on public.customer_favorite_songs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Customers can remove their favorite songs"
  on public.customer_favorite_songs for delete to authenticated
  using ((select auth.uid()) = user_id);

