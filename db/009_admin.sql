-- Στάδιο 6: λειτουργίες διαχείρισης. Όλες οι συναρτήσεις ελέγχουν is_admin() και δεν δουλεύουν για κανέναν άλλον.
-- Πώς γίνεται κανείς διαχειριστής (μία φορά, στο SQL Editor, αφού έχει κάνει εγγραφή στο site):
--   insert into public.admins (user_id) select id from auth.users where email = 'EMAIL_ΣΟΥ';

create or replace function public.approve_application(p_id uuid, p_slug text, p_publish boolean default false, p_reason text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.party_applications; pid uuid;
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  select * into a from public.party_applications where id = p_id for update;
  if a.id is null then raise exception 'Η αίτηση δεν βρέθηκε.'; end if;
  if a.state <> 'pending' or a.party_id is not null then raise exception 'Η αίτηση έχει ήδη κριθεί.'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Το slug πρέπει να έχει λατινικά πεζά, αριθμούς και παύλες.'; end if;
  if exists (select 1 from public.parties where slug = p_slug) then raise exception 'Το slug χρησιμοποιείται ήδη.'; end if;
  insert into public.parties (name, slug, kind, tier, responsible_persons, website, is_published)
  values (a.name, p_slug, a.kind, 'in_progress', a.responsible_persons, a.website, coalesce(p_publish, false))
  returning id into pid;
  update public.party_applications set state = 'approved', party_id = pid, admin_note = coalesce(nullif(btrim(p_reason), ''), admin_note) where id = p_id;
  insert into public.decisions (subject, decision, reason)
  values (left('Αίτηση συμμετοχής: ' || a.name, 200), 'accepted', coalesce(nullif(btrim(p_reason), ''), 'Πληροί τους όρους συμμετοχής.'));
  return pid;
end $$;

create or replace function public.reject_application(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.party_applications;
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Η αιτιολόγηση είναι υποχρεωτική (δημοσιεύεται).'; end if;
  select * into a from public.party_applications where id = p_id for update;
  if a.id is null or a.state <> 'pending' then raise exception 'Η αίτηση δεν είναι σε αναμονή.'; end if;
  update public.party_applications set state = 'rejected', admin_note = p_reason where id = p_id;
  insert into public.decisions (subject, decision, reason) values (left('Αίτηση συμμετοχής: ' || a.name, 200), 'rejected', p_reason);
end $$;

-- Μέλη κόμματος: σύνδεση λογαριασμού με κόμμα βάσει email (ο εκπρόσωπος πρέπει να έχει ήδη λογαριασμό στο site).
create or replace function public.link_member(p_email text, p_party uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare u uuid;
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  select id into u from auth.users where lower(email) = lower(btrim(p_email));
  if u is null then raise exception 'Δεν υπάρχει λογαριασμός με αυτό το email. Ο εκπρόσωπος πρέπει πρώτα να κάνει εγγραφή.'; end if;
  if exists (select 1 from public.party_members where user_id = u and party_id <> p_party) then
    raise exception 'Ο λογαριασμός είναι ήδη συνδεδεμένος με άλλο κόμμα.';
  end if;
  insert into public.party_members (user_id, party_id) values (u, p_party) on conflict (user_id) do nothing;
end $$;

create or replace function public.unlink_member(p_user uuid, p_party uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  delete from public.party_members where user_id = p_user and party_id = p_party;
end $$;

create or replace function public.list_members(p_party uuid)
returns table (user_id uuid, email text, display_name text) language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  return query
    select m.user_id, u.email::text, c.display_name
      from public.party_members m join auth.users u on u.id = m.user_id
      left join public.citizen_profiles c on c.user_id = m.user_id
     where m.party_id = p_party;
end $$;

-- Απόρριψη αναφορών: το περιεχόμενο μένει, οι αναφορές καθαρίζουν.
create or replace function public.clear_reports(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  delete from public.content_reports where target_type = p_type and target_id = p_id;
  if p_type = 'comment' then update public.comments set report_count = 0 where id = p_id;
  elsif p_type = 'question' then update public.questions set report_count = 0 where id = p_id;
  elsif p_type = 'citizen_proposal' then update public.citizen_proposals set report_count = 0 where id = p_id;
  else raise exception 'Άγνωστος τύπος'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['approve_application(uuid,text,boolean,text)', 'reject_application(uuid,text)', 'link_member(text,uuid)',
                           'unlink_member(uuid,uuid)', 'list_members(uuid)', 'clear_reports(text,uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
