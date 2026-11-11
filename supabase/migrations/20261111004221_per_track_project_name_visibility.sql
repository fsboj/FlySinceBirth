alter table public.artist_songs add column if not exists hide_track_name boolean not null default false;
comment on column public.artist_songs.hide_track_name is 'Hide this track title in the public catalog until the parent project release, independent of early audio access.';
