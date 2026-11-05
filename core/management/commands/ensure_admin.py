import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Τοπική ανάπτυξη: δημιουργεί λογαριασμό διαχειριστή admin αν δεν υπάρχει κανένας."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stdout.write("Παραλείφθηκε: το ensure_admin δουλεύει μόνο με FD_DEBUG=1.")
            return
        User = get_user_model()
        if User.objects.filter(is_superuser=True).exists():
            return
        password = os.environ.get("FD_ADMIN_PASSWORD", "admin")
        User.objects.create_superuser("admin", "admin@example.org", password)
        self.stdout.write(f"Δημιουργήθηκε τοπικός διαχειριστής: admin / {password}  (μόνο για τοπική χρήση)")
