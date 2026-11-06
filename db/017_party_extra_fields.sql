-- 017 · Πρόσθετα πεδία προφίλ, από ό,τι δημοσιεύουν τα ίδια τα κόμματα στις ιστοσελίδες τους:
-- νομική υπόσταση, email επικοινωνίας (δημόσιο, το δηλώνει το κόμμα), ομάδα/πολιτικό όργανο, και σύνδεσμοι προς θέσεις, νέα, εγγραφή μελών, οικονομική ενίσχυση.
alter table public.parties add column if not exists legal_status text not null default '';
alter table public.parties add column if not exists contact_email text not null default '';
alter table public.parties add column if not exists team text not null default '';
alter table public.parties add column if not exists positions_url text not null default '';
alter table public.parties add column if not exists news_url text not null default '';
alter table public.parties add column if not exists membership_url text not null default '';
alter table public.parties add column if not exists donate_url text not null default '';

alter table public.parties drop constraint if exists parties_extra_check;
alter table public.parties add constraint parties_extra_check check (
  char_length(legal_status) <= 500 and char_length(team) <= 2000
  and (contact_email = '' or (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200))
  and (positions_url = '' or positions_url ~* '^https?://') and char_length(positions_url) <= 300
  and (news_url = '' or news_url ~* '^https?://') and char_length(news_url) <= 300
  and (membership_url = '' or membership_url ~* '^https?://') and char_length(membership_url) <= 300
  and (donate_url = '' or donate_url ~* '^https?://') and char_length(donate_url) <= 300
);

create or replace function public.log_party_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cols text[][] := array[['slogan','Σύνθημα'],['founded_year','Έτος ίδρυσης'],['founders','Ιδρυτές'],['founders_prior_service','Ένδειξη προηγούμενης θητείας ιδρυτών'],
    ['funding','Χρηματοδότηση'],['website','Επίσημη ιστοσελίδα'],['facebook','Facebook'],['instagram','Instagram'],['x_url','X (Twitter)'],
    ['youtube','YouTube'],['tiktok','TikTok'],['linkedin','LinkedIn'],['image_path','Εικόνα'],
    ['manifesto','Διακήρυξη'],['manifesto_url','Σύνδεσμος διακήρυξης'],
    ['legal_status','Νομική υπόσταση'],['contact_email','Email επικοινωνίας'],['team','Ομάδα'],
    ['positions_url','Σύνδεσμος θέσεων'],['news_url','Σύνδεσμος νέων'],['membership_url','Σύνδεσμος εγγραφής μελών'],['donate_url','Σύνδεσμος οικονομικής ενίσχυσης']];
  i int; details jsonb := '[]'; labels text[] := '{}'; o text; n text;
begin
  for i in 1 .. array_length(cols, 1) loop
    o := to_jsonb(old) ->> cols[i][1]; n := to_jsonb(new) ->> cols[i][1];
    if o is distinct from n then
      details := details || jsonb_build_object('label', cols[i][2], 'before', coalesce(o, ''), 'after', coalesce(n, ''));
      labels := labels || cols[i][2];
    end if;
  end loop;
  if array_length(labels, 1) > 0 then
    perform public.log_party_change(new.id, 'Ενημερώθηκε το προφίλ: ' || array_to_string(labels, ', '), details);
  end if;
  return new;
end $$;
