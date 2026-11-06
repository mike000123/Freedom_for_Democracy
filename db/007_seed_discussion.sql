-- Δείγμα συζήτησης στην πρόταση του «Κόμμα Δείγμα Πλήρες Προφίλ» στο θέμα Φορολογία:
-- υπέρ, κατά, ερώτηση, αφαιρεμένο σχόλιο και επίσημη απάντηση. Όλα φανταστικά (is_example).
-- Ασφαλές να ξανατρέξει: δεν διπλογράφει.
do $$
declare
  prop uuid; party uuid; qid uuid;
  names text[] := array['Αναγνώστης Α', 'Πολίτης Δείγμα', 'Αναγνώστης Β', 'Αναγνώστης Γ'];
  slugs text[] := array['anagnostis-a', 'politis-deigma', 'anagnostis-b', 'anagnostis-g'];
  uid uuid[] := '{}'; u uuid; i int;
begin
  select p.id, p.party_id into prop, party from public.proposals p
    join public.parties pa on pa.id = p.party_id join public.topics t on t.id = p.topic_id
   where pa.slug = 'komma-deigma-plires-profil' and t.slug = 'forologia';
  if prop is null then raise exception 'Δεν βρέθηκε η πρόταση δείγματος στο θέμα Φορολογία (έτρεξε το 003;).'; end if;
  if exists (select 1 from public.comments where proposal_id = prop) then
    raise notice 'Η πρόταση έχει ήδη σχόλια. Δεν έγινε καμία αλλαγή.'; return;
  end if;

  alter table public.comments disable trigger user;   -- χωρίς όρια ρυθμού/ελέγχους, μόνο για το δείγμα
  for i in 1 .. 4 loop
    select id into u from auth.users where email = slugs[i] || '@example.org';
    if u is null then
      u := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', slugs[i] || '@example.org', now(),
              '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', names[i], 'kind', 'person'), now(), now());
    end if;
    update public.citizen_profiles set is_example = true where user_id = u;
    uid := uid || u;
  end loop;

  insert into public.comments (proposal_id, kind, author_id, body, created_at) values
    (prop, 'for', uid[1], 'Φανταστικό σχόλιο δείγματος: υποστηρίζω την πρόταση επειδή ορίζει σαφές χρονοδιάγραμμα και μέτρο επιτυχίας.', now() - interval '300 minutes'),
    (prop, 'against', uid[2], 'Φανταστικό σχόλιο δείγματος: το κόστος που δηλώνεται δεν δείχνει από πού θα χρηματοδοτηθεί. Θα ήθελα πηγή για την εκτίμηση.', now() - interval '240 minutes');
  insert into public.comments (proposal_id, kind, author_id, body, created_at)
    values (prop, 'question', uid[3], 'Φανταστικό ερώτημα δείγματος: ποιες ομάδες πολιτών θα επιβαρυνθούν περισσότερο τα δύο πρώτα χρόνια;', now() - interval '180 minutes')
    returning id into qid;
  insert into public.comments (proposal_id, kind, author_id, body, created_at, removed, moderation_note)
    values (prop, 'for', uid[4], 'Φανταστικό αφαιρεμένο σχόλιο δείγματος.', now() - interval '120 minutes', true,
            'Φανταστική αιτιολόγηση δείγματος: το σχόλιο περιείχε προσωπική επίθεση.');
  insert into public.comments (proposal_id, parent_id, kind, official_party_id, body, created_at)
    values (prop, qid, 'comment', party, 'Φανταστική επίσημη απάντηση δείγματος: οι χαμηλότερα αμειβόμενοι εξαιρούνται τα δύο πρώτα χρόνια. Θα προσθέσουμε πηγή χρηματοδότησης στην πρόταση.', now() - interval '60 minutes');
  alter table public.comments enable trigger user;
end $$;
