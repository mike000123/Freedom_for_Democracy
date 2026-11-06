-- Κανόνες υποβολής για πολίτες (όπως στο Django): χωρίς σύνδεσμους στα κείμενα, χωρίς διπλοεγγραφές το τελευταίο 24ωρο,
-- σωστοί τύποι σχολίων, απαντήσεις μόνο σε σχόλια πρώτου επιπέδου. Οι έλεγχοι γίνονται στη βάση, όχι στον browser.

-- Οι επίσημες απαντήσεις κομμάτων δεν έχουν λογαριασμό πολίτη: ο συγγραφέας μπορεί να είναι κενός
-- όταν υπάρχει official_party_id.
alter table public.comments alter column author_id drop not null;
alter table public.comments drop constraint if exists comments_author_or_official;
alter table public.comments add constraint comments_author_or_official check (author_id is not null or official_party_id is not null);
alter table public.comments drop constraint if exists comments_kind_valid;
alter table public.comments add constraint comments_kind_valid check (kind in ('for', 'against', 'question', 'comment'));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert with check (
  public.feature_on('citizen_accounts') and (
    (author_id = auth.uid() and official_party_id is null)
    or (author_id is null and official_party_id is not null and official_party_id = public.member_party())
  )
);

-- Το rate limit αφορά μόνο σχόλια με συγγραφέα πολίτη.
create or replace function public.trg_rl_comments() returns trigger language plpgsql as $$
begin
  if new.author_id is not null then
    perform public.rate_limit('public.comments', 'author_id', 10, interval '10 minutes');
  end if;
  return new;
end $$;

create or replace function public.trg_check_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare txt text; par public.comments;
begin
  if tg_table_name = 'comments' then
    if new.official_party_id is null then
      if exists (select 1 from public.comments where body = new.body and created_at > now() - interval '1 day')
         or exists (select 1 from public.questions where body = new.body and created_at > now() - interval '1 day') then
        raise exception 'Το ίδιο κείμενο έχει ήδη δημοσιευτεί πρόσφατα.';
      end if;
      if new.question_id is not null and new.kind <> 'comment' then raise exception 'Μη έγκυρος τύπος σχολίου.'; end if;
      if new.question_id is null and new.kind not in ('for', 'against', 'question') then raise exception 'Μη έγκυρος τύπος σχολίου.'; end if;
      txt := new.body;
    end if;
    if new.parent_id is not null then
      select * into par from public.comments where id = new.parent_id;
      if par.id is null or par.parent_id is not null
         or par.proposal_id is distinct from new.proposal_id
         or par.citizen_proposal_id is distinct from new.citizen_proposal_id
         or par.question_id is distinct from new.question_id then
        raise exception 'Μη έγκυρη απάντηση.';
      end if;
    end if;
  elsif tg_table_name = 'questions' then
    if exists (select 1 from public.comments where body = new.body and created_at > now() - interval '1 day')
       or exists (select 1 from public.questions where body = new.body and created_at > now() - interval '1 day') then
      raise exception 'Το ίδιο κείμενο έχει ήδη δημοσιευτεί πρόσφατα.';
    end if;
    txt := new.body;
  else
    txt := concat_ws(' ', new.title, new.problem, new.action, new.legal, new.cost, new.tradeoffs, new.timeline, new.metric);
    if new.source !~* '^https?://' then raise exception 'Η πηγή τεκμηρίωσης πρέπει να είναι σύνδεσμος που ξεκινά με http:// ή https://.'; end if;
  end if;
  if txt ~* '(https?://|www\.)' then
    raise exception 'Δεν επιτρέπονται σύνδεσμοι στα κείμενα των πολιτών.';
  end if;
  return new;
end $$;

drop trigger if exists chk_comments on public.comments;
create trigger chk_comments before insert on public.comments for each row execute function public.trg_check_post();
drop trigger if exists chk_questions on public.questions;
create trigger chk_questions before insert on public.questions for each row execute function public.trg_check_post();
drop trigger if exists chk_cprops on public.citizen_proposals;
create trigger chk_cprops before insert on public.citizen_proposals for each row execute function public.trg_check_post();

-- Όριο υποβολής ερωτημάτων και προτάσεων ανά χρήστη (το rate limit των σχολίων/ερωτημάτων υπάρχει ήδη από το 001).
