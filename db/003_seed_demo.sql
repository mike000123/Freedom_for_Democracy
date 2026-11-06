-- ΜΟΝΟ φανταστικά δεδομένα δείγματος (is_example = true) για δοκιμή της διεπαφής.
-- Τα ονόματα και τα κείμενα δεν αντιπροσωπεύουν πραγματικά κόμματα ή θέσεις.
-- Ασφαλές να τρέξει ξανά: δεν διπλογράφει. Για να τα σβήσεις: delete from public.parties where is_example;

insert into public.topics (name, slug, "order") values
  ('Φορολογία', 'forologia', 0), ('Υγεία', 'ygeia', 1), ('Παιδεία', 'paideia', 2),
  ('Αγορά εργασίας', 'agora-ergasias', 3), ('Μετανάστευση', 'metanastefsi', 4),
  ('Ενέργεια και περιβάλλον', 'energeia-perivallon', 5), ('Στέγαση', 'stegasi', 6),
  ('Θεσμοί', 'thesmoi', 7), ('Εκλογικό σύστημα', 'eklogiko-systima', 8), ('Ευρώπη', 'evropi', 9)
on conflict (slug) do nothing;

insert into public.parties
  (name, slug, slogan, kind, tier, founded_year, responsible_persons, founders, funding, is_published, is_example)
select v.name, v.slug, 'Κείμενο δείγματος για δοκιμή της διεπαφής.', v.kind, v.tier, v.yr,
       'Όνομα Δείγμα Α' || chr(10) || 'Όνομα Δείγμα Β', 'Όνομα Δείγμα Α',
       'Φανταστική δήλωση χρηματοδότησης δείγματος.', true, true
  from (values
    ('Κόμμα Δείγμα Άλφα',  'komma-deigma-alfa',  'party', 'full', 2020),
    ('Κόμμα Δείγμα Βήτα',  'komma-deigma-vita',  'party', 'full', 2021),
    ('Κόμμα Δείγμα Γάμμα', 'komma-deigma-gamma', 'party', 'full', 2022),
    ('Κόμμα Δείγμα Δέλτα', 'komma-deigma-delta', 'party', 'full', 2023),
    ('Κόμμα Δείγμα Έψιλον','komma-deigma-epsilon','party','full', 2024),
    ('Κόμμα Δείγμα Ζήτα',  'komma-deigma-zita',  'party', 'full', 2020),
    ('Κόμμα Δείγμα Ήτα',   'komma-deigma-ita',   'party', 'full', 2021),
    ('Κόμμα Δείγμα Θήτα',  'komma-deigma-thita', 'party', 'full', 2022),
    ('Κόμμα Δείγμα Ιώτα',  'komma-deigma-iota',  'party', 'in_progress', 2023),
    ('Κόμμα Δείγμα Κάππα', 'komma-deigma-kappa', 'party', 'in_progress', 2023),
    ('Κόμμα Δείγμα Λάμδα', 'komma-deigma-lamda', 'party', 'in_progress', 2023),
    ('Ομάδα Δείγμα Μι',    'omada-deigma-mi',    'group', 'in_progress', null),
    ('Ομάδα Δείγμα Νι',    'omada-deigma-ni',    'group', 'in_progress', null),
    ('Ομάδα Δείγμα Ξι',    'omada-deigma-xi',    'group', 'in_progress', null)
  ) as v(name, slug, kind, tier, yr)
on conflict (slug) do nothing;

-- Κάθε κόμμα δείγματος δηλώνει θέση σε λίγα θέματα, ώστε να φαίνονται και τα κενά.
insert into public.proposals (party_id, topic_id, title, problem, action, legal, cost, tradeoffs, timeline, metric, source)
select p.id, t.id, 'Πρόταση δείγματος: ' || t.name, x.txt, x.txt, x.txt, x.txt, x.txt, x.txt, x.txt, 'https://example.org/pigi-deigmatos'
  from (select id, name, row_number() over (order by slug) - 1 as i from public.parties
         where is_example and slug <> 'komma-deigma-plires-profil') p
  join public.topics t on (p.i + t."order") % 3 = 0
 cross join lateral (select 'Κείμενο δείγματος του «' || p.name || '» για το θέμα «' || t.name || '». Δεν αντιπροσωπεύει πραγματική θέση.' as txt) x
 where not exists (select 1 from public.proposals q where q.party_id = p.id and q.topic_id = t.id);

-- Ένα κόμμα με πλήρες προφίλ: πρόσωπα, βίντεο, προτάσεις σε όλα τα θέματα, ιστορικό αλλαγών.
insert into public.parties
  (name, slug, slogan, kind, tier, founded_year, responsible_persons, founders, founders_prior_service, funding,
   website, facebook, instagram, x_url, youtube, tiktok, linkedin, is_published, is_example)
values
  ('Κόμμα Δείγμα Πλήρες Προφίλ', 'komma-deigma-plires-profil', 'Φανταστικό σύνθημα: λιγότερα λόγια, περισσότερα στοιχεία.',
   'party', 'full', 2024,
   'Ειρήνη Δείγμα' || chr(10) || 'Νικόλαος Παράδειγμα' || chr(10) || 'Μαρία Δοκιμή',
   'Ειρήνη Δείγμα' || chr(10) || 'Κώστας Υποθετικός' || chr(10) || 'Σοφία Φανταστική', true,
   'Φανταστική δήλωση: εθελοντικές συνδρομές μελών (έως 120 ευρώ ετησίως ανά μέλος) και μικρές δωρεές ιδιωτών. Δεν γίνονται δεκτές δωρεές από εταιρείες.',
   'https://example.org/kommadeigma', 'https://facebook.com/kommadeigma', 'https://instagram.com/kommadeigma',
   'https://x.com/kommadeigma', 'https://youtube.com/@kommadeigma', 'https://tiktok.com/@kommadeigma',
   'https://linkedin.com/company/kommadeigma', true, true)
