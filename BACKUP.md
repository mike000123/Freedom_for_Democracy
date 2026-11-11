# Αντίγραφα ασφαλείας (Supabase)

Η βάση δεν έχει αυτόματη επαναφορά σε χρονική στιγμή στο πλάνο Nano. Κράτα τακτικά δικό σου αντίγραφο.

## Τι χρειάζεσαι
- PostgreSQL client tools (`pg_dump`). Windows: https://www.postgresql.org/download/windows/ (αρκεί το «Command Line Tools»).
- Το connection string: Supabase → Project Settings → Database → Connection string → «Session pooler» (URI). Αντικατάστησε το `[YOUR-PASSWORD]` με τον κωδικό της βάσης (Database → Reset password αν τον έχεις ξεχάσει).

## Εντολή
```
pg_dump "ΤΟ_CONNECTION_STRING" --no-owner --no-privileges --schema=public -F c -f backup_ΗΜΕΡΟΜΗΝΙΑ.dump
```
Δημιουργεί αρχείο `.dump` με όλους τους πίνακες του `public` (κόμματα, προτάσεις, συζητήσεις, μηνύματα, κ.λπ.).

Για αναγνώσιμο SQL αντί για `.dump`: αντικατάστησε `-F c -f backup.dump` με `-f backup.sql`.

## Επαναφορά (σε κενή βάση ή νέο project)
```
pg_restore --no-owner -d "ΤΟ_CONNECTION_STRING" backup_ΗΜΕΡΟΜΗΝΙΑ.dump
```

## Σημειώσεις
- Οι λογαριασμοί χρηστών (πίνακας `auth.users`) δεν περιλαμβάνονται στο `--schema=public`. Για πλήρες αντίγραφο πρόσθεσε `--schema=auth`. Αντικείμενα αποθήκευσης (εικόνες) είναι ξεχωριστά: Storage → κατέβασμα ή `supabase` CLI.
- Κράτα τα αρχεία σε ασφαλές μέρος (κρυπτογραφημένος δίσκος): περιέχουν email χρηστών και μηνύματα. Όχι στο GitHub.
- Συνιστώμενη συχνότητα: εβδομαδιαία, και πριν από κάθε χειροκίνητο SQL που αλλάζει δεδομένα.
- Εναλλακτικά: αναβάθμιση σε πλάνο Pro με ημερήσια αυτόματα backups.
- Οι αλλαγές στη δομή υπάρχουν ήδη ως αρχεία στον φάκελο `db/`.
