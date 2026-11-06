-- Στάδιο 7β: δωμάτια συζήτησης. Επίσημα δωμάτια (τα ανοίγει μόνο ο διαχειριστής, προαιρετικά ανά θέμα)
-- και ομαδικά chat που φτιάχνουν οι χρήστες (δημόσια ή ιδιωτικά με κωδικό πρόσκλησης).
-- Τα ομαδικά ελέγχονται από τη λειτουργία «chat_groups» (ανενεργή αρχικά). Τα επίσημα δωμάτια από το «chat».

insert into public.feature_flags (key, label, description, state) values
  ('chat_groups', 'Ομαδικά chat χρηστών', 'Οι πολίτες δημιουργούν δημόσιες ή ιδιωτικές ομάδες συζήτησης. Οι διαχειριστές βλέπουν μόνο μηνύματα που αναφέρονται.', 'off')
on conflict (key) do nothing;

create table if not exists public.chat_rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 200),
  kind        text not null check (kind in ('official', 'group')),
  visibility  text not null default 'public' check (visibility in ('public', 'private')),
  topic_id    int references public.topics(id) on delete set null,
  owner_id    uuid references auth.users(id) on delete cascade,
  invite_code text unique,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  check (kind = 'group' or visibility = 'public')
);
create table if not exists public.chat_room_members (
  room_id   uuid not null references public.chat_rooms(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  banned    boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;

-- Μηνύματα: πέμπτη επιλογή δωματίου.
alter table public.chat_messages add column if not exists room_id uuid references public.chat_rooms(id) on delete cascade;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.chat_messages'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) ilike '%num_nonnulls%' loop
    execute format('alter table public.chat_messages drop constraint %I', c);
  end loop;
end $$;
alter table public.chat_messages add constraint chat_one_room check (num_nonnulls(topic_id, party_id, proposal_id, room_id) <= 1);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, id);

-- Βοηθητικές συναρτήσεις (security definer για να μη γίνεται αναδρομή στα policies)
create or replace function public.is_room_member(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_room_members where room_id = rid and user_id = auth.uid() and not banned)
$$;
create or replace function public.can_read_room(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.chat_rooms r where r.id = rid and not r.archived
       and (r.kind = 'official' or r.visibility = 'public' or public.is_room_member(r.id)))
$$;
create or replace function public.can_post_room(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_rooms r where r.id = rid and not r.archived
       and (r.kind = 'official' or (public.is_room_member(r.id) and public.feature_on('chat_groups'))))
$$;

-- Policies
drop policy if exists rooms_read on public.chat_rooms;
create policy rooms_read on public.chat_rooms for select using (
  public.is_admin() or (not archived and (kind = 'official' or visibility = 'public' or public.is_room_member(id))));
drop policy if exists members_read on public.chat_room_members;
create policy members_read on public.chat_room_members for select using (
  user_id = auth.uid() or public.is_room_member(room_id) or public.is_admin());

drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select
  using (not removed and public.feature_on('chat') and (room_id is null or public.can_read_room(room_id)));
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert
  with check (author_id = auth.uid() and public.feature_on('chat') and (room_id is null or public.can_post_room(room_id)));

-- Αναφορά επιτρέπεται μόνο σε μήνυμα που ο χρήστης μπορεί να δει.
drop policy if exists chat_reports_insert on public.chat_reports;
create policy chat_reports_insert on public.chat_reports for insert
  with check (user_id = auth.uid() and public.feature_on('chat') and exists (select 1 from public.chat_messages m where m.id = message_id));

-- Λίστα δωματίων (επίσημα, δημόσιες ομάδες, και οι ομάδες του χρήστη). Οι δημόσιες ομάδες σε τυχαία σειρά, χωρίς κατάταξη.
create or replace function public.list_rooms()
returns table (id uuid, name text, description text, kind text, visibility text, topic_id int, members bigint, is_member boolean, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.kind, r.visibility, r.topic_id,
         (select count(*) from public.chat_room_members m where m.room_id = r.id and not m.banned),
         public.is_room_member(r.id), r.owner_id = auth.uid()
    from public.chat_rooms r
   where not r.archived and (r.kind = 'official' or r.visibility = 'public' or public.is_room_member(r.id))
   order by (r.kind = 'official') desc, random()
$$;

create or replace function public.create_room(p_name text, p_desc text, p_visibility text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; nm text := btrim(coalesce(p_name, '')); ds text := btrim(coalesce(p_desc, ''));
begin
  if auth.uid() is null then raise exception 'Χρειάζεται σύνδεση.'; end if;
  if not public.feature_on('chat_groups') then raise exception 'Τα ομαδικά chat δεν είναι ενεργά αυτή τη στιγμή.'; end if;
  if not exists (select 1 from public.citizen_profiles where user_id = auth.uid()) then raise exception 'Δεν βρέθηκε προφίλ πολίτη.'; end if;
  if char_length(nm) not between 3 and 60 then raise exception 'Το όνομα της ομάδας πρέπει να έχει 3 έως 60 χαρακτήρες.'; end if;
  if char_length(ds) > 200 then raise exception 'Η περιγραφή έχει έως 200 χαρακτήρες.'; end if;
  if (nm || ' ' || ds) ~* '(https?://|www\.)' then raise exception 'Δεν επιτρέπονται σύνδεσμοι.'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Μη έγκυρη ορατότητα.'; end if;
  if (select count(*) from public.chat_rooms where owner_id = auth.uid() and kind = 'group' and not archived) >= 3 then
    raise exception 'Μπορείτε να έχετε έως 3 ομάδες.';
  end if;
  if (select count(*) from public.chat_rooms where owner_id = auth.uid() and created_at > now() - interval '1 hour') >= 2 then
    raise exception 'Πολλές δημιουργίες. Δοκιμάστε ξανά αργότερα.';
  end if;
  insert into public.chat_rooms (name, description, kind, visibility, owner_id, invite_code)
  values (nm, ds, 'group', p_visibility, auth.uid(), substr(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 1, 10))
  returning id into rid;
  insert into public.chat_room_members (room_id, user_id, role) values (rid, auth.uid(), 'owner');
  return rid;
end $$;

create or replace function public.join_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.chat_rooms;
begin
  if auth.uid() is null then raise exception 'Χρειάζεται σύνδεση.'; end if;
  if not public.feature_on('chat_groups') then raise exception 'Τα ομαδικά chat δεν είναι ενεργά αυτή τη στιγμή.'; end if;
  select * into r from public.chat_rooms where id = p_room and kind = 'group' and not archived;
  if r.id is null or r.visibility <> 'public' then raise exception 'Η ομάδα δεν βρέθηκε.'; end if;
  if exists (select 1 from public.chat_room_members where room_id = p_room and user_id = auth.uid() and banned) then raise exception 'Δεν μπορείτε να συμμετέχετε σε αυτή την ομάδα.'; end if;
  if (select count(*) from public.chat_room_members where room_id = p_room and not banned) >= 200 then raise exception 'Η ομάδα είναι πλήρης.'; end if;
  insert into public.chat_room_members (room_id, user_id) values (p_room, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.join_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.chat_rooms;
begin
  if auth.uid() is null then raise exception 'Χρειάζεται σύνδεση.'; end if;
  if not public.feature_on('chat_groups') then raise exception 'Τα ομαδικά chat δεν είναι ενεργά αυτή τη στιγμή.'; end if;
  select * into r from public.chat_rooms where invite_code = btrim(p_code) and kind = 'group' and not archived;
  if r.id is null then raise exception 'Μη έγκυρος κωδικός πρόσκλησης.'; end if;
  if exists (select 1 from public.chat_room_members where room_id = r.id and user_id = auth.uid() and banned) then raise exception 'Δεν μπορείτε να συμμετέχετε σε αυτή την ομάδα.'; end if;
  if (select count(*) from public.chat_room_members where room_id = r.id and not banned) >= 200 then raise exception 'Η ομάδα είναι πλήρης.'; end if;
  insert into public.chat_room_members (room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return r.id;
end $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.chat_room_members where room_id = p_room and user_id = auth.uid() and role = 'owner') then
    raise exception 'Ο δημιουργός δεν μπορεί να αποχωρήσει. Διαγράψτε την ομάδα.';
  end if;
  delete from public.chat_room_members where room_id = p_room and user_id = auth.uid() and not banned;
end $$;

create or replace function public.delete_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from public.chat_rooms where id = p_room and owner_id = auth.uid() and kind = 'group')) then
    raise exception 'Δεν έχετε δικαίωμα.';
  end if;
  delete from public.chat_rooms where id = p_room;
end $$;

create or replace function public.kick_member(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from public.chat_rooms where id = p_room and owner_id = auth.uid())) then
    raise exception 'Δεν έχετε δικαίωμα.';
  end if;
  if exists (select 1 from public.chat_room_members where room_id = p_room and user_id = p_user and role = 'owner') then raise exception 'Δεν αφαιρείται ο δημιουργός.'; end if;
  update public.chat_room_members set banned = true where room_id = p_room and user_id = p_user;
end $$;

create or replace function public.owner_remove_message(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_messages m join public.chat_rooms r on r.id = m.room_id where m.id = p_id and (r.owner_id = auth.uid() or public.is_admin())) then
    raise exception 'Δεν έχετε δικαίωμα.';
  end if;
  update public.chat_messages set removed = true where id = p_id;
end $$;

create or replace function public.admin_create_room(p_name text, p_desc text, p_topic int)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  insert into public.chat_rooms (name, description, kind, visibility, topic_id, owner_id)
  values (btrim(p_name), btrim(coalesce(p_desc, '')), 'official', 'public', p_topic, null) returning id into rid;
  return rid;
end $$;

do $$
declare f text;
begin
  foreach f in array array['list_rooms()', 'create_room(text,text,text)', 'join_room(uuid)', 'join_by_code(text)', 'leave_room(uuid)',
                           'delete_room(uuid)', 'kick_member(uuid,uuid)', 'owner_remove_message(bigint)', 'admin_create_room(text,text,int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  grant execute on function public.list_rooms() to anon;
end $$;
