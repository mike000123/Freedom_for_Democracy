-- 028: ΠΡΟΑΙΡΕΤΙΚΟ — πριν το δημόσιο launch.
-- Αποσύρει (is_published = false) όλα τα προφίλ ΠΡΑΓΜΑΤΙΚΩΝ κομμάτων που δεν έχουν επιβεβαιωθεί από το ίδιο το κόμμα,
-- μαζί με τις προτάσεις τους. Τα παραδείγματα (is_example) δεν επηρεάζονται.
-- Όταν ένα κόμμα επιβεβαιώσει, ο διαχειριστής βάζει «Επιβεβαιωμένο από το κόμμα» και το δημοσιεύει ξανά από τη Διαχείριση.

-- Βήμα 1 — δες ποια επηρεάζονται (τρέξε μόνο αυτό πρώτα):
select name, kind, is_published, profile_source
from public.parties
where not is_example and profile_source = 'public_sources'
order by name;

-- Βήμα 2 — εφαρμογή (αφαίρεσε το σχόλιο όταν είσαι έτοιμος):
-- update public.proposals set is_published = false
--  where party_id in (select id from public.parties where not is_example and profile_source = 'public_sources');
-- update public.parties set is_published = false
--  where not is_example and profile_source = 'public_sources';
