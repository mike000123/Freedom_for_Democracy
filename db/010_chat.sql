-- Στάδιο 7: συζήτηση σε πραγματικό χρόνο. Ελέγχους κειμένου, αναφορές, εποπτεία.

create or replace function public.trg_check_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.body := btrim(new.body);
  if new.body = '' then raise exception 'Γράψτε ένα μήνυμα.'; end if;
  if new.body ~* '(https?://|www\.)' then raise exception 'Δεν επιτρέπονται σύνδεσμοι στα μηνύματα.'; end if;
  if exists (select 1 from public.chat_messages where author_id = new.author_id and body = new.body and created_at > now() - interval '1 minute') then
    raise exception 'Το ίδιο μήνυμα στάλθηκε μόλις τώρα.';
  end if;
  return new;
end $$;
drop trigger if exists chk_chat on public.chat_messages;
create trigger chk_chat before insert on public.chat_messages for each row execute function public.trg_check_chat();

-- Αναφορές μηνυμάτων (το id των μηνυμάτων είναι bigint, γι' αυτό ξεχωριστός πίνακας).
create table if not exists public.chat_reports (
  user_id    uuid not null references auth.users(id) on delete cascade,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.chat_reports enable row level security;
drop policy if exists chat_reports_insert on public.chat_reports;
create policy chat_reports_insert on public.chat_reports for insert with check (user_id = auth.uid() and public.feature_on('chat'));
drop policy if exists chat_reports_admin on public.chat_reports;
create policy chat_reports_admin on public.chat_reports for select using (public.is_admin());

create or replace function public.bump_chat_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_messages set report_count = report_count + 1 where id = new.message_id;
  return new;
end $$;
drop trigger if exists trg_bump_chat_report on public.chat_reports;
create trigger trg_bump_chat_report after insert on public.chat_reports for each row execute function public.bump_chat_report();

-- Οι διαχειριστές βλέπουν και τα αφαιρεμένα μηνύματα.
drop policy if exists chat_admin_read on public.chat_messages;
create policy chat_admin_read on public.chat_messages for select using (public.is_admin());

create or replace function public.moderate_chat(p_id bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'Η αιτιολόγηση είναι υποχρεωτική (δημοσιεύεται).'; end if;
  update public.chat_messages set removed = true where id = p_id;
  insert into public.decisions (subject, decision, reason) values ('Μήνυμα συζήτησης ' || p_id, 'removed', p_note);
end $$;

create or replace function public.clear_chat_reports(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  delete from public.chat_reports where message_id = p_id;
  update public.chat_messages set report_count = 0 where id = p_id;
end $$;

revoke all on function public.moderate_chat(bigint, text) from public;
grant execute on function public.moderate_chat(bigint, text) to authenticated;
revoke all on function public.clear_chat_reports(bigint) from public;
grant execute on function public.clear_chat_reports(bigint) to authenticated;

-- Realtime: ο πίνακας υπάρχει ήδη στο publication από το 001 (αν όχι, αγνοείται το σφάλμα).
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
