-- Στάδιο 5: λογαριασμοί κομμάτων (προφίλ, πρόσωπα, βίντεο, προτάσεις, εικόνα), επίσημες απαντήσεις, αιτήσεις συμμετοχής.

-- ───────── Βοηθητικά ─────────
create or replace function public.valid_social(u text, hosts text[]) returns boolean
language sql immutable as $$
  select u = '' or exists (
    select 1 from unnest(hosts) h where u ~* ('^https://([a-z0-9-]+\.)*' || replace(h, '.', '\.') || '(/|\?|$)'))
$$;

-- Ιστορικό αλλαγών: γράφεται ΜΟΝΟ από triggers (όχι από τα μέλη), και μόνο για δημοσιευμένα προφίλ,
-- και μόνο όταν η αλλαγή γίνεται από την εφαρμογή (auth.uid() δεν είναι κενό).
create or replace function public.log_party_change(p_party uuid, p_summary text, p_details jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.parties where id = p_party and is_published) then return; end if;
  if exists (select 1 from public.change_log where party_id = p_party and summary = p_summary and at > now() - interval '1 minute') then return; end if;
  insert into public.change_log (party_id, summary, details) values (p_party, left(p_summary, 300), p_details);
end $$;
revoke all on function public.log_party_change(uuid, text, jsonb) from public;

-- ───────── Προφίλ κόμματος ─────────
-- Το μέλος αλλάζει μόνο τα πεδία του προφίλ. Όνομα, είδος, βαθμίδα, υπεύθυνα πρόσωπα και δημοσίευση: μόνο διαχειριστής.
create or replace function public.guard_party_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (new.id, new.name, new.slug, new.kind, new.tier, new.responsible_persons, new.is_published, new.graduated, new.is_example, new.moderation_note, new.created_at)
     is distinct from
     (old.id, old.name, old.slug, old.kind, old.tier, old.responsible_persons, old.is_published, old.graduated, old.is_example, old.moderation_note, old.created_at) then
    raise exception 'Αυτά τα πεδία αλλάζουν μόνο από τη διαχείριση.';
  end if;
  if not (public.valid_social(new.facebook, array['facebook.com', 'fb.com', 'fb.me'])
      and public.valid_social(new.instagram, array['instagram.com'])
      and public.valid_social(new.x_url, array['x.com', 'twitter.com'])
      and public.valid_social(new.youtube, array['youtube.com', 'youtu.be'])
      and public.valid_social(new.tiktok, array['tiktok.com'])
      and public.valid_social(new.linkedin, array['linkedin.com'])) then
    raise exception 'Δώστε έγκυρους συνδέσμους https από την αντίστοιχη υπηρεσία.';
  end if;
  if new.website <> '' and new.website !~* '^https?://' then raise exception 'Η ιστοσελίδα πρέπει να ξεκινά με http:// ή https://.'; end if;
  if new.image_path <> '' and new.image_path not like new.id::text || '/%' then raise exception 'Μη έγκυρη εικόνα.'; end if;
  return new;
end $$;
drop trigger if exists trg_guard_party on public.parties;
create trigger trg_guard_party before update on public.parties for each row execute function public.guard_party_update();

create or replace function public.log_party_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cols text[][] := array[['slogan','Σύνθημα'],['founded_year','Έτος ίδρυσης'],['founders','Ιδρυτές'],['founders_prior_service','Ένδειξη προηγούμενης θητείας ιδρυτών'],
    ['funding','Χρηματοδότηση'],['website','Επίσημη ιστοσελίδα'],['facebook','Facebook'],['instagram','Instagram'],['x_url','X (Twitter)'],
    ['youtube','YouTube'],['tiktok','TikTok'],['linkedin','LinkedIn'],['image_path','Εικόνα']];
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
drop trigger if exists trg_log_party on public.parties;
create trigger trg_log_party after update on public.parties for each row execute function public.log_party_profile();

-- Το μέλος δεν γράφει πια απευθείας στο ιστορικό.
drop policy if exists changelog_member_ins on public.change_log;

-- ───────── Πρόσωπα και βίντεο ─────────
alter table public.party_people drop constraint if exists party_people_social_https;
alter table public.party_people add constraint party_people_social_https check (social_url = '' or social_url ~* '^https://');
alter table public.party_videos drop constraint if exists party_videos_youtube;
alter table public.party_videos add constraint party_videos_youtube
  check (url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)(/|\?|$)');

create or replace function public.log_party_people() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old) then
    perform public.log_party_change(new.party_id, 'Ενημερώθηκε το βιογραφικό: ' || new.name);
  end if;
  return new;
end $$;
drop trigger if exists trg_log_people on public.party_people;
create trigger trg_log_people after insert or update on public.party_people for each row execute function public.log_party_people();

create or replace function public.log_party_videos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_party_change(coalesce(new.party_id, old.party_id), 'Ενημερώθηκαν τα βίντεο YouTube');
  return coalesce(new, old);
end $$;
drop trigger if exists trg_log_videos on public.party_videos;
create trigger trg_log_videos after insert or update or delete on public.party_videos for each row execute function public.log_party_videos();

-- ───────── Προτάσεις κομμάτων ─────────
alter table public.proposals drop constraint if exists proposals_party_topic_key;
alter table public.proposals add constraint proposals_party_topic_key unique (party_id, topic_id);
alter table public.proposals drop constraint if exists proposals_source_url;
alter table public.proposals add constraint proposals_source_url check (source ~* '^https?://');

