-- 027: Αιτήματα διόρθωσης / δικαίωμα απάντησης / απόσυρση για προφίλ και προτάσεις κομμάτων.
-- Ανοιχτό σε όλους (και χωρίς λογαριασμό), ώστε να μπορεί να το χρησιμοποιήσει κάθε εκπρόσωπος κόμματος.
-- Οι αποφάσεις καταγράφονται δημόσια στον πίνακα decisions (χωρίς προσωπικά στοιχεία του αιτούντος).

create table if not exists public.party_corrections (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  party_id      uuid not null references public.parties(id) on delete cascade,
  proposal_id   uuid references public.proposals(id) on delete cascade,
  kind          text not null check (kind in ('correction', 'reply', 'removal')),
  body          text not null check (char_length(btrim(body)) between 10 and 1500),
  evidence_url  text not null default '' check (char_length(evidence_url) <= 500),
  contact_name  text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_email text not null check (char_length(contact_email) <= 200 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status        text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  admin_note    text not null default '',
  resolved_at   timestamptz
);
create index if not exists party_corrections_status_idx on public.party_corrections (status, created_at desc);

alter table public.party_corrections enable row level security;

drop policy if exists party_corrections_insert on public.party_corrections;
create policy party_corrections_insert on public.party_corrections for insert to anon, authenticated
  with check (status = 'open' and admin_note = '' and resolved_at is null
              and exists (select 1 from public.parties p where p.id = party_id and p.is_published));
drop policy if exists party_corrections_admin on public.party_corrections;
create policy party_corrections_admin on public.party_corrections for select to authenticated using (public.is_admin());

grant insert on public.party_corrections to anon, authenticated;
grant select on public.party_corrections to authenticated;

-- Φραγή spam: έως 5 αιτήματα ανά email και ανά 24 ώρες.
create or replace function public.limit_party_corrections() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.party_corrections
       where lower(contact_email) = lower(new.contact_email) and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Έχετε υποβάλει ήδη πολλά αιτήματα. Δοκιμάστε ξανά αύριο.';
  end if;
  if new.proposal_id is not null
     and not exists (select 1 from public.proposals where id = new.proposal_id and party_id = new.party_id) then
    raise exception 'Η πρόταση δεν ανήκει σε αυτό το κόμμα.';
  end if;
  return new;
end $$;
drop trigger if exists trg_limit_party_corrections on public.party_corrections;
create trigger trg_limit_party_corrections before insert on public.party_corrections for each row execute function public.limit_party_corrections();

-- Απόφαση διαχειριστή. p_action:
--   corrected     → το περιεχόμενο διορθώθηκε (ή θα διορθωθεί) — καταγράφεται ως «accepted»
--   hide_proposal → αποσύρεται η πρόταση μέχρι να τεκμηριωθεί      — «removed»
--   hide_party    → αποσύρεται ολόκληρο το προφίλ                  — «removed»
--   rejected      → το αίτημα δεν γίνεται δεκτό                   — «rejected»
-- Η αιτιολόγηση είναι υποχρεωτική και δημοσιεύεται στη «Διαφάνεια» (μην γράφετε προσωπικά στοιχεία).
create or replace function public.resolve_party_correction(p_id bigint, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.party_corrections; pname text; dec text;
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Η αιτιολόγηση είναι υποχρεωτική (δημοσιεύεται).'; end if;
  if p_action not in ('corrected', 'hide_proposal', 'hide_party', 'rejected') then raise exception 'Άγνωστη ενέργεια.'; end if;
  select * into c from public.party_corrections where id = p_id;
  if not found then raise exception 'Το αίτημα δεν βρέθηκε.'; end if;
  select name into pname from public.parties where id = c.party_id;
  if p_action = 'hide_proposal' then
    if c.proposal_id is null then raise exception 'Το αίτημα δεν αφορά συγκεκριμένη πρόταση.'; end if;
    update public.proposals set is_published = false where id = c.proposal_id;
  elsif p_action = 'hide_party' then
    update public.parties set is_published = false where id = c.party_id;
  end if;
  dec := case p_action when 'corrected' then 'accepted' when 'rejected' then 'rejected' else 'removed' end;
  update public.party_corrections
     set status = case when p_action = 'rejected' then 'rejected' else 'resolved' end, admin_note = p_reason, resolved_at = now()
   where id = p_id;
  insert into public.decisions (subject, decision, reason) values (left('Αίτημα διόρθωσης: ' || pname, 200), dec, p_reason);
end $$;
revoke all on function public.resolve_party_correction(bigint, text, text) from public;
grant execute on function public.resolve_party_correction(bigint, text, text) to authenticated;
