-- Ερωτηματολόγιο προτιμήσεων: ερωτήματα δείγματος (ουδέτερες διατυπώσεις, να επανεξεταστούν πριν από δημόσια χρήση),
-- έλεγχος ότι η θέση μιας πρότασης ανήκει στο ίδιο θέμα, και θέσεις για τις προτάσεις των κομμάτων δείγματος.
-- Ασφαλές να ξανατρέξει: δεν αλλάζει ερωτήματα που υπάρχουν ούτε θέσεις που έχει δηλώσει κόμμα.

create or replace function public.trg_check_stance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stance_id is not null and not exists (
      select 1 from public.pref_options o join public.pref_questions pq on pq.id = o.question_id
       where o.id = new.stance_id and pq.topic_id = new.topic_id) then
    raise exception 'Η θέση πρέπει να ανήκει στο ίδιο θέμα με την πρόταση.';
  end if;
  return new;
end $$;
drop trigger if exists chk_stance on public.proposals;
create trigger chk_stance before insert or update on public.proposals for each row execute function public.trg_check_stance();

do $$
declare
  qs jsonb := '[
   {"slug":"forologia","q":"Τι πρέπει να έχει προτεραιότητα στη φορολογική πολιτική;","o":["Χαμηλότεροι συντελεστές, ακόμη και με λιγότερα δημόσια έσοδα","Μικρές αλλαγές στους συντελεστές και αυστηρότερη είσπραξη","Περισσότερα έσοδα για περισσότερες δημόσιες υπηρεσίες"]},
   {"slug":"ygeia","q":"Πώς πρέπει να ενισχυθεί το σύστημα υγείας;","o":["Κυρίως μέσω του δημόσιου συστήματος","Με συνεργασία δημόσιου και ιδιωτικού τομέα","Με έμφαση στην πρόληψη και την πρωτοβάθμια φροντίδα"]},
   {"slug":"paideia","q":"Ποια αλλαγή χρειάζεται πρώτα στην εκπαίδευση;","o":["Περισσότεροι πόροι και προσωπικό στα δημόσια σχολεία","Αλλαγή στο αναλυτικό πρόγραμμα και στην αξιολόγηση","Μεγαλύτερη αυτονομία των σχολείων και επιλογή από τους γονείς"]},
   {"slug":"agora-ergasias","q":"Τι πρέπει να προτεραιοποιηθεί στην αγορά εργασίας;","o":["Ισχυρότερη προστασία εργαζομένων και συλλογικές συμβάσεις","Μεγαλύτερη ευελιξία και ευκολότερες προσλήψεις","Επανεκπαίδευση και στήριξη στη μετάβαση σε νέες θέσεις"]},
   {"slug":"metanastefsi","q":"Ποιο πρέπει να είναι το βάρος της μεταναστευτικής πολιτικής;","o":["Αυστηρότεροι έλεγχοι και λιγότερες άδειες παραμονής","Νόμιμοι δρόμοι και ένταξη όσων μένουν","Μεγαλύτερος μοιρασμός ευθυνών μέσα στην Ευρωπαϊκή Ένωση"]},
   {"slug":"energeia-perivallon","q":"Πώς πρέπει να προχωρήσει η ενεργειακή μετάβαση;","o":["Γρήγορη στροφή στις ανανεώσιμες πηγές, ακόμη και με υψηλό αρχικό κόστος","Σταδιακή μετάβαση που κρατά χαμηλό το κόστος για τα νοικοκυριά","Αξιοποίηση και των εγχώριων πηγών ενέργειας"]},
   {"slug":"stegasi","q":"Τι πρέπει να κάνει πρώτα η πολιτική στέγασης;","o":["Περισσότερη κοινωνική και προσιτή κατοικία από το δημόσιο","Κίνητρα προς ιδιώτες για περισσότερη προσφορά κατοικιών","Ρυθμίσεις στην αγορά ενοικίων και στη βραχυχρόνια μίσθωση"]},
   {"slug":"thesmoi","q":"Ποια αλλαγή στους θεσμούς είναι η πιο επείγουσα;","o":["Ισχυρότερη ανεξαρτησία της δικαιοσύνης και των ελεγκτικών αρχών","Ταχύτερες και πιο ψηφιακές δημόσιες υπηρεσίες","Περισσότερη διαφάνεια στη χρηματοδότηση και στη λήψη αποφάσεων"]},
   {"slug":"eklogiko-systima","q":"Ποιο εκλογικό σύστημα προτιμάς;","o":["Σύστημα που ευνοεί τη σταθερή κυβέρνηση","Αναλογικό σύστημα με όσο γίνεται πιστή εκπροσώπηση","Μικτό σύστημα με στοιχεία και από τα δύο"]},
   {"slug":"evropi","q":"Ποια πρέπει να είναι η σχέση με την Ευρωπαϊκή Ένωση;","o":["Βαθύτερη ενοποίηση με περισσότερες κοινές πολιτικές","Συνεργασία που κρατά τον εθνικό έλεγχο σε βασικούς τομείς","Επιλεκτική συμμετοχή ανά πολιτική"]}
  ]';
  item jsonb; tid int; qid int; opt text; i int;
begin
  for item in select * from jsonb_array_elements(qs) loop
    select id into tid from public.topics where slug = item->>'slug';
    continue when tid is null;
    insert into public.pref_questions (topic_id, text) values (tid, item->>'q') on conflict (topic_id) do nothing;
    select id into qid from public.pref_questions where topic_id = tid;
    if not exists (select 1 from public.pref_options where question_id = qid) then
      i := 0;
      for opt in select jsonb_array_elements_text(item->'o') loop
        insert into public.pref_options (question_id, text, "order") values (qid, opt, i);
        i := i + 1;
      end loop;
    end if;
  end loop;

  -- Θέσεις για τις προτάσεις των κομμάτων δείγματος (σταθερή, ψευδοτυχαία κατανομή).
  update public.proposals p set stance_id = (
      select o.id from public.pref_options o join public.pref_questions pq on pq.id = o.question_id
       where pq.topic_id = p.topic_id
       order by o."order" offset (abs(hashtext(p.party_id::text || p.topic_id::text)) % 3) limit 1)
   where p.stance_id is null and exists (select 1 from public.parties pa where pa.id = p.party_id and pa.is_example);
end $$;
