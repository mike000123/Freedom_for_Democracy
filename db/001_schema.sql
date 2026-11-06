-- Freedom for Democracy — σχήμα Postgres για Supabase (v1, πρώτο προσχέδιο)
-- Αντιστοιχεί στα Django μοντέλα του φακέλου pythonanywhere. Τρέχει στο Supabase > SQL Editor.
--
-- Βασικές αποφάσεις:
--  * Λογαριασμοί: Supabase Auth (auth.users). Στο Authentication > Providers > Email ενεργοποίησε "Confirm email",
--    ώστε κάθε συνδεδεμένος χρήστης να έχει επαληθευμένο email.
--  * Διαχειριστές: πίνακας admins. Μέλη κόμματος: πίνακας party_members. Το TOTP του Django αντικαθίσταται
--    από το MFA του Supabase Auth (δεν υπάρχει πίνακας totp_devices).
--  * Ανώνυμα σχόλια με κωδικό διαγραφής δεν υπάρχουν πια (απαιτείται λογαριασμός), άρα δεν υπάρχει delete_code_hash.
--  * Το rate limit γίνεται με triggers ανά χρήστη (όχι ip_hash). Οι αναφορές καταγράφονται στον πίνακα content_reports.
--  * Οι εικόνες κομμάτων πηγαίνουν στο Supabase Storage (bucket "party-images").
--  * Κανένα κλειδί (service_role) δεν μπαίνει στον κώδικα του site. Το frontend χρησιμοποιεί μόνο το anon key.

-- ───────────────────────── Βοηθητικά ─────────────────────────

create or replace function public.word_count(t text) returns int
language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(btrim(t), '\s+'), 1), 0)
$$;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;   -- χωρίς policies: διαβάζεται μόνο από τις security definer συναρτήσεις

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ───────────────────────── Λειτουργίες (feature flags) ─────────────────────────

create table public.feature_flags (
  key         text primary key,
  label       text not null,
  description text not null default '',
  state       text not null default 'off' check (state in ('off', 'test', 'on')),
  version     int  not null default 1,
  updated_at  timestamptz not null default now()
);

create table public.feature_changes (
  id         bigint generated always as identity primary key,
  flag_key   text not null references public.feature_flags(key) on delete cascade,
  at         timestamptz not null default now(),
  old_state  text not null,
  new_state  text not null,
  version    int  not null,
  by_user    uuid references auth.users(id) on delete set null
);

-- true αν η λειτουργία είναι on, ή test και ο χρήστης είναι διαχειριστής. Άγνωστη λειτουργία: false.
create or replace function public.feature_on(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case f.state when 'on' then true when 'test' then public.is_admin() else false end
                   from public.feature_flags f where f.key = k), false)
$$;

