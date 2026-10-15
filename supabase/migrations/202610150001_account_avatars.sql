-- Profile photos are private and separate from immutable workspace backups.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('easier-avatars', 'easier-avatars', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Read own Easier avatar" on storage.objects for select to authenticated
using (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own Easier avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own Easier avatar" on storage.objects for delete to authenticated
using (bucket_id = 'easier-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
