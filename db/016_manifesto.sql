-- 016 · Διακήρυξη κόμματος: κείμενο (περίληψη ή πλήρες) και σύνδεσμος προς το επίσημο κείμενο. Και τα δύο προαιρετικά.
alter table public.parties add column if not exists manifesto text not null default '';
alter table public.parties add column if not exists manifesto_url text not null default '';
alter table public.parties drop constraint if exists parties_manifesto_len;
alter table public.parties add constraint parties_manifesto_len
  check (char_length(manifesto) <= 8000 and char_length(manifesto_url) <= 300 and (manifesto_url = '' or manifesto_url ~* '^https?://'));

-- Το ιστορικό αλλαγών καταγράφει και τα δύο πεδία.
create or replace function public.log_party_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cols text[][] := array[['slogan','Σύνθημα'],['founded_year','Έτος ίδρυσης'],['founders','Ιδρυτές'],['founders_prior_service','Ένδειξη προηγούμενης θητείας ιδρυτών'],
    ['funding','Χρηματοδότηση'],['website','Επίσημη ιστοσελίδα'],['facebook','Facebook'],['instagram','Instagram'],['x_url','X (Twitter)'],
    ['youtube','YouTube'],['tiktok','TikTok'],['linkedin','LinkedIn'],['image_path','Εικόνα'],
    ['manifesto','Διακήρυξη'],['manifesto_url','Σύνδεσμος διακήρυξης']];
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
