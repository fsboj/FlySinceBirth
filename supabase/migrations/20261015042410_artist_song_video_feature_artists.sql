create table public.artist_song_features (
  song_id bigint not null references public.artist_songs(id) on delete cascade,
  artist_id bigint not null references public.artists(id) on delete cascade,
  sort_order smallint not null default 1 check (sort_order > 0),
  primary key (song_id, artist_id),
  unique (song_id, sort_order)
);
create index artist_song_features_artist_id_idx on public.artist_song_features(artist_id);
alter table public.artist_song_features enable row level security;
grant select on public.artist_song_features to anon, authenticated;
grant insert, update, delete on public.artist_song_features to authenticated;
create policy public_read_artist_song_features on public.artist_song_features for select to anon, authenticated using (true);
create policy admin_aal2_artist_song_features on public.artist_song_features for all to authenticated
using (
  (select auth.jwt() ->> 'aal') = 'aal2'
  and exists (
    select 1 from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
)
with check (
  (select auth.jwt() ->> 'aal') = 'aal2'
  and exists (
    select 1 from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);
create table public.video_artist_features (
  video_id bigint not null references public.videos(id) on delete cascade,
  artist_id bigint not null references public.artists(id) on delete cascade,
  sort_order smallint not null default 1 check (sort_order > 0),
  primary key (video_id, artist_id),
  unique (video_id, sort_order)
);
create index video_artist_features_artist_id_idx on public.video_artist_features(artist_id);
alter table public.video_artist_features enable row level security;
grant select on public.video_artist_features to anon, authenticated;
grant insert, update, delete on public.video_artist_features to authenticated;
create policy public_read_video_artist_features on public.video_artist_features for select to anon, authenticated using (true);
create policy admin_aal2_video_artist_features on public.video_artist_features for all to authenticated
using (
  (select auth.jwt() ->> 'aal') = 'aal2'
  and exists (
    select 1 from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
)
with check (
  (select auth.jwt() ->> 'aal') = 'aal2'
  and exists (
    select 1 from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);