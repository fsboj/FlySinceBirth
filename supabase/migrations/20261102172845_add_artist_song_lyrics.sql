alter table public.artist_songs add column if not exists lyrics text;
comment on column public.artist_songs.lyrics is 'Optional plain-text song lyrics. Null or blank means lyrics have not been added.';
