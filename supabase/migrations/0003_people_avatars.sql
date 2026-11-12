-- REFERENCE ONLY. Already applied to the hosted Supabase project; do not run it.

alter table public.people add column avatar_path text;
comment on column public.people.avatar_path is 'Object path in private storage bucket "avatars" (<household_id>/<person_id>-<timestamp>.webp); null = use emoji.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "household members read avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));

create policy "household members upload avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and exists (select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));

create policy "household members update avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));

create policy "household members delete avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));
