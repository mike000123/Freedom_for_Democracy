-- Δύο φανταστικές προτάσεις πολιτών στο θέμα Φορολογία (ένας πολίτης, ένα κανάλι). Ασφαλές να ξανατρέξει.
do $$
declare
  tid int; u uuid; r record;
begin
  select id into tid from public.topics where slug = 'forologia';
  if tid is null then raise exception 'Δεν βρέθηκε το θέμα Φορολογία (έτρεξε το 003;).'; end if;
  for r in select * from (values
    ('Πολίτης Δείγμα', 'person', '', 'politis-deigma',
     'Δημόσια αναφορά αποτελεσμάτων κάθε έξι μήνες',
     'Φανταστικό παράδειγμα: οι πολίτες δεν βλέπουν αν τα μέτρα πέτυχαν, γιατί δεν δημοσιεύονται μετρήσεις.',
     'Κάθε υπουργείο δημοσιεύει ανά εξάμηνο τρεις δείκτες και τη σύγκρισή τους με τον στόχο, σε ανοιχτή μορφή.',
     'Αρκεί υπουργική απόφαση για τη μορφή και τα χρονοδιαγράμματα (φανταστική παραπομπή).',
     'Χαμηλό κόστος, περίπου 2 εκατ. ευρώ ετησίως, από υπάρχουσες υπηρεσίες στατιστικής (φανταστικό).',
     'Περισσότερη δουλειά για τις υπηρεσίες και πιθανή δυσφορία όταν οι δείκτες είναι κακοί (φανταστικό).',
     'Πρώτη αναφορά σε 6 μήνες από την έναρξη ισχύος (φανταστικό).',
     'Ποσοστό μέτρων με δημοσιευμένο δείκτη, στόχος 90% σε δύο χρόνια (φανταστικό).'),
    ('Κανάλι Δείγμα', 'org', 'youtube', 'kanali-deigma',
     'Αξιολόγηση κάθε νέου μέτρου από ανεξάρτητη αρχή',
     'Φανταστικό παράδειγμα: νέα μέτρα εφαρμόζονται χωρίς εκ των προτέρων εκτίμηση του κόστους και των παρενεργειών.',
     'Ανεξάρτητη αρχή εκδίδει σύντομη γνωμοδότηση πριν από κάθε νομοσχέδιο που ξεπερνά ορισμένο κόστος.',
     'Απαιτείται νέος νόμος που ορίζει τη σύνθεση και τις αρμοδιότητες της αρχής (φανταστική παραπομπή).',
     'Περίπου 8 εκατ. ευρώ ετησίως για προσωπικό και λειτουργία (φανταστικό).',
     'Επιβράδυνση της νομοθέτησης κατά λίγες εβδομάδες για μεγάλα νομοσχέδια (φανταστικό).',
     'Σύσταση της αρχής σε 12 μήνες και πλήρης λειτουργία σε 24 (φανταστικό).',
     'Ποσοστό νομοσχεδίων με γνωμοδότηση πριν την ψήφιση (φανταστικό).')
  ) as t(name, kind, org_type, slug, title, problem, action, legal, cost, tradeoffs, timeline, metric)
  loop
    select id into u from auth.users where email = r.slug || '@example.org';
    if u is null then
      u := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', r.slug || '@example.org', now(),
              '{"provider":"email","providers":["email"]}',
              jsonb_build_object('display_name', r.name, 'kind', r.kind, 'org_type', r.org_type), now(), now());
    end if;
    update public.citizen_profiles set is_example = true where user_id = u;
    if exists (select 1 from public.citizen_profiles where user_id = u)
       and not exists (select 1 from public.citizen_proposals where author_id = u and topic_id = tid) then
      insert into public.citizen_proposals (author_id, topic_id, title, problem, action, legal, cost, tradeoffs, timeline, metric, source)
      values (u, tid, r.title, r.problem, r.action, r.legal, r.cost, r.tradeoffs, r.timeline, r.metric, 'https://example.org/pigi-deigmatos');
    end if;
  end loop;
end $$;