on conflict (slug) do nothing;

insert into public.party_people (party_id, name, occupation, education, experience, public_office, office_details, motivation)
select p.id, v.name, v.occ, v.edu, v.exp, v.office, v.details, v.mot
  from public.parties p,
  (values
    ('Ειρήνη Δείγμα', 'Γεωπόνος', 'Πτυχίο Γεωπονίας, Πανεπιστήμιο Δείγματος', '12 χρόνια σε συνεταιρισμούς παραγωγών και προγράμματα νέων αγροτών', 'none', '', 'Θέλω οι αποφάσεις για την ύπαιθρο να παίρνονται με στοιχεία.'),
    ('Νικόλαος Παράδειγμα', 'Δικηγόρος', 'Νομική και μεταπτυχιακό δημοσίου δικαίου', 'Δικηγορία σε υποθέσεις διοικητικού δικαίου και εθελοντική νομική συνδρομή', 'held', 'Δημοτικός σύμβουλος, 2014-2019 (φανταστικός δήμος)', 'Οι κανόνες πρέπει να είναι ίδιοι για όλους και κατανοητοί.'),
    ('Μαρία Δοκιμή', 'Μηχανικός λογισμικού', 'Δίπλωμα Ηλεκτρολόγου Μηχανικού και Μηχανικού Υπολογιστών', 'Ανοιχτά δεδομένα και ψηφιακές υπηρεσίες για δήμους', 'none', '', 'Η διαφάνεια γίνεται πράξη όταν τα δεδομένα είναι ανοιχτά.'),
    ('Κώστας Υποθετικός', 'Εκπαιδευτικός', 'Πτυχίο Παιδαγωγικής, μεταπτυχιακό εκπαιδευτικής πολιτικής', 'Δευτεροβάθμια εκπαίδευση, συντονισμός σχολικών προγραμμάτων', 'party', 'Μέλος τοπικής επιτροπής άλλου φανταστικού κόμματος, 2016-2018', 'Θέλω ένα σχολείο που προετοιμάζει πολίτες, όχι μόνο υποψηφίους εξετάσεων.'),
    ('Σοφία Φανταστική', 'Οικονομολόγος', 'Μεταπτυχιακό στη δημόσια οικονομική', 'Ανάλυση προϋπολογισμών και κοστολόγηση δημοσίων πολιτικών', 'none', '', 'Κάθε πρόταση χρειάζεται τιμή και πηγή χρηματοδότησης.')
  ) as v(name, occ, edu, exp, office, details, mot)
 where p.slug = 'komma-deigma-plires-profil'
on conflict (party_id, name) do nothing;

insert into public.party_videos (party_id, url, title, position)
select p.id, v.url, v.title, v.pos
  from public.parties p,
  (values
    ('https://www.youtube.com/watch?v=demo0001', 'Παρουσίαση του κόμματος σε 3 λεπτά (δείγμα)', 0),
    ('https://www.youtube.com/watch?v=demo0002', 'Συζήτηση για την εκπαίδευση, ολόκληρη η εκδήλωση (δείγμα)', 1),
    ('https://youtu.be/demo0003', 'Πώς κοστολογούμε τις προτάσεις μας (δείγμα)', 2)
  ) as v(url, title, pos)
 where p.slug = 'komma-deigma-plires-profil'
   and not exists (select 1 from public.party_videos x where x.party_id = p.id);

insert into public.proposals (party_id, topic_id, title, problem, action, legal, cost, tradeoffs, timeline, metric, source)
select p.id, t.id, 'Η πρότασή μας για: ' || t.name,
       'Φανταστικό κείμενο για το θέμα «' || t.name || '». Το πρόβλημα είναι η έλλειψη μετρήσιμων στόχων.',
       'Προτείνεται ένα σαφές πρόγραμμα με αρχή, μέση και τέλος (φανταστικό).',
       'Απαιτείται τροποποίηση νόμου (φανταστική παραπομπή).',
       'Εκτιμώμενο κόστος 40 εκατ. ευρώ ετησίως, από αναδιάταξη υφιστάμενων δαπανών (φανταστικό).',
       'Μικρή αύξηση γραφειοκρατίας στην αρχή, μείωση μακροπρόθεσμα (φανταστικό).',
       'Πρώτα αποτελέσματα σε 18 μήνες, πλήρης εφαρμογή σε 4 χρόνια (φανταστικό).',
       'Ετήσια δημόσια αναφορά με 3 δείκτες (φανταστικό).', 'https://example.org/pigi-deigmatos'
  from public.parties p cross join public.topics t
 where p.slug = 'komma-deigma-plires-profil'
   and not exists (select 1 from public.proposals q where q.party_id = p.id and q.topic_id = t.id);

insert into public.change_log (party_id, summary)
select p.id, s.summary
  from public.parties p,
  (values ('Ενημερώθηκε το προφίλ: Σύνθημα, Χρηματοδότηση'), ('Ενημερώθηκε το βιογραφικό: Ειρήνη Δείγμα')) as s(summary)
 where p.slug = 'komma-deigma-plires-profil'
   and not exists (select 1 from public.change_log c where c.party_id = p.id);
