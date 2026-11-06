-- 015 · Η αίτηση συμμετοχής γίνεται από συνδεδεμένο λογαριασμό· στην έγκριση ο λογαριασμός συνδέεται αυτόματα με το κόμμα.
-- Το email επικοινωνίας μένει ξεχωριστό (δεν δημοσιεύεται). Παλιές αιτήσεις (applicant_id null) συνδέονται χειροκίνητα με link_member.

alter table public.party_applications add column if not exists applicant_id uuid references auth.users(id) on delete set null;

drop policy if exists app_insert on public.party_applications;
create policy app_insert on public.party_applications for insert to authenticated
  with check (public.feature_on('applications') and state = 'pending' and applicant_id = auth.uid());

create or replace function public.trg_check_applicant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.applicant_id is null then return new; end if;
  if exists (select 1 from public.party_members where user_id = new.applicant_id) then
    raise exception 'Ο λογαριασμός σας είναι ήδη συνδεδεμένος με κόμμα ή ομάδα.';
  end if;
  if exists (select 1 from public.party_applications where applicant_id = new.applicant_id and state = 'pending') then
    raise exception 'Έχετε ήδη μια αίτηση σε αναμονή.';
  end if;
  return new;
end $$;
drop trigger if exists chk_applicant on public.party_applications;
create trigger chk_applicant before insert on public.party_applications for each row execute function public.trg_check_applicant();

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
  if a.applicant_id is not null and exists (select 1 from public.party_members where user_id = a.applicant_id) then
    raise exception 'Ο λογαριασμός του αιτούντος είναι ήδη συνδεδεμένος με άλλο κόμμα.';
  end if;
  insert into public.parties (name, slug, kind, tier, responsible_persons, website, is_published)
  values (a.name, p_slug, a.kind, 'in_progress', a.responsible_persons, a.website, coalesce(p_publish, false))
  returning id into pid;
  update public.party_applications set state = 'approved', party_id = pid, admin_note = coalesce(nullif(btrim(p_reason), ''), admin_note) where id = p_id;
  if a.applicant_id is not null then
    insert into public.party_members (user_id, party_id) values (a.applicant_id, pid);
  end if;
  insert into public.decisions (subject, decision, reason)
  values (left('Αίτηση συμμετοχής: ' || a.name, 200), 'accepted', coalesce(nullif(btrim(p_reason), ''), 'Πληροί τους όρους συμμετοχής.'));
  return pid;
end $$;
revoke all on function public.approve_application(uuid,text,boolean,text) from public;
grant execute on function public.approve_application(uuid,text,boolean,text) to authenticated;
