-- Luvli ♡ — private image storage for the Vision Board
--
-- Until now an uploaded photo was turned into a base64 data: URL and stored
-- inline as the item's url — which synced into vision_board_items.url and
-- into the single localStorage blob (hard ~5MB cap for the whole app), so a
-- handful of photos could make every save in Luvli fail.
--
-- Now: photos go into this private bucket at <user id>/<item id>.jpg, and
-- the item stores only the path. Private bucket = no public URLs at all;
-- the app asks for short-lived signed URLs to display them. Each user can
-- only read/write/delete inside their own <user id>/ folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vision-board', 'vision-board', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "vision_board_images_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'vision-board' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vision_board_images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vision-board' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vision_board_images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'vision-board' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vision-board' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vision_board_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vision-board' and (storage.foldername(name))[1] = auth.uid()::text);
