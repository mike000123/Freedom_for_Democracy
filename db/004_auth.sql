-- Λογαριασμοί πολιτών: αυτόματη δημιουργία προφίλ κατά την εγγραφή, έλεγχος διαθεσιμότητας ονόματος,
-- διαγραφή λογαριασμού από τον ίδιο τον χρήστη.

-- Μοναδικό όνομα χωρίς διάκριση πεζών/κεφαλαίων (το υπάρχον unique ήταν case-sensitive).
create unique index if not exists citizen_display_name_ci on public.citizen_profiles (lower(display_name));

create or replace function public.display_name_available(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.citizen_profiles where lower(display_name) = lower(btrim(p_name)))
$$;
grant execute on function public.display_name_available(text) to anon, authenticated;

-- Η εγγραφή στέλνει τα στοιχεία στο user_metadata· το προφίλ δημιουργείται ήδη από την εγγραφή,
-- ώστε να υπάρχει και πριν την επιβεβαίωση του email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if btrim(coalesce(m->>'display_name', '')) <> '' then
    insert into public.citizen_profiles (user_id, display_name, kind, org_type, contact_person, consent_at)
    values (new.id, btrim(m->>'display_name'),
            case when m->>'kind' = 'org' then 'org' else 'person' end,
            coalesce(m->>'org_type', ''), coalesce(m->>'contact_person', ''), now());
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Διαγραφή του λογαριασμού και των δεδομένων του (προφίλ, σχόλια, ερωτήματα, προτάσεις, αναφορές).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Δεν έχετε συνδεθεί'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