create or replace function public.touch_proposal() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_touch_proposal on public.proposals;
create trigger trg_touch_proposal before update on public.proposals for each row execute function public.touch_proposal();

create or replace function public.log_proposal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cols text[][] := array[['title','Τίτλος'],['problem','Πρόβλημα'],['action','Πρόταση'],['legal','Νομικό πλαίσιο'],['cost','Κόστος και χρηματοδότηση'],
    ['tradeoffs','Αντισταθμίσματα'],['timeline','Χρονοδιάγραμμα'],['metric','Μέτρο επιτυχίας'],['source','Πηγή τεκμηρίωσης']];
  tname text; details jsonb := '[]'; i int; o text; n text;
begin
  select name into tname from public.topics where id = new.topic_id;
  if tg_op = 'INSERT' then
    if new.is_published then perform public.log_party_change(new.party_id, 'Νέα πρόταση: ' || tname); end if;
  elsif new.is_published or old.is_published then
    for i in 1 .. array_length(cols, 1) loop
      o := to_jsonb(old) ->> cols[i][1]; n := to_jsonb(new) ->> cols[i][1];
      if o is distinct from n then
        details := details || jsonb_build_object('label', cols[i][2], 'before', coalesce(o, ''), 'after', coalesce(n, ''));
      end if;
    end loop;
    if old.is_published is distinct from new.is_published then
      perform public.log_party_change(new.party_id, case when new.is_published then 'Δημοσιεύτηκε η πρόταση: ' else 'Αποσύρθηκε η πρόταση: ' end || tname);
    elsif jsonb_array_length(details) > 0 then
      perform public.log_party_change(new.party_id, 'Ενημερώθηκε η πρόταση: ' || tname, details);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_log_proposal on public.proposals;
create trigger trg_log_proposal after insert or update on public.proposals for each row execute function public.log_proposal();

-- ───────── Επίσημες απαντήσεις ─────────
-- Σε πρόταση: μόνο το κόμμα στο οποίο ανήκει. Σε ερώτημα πολίτη: οποιοδήποτε κόμμα.
create or replace function public.trg_check_official() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.official_party_id is null then return new; end if;
  if new.citizen_proposal_id is not null then raise exception 'Οι επίσημες απαντήσεις γίνονται σε προτάσεις κομμάτων και σε ερωτήματα πολιτών.'; end if;
  if new.proposal_id is not null
     and not exists (select 1 from public.proposals where id = new.proposal_id and party_id = new.official_party_id) then
    raise exception 'Μπορείτε να απαντήσετε επίσημα μόνο στις δικές σας προτάσεις.';
  end if;
  if new.kind <> 'comment' then raise exception 'Μη έγκυρος τύπος σχολίου.'; end if;
  if new.parent_id is null then raise exception 'Η επίσημη απάντηση γίνεται σε υπάρχον σχόλιο.'; end if;
  return new;
end $$;
drop trigger if exists chk_official on public.comments;
create trigger chk_official before insert on public.comments for each row execute function public.trg_check_official();

-- ───────── Εικόνες κομμάτων (Storage) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('party-images', 'party-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "party images insert" on storage.objects;
create policy "party images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'party-images' and (storage.foldername(name))[1] = public.member_party()::text);
drop policy if exists "party images update" on storage.objects;
create policy "party images update" on storage.objects for update to authenticated
  using (bucket_id = 'party-images' and (storage.foldername(name))[1] = public.member_party()::text);
drop policy if exists "party images delete" on storage.objects;
create policy "party images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'party-images' and (storage.foldername(name))[1] = public.member_party()::text);

-- ───────── Αιτήσεις συμμετοχής ─────────
alter table public.party_applications drop constraint if exists app_email_format;
alter table public.party_applications add constraint app_email_format check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200);
alter table public.party_applications drop constraint if exists app_lengths;
alter table public.party_applications add constraint app_lengths
  check (char_length(responsible_persons) <= 500 and char_length(elections_statement) <= 2000 and char_length(website) <= 300);

create or replace function public.trg_check_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare persons int;
begin
  new.name := btrim(new.name);
  if exists (select 1 from public.parties where lower(name) = lower(new.name)) then
    raise exception 'Υπάρχει ήδη κόμμα ή ομάδα με αυτή την επωνυμία.';
  end if;
  select count(*) into persons from unnest(string_to_array(new.responsible_persons, E'\n')) l where btrim(l) <> '';
  if persons < 1 or persons > 3 then raise exception 'Δηλώστε 1 έως 3 υπεύθυνα πρόσωπα, ένα όνομα ανά γραμμή.'; end if;
  if (select count(*) from public.party_applications where created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Πολλές αιτήσεις αυτή την ώρα. Δοκιμάστε ξανά αργότερα.';
  end if;
  if (select count(*) from public.party_applications where lower(contact_email) = lower(new.contact_email) and created_at > now() - interval '1 day') >= 2 then
    raise exception 'Έχετε ήδη υποβάλει αίτηση πρόσφατα με αυτό το email.';
  end if;
  return new;
end $$;
drop trigger if exists chk_application on public.party_applications;
create trigger chk_application before insert on public.party_applications for each row execute function public.trg_check_application();
