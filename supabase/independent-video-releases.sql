alter table public.artist_songs add column video_release_date date;
alter table public.artist_songs add column video_release_at timestamptz generated always as (video_release_date::timestamp at time zone 'America/New_York') stored;
alter table public.artist_releases add column video_release_date date;
alter table public.artist_releases add column video_release_at timestamptz generated always as (video_release_date::timestamp at time zone 'America/New_York') stored;
alter policy public_read_videos on public.videos using (
 case when release_date is not null then release_at<=now()
 else release_id is null or exists(select 1 from public.artist_releases r where r.id=videos.release_id)
 end
);