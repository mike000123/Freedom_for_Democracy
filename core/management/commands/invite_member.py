import secrets

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from core.models import Party, PartyMember


class Command(BaseCommand):
    help = (
        "Δημιουργεί λογαριασμό εκπροσώπου για ένα κόμμα και εκτυπώνει προσωρινό κωδικό. "
        "Ο δεύτερος παράγοντας ρυθμίζεται στην πρώτη είσοδο."
    )

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("party", help="Η ακριβής επωνυμία του κόμματος")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        try:
            party = Party.objects.get(name=options["party"])
        except Party.DoesNotExist:
            raise CommandError(f"Δεν βρέθηκε κόμμα «{options['party']}».")
        User = get_user_model()
        if User.objects.filter(username=email).exists():
            raise CommandError("Υπάρχει ήδη χρήστης με αυτό το email.")
        password = secrets.token_urlsafe(12)
        user = User(username=email, email=email)
        user.set_password(password)
        member = PartyMember(user=user, party=party)
        try:
            member.clean()
        except ValidationError as e:
            raise CommandError("; ".join(e.messages))
        user.save()
        member.user = user
        member.save()
        self.stdout.write(self.style.SUCCESS(f"Λογαριασμός για {party.name}: {email}"))
        self.stdout.write(f"Προσωρινός κωδικός: {password}")
        self.stdout.write("Στείλτε τον με ασφαλή τρόπο. Ο εκπρόσωπος ρυθμίζει το 2FA στην πρώτη είσοδο και αλλάζει κωδικό.")
