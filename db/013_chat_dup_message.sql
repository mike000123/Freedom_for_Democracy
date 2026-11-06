-- Σαφέστερο μήνυμα όταν το ίδιο κείμενο στέλνεται ξανά μέσα σε ένα λεπτό: λέει αν έγινε σε αυτό ή σε άλλο δωμάτιο.
-- Ο έλεγχος μένει σε όλα τα δωμάτια μαζί (αποτρέπει το ίδιο μήνυμα σε πολλά δωμάτια).
create or replace function public.trg_check_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare dup public.chat_messages;
begin
  new.body := btrim(new.body);
  if new.body = '' then raise exception 'Γράψτε ένα μήνυμα.'; end if;
  if new.body ~* '(https?://|www\.)' then raise exception 'Δεν επιτρέπονται σύνδεσμοι στα μηνύματα.'; end if;
  select * into dup from public.chat_messages
   where author_id = new.author_id and body = new.body and created_at > now() - interval '1 minute'
   order by id desc limit 1;
  if dup.id is not null then
    if (dup.topic_id, dup.party_id, dup.proposal_id, dup.room_id) is not distinct from (new.topic_id, new.party_id, new.proposal_id, new.room_id) then
      raise exception 'Το ίδιο μήνυμα στάλθηκε μόλις τώρα σε αυτό το δωμάτιο.';
    else
      raise exception 'Το ίδιο μήνυμα στάλθηκε μόλις τώρα σε άλλο δωμάτιο. Περιμένετε ένα λεπτό ή αλλάξτε το κείμενο.';
    end if;
  end if;
  return new;
end $$;
