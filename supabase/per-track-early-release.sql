alter table public.artist_songs add column release_early boolean not null default false;
alter policy public_read_artist_songs on public.artist_songs using ((release_at is null or release_at<=now()) and (release_id is null or release_early or exists(select 1 from public.artist_releases r where r.id=artist_songs.release_id)));
