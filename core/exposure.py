"""Αλγόριθμος ισότιμης έκθεσης.

Κανόνας: εμφανίζονται πρώτα τα κόμματα με τις λιγότερες συσσωρευμένες εμφανίσεις.
Ισοπαλίες λύνονται τυχαία. Η σειρά εμφάνισης των επιλεγμένων είναι επίσης τυχαία,
ώστε η θέση στη σελίδα να μη δίνει πλεονέκτημα.

Δεν διαβάζει κλικ, δημοτικότητα, πληρωμές ή οποιοδήποτε άλλο σήμα.
"""
import random

from django.db.models import Count

from .models import Impression, Party


def eligible(kind, tier=None):
    qs = Party.objects.filter(is_published=True, graduated=False, kind=kind)
    if tier:
        qs = qs.filter(tier=tier)
    return qs


def pick(kind, tier=None, n=6, record=True, rng=None):
    rng = rng or random.SystemRandom()
    parties = list(eligible(kind, tier).annotate(imp=Count("impressions")))
    rng.shuffle(parties)                 # τυχαία ισοπαλία
    parties.sort(key=lambda p: p.imp)    # σταθερή ταξινόμηση: διατηρεί την τυχαία σειρά στις ισοπαλίες
    chosen = parties[:n]
    rng.shuffle(chosen)                  # τυχαία σειρά εμφάνισης
    if record and chosen:
        Impression.objects.bulk_create([Impression(party=p) for p in chosen])
    return chosen
