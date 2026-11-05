"""Πίνακας ενεργοποίησης λειτουργιών.

Κάθε λειτουργία έχει κατάσταση: off (ανενεργή), test (ορατή μόνο σε διαχειριστές) ή on (ενεργή για όλους).
Οι λειτουργίες ορίζονται εδώ· η κατάστασή τους αλλάζει από τη Διαχείριση και κάθε αλλαγή καταγράφεται
(ποιος, πότε, από ποια σε ποια κατάσταση) και φαίνεται δημόσια στη σελίδα Διαφάνεια.
"""

DEFAULTS = {
    # key: (τίτλος, περιγραφή, αρχική κατάσταση)
    "applications": ("Αιτήσεις συμμετοχής", "Δημόσια φόρμα αίτησης κόμματος ή ομάδας (/aitisi/).", "on"),
    "comparison": ("Σύγκριση κομμάτων", "Σύγκριση θέσεων κομμάτων δίπλα-δίπλα ανά θέμα.", "on"),
    "citizen_accounts": ("Λογαριασμοί πολιτών", "Σχόλια, ερωτήματα και προτάσεις απαιτούν λογαριασμό με επαληθευμένο email. Αν είναι ανενεργή, η υποβολή γίνεται ανώνυμα με ψευδώνυμο.", "on"),
    "citizen_proposals": ("Προτάσεις πολιτών", "Οι πολίτες και οι οργανισμοί υποβάλλουν δομημένες προτάσεις, μία ανά θέμα. Απαιτεί «Λογαριασμοί πολιτών».", "on"),
    "notifications": ("Ειδοποιήσεις", "Ειδοποίηση email για νέα απάντηση ή αλλαγή σε προφίλ που παρακολουθείτε.", "off"),
    "questionnaire": ("Ερωτηματολόγιο προτιμήσεων", "Ανώνυμο ερωτηματολόγιο που δείχνει ποιες θέσεις ταιριάζουν, χωρίς κατάταξη κομμάτων.", "off"),
    "taxisnet": ("Επαλήθευση πολίτη (gov.gr)", "Προαιρετική επαλήθευση ταυτότητας μέσω gov.gr.", "off"),
    "eudi": ("Ψηφιακό πορτοφόλι EUDI", "Προαιρετική επαλήθευση μέσω του ευρωπαϊκού πορτοφολιού ταυτότητας.", "off"),
    "donations": ("Δωρεές στην πλατφόρμα", "Δωρεές προς την πλατφόρμα, χωρίς καμία επιρροή στην έκθεση κομμάτων.", "off"),
    "subscriptions": ("Συνδρομές", "Προαιρετικές συνδρομές υποστηρικτών της πλατφόρμας.", "off"),
}


def ensure_flags():
    from .models import FeatureFlag

    for key, (label, description, state) in DEFAULTS.items():
        FeatureFlag.objects.get_or_create(key=key, defaults={"label": label, "description": description, "state": state})


def enabled(request, key):
    """True αν η λειτουργία είναι on, ή test και ο χρήστης είναι διαχειριστής. Άγνωστη λειτουργία: False."""
    from .models import FeatureFlag

    state = FeatureFlag.objects.filter(key=key).values_list("state", flat=True).first()
    if state is None and key in DEFAULTS:
        ensure_flags()
        state = FeatureFlag.objects.filter(key=key).values_list("state", flat=True).first()
    if state == FeatureFlag.ON:
        return True
    if state == FeatureFlag.TEST:
        user = getattr(request, "user", None)
        return bool(user and user.is_active and user.is_staff)
    return False
