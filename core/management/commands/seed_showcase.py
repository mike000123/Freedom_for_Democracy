"""Συμπληρώνει πλήρως ένα φανταστικό κόμμα (προφίλ, πρόσωπα, social, βίντεο, εικόνα, προτάσεις) για έλεγχο της εμφάνισης."""
import io

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from core.models import ChangeLogEntry, Party, PartyPerson, PartyVideo, Proposal, Topic

NAME = "Κόμμα Δείγμα Πλήρες Προφίλ"
DEMO_PASSWORD = "demo-politis-1"  # μόνο για τοπική δοκιμή (DEBUG)


def prepare_user(user, created):
    """Σε τοπική λειτουργία (DEBUG) οι λογαριασμοί δείγματος έχουν γνωστό κωδικό, αλλιώς δεν μπορούν να συνδεθούν."""
    from django.conf import settings

    if settings.FD_DEMO_LOGINS:
        if created or not user.has_usable_password():
            user.set_password(DEMO_PASSWORD)
            user.save()
    elif created:
        user.set_unusable_password()
        user.save()

PEOPLE = [
    dict(name="Ειρήνη Δείγμα", occupation="Γεωπόνος", education="Πτυχίο Γεωπονίας, Πανεπιστήμιο Δείγματος",
         experience="12 χρόνια σε συνεταιρισμούς παραγωγών και προγράμματα νέων αγροτών",
         public_office="none", office_details="", motivation="Θέλω οι αποφάσεις για την ύπαιθρο να παίρνονται με στοιχεία.",
         social_url="https://www.linkedin.com/in/eirini-deigma"),
    dict(name="Νικόλαος Παράδειγμα", occupation="Δικηγόρος", education="Νομική και μεταπτυχιακό δημοσίου δικαίου",
         experience="Δικηγορία σε υποθέσεις διοικητικού δικαίου και εθελοντική νομική συνδρομή",
         public_office="held", office_details="Δημοτικός σύμβουλος, 2014-2019 (φανταστικός δήμος)",
         motivation="Οι κανόνες πρέπει να είναι ίδιοι για όλους και κατανοητοί.",
         social_url="https://x.com/nikolaos_deigma"),
    dict(name="Μαρία Δοκιμή", occupation="Μηχανικός λογισμικού", education="Δίπλωμα Ηλεκτρολόγου Μηχανικού και Μηχανικού Υπολογιστών",
         experience="Ανοιχτά δεδομένα και ψηφιακές υπηρεσίες για δήμους",
         public_office="none", office_details="", motivation="Η διαφάνεια γίνεται πράξη όταν τα δεδομένα είναι ανοιχτά.",
         social_url="https://www.instagram.com/maria_dokimi"),
    dict(name="Κώστας Υποθετικός", occupation="Εκπαιδευτικός", education="Πτυχίο Παιδαγωγικής, μεταπτυχιακό εκπαιδευτικής πολιτικής",
         experience="Δευτεροβάθμια εκπαίδευση, συντονισμός σχολικών προγραμμάτων",
         public_office="party", office_details="Μέλος τοπικής επιτροπής άλλου φανταστικού κόμματος, 2016-2018",
         motivation="Θέλω ένα σχολείο που προετοιμάζει πολίτες, όχι μόνο υποψηφίους εξετάσεων.",
         social_url="https://www.facebook.com/kostas.ypothetikos"),
    dict(name="Σοφία Φανταστική", occupation="Οικονομολόγος", education="Μεταπτυχιακό στη δημόσια οικονομική",
         experience="Ανάλυση προϋπολογισμών και κοστολόγηση δημοσίων πολιτικών",
         public_office="none", office_details="", motivation="Κάθε πρόταση χρειάζεται τιμή και πηγή χρηματοδότησης.",
         social_url=""),
]


