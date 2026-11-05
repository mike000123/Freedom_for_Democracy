"""Δημιουργεί ΜΟΝΟ φανταστικά δεδομένα δείγματος για δοκιμή της διεπαφής.

Τα ονόματα και τα κείμενα δεν αντιπροσωπεύουν πραγματικά κόμματα ή θέσεις.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import Party, PartyMember, Proposal, Topic

TOPICS = [
    "Φορολογία",
    "Υγεία",
    "Παιδεία",
    "Αγορά εργασίας",
    "Μετανάστευση",
    "Ενέργεια και περιβάλλον",
    "Στέγαση",
    "Θεσμοί",
    "Εκλογικό σύστημα",
    "Ευρώπη",
]

FULL = ["Άλφα", "Βήτα", "Γάμμα", "Δέλτα", "Έψιλον", "Ζήτα", "Ήτα", "Θήτα"]
PROGRESS = ["Ιώτα", "Κάππα", "Λάμδα"]
GROUPS = ["Μι", "Νι", "Ξι"]


def make_party(name, kind, tier, year):
    party, _ = Party.objects.get_or_create(
        name=name,
        defaults=dict(
            slogan="Κείμενο δείγματος για δοκιμή της διεπαφής.",
            kind=kind,
            tier=tier,
            founded_year=year,
            responsible_persons="Όνομα Δείγμα Α\nΌνομα Δείγμα Β",
            founders="Φανταστικοί ιδρυτές δείγματος.",
            funding="Φανταστική δήλωση χρηματοδότησης δείγματος.",
            is_published=True,
            is_example=True,
        ),
    )
    if not party.facebook and not party.instagram:  # εικονίδια δείγματος για έλεγχο της διεπαφής
        slug = f"demo{party.pk}"
        party.facebook = f"https://facebook.com/{slug}"
        party.instagram = f"https://instagram.com/{slug}"
        party.youtube = f"https://youtube.com/@{slug}"
        party.save(update_fields=["facebook", "instagram", "youtube"])
    if not party.people.exists():
        from core.models import PartyPerson

        PartyPerson.objects.create(
            party=party, name="Όνομα Δείγμα Α", occupation="Επάγγελμα δείγματος", education="Σπουδές δείγματος",
            experience="Εμπειρία δείγματος", motivation="Κείμενο δείγματος.", social_url=f"https://x.com/{slug}")
    return party


def make_proposal(party, topic):
    text = f"Κείμενο δείγματος του «{party.name}» για το θέμα «{topic.name}». Δεν αντιπροσωπεύει πραγματική θέση."
    Proposal.objects.get_or_create(
        party=party,
        topic=topic,
        defaults=dict(
            title=f"Πρόταση δείγματος: {topic.name}",
            problem=text,
            action=text,
            legal=text,
            cost=text,
            tradeoffs=text,
            timeline=text,
            metric=text,
            source="https://example.org/pigi-deigmatos",
        ),
    )


class Command(BaseCommand):
    help = "Φορτώνει τα 10 βασικά θέματα και φανταστικά κόμματα/ομάδες δείγματος."

    def add_arguments(self, parser):
        parser.add_argument(
            "--if-empty", action="store_true", help="Φόρτωση μόνο αν δεν υπάρχει κανένα κόμμα."
        )

    def handle(self, *args, **options):
        if options["if_empty"] and Party.objects.exists():
            return
        topics = []
        for i, name in enumerate(TOPICS):
            topic, _ = Topic.objects.get_or_create(
                name=name, defaults=dict(slug=f"t{i + 1}", order=i)
            )
            topics.append(topic)

        parties = []
        for i, n in enumerate(FULL):
            parties.append(make_party(f"Κόμμα Δείγμα {n}", Party.KIND_PARTY, Party.TIER_FULL, 2020 + i % 5))
        for i, n in enumerate(PROGRESS):
            parties.append(make_party(f"Κόμμα Δείγμα {n}", Party.KIND_PARTY, Party.TIER_PROGRESS, 2023))
        for n in GROUPS:
            parties.append(make_party(f"Ομάδα Δείγμα {n}", Party.KIND_GROUP, Party.TIER_PROGRESS, None))

        # Κάθε κόμμα δείγματος δηλώνει θέση σε λίγα θέματα, ώστε να φαίνονται και τα κενά
        for i, party in enumerate(parties):
            for j, topic in enumerate(topics):
                if (i + j) % 3 == 0:
                    make_proposal(party, topic)

        if settings.DEBUG:
            self.demo_member(parties[0])

        self.stdout.write(self.style.SUCCESS(f"Έτοιμα: {len(topics)} θέματα, {len(parties)} κόμματα/ομάδες δείγματος."))

    def demo_member(self, party):
        """Τοπικός λογαριασμός εκπροσώπου για δοκιμή της εισόδου (μόνο με DEBUG)."""
        User = get_user_model()
        if User.objects.filter(username="demo@example.org").exists():
            return
        user = User.objects.create_user("demo@example.org", "demo@example.org", "demo-kodikos-1")
        PartyMember.objects.create(user=user, party=party)
        self.stdout.write(f"Λογαριασμός δοκιμής εκπροσώπου: demo@example.org / demo-kodikos-1  ({party.name})")
