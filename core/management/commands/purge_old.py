from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import RateLimitHit


class Command(BaseCommand):
    help = "Διαγράφει τα κατακερματισμένα αναγνωριστικά ρυθμού που ξεπέρασαν την περίοδο διατήρησης."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=settings.FD_IP_RETENTION_HOURS)
        deleted, _ = RateLimitHit.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Διαγράφηκαν {deleted} εγγραφές.")
