from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.text import slugify


@deconstructible
class MaxWords:
    """Όριο λέξεων ανά πεδίο (150 στις δομημένες προτάσεις)."""

    def __init__(self, limit):
        self.limit = limit

    def __call__(self, value):
        if len((value or "").split()) > self.limit:
            raise ValidationError(f"Έως {self.limit} λέξεις.")

    def __eq__(self, other):
        return isinstance(other, MaxWords) and other.limit == self.limit


class Topic(models.Model):
    name = models.CharField("Θέμα", max_length=80, unique=True)
    slug = models.CharField(max_length=80, unique=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "Θέμα"
        verbose_name_plural = "Θέματα"

    def __str__(self):
        return self.name


class Party(models.Model):
    KIND_PARTY = "party"
    KIND_GROUP = "group"
    KINDS = [(KIND_PARTY, "Κόμμα"), (KIND_GROUP, "Ομάδα υπό σύσταση")]

    TIER_PROGRESS = "in_progress"
    TIER_FULL = "full"
    TIERS = [(TIER_PROGRESS, "Προφίλ σε εξέλιξη"), (TIER_FULL, "Πλήρες προφίλ")]

    name = models.CharField("Επωνυμία", max_length=120, unique=True)
    slug = models.CharField(max_length=140, unique=True, editable=False)
    slogan = models.CharField("Σύνθημα (έως 120 χαρακτήρες)", max_length=120, blank=True)
    kind = models.CharField("Είδος", max_length=10, choices=KINDS, default=KIND_PARTY)
    tier = models.CharField("Βαθμίδα προφίλ", max_length=12, choices=TIERS, default=TIER_PROGRESS)
    founded_year = models.PositiveSmallIntegerField("Έτος ίδρυσης", null=True, blank=True)
    responsible_persons = models.TextField(
        "Υπεύθυνα πρόσωπα (1-3, ένα όνομα ανά γραμμή)",
        help_text="Επαληθευμένα μέσω υπεύθυνης δήλωσης gov.gr.",
    )
    founders = models.TextField("Ιδρυτές", blank=True)
    founders_prior_service = models.BooleanField(
        "Ιδρυτές με προηγούμενη κοινοβουλευτική θητεία", default=False
    )
    funding = models.TextField("Πηγές χρηματοδότησης (δημόσια δήλωση)", blank=True)
    website = models.URLField("Επίσημη ιστοσελίδα", blank=True)
    is_example = models.BooleanField("Παράδειγμα (φανταστικά στοιχεία)", default=False,
                                     help_text="Εμφανίζεται με ετικέτα «Παράδειγμα» σε όλες τις σελίδες.")
    facebook = models.URLField("Facebook", blank=True)
    instagram = models.URLField("Instagram", blank=True)
    x_url = models.URLField("X (Twitter)", blank=True)
    youtube = models.URLField("YouTube", blank=True)
    tiktok = models.URLField("TikTok", blank=True)
    linkedin = models.URLField("LinkedIn", blank=True)
    image = models.ImageField(
        "Φωτογραφία ομάδας ή λογότυπο", upload_to="party_images/", blank=True,
        help_text="JPG, PNG ή WebP, έως 2 MB. Αφαιρούνται αυτόματα τα μεταδεδομένα της φωτογραφίας (π.χ. τοποθεσία).",
    )
    is_published = models.BooleanField("Δημοσιευμένο", default=False)
    graduated = models.BooleanField(
        "Απόφοιτο (εισήλθε στη Βουλή)",
        default=False,
        help_text="Το προφίλ μένει, αλλά το κόμμα βγαίνει από την ισότιμη εναλλαγή.",
    )
    moderation_note = models.TextField(
        "Αιτιολόγηση απόφασης (δημοσιεύεται στο αρχείο αποφάσεων)", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Κόμμα / ομάδα"
        verbose_name_plural = "Κόμματα και ομάδες"

    def __str__(self):
        return self.name

    def clean(self):
        persons = self.person_list
        if not 1 <= len(persons) <= 3:
            raise ValidationError({"responsible_persons": "Απαιτούνται 1 έως 3 υπεύθυνα πρόσωπα."})

    @property
    def n_proposals(self):
        return self.proposals.filter(is_published=True).count()

    @property
    def person_list(self):
        return [line.strip() for line in (self.responsible_persons or "").splitlines() if line.strip()]

    @property
    def kind_label(self):
        return "κόμμα" if self.kind == self.KIND_PARTY else "σχήμα"

    @property
    def founder_list(self):
        return [line.strip() for line in (self.founders or "").splitlines() if line.strip()]

    SOCIALS = [
        ("facebook", "Facebook", ("facebook.com", "fb.com", "fb.me")),
        ("instagram", "Instagram", ("instagram.com",)),
        ("x_url", "X", ("x.com", "twitter.com")),
        ("youtube", "YouTube", ("youtube.com", "youtu.be")),
        ("tiktok", "TikTok", ("tiktok.com",)),
        ("linkedin", "LinkedIn", ("linkedin.com",)),
    ]

    @property
    def social_links(self):
        return [(key, label, getattr(self, key)) for key, label, _ in self.SOCIALS if getattr(self, key)]

    def bio_for(self, name):
        return next((p for p in self.people.all() if p.name == name), None)

    @property
    def people_cards(self):
        """Κάθε όνομα (υπεύθυνα πρόσωπα και ιδρυτές) με το βιογραφικό του, αν υπάρχει."""
        people = list(self.people.all())
        by_name = {p.name: p for p in people}
        out = []
        for role, names in (("Υπεύθυνο πρόσωπο", self.person_list), ("Ιδρυτής", self.founder_list)):
            for n in names:
                out.append({"name": n, "role": role, "person": by_name.get(n), "id": f"pp{len(out)}"})
        return out

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name, allow_unicode=True) or "party"
            slug, n = base, 2
            while Party.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)


