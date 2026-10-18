-- Keep media writes restricted to registered FSB admins.
-- The website now uses password-only admin authentication, so do not require aal2 here.
drop policy if exists "AAL2 FSB admin manages media" on storage.objects;
drop policy if exists "FSB admins manage media" on storage.objects;

create policy "FSB admins manage media"
on storage.objects
for all
to authenticated
using (
  bucket_id = any (array[
    'artist-artwork',
    'artist-backgrounds',
    'artist-images',
    'artist-music',
    'site-images',
    'videos'
  ])
  and exists (
    select 1
    from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
)
with check (
  bucket_id = any (array[
    'artist-artwork',
    'artist-backgrounds',
    'artist-images',
    'artist-music',
    'site-images',
    'videos'
  ])
  and exists (
    select 1
    from public.fsb_store_admins a
    where a.user_id = (select auth.uid())
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);
