create table public.fsb_performance_events (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 playback_id uuid not null,
 visitor_id uuid not null,
 user_id uuid references auth.users(id) on delete set null,
 listener_name text not null default 'Anonymous visitor',
 media_type text not null check(media_type in ('music','video')),
 content_key text not null check(length(content_key)<100),
 title text not null,
 artist_name text not null default '',
 phase text not null check(phase in ('open','start','engaged','complete')),
 source_path text not null,
 unique(playback_id,phase)
);
create index fsb_performance_created_idx on public.fsb_performance_events(created_at desc,id desc);
create index fsb_performance_visitor_idx on public.fsb_performance_events(visitor_id,created_at desc);
create index fsb_performance_user_idx on public.fsb_performance_events(user_id) where user_id is not null;
alter table public.fsb_performance_events enable row level security;
revoke all on public.fsb_performance_events from anon,authenticated;
grant select on public.fsb_performance_events to authenticated;
grant all on public.fsb_performance_events to service_role;
grant usage,select on sequence public.fsb_performance_events_id_seq to service_role;
create policy "FSB admins read performance" on public.fsb_performance_events for select to authenticated using (
 exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),'')))
);
insert into public.site_content(key,value) values('performance_tracking_started_at',now()::text) on conflict(key) do nothing;

