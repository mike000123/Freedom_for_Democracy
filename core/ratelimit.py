"""Όρια ρυθμού ανά διεύθυνση δικτύου, χωρίς αποθήκευση της αρχικής διεύθυνσης.

Αποθηκεύεται μόνο HMAC της IP με μυστικό κλειδί. Οι εγγραφές διαγράφονται από
την εντολή `purge_old` (προεπιλογή 24 ώρες, προς νομική επιβεβαίωση).

Πίσω από reverse proxy πρέπει να ρυθμιστεί σωστά το REMOTE_ADDR (ή να προστεθεί
αξιόπιστη επικεφαλίδα), αλλιώς όλοι θα μετρούν ως ένας χρήστης.

Πεδίο εφαρμογής (scope): "submit" για σχόλια/ερωτήματα/αναφορές, "login" για
αποτυχημένες προσπάθειες εισόδου κομμάτων.
"""
import hashlib
import hmac
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import RateLimitHit


def ip_hash(request):
    ip = request.META.get("REMOTE_ADDR", "")
    return hmac.new(settings.FD_IP_HASH_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()


def allowed(request, scope="submit", hour=None, day=None):
    """Επιστρέφει (επιτρέπεται, μήνυμα) χωρίς να καταγράψει τίποτα."""
    hour = settings.FD_RATE_HOUR if hour is None else hour
    day = settings.FD_RATE_DAY if day is None else day
    hits = RateLimitHit.objects.filter(ip_hash=ip_hash(request), scope=scope)
    now = timezone.now()
    if hits.filter(created_at__gte=now - timedelta(hours=1)).count() >= hour:
        return False, f"Έχετε φτάσει το όριο των {hour} προσπαθειών ανά ώρα. Δοκιμάστε αργότερα."
    if hits.filter(created_at__gte=now - timedelta(days=1)).count() >= day:
        return False, f"Έχετε φτάσει το όριο των {day} προσπαθειών ανά ημέρα."
    return True, ""


def record(request, scope="submit"):
    RateLimitHit.objects.create(ip_hash=ip_hash(request), scope=scope)


def check_and_record(request, scope="submit", hour=None, day=None):
    ok, msg = allowed(request, scope, hour, day)
    if ok:
        record(request, scope)
    return ok, msg