create or replace function public.log_feature_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state is distinct from old.state then
    new.version := old.version + 1;
    new.updated_at := now();
    insert into public.feature_changes (flag_key, old_state, new_state, version, by_user)
    values (new.key, old.state, new.state, new.version, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_feature_change before update on public.feature_flags
  for each row execute function public.log_feature_change();

insert into public.feature_flags (key, label, description, state) values
  ('applications',     'Αιτήσεις συμμετοχής',        'Δημόσια φόρμα αίτησης κόμματος ή ομάδας.', 'on'),
  ('comparison',       'Σύγκριση κομμάτων',          'Σύγκριση θέσεων κομμάτων δίπλα-δίπλα ανά θέμα.', 'on'),
  ('citizen_accounts', 'Λογαριασμοί πολιτών',        'Σχόλια, ερωτήματα και προτάσεις απαιτούν λογαριασμό με επαληθευμένο email.', 'on'),
  ('citizen_proposals','Προτάσεις πολιτών',          'Οι πολίτες και οι οργανισμοί υποβάλλουν δομημένες προτάσεις, μία ανά θέμα.', 'on'),
  ('chat',             'Συζήτηση σε πραγματικό χρόνο','Δωμάτια συζήτησης ανά θέμα, κόμμα και πρόταση.', 'off'),
  ('notifications',    'Ειδοποιήσεις',               'Ειδοποίηση email για νέα απάντηση ή αλλαγή σε προφίλ που παρακολουθείτε.', 'off'),
  ('questionnaire',    'Ερωτηματολόγιο προτιμήσεων', 'Ανώνυμο ερωτηματολόγιο που δείχνει ποιες θέσεις ταιριάζουν, χωρίς κατάταξη κομμάτων.', 'off'),
  ('taxisnet',         'Επαλήθευση πολίτη (gov.gr)', 'Προαιρετική επαλήθευση ταυτότητας μέσω gov.gr.', 'off'),
  ('eudi',             'Ψηφιακό πορτοφόλι EUDI',     'Προαιρετική επαλήθευση μέσω του ευρωπαϊκού πορτοφολιού ταυτότητας.', 'off'),
  ('donations',        'Δωρεές στην πλατφόρμα',      'Δωρεές προς την πλατφόρμα, χωρίς καμία επιρροή στην έκθεση κομμάτων.', 'off'),
  ('subscriptions',    'Συνδρομές',                  'Προαιρετικές συνδρομές υποστηρικτών της πλατφόρμας.', 'off');

-- ───────────────────────── Θέματα ─────────────────────────

create table public.topics (
  id    int generated always as identity primary key,
  name  text not null unique check (char_length(name) <= 80),
  slug  text not null unique,
  "order" smallint not null default 0
);

-- ───────────────────────── Κόμματα και ομάδες ─────────────────────────

create table public.parties (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (char_length(name) <= 120),
  slug          text not null unique,
  slogan        text not null default '' check (char_length(slogan) <= 120),
  kind          text not null default 'party'       check (kind in ('party', 'group')),
  tier          text not null default 'in_progress' check (tier in ('in_progress', 'full')),
  founded_year  smallint,
  responsible_persons text not null default '',
  founders      text not null default '',
  founders_prior_service boolean not null default false,
  funding       text not null default '',
  website       text not null default '',
  is_example    boolean not null default false,     -- εμφανίζεται με την ένδειξη «Παράδειγμα»
  facebook text not null default '', instagram text not null default '', x_url text not null default '',
  youtube  text not null default '', tiktok    text not null default '', linkedin text not null default '',
  image_path    text not null default '',            -- διαδρομή στο Storage bucket "party-images"
  is_published  boolean not null default false,
  graduated     boolean not null default false,
  moderation_note text not null default '',
  created_at    timestamptz not null default now()
);

create table public.party_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,   -- ένα μέλος, ένα κόμμα
  party_id uuid not null references public.parties(id) on delete cascade
);
alter table public.party_members enable row level security;

create or replace function public.member_party() returns uuid
language sql stable security definer set search_path = public as $$
  select party_id from public.party_members where user_id = auth.uid()
$$;

create table public.party_people (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.parties(id) on delete cascade,
  name       text not null check (char_length(name) <= 120),
  occupation text not null default '', education text not null default '', experience text not null default '',
  public_office text not null default 'none' check (public_office in ('none', 'held', 'party')),
  office_details text not null default '', motivation text not null default '', social_url text not null default '',
  unique (party_id, name)
);

create table public.party_videos (
  id        uuid primary key default gen_random_uuid(),
  party_id  uuid not null references public.parties(id) on delete cascade,
  url       text not null,
  title     text not null check (char_length(title) <= 100),
  position  smallint not null default 0
);
create or replace function public.limit_party_videos() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.party_videos where party_id = new.party_id) >= 4 then
    raise exception 'Έως 4 βίντεο ανά προφίλ';
  end if;
  return new;
end $$;
create trigger trg_limit_videos before insert on public.party_videos
  for each row execute function public.limit_party_videos();

create table public.change_log (
  id        bigint generated always as identity primary key,
  party_id  uuid not null references public.parties(id) on delete cascade,
  at        timestamptz not null default now(),
  summary   text not null check (char_length(summary) <= 300),
  details   jsonb not null default '[]'
);

-- ───────────────────────── Αιτήσεις συμμετοχής ─────────────────────────