def make_logo():
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (900, 540), "#16213A")
    d = ImageDraw.Draw(img)
    d.rectangle([60, 60, 840, 480], outline="#FFFFFF", width=6)
    d.ellipse([330, 130, 570, 370], fill="#B0432D")
    d.rectangle([360, 400, 540, 420], fill="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return ContentFile(buf.getvalue(), name="showcase.png")


class Command(BaseCommand):
    help = "Φανταστικό κόμμα με πλήρες προφίλ για έλεγχο της εμφάνισης (ασφαλές να τρέξει ξανά)."

    def handle(self, *args, **options):
        party, _ = Party.objects.get_or_create(name=NAME, defaults=dict(responsible_persons="x"))
        party.slogan = "Φανταστικό σύνθημα: λιγότερα λόγια, περισσότερα στοιχεία."
        party.kind = Party.KIND_PARTY
        party.tier = Party.TIER_FULL
        party.founded_year = 2024
        party.responsible_persons = "Ειρήνη Δείγμα\nΝικόλαος Παράδειγμα\nΜαρία Δοκιμή"
        party.founders = "Ειρήνη Δείγμα\nΚώστας Υποθετικός\nΣοφία Φανταστική"
        party.founders_prior_service = True
        party.funding = ("Φανταστική δήλωση: εθελοντικές συνδρομές μελών (έως 120 ευρώ ετησίως ανά μέλος) και μικρές δωρεές "
                         "ιδιωτών. Δεν γίνονται δεκτές δωρεές από εταιρείες. Οι οικονομικές καταστάσεις δημοσιεύονται κάθε εξάμηνο.")
        party.website = "https://example.org/kommadeigma"
        party.facebook = "https://facebook.com/kommadeigma"
        party.instagram = "https://instagram.com/kommadeigma"
        party.x_url = "https://x.com/kommadeigma"
        party.youtube = "https://youtube.com/@kommadeigma"
        party.tiktok = "https://tiktok.com/@kommadeigma"
        party.linkedin = "https://linkedin.com/company/kommadeigma"
        party.is_published = True
        party.is_example = True
        if not party.image:
            party.image.save("showcase.png", make_logo(), save=False)
        party.save()

        for p in PEOPLE:
            PartyPerson.objects.update_or_create(party=party, name=p["name"], defaults={k: v for k, v in p.items() if k != "name"})
        party.videos.all().delete()
        for i, (url, title) in enumerate([
            ("https://www.youtube.com/watch?v=demo0001", "Παρουσίαση του κόμματος σε 3 λεπτά (δείγμα)"),
            ("https://www.youtube.com/watch?v=demo0002", "Συζήτηση για την εκπαίδευση, ολόκληρη η εκδήλωση (δείγμα)"),
            ("https://youtu.be/demo0003", "Πώς κοστολογούμε τις προτάσεις μας (δείγμα)"),
        ]):
            PartyVideo.objects.create(party=party, url=url, title=title, position=i)

        for topic in Topic.objects.all():
            text = f"Φανταστικό κείμενο του «{party.name}» για το θέμα «{topic.name}». Δεν αντιπροσωπεύει πραγματική θέση."
            Proposal.objects.update_or_create(
                party=party, topic=topic,
                defaults=dict(
                    title=f"Η πρότασή μας για: {topic.name}",
                    problem=f"{text} Το πρόβλημα που περιγράφεται είναι η έλλειψη μετρήσιμων στόχων.",
                    action=f"{text} Προτείνεται ένα σαφές πρόγραμμα με αρχή, μέση και τέλος.",
                    legal="Απαιτείται τροποποίηση νόμου (φανταστική παραπομπή).",
                    cost="Εκτιμώμενο κόστος 40 εκατ. ευρώ ετησίως, από αναδιάταξη υφιστάμενων δαπανών (φανταστικό).",
                    tradeoffs="Μικρή αύξηση γραφειοκρατίας στην αρχή, μείωση μακροπρόθεσμα (φανταστικό).",
                    timeline="Πρώτα αποτελέσματα σε 18 μήνες, πλήρης εφαρμογή σε 4 χρόνια (φανταστικό).",
                    metric="Ετήσια δημόσια αναφορά με 3 δείκτες (φανταστικό).",
                    source="https://example.org/pigi-deigmatos", is_published=True))

        self.seed_citizens()
        self.seed_discussion()
        from django.db.models import Q

        Party.objects.filter(Q(name__startswith="Κόμμα Δείγμα") | Q(name__startswith="Ομάδα Δείγμα")).update(is_example=True)

        if not ChangeLogEntry.objects.filter(party=party).exists():
            ChangeLogEntry.objects.create(party=party, summary="Ενημερώθηκε το προφίλ: Σύνθημα, Χρηματοδότηση")
            ChangeLogEntry.objects.create(party=party, summary="Ενημερώθηκε το βιογραφικό: Ειρήνη Δείγμα")
        self.stdout.write("Λογαριασμοί πολιτών δείγματος (μόνο με FD_DEMO_LOGINS), κωδικός " + DEMO_PASSWORD + ": politis-deigma@example.org, kanali-deigma@example.org, anagnostis-0@example.org")
        self.stdout.write(self.style.SUCCESS(f"Έτοιμο: «{NAME}» με πρόσωπα, social, βίντεο και προτάσεις σε όλα τα θέματα."))

    def seed_citizens(self):
        """Δύο ενδεικτικές προτάσεις πολιτών (ένας πολίτης, ένα κανάλι) στο πρώτο θέμα. Σε DEBUG οι λογαριασμοί έχουν κωδικό demo-politis-1."""
        from django.contrib.auth import get_user_model
        from django.utils import timezone

        from core.models import CitizenProfile, CitizenProposal

        topic = Topic.objects.first()
        if not topic:
            return
        User = get_user_model()
        samples = [
            ("Πολίτης Δείγμα", CitizenProfile.PERSON, "", "politis-deigma@example.org", dict(
                title="Δημόσια αναφορά αποτελεσμάτων κάθε έξι μήνες",
                problem="Φανταστικό παράδειγμα: οι πολίτες δεν βλέπουν αν τα μέτρα πέτυχαν, γιατί δεν δημοσιεύονται μετρήσεις.",
                action="Κάθε υπουργείο δημοσιεύει ανά εξάμηνο τρεις δείκτες και τη σύγκρισή τους με τον στόχο, σε ανοιχτή μορφή.",
                legal="Αρκεί υπουργική απόφαση για τη μορφή και τα χρονοδιαγράμματα (φανταστική παραπομπή).",
                cost="Χαμηλό κόστος, περίπου 2 εκατ. ευρώ ετησίως, από υπάρχουσες υπηρεσίες στατιστικής (φανταστικό).",
                tradeoffs="Περισσότερη δουλειά για τις υπηρεσίες και πιθανή δυσφορία όταν οι δείκτες είναι κακοί (φανταστικό).",
                timeline="Πρώτη αναφορά σε 6 μήνες από την έναρξη ισχύος (φανταστικό).",
                metric="Ποσοστό μέτρων με δημοσιευμένο δείκτη, στόχος 90% σε δύο χρόνια (φανταστικό).")),
            ("Κανάλι Δείγμα", CitizenProfile.ORG, "youtube", "kanali-deigma@example.org", dict(
                title="Αξιολόγηση κάθε νέου μέτρου από ανεξάρτητη αρχή",
                problem="Φανταστικό παράδειγμα: νέα μέτρα εφαρμόζονται χωρίς εκ των προτέρων εκτίμηση του κόστους και των παρενεργειών.",
                action="Ανεξάρτητη αρχή εκδίδει σύντομη γνωμοδότηση πριν από κάθε νομοσχέδιο που ξεπερνά ορισμένο κόστος.",
                legal="Απαιτείται νέος νόμος που ορίζει τη σύνθεση και τις αρμοδιότητες της αρχής (φανταστική παραπομπή).",
                cost="Περίπου 8 εκατ. ευρώ ετησίως για προσωπικό και λειτουργία (φανταστικό).",
                tradeoffs="Επιβράδυνση της νομοθέτησης κατά λίγες εβδομάδες για μεγάλα νομοσχέδια (φανταστικό).",
                timeline="Σύσταση της αρχής σε 12 μήνες και πλήρης λειτουργία σε 24 (φανταστικό).",
                metric="Ποσοστό νομοσχεδίων με γνωμοδότηση πριν την ψήφιση (φανταστικό).")),
        ]
        for name, kind, org_type, email, fields in samples:
            user, created = User.objects.get_or_create(username=email, defaults={"email": email})
            prepare_user(user, created)
            profile, _ = CitizenProfile.objects.get_or_create(
                user=user, defaults=dict(display_name=name, kind=kind, org_type=org_type, verified_at=timezone.now(), is_example=True))
            if not profile.is_example:
                profile.is_example = True
                profile.save(update_fields=["is_example"])
            CitizenProposal.objects.update_or_create(
                author=profile, topic=topic, defaults=dict(source="https://example.org/pigi-deigmatos", **fields))

    def seed_discussion(self):
        """Δείγμα συζήτησης στην πρόταση της «Ομάδα Δείγμα Νι» στο πρώτο θέμα: υπέρ, κατά, ερώτηση, επίσημη απάντηση, αφαιρεμένο σχόλιο."""
        from datetime import timedelta

        from django.utils import timezone

        from core.models import CitizenProfile, Comment

        topic = Topic.objects.first()
        group = Party.objects.filter(name="Ομάδα Δείγμα Νι").first()
        prop = Proposal.objects.filter(party=group, topic=topic).first() if group and topic else None
        if not prop:
            return
        from django.contrib.auth import get_user_model

        User = get_user_model()

        def example_citizen(name, slug):
            user, created = User.objects.get_or_create(username=f"{slug}@example.org", defaults={"email": f"{slug}@example.org"})
            prepare_user(user, created)
            profile, _ = CitizenProfile.objects.get_or_create(
                user=user, defaults=dict(display_name=name, verified_at=timezone.now(), is_example=True))
            return profile

        verified = example_citizen("Πολίτης Δείγμα", "politis-deigma")
        accounts = {n: example_citizen(n, f"anagnostis-{i}") for i, n in enumerate(["Αναγνώστης Α", "Αναγνώστης Β", "Αναγνώστης Γ"])}
        now = timezone.now()
        items = [
            (Comment.FOR, "Αναγνώστης Α", None, None, 300, False, "",
             "Φανταστικό σχόλιο δείγματος: υποστηρίζω την πρόταση επειδή ορίζει σαφές χρονοδιάγραμμα και μέτρο επιτυχίας."),
            (Comment.AGAINST, "Πολίτης Δείγμα", verified, None, 240, False, "",
             "Φανταστικό σχόλιο δείγματος: το κόστος που δηλώνεται δεν δείχνει από πού θα χρηματοδοτηθεί. Θα ήθελα πηγή για την εκτίμηση."),
            (Comment.ASK, "Αναγνώστης Β", None, None, 180, False, "",
             "Φανταστικό ερώτημα δείγματος: ποιες ομάδες πολιτών θα επιβαρυνθούν περισσότερο τα δύο πρώτα χρόνια;"),
            (Comment.PLAIN, "Αναγνώστης Γ", None, None, 120, True, "Φανταστική αιτιολόγηση δείγματος: το σχόλιο περιείχε προσωπική επίθεση.",
             "Φανταστικό αφαιρεμένο σχόλιο δείγματος."),
            (Comment.PLAIN, "", None, group, 60, False, "",
             "Φανταστική επίσημη απάντηση δείγματος: οι χαμηλότερα αμειβόμενοι εξαιρούνται τα δύο πρώτα χρόνια. Θα προσθέσουμε πηγή χρηματοδότησης στην πρόταση."),
        ]
        question = None
        for kind, pseud, author, official, mins, removed, note, body in items:
            author = author or accounts.get(pseud)
            c, created = Comment.objects.get_or_create(
                proposal=prop, body=body,
                defaults=dict(kind=kind, pseudonym=pseud or group.name, author=author, official_party=official,
                              removed=removed, moderation_note=note, created_at=now - timedelta(minutes=mins)))
            if author and c.author_id != author.pk:
                c.author = author  # τα δείγματα ανήκουν σε επαληθευμένους λογαριασμούς, όπως στη κανονική λειτουργία
                c.save(update_fields=["author"])
            if kind == Comment.ASK:
                question = c
            if official and question and c.parent_id != question.pk:
                c.parent = question  # η επίσημη απάντηση εμφανίζεται κάτω από την ερώτηση
                c.save(update_fields=["parent"])
