-- Απαντήσεις κάτω από μήνυμα στις συζητήσεις (ένα επίπεδο, όπως στα σχόλια).
-- Ασφαλές να ξανατρέξει. Τρέξτε το πριν ή μετά το ανέβασμα του κώδικα: η σελίδα δουλεύει και χωρίς αυτό (χωρίς κουμπί «Απάντηση»).
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages(id) on delete cascade;
create index if not exists chat_messages_reply_idx on public.chat_messages (reply_to);

create or replace function public.trg_check_chat_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare par public.chat_messages;
begin
  if new.reply_to is null then return new; end if;
  select * into par from public.chat_messages where id = new.reply_to;
  if par.id is null or par.removed then raise exception 'Το μήνυμα στο οποίο απαντάτε δεν υπάρχει πια.'; end if;
  if par.reply_to is not null then raise exception 'Η απάντηση γίνεται στο αρχικό μήνυμα.'; end if;
  if (par.topic_id, par.party_id, par.proposal_id, par.room_id) is distinct from (new.topic_id, new.party_id, new.proposal_id, new.room_id) then
    raise exception 'Η απάντηση πρέπει να είναι στο ίδιο δωμάτιο.';
  end if;
  return new;
end $$;
drop trigger if exists chk_chat_reply on public.chat_messages;
create trigger chk_chat_reply before insert on public.chat_messages for each row execute function public.trg_check_chat_reply();