create table public.party_applications (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) <= 120),
  kind          text not null default 'party' check (kind in ('party', 'group')),
  responsible_persons text not null,
  contact_email text not null,
  elections_statement text not null,
  website       text not null default '',
  state         text not null default 'pending',
  admin_note    text not null default '',
  created_at    timestamptz not null default now(),
  party_id      uuid unique references public.parties(id) on delete set null
);

-- ───────────────────────── Λογαριασμοί πολιτών ─────────────────────────

create table public.citizen_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique check (char_length(display_name) between 2 and 40),
  kind         text not null default 'person' check (kind in ('person', 'org')),
  org_type     text not null default '',
  contact_person text not null default '',            -- δεν δημοσιεύεται (δες policies)
  is_example   boolean not null default false,
  consent_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Δημόσια προβολή χωρίς το contact_person.
create view public.citizens_public with (security_invoker = off) as
  select user_id, display_name, kind, org_type, is_example, created_at from public.citizen_profiles;

-- ───────────────────────── Προτάσεις κομμάτων ─────────────────────────

create table public.pref_questions (
  id       int generated always as identity primary key,
  topic_id int not null unique references public.topics(id) on delete cascade,
  text     text not null check (char_length(text) <= 200)
);
create table public.pref_options (
  id          int generated always as identity primary key,
  question_id int not null references public.pref_questions(id) on delete cascade,
  text        text not null check (char_length(text) <= 160),
  "order"     smallint not null default 0
);

create table public.proposals (
  id        uuid primary key default gen_random_uuid(),
  party_id  uuid not null references public.parties(id) on delete cascade,
  topic_id  int  not null references public.topics(id),
  title     text not null check (char_length(title) <= 200),
  problem   text not null check (public.word_count(problem)   <= 150),
  action    text not null check (public.word_count(action)    <= 150),
  legal     text not null check (public.word_count(legal)     <= 150),
  cost      text not null check (public.word_count(cost)      <= 150),
  tradeoffs text not null check (public.word_count(tradeoffs) <= 150),
  timeline  text not null check (public.word_count(timeline)  <= 150),
  metric    text not null check (public.word_count(metric)    <= 150),
  source    text not null default '',
  stance_id int references public.pref_options(id) on delete set null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Προτάσεις πολιτών ─────────────────────────

create table public.citizen_proposals (
  id        uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.citizen_profiles(user_id) on delete cascade,
  topic_id  int  not null references public.topics(id),
  title     text not null check (char_length(title) <= 200),
  problem   text not null check (public.word_count(problem)   <= 150),
  action    text not null check (public.word_count(action)    <= 150),
  legal     text not null check (public.word_count(legal)     <= 150),
  cost      text not null check (public.word_count(cost)      <= 150),
  tradeoffs text not null check (public.word_count(tradeoffs) <= 150),
  timeline  text not null check (public.word_count(timeline)  <= 150),
  metric    text not null check (public.word_count(metric)    <= 150),
  source    text not null check (source <> ''),
  created_at timestamptz not null default now(),
  removed   boolean not null default false,
  moderation_note text not null default '',
  report_count int not null default 0,
  constraint one_citizen_proposal_per_topic unique (author_id, topic_id)
);

-- ───────────────────────── Ερωτήματα και σχόλια ─────────────────────────

create table public.questions (
  id        uuid primary key default gen_random_uuid(),
  topic_id  int  not null references public.topics(id) on delete cascade,
  author_id uuid not null references public.citizen_profiles(user_id) on delete cascade,
  body      text not null check (public.word_count(body) <= 150 and char_length(body) <= 1500),
  created_at timestamptz not null default now(),
  removed   boolean not null default false,
  moderation_note text not null default '',
  report_count int not null default 0
);

create table public.comments (
  id        uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  citizen_proposal_id uuid references public.citizen_proposals(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  kind      text not null,
  author_id uuid not null references public.citizen_profiles(user_id) on delete cascade,
  official_party_id uuid references public.parties(id) on delete set null,   -- επίσημη απάντηση κόμματος
  body      text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  removed   boolean not null default false,
  removed_by_author boolean not null default false,
  moderation_note text not null default '',
  report_count int not null default 0,
  check (num_nonnulls(proposal_id, citizen_proposal_id, question_id) = 1)
);
create index on public.comments (proposal_id);
create index on public.comments (citizen_proposal_id);
create index on public.comments (question_id);

-- ───────────────────────── Αναφορές (reports) και εποπτεία ─────────────────────────

create table public.content_reports (
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('comment', 'question', 'citizen_proposal')),
  target_id   uuid not null,
  reason      text not null default '' check (char_length(reason) <= 500),
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)        -- μία αναφορά ανά χρήστη και περιεχόμενο
);