class Proposal(models.Model):
    """Δομημένη πρόταση: πρόβλημα → πρόταση → κόστος → αντισταθμίσματα."""

    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="proposals")
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="proposals")
    title = models.CharField("Τίτλος (η δράση σε μία πρόταση)", max_length=200)
    problem = models.TextField("Πρόβλημα (με πηγή ή δεδομένο)", validators=[MaxWords(150)])
    action = models.TextField("Πρόταση (τι αλλάζει και ποιος το υλοποιεί)", validators=[MaxWords(150)])
    legal = models.TextField("Νομικό πλαίσιο", validators=[MaxWords(150)])
    cost = models.TextField("Κόστος και χρηματοδότηση", validators=[MaxWords(150)])
    tradeoffs = models.TextField("Αντισταθμίσματα (ποιος χάνει ή τι θυσιάζεται)", validators=[MaxWords(150)])
    timeline = models.TextField("Χρονοδιάγραμμα", validators=[MaxWords(150)])
    metric = models.TextField("Μέτρο επιτυχίας", validators=[MaxWords(150)])
    source = models.URLField("Πηγή τεκμηρίωσης (σύνδεσμος)", blank=True)
    is_published = models.BooleanField("Δημοσιευμένη", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["topic__order", "title"]
        verbose_name = "Δομημένη πρόταση"
        verbose_name_plural = "Δομημένες προτάσεις"

    def __str__(self):
        return f"{self.party}: {self.title}"

    # Πεδία με την σειρά εμφάνισης (για πρότυπα)
    FIELDS = [
        ("problem", "Πρόβλημα"),
        ("action", "Πρόταση"),
        ("legal", "Νομικό πλαίσιο"),
        ("cost", "Κόστος και χρηματοδότηση"),
        ("tradeoffs", "Αντισταθμίσματα"),
        ("timeline", "Χρονοδιάγραμμα"),
        ("metric", "Μέτρο επιτυχίας"),
    ]

    @property
    def sections(self):
        return [(label, getattr(self, name)) for name, label in self.FIELDS]


class Question(models.Model):
    """Ερώτημα πολιτών ανά θέμα (στο MVP μόνο ερωτήματα, όχι προτάσεις)."""

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="questions")
    pseudonym = models.CharField("Ψευδώνυμο", max_length=40)
    body = models.TextField("Ερώτημα (έως 150 λέξεις)", max_length=1500, validators=[MaxWords(150)])
    created_at = models.DateTimeField(default=timezone.now)
    removed = models.BooleanField("Αφαιρέθηκε", default=False)
    moderation_note = models.TextField("Αιτιολόγηση αφαίρεσης", blank=True)
    author = models.ForeignKey("CitizenProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="questions")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Ερώτημα πολίτη"
        verbose_name_plural = "Ερωτήματα πολιτών"

    def __str__(self):
        return self.body[:60]


class Comment(models.Model):
    FOR, AGAINST, ASK, PLAIN = "for", "against", "question", "comment"
    KINDS = [
        (FOR, "Υπέρ (με επιχείρημα)"),
        (AGAINST, "Κατά (με επιχείρημα)"),
        (ASK, "Ερώτηση προς το κόμμα"),
        (PLAIN, "Σχόλιο"),
    ]

    proposal = models.ForeignKey(Proposal, null=True, blank=True, on_delete=models.CASCADE, related_name="comments")
    question = models.ForeignKey(Question, null=True, blank=True, on_delete=models.CASCADE, related_name="comments")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies",
                               verbose_name="Απάντηση στο σχόλιο")
    kind = models.CharField("Τύπος", max_length=10, choices=KINDS)
    pseudonym = models.CharField("Ψευδώνυμο", max_length=40)
    body = models.TextField("Κείμενο", max_length=1000)
    delete_code_hash = models.CharField(max_length=64, editable=False, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    removed = models.BooleanField("Αφαιρέθηκε", default=False)
    removed_by_author = models.BooleanField(default=False, editable=False)
    moderation_note = models.TextField("Αιτιολόγηση αφαίρεσης (δημόσια)", blank=True)
    report_count = models.PositiveIntegerField(default=0, editable=False)
    author = models.ForeignKey("CitizenProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="comments")
    official_party = models.ForeignKey(
        Party,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="official_replies",
        verbose_name="Επίσημη απάντηση από",
    )

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Σχόλιο"
        verbose_name_plural = "Σχόλια"

    def __str__(self):
        return f"{self.pseudonym}: {self.body[:40]}"

    def clean(self):
        if bool(self.proposal_id) == bool(self.question_id):
            raise ValidationError("Το σχόλιο ανήκει είτε σε πρόταση είτε σε ερώτημα.")


class Impression(models.Model):
    """Μία εμφάνιση κόμματος στην αρχική. Η εναλλαγή βασίζεται μόνο σε αυτό το μέτρημα."""

    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="impressions")
    shown_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        verbose_name = "Εμφάνιση"
        verbose_name_plural = "Εμφανίσεις"


class RateLimitHit(models.Model):
    """Κατακερματισμένο αναγνωριστικό δικτύου για όρια ρυθμού. Σύντομη διατήρηση (purge_old)."""

    ip_hash = models.CharField(max_length=64, db_index=True)
    scope = models.CharField(max_length=10, default="submit", db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)


class Decision(models.Model):
    """Δημόσιο αρχείο αποφάσεων (αποδοχή, απόρριψη, αφαίρεση) με αιτιολόγηση."""

    ACCEPTED, REJECTED, REMOVED = "accepted", "rejected", "removed"
    KINDS = [(ACCEPTED, "Αποδοχή"), (REJECTED, "Απόρριψη"), (REMOVED, "Αφαίρεση")]

    decided_at = models.DateTimeField(default=timezone.now)
    subject = models.CharField("Αντικείμενο", max_length=200)
    decision = models.CharField(max_length=10, choices=KINDS)
    reason = models.TextField("Αιτιολόγηση")

    class Meta:
        ordering = ["-decided_at"]
        verbose_name = "Απόφαση"
        verbose_name_plural = "Αρχείο αποφάσεων"

    def __str__(self):
        return f"{self.get_decision_display()}: {self.subject}"


class PartyMember(models.Model):
    """Λογαριασμός εκπροσώπου κόμματος (έως 3 ανά κόμμα, όπως τα υπεύθυνα πρόσωπα)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="membership")
    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="members")

    class Meta:
        verbose_name = "Εκπρόσωπος κόμματος"
        verbose_name_plural = "Εκπρόσωποι κομμάτων"

    def __str__(self):
        return f"{self.user} → {self.party}"

    def clean(self):
        others = PartyMember.objects.filter(party_id=self.party_id).exclude(pk=self.pk).count()
        if others >= 3:
            raise ValidationError("Κάθε κόμμα έχει έως 3 λογαριασμούς εκπροσώπων.")


class TotpDevice(models.Model):
    """Δεύτερος παράγοντας (TOTP). Το μυστικό πρέπει να κρυπτογραφείται σε παραγωγή."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="totp")
    secret = models.CharField(max_length=32)
    confirmed = models.BooleanField(default=False)
    last_counter = models.BigIntegerField(default=0)


class ChangeLogEntry(models.Model):
    """Δημόσιο, αυτόματο ιστορικό αλλαγών του προφίλ και των προτάσεων ενός κόμματος."""

    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="changes")
    at = models.DateTimeField(default=timezone.now)
    summary = models.CharField(max_length=300)
    details = models.JSONField("Αλλαγές ανά πεδίο", default=list, blank=True)

    class Meta:
        ordering = ["-at"]
        verbose_name = "Καταγραφή αλλαγής"
        verbose_name_plural = "Ιστορικό αλλαγών"


