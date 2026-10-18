-- Keep FSB admin membership checks; remove the second-factor (aal2) requirement.
-- Admin editing remains limited to the registered FSB admin account.
drop policy if exists "admin_aal2_artist_links" on public.artist_links;
create policy "admin_aal2_artist_links" on public.artist_links
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));
drop policy if exists "admin_aal2_artist_releases" on public.artist_releases;
create policy "admin_aal2_artist_releases" on public.artist_releases
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_artist_song_features" on public.artist_song_features;
create policy "admin_aal2_artist_song_features" on public.artist_song_features
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_artist_songs" on public.artist_songs;
create policy "admin_aal2_artist_songs" on public.artist_songs
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_artists" on public.artists;
create policy "admin_aal2_artists" on public.artists
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_custom_home_sections" on public.custom_home_sections;
create policy "admin_aal2_custom_home_sections" on public.custom_home_sections
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_homepage_vip_music" on public.homepage_vip_music;
create policy "admin_aal2_homepage_vip_music" on public.homepage_vip_music
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_menu_items" on public.menu_items;
create policy "admin_aal2_menu_items" on public.menu_items
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_merch" on public.merch;
create policy "admin_aal2_merch" on public.merch
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_merch_image_rotation" on public.merch_image_rotation;
create policy "admin_aal2_merch_image_rotation" on public.merch_image_rotation
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_music" on public.music;
create policy "admin_aal2_music" on public.music
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_music_cards" on public.music_cards;
create policy "admin_aal2_music_cards" on public.music_cards
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_sections" on public.sections;
create policy "admin_aal2_sections" on public.sections
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_site_images" on public.site_images;
create policy "admin_aal2_site_images" on public.site_images
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_site_sections" on public.site_sections;
create policy "admin_aal2_site_sections" on public.site_sections
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_upcoming_releases" on public.upcoming_releases;
create policy "admin_aal2_upcoming_releases" on public.upcoming_releases
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_video_artist_features" on public.video_artist_features;
create policy "admin_aal2_video_artist_features" on public.video_artist_features
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "admin_aal2_videos" on public.videos;
create policy "admin_aal2_videos" on public.videos
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins can manage merch products" on public.merch_products;
create policy "FSB admins can manage merch products" on public.merch_products
  for all to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins read all support requests" on public.customer_support_requests;
create policy "FSB admins read all support requests" on public.customer_support_requests
  for SELECT to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins update support requests" on public.customer_support_requests;
create policy "FSB admins update support requests" on public.customer_support_requests
  for UPDATE to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins can view store order items" on public.fsb_store_order_items;
create policy "FSB admins can view store order items" on public.fsb_store_order_items
  for SELECT to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins can update store order items" on public.fsb_store_order_items;
create policy "FSB admins can update store order items" on public.fsb_store_order_items
  for UPDATE to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins can view store orders" on public.fsb_store_orders;
create policy "FSB admins can view store orders" on public.fsb_store_orders
  for SELECT to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));

drop policy if exists "FSB admins can update store orders" on public.fsb_store_orders;
create policy "FSB admins can update store orders" on public.fsb_store_orders
  for UPDATE to authenticated
  using (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
))
  with check (exists (
  select 1
  from public.fsb_store_admins a
  where a.user_id = (select auth.uid())
    and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
));
