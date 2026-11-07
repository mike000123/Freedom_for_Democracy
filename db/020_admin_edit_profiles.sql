-- 020: Ο διαχειριστής μπορεί να συντάσσει το προφίλ, τα πρόσωπα, τα βίντεο και τις προτάσεις οποιουδήποτε κόμματος
-- (π.χ. προφίλ από δημόσιες πηγές χωρίς λογαριασμό εκπροσώπου).
drop policy if exists people_admin    on public.party_people;
drop policy if exists videos_admin    on public.party_videos;
drop policy if exists proposals_admin on public.proposals;
create policy people_admin    on public.party_people for all using (public.is_admin()) with check (public.is_admin());
create policy videos_admin    on public.party_videos for all using (public.is_admin()) with check (public.is_admin());
create policy proposals_admin on public.proposals    for all using (public.is_admin()) with check (public.is_admin());

-- Εικόνες ομάδας: ο διαχειριστής ανεβάζει σε οποιονδήποτε φάκελο κόμματος.
drop policy if exists "party images admin insert" on storage.objects;
drop policy if exists "party images admin update" on storage.objects;
drop policy if exists "party images admin delete" on storage.objects;
create policy "party images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'party-images' and public.is_admin());
create policy "party images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'party-images' and public.is_admin());
create policy "party images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'party-images' and public.is_admin());