create or replace function public.bump_report_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.target_type = 'comment' then
    update public.comments set report_count = report_count + 1 where id = new.target_id;
  elsif new.target_type = 'question' then
    update public.questions set report_count = report_count + 1 where id = new.target_id;
  else
    update public.citizen_proposals set report_count = report_count + 1 where id = new.target_id;
  end if;
  return new;
end $$;
create trigger trg_bump_report after insert on public.content_reports
  for each row execute function public.bump_report_count();

-- Διαγραφή από διαχειριστή: αδειάζει το κείμενο και κρατά τη δημόσια αιτιολόγηση.
create or replace function public.moderate_remove(p_type text, p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Μόνο για διαχειριστές'; end if;
  if p_type = 'comment' then
    update public.comments set removed = true, body = '', moderation_note = p_note where id = p_id;
  elsif p_type = 'question' then
    update public.questions set removed = true, body = '', moderation_note = p_note where id = p_id;
  elsif p_type = 'citizen_proposal' then
    update public.citizen_proposals
       set removed = true, title = '', problem = '', action = '', legal = '', cost = '', tradeoffs = '',
           timeline = '', metric = '', moderation_note = p_note where id = p_id;
  else
    raise exception 'Άγνωστος τύπος';
  end if;
  insert into public.decisions (subject, decision, reason) values (p_type || ' ' || p_id, 'removed', p_note);
end $$;

-- Διαγραφή του σχολίου από τον ίδιο τον συγγραφέα.
create or replace function public.remove_own_comment(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.comments set removed = true, removed_by_author = true, body = ''
   where id = p_id and author_id = auth.uid();
$$;

create table public.decisions (
  id         bigint generated always as identity primary key,
  decided_at timestamptz not null default now(),
  subject    text not null check (char_length(subject) <= 200),
  decision   text not null check (decision in ('accepted', 'rejected', 'removed')),
  reason     text not null
);

-- ───────────────────────── Ισότιμη έκθεση ─────────────────────────
-- Κανόνας του Django (exposure.py): πρώτα τα κόμματα με τις λιγότερες εμφανίσεις, ισοπαλίες τυχαία,
-- τυχαία σειρά εμφάνισης. Κανένα σήμα δημοτικότητας.

create table public.impressions (
  id       bigint generated always as identity primary key,
  party_id uuid not null references public.parties(id) on delete cascade,
  shown_at timestamptz not null default now()
);
create index on public.impressions (shown_at);
create index on public.impressions (party_id);
alter table public.impressions enable row level security;

create or replace function public.pick_parties(p_kind text, p_tier text default null, p_n int default 6, p_record boolean default true)
returns setof public.parties
language plpgsql volatile security definer set search_path = public as $$
declare chosen uuid[];
begin
  select array_agg(id) into chosen from (
    select p.id
      from public.parties p
      left join public.impressions i on i.party_id = p.id
     where p.is_published and not p.graduated and p.kind = p_kind
       and (p_tier is null or p.tier = p_tier)
     group by p.id
     order by count(i.id), random()
     limit p_n
  ) s;
  if chosen is null then return; end if;
  if p_record then
    insert into public.impressions (party_id) select unnest(chosen);
  end if;
  return query select * from public.parties where id = any(chosen) order by random();
end $$;

-- ───────────────────────── Rate limit ανά χρήστη ─────────────────────────

create or replace function public.rate_limit(p_table regclass, p_user_col text, p_max int, p_window interval)
returns void language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from %s where %I = $1 and created_at > now() - $2', p_table, p_user_col)
    into n using auth.uid(), p_window;
  if n >= p_max then raise exception 'Πολλές υποβολές. Δοκίμασε ξανά σε λίγο.'; end if;
end $$;

create or replace function public.trg_rl_comments() returns trigger language plpgsql as $$
begin perform public.rate_limit('public.comments', 'author_id', 10, interval '10 minutes'); return new; end $$;
create trigger rl_comments before insert on public.comments for each row execute function public.trg_rl_comments();

create or replace function public.trg_rl_questions() returns trigger language plpgsql as $$
begin perform public.rate_limit('public.questions', 'author_id', 5, interval '10 minutes'); return new; end $$;
create trigger rl_questions before insert on public.questions for each row execute function public.trg_rl_questions();

-- ───────────────────────── Δωμάτια συζήτησης (chat) ─────────────────────────
-- Ένα δωμάτιο ανά θέμα, κόμμα ή πρόταση, ή το γενικό (όλα τα πεδία null). Realtime μέσω Supabase.

create table public.chat_messages (
  id        bigint generated always as identity primary key,
  topic_id  int  references public.topics(id) on delete cascade,
  party_id  uuid references public.parties(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete cascade,
  author_id uuid not null references public.citizen_profiles(user_id) on delete cascade,
  body      text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  removed   boolean not null default false,
  report_count int not null default 0,
  check (num_nonnulls(topic_id, party_id, proposal_id) <= 1)
);
create index on public.chat_messages (topic_id, id);
create index on public.chat_messages (party_id, id);
create index on public.chat_messages (proposal_id, id);

-- Ένα μήνυμα ανά 3 δευτερόλεπτα (slow mode) και έως 30 ανά 10 λεπτά.
create or replace function public.trg_rl_chat() returns trigger language plpgsql as $$
begin
  perform public.rate_limit('public.chat_messages', 'author_id', 1, interval '3 seconds');
  perform public.rate_limit('public.chat_messages', 'author_id', 30, interval '10 minutes');
  return new;
end $$;
create trigger rl_chat before insert on public.chat_messages for each row execute function public.trg_rl_chat();

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.feature_flags       enable row level security;
alter table public.feature_changes     enable row level security;
alter table public.topics              enable row level security;
alter table public.parties             enable row level security;
alter table public.party_people        enable row level security;
alter table public.party_videos        enable row level security;
alter table public.change_log          enable row level security;
alter table public.party_applications  enable row level security;
alter table public.citizen_profiles    enable row level security;
alter table public.pref_questions      enable row level security;
alter table public.pref_options        enable row level security;
alter table public.proposals           enable row level security;
alter table public.citizen_proposals   enable row level security;
alter table public.questions           enable row level security;
alter table public.comments            enable row level security;
alter table public.content_reports     enable row level security;
alter table public.decisions           enable row level security;
alter table public.chat_messages       enable row level security;

-- Δημόσια ανάγνωση
create policy flags_read    on public.feature_flags   for select using (true);
create policy changes_read  on public.feature_changes for select using (true);       -- σελίδα «Διαφάνεια»
create policy topics_read   on public.topics         for select using (true);
create policy decisions_read on public.decisions      for select using (true);       -- σελίδα «Διαφάνεια»
create policy pq_read       on public.pref_questions  for select using (true);
create policy po_read       on public.pref_options    for select using (true);
create policy parties_read  on public.parties         for select using (is_published or public.is_admin() or id = public.member_party());
create policy people_read   on public.party_people    for select using (exists (select 1 from public.parties p where p.id = party_id and (p.is_published or public.is_admin() or p.id = public.member_party())));
create policy videos_read   on public.party_videos    for select using (exists (select 1 from public.parties p where p.id = party_id and (p.is_published or public.is_admin() or p.id = public.member_party())));
create policy changelog_read on public.change_log     for select using (exists (select 1 from public.parties p where p.id = party_id and p.is_published));
create policy proposals_read on public.proposals      for select using (is_published or public.is_admin() or party_id = public.member_party());
create policy cprop_read    on public.citizen_proposals for select using (true);     -- οι αφαιρεθείσες έχουν αδειάσει το κείμενο
create policy questions_read on public.questions      for select using (true);
create policy comments_read on public.comments        for select using (true);
create policy chat_read     on public.chat_messages   for select using (not removed and public.feature_on('chat'));

-- Προφίλ πολιτών: ο καθένας βλέπει το δικό του (με contact_person), οι διαχειριστές όλα.
-- Το κοινό διαβάζει μόνο το view citizens_public.
create policy cp_self_read  on public.citizen_profiles for select using (user_id = auth.uid() or public.is_admin());
create policy cp_insert     on public.citizen_profiles for insert with check (user_id = auth.uid() and public.feature_on('citizen_accounts'));
create policy cp_update     on public.citizen_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.citizens_public to anon, authenticated;

-- Εγγραφή από πολίτες (απαιτείται συνδεδεμένος χρήστης με επαληθευμένο email)
create policy cprop_insert on public.citizen_proposals for insert
  with check (author_id = auth.uid() and public.feature_on('citizen_proposals') and public.feature_on('citizen_accounts'));
create policy cprop_update on public.citizen_proposals for update using (author_id = auth.uid() and not removed) with check (author_id = auth.uid() and not removed);

create policy questions_insert on public.questions for insert
  with check (author_id = auth.uid() and public.feature_on('citizen_accounts'));

create policy comments_insert on public.comments for insert
  with check (author_id = auth.uid() and public.feature_on('citizen_accounts')
              and (official_party_id is null or official_party_id = public.member_party()));

create policy chat_insert on public.chat_messages for insert
  with check (author_id = auth.uid() and public.feature_on('chat'));

create policy reports_insert on public.content_reports for insert with check (user_id = auth.uid());
create policy reports_admin_read on public.content_reports for select using (public.is_admin());

-- Αιτήσεις συμμετοχής: ο καθένας υποβάλλει (όταν η λειτουργία είναι ενεργή), μόνο διαχειριστές διαβάζουν και κρίνουν.
create policy app_insert on public.party_applications for insert with check (public.feature_on('applications') and state = 'pending');
create policy app_admin  on public.party_applications for all using (public.is_admin()) with check (public.is_admin());

-- Μέλη κόμματος: διαχειρίζονται το προφίλ και τις προτάσεις του δικού τους κόμματος.
create policy pm_self_read on public.party_members for select using (user_id = auth.uid() or public.is_admin());
create policy pm_admin     on public.party_members for all using (public.is_admin()) with check (public.is_admin());

create policy parties_member_update on public.parties for update using (id = public.member_party()) with check (id = public.member_party());
create policy people_member on public.party_people for all using (party_id = public.member_party()) with check (party_id = public.member_party());
create policy videos_member on public.party_videos for all using (party_id = public.member_party()) with check (party_id = public.member_party());
create policy proposals_member on public.proposals for all using (party_id = public.member_party()) with check (party_id = public.member_party());
create policy changelog_member_ins on public.change_log for insert with check (party_id = public.member_party());

-- Διαχειριστές: πλήρης διαχείριση
create policy flags_admin     on public.feature_flags  for update using (public.is_admin()) with check (public.is_admin());
create policy topics_admin    on public.topics         for all using (public.is_admin()) with check (public.is_admin());
create policy parties_admin   on public.parties        for all using (public.is_admin()) with check (public.is_admin());
create policy pq_admin        on public.pref_questions for all using (public.is_admin()) with check (public.is_admin());
create policy po_admin        on public.pref_options   for all using (public.is_admin()) with check (public.is_admin());
create policy decisions_admin on public.decisions      for insert with check (public.is_admin());
create policy chat_admin      on public.chat_messages  for update using (public.is_admin());

-- Δικαιώματα για τις συναρτήσεις που καλεί το frontend
revoke all on function public.pick_parties(text, text, int, boolean) from public;
grant execute on function public.pick_parties(text, text, int, boolean) to anon, authenticated;
grant execute on function public.moderate_remove(text, uuid, text) to authenticated;
grant execute on function public.remove_own_comment(uuid) to authenticated;

-- Realtime μόνο για το chat
alter publication supabase_realtime add table public.chat_messages;
