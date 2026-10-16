alter table public.artist_songs add column if not exists external_features jsonb not null default '[]'::jsonb;

alter table public.videos add column if not exists external_features jsonb not null default '[]'::jsonb;