class PartyApplication(models.Model):
    """Αίτηση συμμετοχής κόμματος ή ομάδας. Ο έλεγχος και η δημοσίευση γίνονται από τη διαχείριση."""

    PENDING, CHANGES, APPROVED, REJECTED = "pending", "changes", "approved", "rejected"
    STATES = [
        (PENDING, "Σε αναμονή ελέγχου"),
        (CHANGES, "Ζητήθηκαν διευκρινίσεις"),
        (APPROVED, "Εγκρίθηκε (δημιουργήθηκε προφίλ)"),
        (REJECTED, "Απορρίφθηκε"),
    ]

    name = models.CharField("Επωνυμία κόμματος ή ομάδας", max_length=120)
    kind = models.CharField("Είδος", max_length=10, choices=Party.KINDS, default=Party.KIND_PARTY)
    responsible_persons = models.TextField("Υπεύθυνα πρόσωπα (1-3, ένα όνομα ανά γραμμή)")
    contact_email = models.EmailField("Email επικοινωνίας")
    elections_statement = models.TextField(
        "Δήλωση για την κοινοβουλευτική εκπροσώπηση",
        help_text="Αναφέρετε αν το κόμμα ή συνασπισμός εκπροσωπήθηκε στις δύο τελευταίες εθνικές και στις τελευταίες ευρωεκλογές.",
        max_length=1500,
    )
    website = models.URLField("Επίσημη ιστοσελίδα", blank=True)
    state = models.CharField("Κατάσταση", max_length=10, choices=STATES, default=PENDING)
    admin_note = models.TextField("Σημείωση ελέγχου (εσωτερική)", blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    party = models.OneToOneField(Party, null=True, blank=True, on_delete=models.SET_NULL, related_name="application")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Αίτηση συμμετοχής"
        verbose_name_plural = "Αιτήσεις συμμετοχής"

    def __str__(self):
        return f"{self.name} ({self.get_state_display()})"

    def clean(self):
        persons = [p for p in (self.responsible_persons or "").splitlines() if p.strip()]
        if not 1 <= len(persons) <= 3:
            raise ValidationError({"responsible_persons": "Απαιτούνται 1 έως 3 υπεύθυνα πρόσωπα."})


class FeatureFlag(models.Model):
    """Κατάσταση μιας λειτουργίας του ιστότοπου (off / test / on)."""

    OFF, TEST, ON = "off", "test", "on"
    STATES = [(OFF, "Ανενεργή"), (TEST, "Δοκιμή (μόνο διαχειριστές)"), (ON, "Ενεργή")]

    key = models.SlugField("Κωδικός", max_length=40, unique=True, editable=False)
    label = models.CharField("Λειτουργία", max_length=120, editable=False)
    description = models.TextField("Περιγραφή", blank=True, editable=False)
    state = models.CharField("Κατάσταση", max_length=5, choices=STATES, default=OFF)
    version = models.PositiveIntegerField("Έκδοση", default=1, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["key"]
        verbose_name = "Λειτουργία"
        verbose_name_plural = "Πίνακας λειτουργιών"

    def __str__(self):
        return f"{self.label}: {self.get_state_display()}"


class FeatureChange(models.Model):
    """Δημόσιο αρχείο αλλαγών κατάστασης λειτουργιών."""

    flag = models.ForeignKey(FeatureFlag, on_delete=models.CASCADE, related_name="changes")
    at = models.DateTimeField(default=timezone.now)
    old_state = models.CharField(max_length=5)
    new_state = models.CharField(max_length=5)
    version = models.PositiveIntegerField()
    by = models.CharField("Από", max_length=150, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        verbose_name = "Αλλαγή λειτουργίας"
        verbose_name_plural = "Αλλαγές λειτουργιών"


class CitizenProfile(models.Model):
    """Λογαριασμός πολίτη ή οργανισμού (κανάλι, εκπομπή, ομάδα) με επαληθευμένο email."""

    PERSON, ORG = "person", "organization"
    KINDS = [(PERSON, "Πολίτης"), (ORG, "Κανάλι, εκπομπή ή ομάδα")]
    ORG_TYPES = [
        ("youtube", "Κανάλι YouTube"),
        ("show", "Εκπομπή"),
        ("group", "Ομάδα ή κίνηση"),
        ("other", "Άλλο"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="citizen")
    display_name = models.CharField("Όνομα που εμφανίζεται δημόσια", max_length=40, unique=True)
    kind = models.CharField("Τύπος λογαριασμού", max_length=12, choices=KINDS, default=PERSON)
    org_type = models.CharField("Είδος", max_length=10, choices=ORG_TYPES, blank=True)
    contact_person = models.CharField("Πρόσωπο επικοινωνίας (δεν δημοσιεύεται)", max_length=120, blank=True)
    is_example = models.BooleanField("Παράδειγμα (φανταστικά στοιχεία)", default=False)
    consent_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "Λογαριασμός πολίτη"
        verbose_name_plural = "Λογαριασμοί πολιτών"

    def __str__(self):
        return self.display_name

    @property
    def verified(self):
        return self.verified_at is not None

    @property
    def public_label(self):
        if self.kind == self.ORG:
            return self.get_org_type_display() or "Οργανισμός"
        return "Πολίτης"


class CitizenProposal(models.Model):
    """Δομημένη πρόταση πολίτη ή οργανισμού. Δεν εκπροσωπεί κόμμα. Μία ανά θέμα και λογαριασμό."""

    author = models.ForeignKey(CitizenProfile, on_delete=models.CASCADE, related_name="proposals")
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="citizen_proposals")
    title = models.CharField("Τίτλος (η δράση σε μία πρόταση)", max_length=200)
    problem = models.TextField("Πρόβλημα (με πηγή ή δεδομένο)", validators=[MaxWords(150)])
    action = models.TextField("Πρόταση (τι αλλάζει και ποιος το υλοποιεί)", validators=[MaxWords(150)])
    legal = models.TextField("Νομικό πλαίσιο", validators=[MaxWords(150)])
    cost = models.TextField("Κόστος και χρηματοδότηση", validators=[MaxWords(150)])
    tradeoffs = models.TextField("Αντισταθμίσματα (ποιος χάνει ή τι θυσιάζεται)", validators=[MaxWords(150)])
    timeline = models.TextField("Χρονοδιάγραμμα", validators=[MaxWords(150)])
    metric = models.TextField("Μέτρο επιτυχίας", validators=[MaxWords(150)])
    source = models.URLField("Πηγή τεκμηρίωσης (σύνδεσμος)")
    created_at = models.DateTimeField(default=timezone.now)
    removed = models.BooleanField("Αφαιρέθηκε", default=False)
    moderation_note = models.TextField("Αιτιολόγηση αφαίρεσης (δημόσια)", blank=True)
    report_count = models.PositiveIntegerField(default=0, editable=False)

    FIELDS = Proposal.FIELDS

    class Meta:
        constraints = [models.UniqueConstraint(fields=["author", "topic"], name="one_citizen_proposal_per_topic")]
        verbose_name = "Πρόταση πολίτη"
        verbose_name_plural = "Προτάσεις πολιτών"

    def __str__(self):
        return f"{self.author}: {self.title}"

    @property
    def sections(self):
        return [(label, getattr(self, name)) for name, label in self.FIELDS]


class PartyPerson(models.Model):
    """Δομημένο βιογραφικό προσώπου: σταθερά πεδία με όρια, ώστε να μη γράφει ο καθένας ό,τι και όπως θέλει."""

    OFFICE_NONE = "none"
    OFFICE_HELD = "held"
    OFFICE_PARTY = "party"
    OFFICE_CHOICES = [
        (OFFICE_NONE, "Δεν έχω ασκήσει δημόσιο αξίωμα ή θέση σε κόμμα"),
        (OFFICE_HELD, "Έχω ασκήσει δημόσιο αξίωμα (π.χ. βουλευτής, δήμαρχος)"),
        (OFFICE_PARTY, "Έχω θέση ή θητεία σε άλλο κόμμα"),
    ]

    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="people")
    name = models.CharField("Όνομα", max_length=120)
    occupation = models.CharField("Επάγγελμα ή ιδιότητα", max_length=80, blank=True)
    education = models.CharField("Εκπαίδευση", max_length=160, blank=True)
    experience = models.CharField("Σχετική επαγγελματική ή κοινωνική εμπειρία", max_length=200, blank=True)
    public_office = models.CharField("Προηγούμενη δημόσια ή κομματική θητεία", max_length=8, choices=OFFICE_CHOICES, default=OFFICE_NONE)
    office_details = models.CharField("Ποια και πότε (αν ισχύει)", max_length=200, blank=True)
    motivation = models.CharField("Γιατί συμμετέχω (μία πρόταση)", max_length=200, blank=True)
    social_url = models.URLField("Σύνδεσμος σε κοινωνικό δίκτυο", blank=True)

    FIELDS = ["occupation", "education", "experience", "public_office", "office_details", "motivation", "social_url"]

    class Meta:
        unique_together = [("party", "name")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.party})"

    @property
    def social_key(self):
        from urllib.parse import urlparse

        host = (urlparse(self.social_url).hostname or "").lower()
        for key, _label, hosts in Party.SOCIALS:
            if any(host == h or host.endswith("." + h) for h in hosts):
                return key
        return "link"

    @property
    def has_content(self):
        return any([self.occupation, self.education, self.experience, self.motivation,
                    self.public_office != self.OFFICE_NONE, self.social_url])


class PartyVideo(models.Model):
    """Επιλεγμένο βίντεο YouTube που το κόμμα προωθεί στην καρτέλα του (έως 4). Μόνο σύνδεσμος, χωρίς ενσωμάτωση τρίτων."""

    MAX = 4
    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="videos")
    url = models.URLField("Σύνδεσμος YouTube")
    title = models.CharField("Τίτλος", max_length=100)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "pk"]

    def __str__(self):
        return f"{self.title} ({self.party})"
