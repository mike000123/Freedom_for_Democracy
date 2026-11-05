from django import forms

from .models import PrefOption, PartyPerson, PartyVideo, CitizenProfile, CitizenProposal, Comment, MaxWords, Party, PartyApplication, Proposal


class _GuardedForm(forms.Form):
    # Honeypot: κρυμμένο πεδίο που οι άνθρωποι δεν συμπληρώνουν
    website = forms.CharField(
        required=False,
        label="Μην συμπληρώσετε αυτό το πεδίο",
        widget=forms.TextInput(attrs={"class": "hp", "tabindex": "-1", "autocomplete": "off"}),
    )
    captcha = forms.CharField(label="Επαλήθευση", max_length=4)


class CommentForm(_GuardedForm):
    kind = forms.ChoiceField(label="Τύπος σχολίου", choices=[])
    pseudonym = forms.CharField(label="Ψευδώνυμο", max_length=40)
    body = forms.CharField(
        label="Κείμενο (έως 1.000 χαρακτήρες)",
        max_length=1000,
        widget=forms.Textarea(attrs={"rows": 5}),
    )

    field_order = ["kind", "pseudonym", "body", "captcha", "website"]

    def __init__(self, *args, kinds=None, **kwargs):
        super().__init__(*args, **kwargs)
        kinds = kinds or Comment.KINDS
        self.fields["kind"].choices = [(k, label) for k, label in Comment.KINDS if k in kinds]
        if len(self.fields["kind"].choices) == 1:
            self.fields["kind"].widget = forms.HiddenInput()
            self.fields["kind"].initial = self.fields["kind"].choices[0][0]


class QuestionForm(_GuardedForm):
    pseudonym = forms.CharField(label="Ψευδώνυμο", max_length=40)
    body = forms.CharField(
        label="Το ερώτημά σας (έως 150 λέξεις, ένα ερώτημα ανά ανάρτηση)",
        max_length=1500,
        validators=[MaxWords(150)],
        widget=forms.Textarea(attrs={"rows": 4}),
    )

    field_order = ["pseudonym", "body", "captcha", "website"]


class LoginForm(forms.Form):
    email = forms.CharField(label="Email ή όνομα χρήστη", max_length=150, widget=forms.TextInput(attrs={"autocomplete": "username"}))
    password = forms.CharField(label="Κωδικός", widget=forms.PasswordInput)


class TotpForm(forms.Form):
    code = forms.CharField(
        label="Κωδικός 6 ψηφίων από την εφαρμογή ταυτοποίησης",
        max_length=7,
        widget=forms.TextInput(attrs={"inputmode": "numeric", "autocomplete": "one-time-code"}),
    )


class ProfileForm(forms.ModelForm):
    """Τα πεδία που επεξεργάζεται το ίδιο το κόμμα. Υπεύθυνα πρόσωπα, είδος, βαθμίδα
    και δημοσίευση ορίζονται μόνο από τη διαχείριση, μετά από έλεγχο."""

    class Meta:
        model = Party
        fields = ["slogan", "founded_year", "founders", "founders_prior_service", "funding", "website",
                  "facebook", "instagram", "x_url", "youtube", "tiktok", "linkedin", "image"]
        widgets = {
            "founders": forms.Textarea(attrs={"rows": 3}),
            "funding": forms.Textarea(attrs={"rows": 3}),
        }

    MAX_IMAGE_BYTES = 2 * 1024 * 1024

    def _clean_social(self, field, hosts):
        from urllib.parse import urlparse

        url = (self.cleaned_data.get(field) or "").strip()
        if not url:
            return ""
        u = urlparse(url)
        host = (u.hostname or "").lower()
        if u.scheme != "https" or not any(host == h or host.endswith("." + h) for h in hosts):
            raise forms.ValidationError("Δώστε έγκυρο σύνδεσμο https από την αντίστοιχη υπηρεσία.")
        return url

    def clean_facebook(self):
        return self._clean_social("facebook", ("facebook.com", "fb.com", "fb.me"))

    def clean_instagram(self):
        return self._clean_social("instagram", ("instagram.com",))

    def clean_x_url(self):
        return self._clean_social("x_url", ("x.com", "twitter.com"))

    def clean_youtube(self):
        return self._clean_social("youtube", ("youtube.com", "youtu.be"))

    def clean_tiktok(self):
        return self._clean_social("tiktok", ("tiktok.com",))

    def clean_linkedin(self):
        return self._clean_social("linkedin", ("linkedin.com",))

    def clean_image(self):
        """Έλεγχος τύπου και μεγέθους. Η εικόνα ξαναγράφεται από την αρχή: αφαιρεί EXIF/τοποθεσία και τυχόν ενσωματωμένο περιεχόμενο."""
        img = self.cleaned_data.get("image")
        if not img or not hasattr(img, "content_type"):  # καμία νέα μεταφόρτωση ή διαγραφή
            return img
        if img.size > self.MAX_IMAGE_BYTES:
            raise forms.ValidationError("Η εικόνα ξεπερνά τα 2 MB.")
        import io
        import uuid

        from django.core.files.base import ContentFile
        from PIL import Image

        try:
            pic = Image.open(img)
            fmt = pic.format
            pic.load()
        except Exception:
            raise forms.ValidationError("Το αρχείο δεν είναι έγκυρη εικόνα.")
        if fmt not in ("JPEG", "PNG", "WEBP"):
            raise forms.ValidationError("Επιτρέπονται μόνο JPG, PNG ή WebP.")
        pic.thumbnail((1600, 1200))
        if fmt == "JPEG" and pic.mode not in ("RGB", "L"):
            pic = pic.convert("RGB")
        buf = io.BytesIO()
        pic.save(buf, format=fmt)  # χωρίς exif: δεν περνούν μεταδεδομένα
        ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[fmt]
        return ContentFile(buf.getvalue(), name=f"{uuid.uuid4().hex}.{ext}")


class ProposalForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["source"].required = True
        self.fields["stance"].queryset = PrefOption.objects.select_related("question__topic")
        self.fields["stance"].label_from_instance = lambda o: f"{o.question.topic.name}: {o.text}"
        self.fields["stance"].help_text = ("Το ερωτηματολόγιο προτιμήσεων δείχνει στους επισκέπτες τις προτάσεις που ταιριάζουν "
                                           "με την απάντησή τους. Διάλεξε την απάντηση του ίδιου θέματος που ταιριάζει στην πρότασή σου.")

    def clean(self):
        data = super().clean()
        stance, topic = data.get("stance"), data.get("topic")
        if stance and topic and stance.question.topic_id != topic.pk:
            self.add_error("stance", "Η απάντηση πρέπει να ανήκει στο ίδιο θέμα με την πρόταση.")
        return data

    class Meta:
        model = Proposal
        fields = ["topic", "title", "problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric", "source", "stance", "is_published"]
        widgets = {name: forms.Textarea(attrs={"rows": 4}) for name in
                   ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}
        help_texts = {name: "Έως 150 λέξεις." for name in
                      ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}


class ApplicationForm(forms.ModelForm):
    captcha = forms.CharField(label="Επαλήθευση", max_length=10)
    website_url = forms.CharField(required=False, label="", widget=forms.TextInput(attrs={"tabindex": "-1", "autocomplete": "off"}))

    class Meta:
        model = PartyApplication
        fields = ["name", "kind", "responsible_persons", "contact_email", "elections_statement", "website"]
        widgets = {
            "responsible_persons": forms.Textarea(attrs={"rows": 3}),
            "elections_statement": forms.Textarea(attrs={"rows": 4}),
        }

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        if Party.objects.filter(name__iexact=name).exists():
            raise forms.ValidationError("Υπάρχει ήδη κόμμα ή ομάδα με αυτή την επωνυμία.")
        return name


class RegisterForm(_GuardedForm):
    email = forms.EmailField(label="Email (θα σταλεί σύνδεσμος επιβεβαίωσης)")
    kind = forms.ChoiceField(label="Τύπος λογαριασμού", choices=CitizenProfile.KINDS, initial=CitizenProfile.PERSON, widget=forms.RadioSelect)
    display_name = forms.CharField(label="Όνομα που εμφανίζεται δημόσια (ψευδώνυμο, ή όνομα καναλιού/εκπομπής/ομάδας)", max_length=40)
    org_type = forms.ChoiceField(label="Είδος (μόνο για κανάλι, εκπομπή ή ομάδα)", choices=[("", "—")] + CitizenProfile.ORG_TYPES, required=False)
    contact_person = forms.CharField(label="Πρόσωπο επικοινωνίας (μόνο για κανάλι, εκπομπή ή ομάδα· δεν δημοσιεύεται)", max_length=120, required=False)
    password1 = forms.CharField(label="Κωδικός", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Επανάληψη κωδικού", widget=forms.PasswordInput)
    consent = forms.BooleanField(label="Συμφωνώ με την επεξεργασία των στοιχείων μου όπως περιγράφεται στην πολιτική απορρήτου")

    field_order = ["email", "kind", "display_name", "org_type", "contact_person", "password1", "password2", "consent", "captcha", "website"]

    def clean_email(self):
        return self.cleaned_data["email"].strip().lower()

    def clean_display_name(self):
        name = self.cleaned_data["display_name"].strip()
        if CitizenProfile.objects.filter(display_name__iexact=name).exists() or Party.objects.filter(name__iexact=name).exists():
            raise forms.ValidationError("Αυτό το όνομα χρησιμοποιείται ήδη. Διαλέξτε άλλο.")
        return name

    def clean(self):
        data = super().clean()
        if data.get("kind") == CitizenProfile.ORG:
            if not data.get("org_type"):
                self.add_error("org_type", "Επιλέξτε είδος.")
            if not (data.get("contact_person") or "").strip():
                self.add_error("contact_person", "Το πρόσωπο επικοινωνίας είναι υποχρεωτικό για κανάλια, εκπομπές και ομάδες.")
        else:
            data["org_type"], data["contact_person"] = "", ""
        p1, p2 = data.get("password1"), data.get("password2")
        if p1 and p2:
            if p1 != p2:
                self.add_error("password2", "Οι κωδικοί δεν ταιριάζουν.")
            else:
                from django.contrib.auth.password_validation import validate_password

                try:
                    validate_password(p1)
                except forms.ValidationError as e:
                    self.add_error("password1", e)
        return data


class CitizenProposalForm(forms.ModelForm):
    class Meta:
        model = CitizenProposal
        fields = ["title", "problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric", "source"]
        widgets = {n: forms.Textarea(attrs={"rows": 4}) for n in ["problem", "action", "legal", "cost", "tradeoffs", "timeline", "metric"]}


class DeleteAccountForm(forms.Form):
    password = forms.CharField(label="Κωδικός (για επιβεβαίωση διαγραφής)", widget=forms.PasswordInput)


class PeopleForm(forms.Form):
    """Δυναμική φόρμα: τα ίδια δομημένα πεδία για κάθε όνομα της καρτέλας."""

    def __init__(self, *args, party, **kwargs):
        super().__init__(*args, **kwargs)
        self.party = party
        existing = {p.name: p for p in party.people.all()}
        self.names = []
        for n in dict.fromkeys(party.person_list + party.founder_list):
            i = len(self.names)
            self.names.append((i, n))
            p = existing.get(n)
            init = lambda f, d="": getattr(p, f) if p else d
            self.fields[f"occupation{i}"] = forms.CharField(label="Επάγγελμα ή ιδιότητα", max_length=80, required=False, initial=init("occupation"))
            self.fields[f"education{i}"] = forms.CharField(label="Εκπαίδευση", max_length=160, required=False, initial=init("education"),
                                                           help_text="π.χ. Διδακτορικό Μηχανικής, ΕΜΠ")
            self.fields[f"experience{i}"] = forms.CharField(label="Σχετική εμπειρία", max_length=200, required=False, initial=init("experience"))
            self.fields[f"office{i}"] = forms.ChoiceField(label="Προηγούμενη δημόσια ή κομματική θητεία", choices=PartyPerson.OFFICE_CHOICES,
                                                          initial=init("public_office", PartyPerson.OFFICE_NONE), widget=forms.RadioSelect)
            self.fields[f"office_details{i}"] = forms.CharField(label="Ποια και πότε (αν ισχύει)", max_length=200, required=False, initial=init("office_details"))
            self.fields[f"motivation{i}"] = forms.CharField(label="Γιατί συμμετέχω (μία πρόταση)", max_length=200, required=False, initial=init("motivation"))
            self.fields[f"url{i}"] = forms.URLField(label="Σύνδεσμος σε κοινωνικό δίκτυο (https)", required=False, initial=init("social_url"))

    def clean(self):
        data = super().clean()
        for i, _ in self.names:
            url = (data.get(f"url{i}") or "").strip()
            if url and not url.startswith("https://"):
                self.add_error(f"url{i}", "Επιτρέπονται μόνο σύνδεσμοι https.")
            if data.get(f"office{i}") not in (None, PartyPerson.OFFICE_NONE) and not (data.get(f"office_details{i}") or "").strip():
                self.add_error(f"office_details{i}", "Δηλώστε ποια θητεία και πότε.")
        return data

    def values(self, i):
        d = self.cleaned_data
        return {
            "occupation": d.get(f"occupation{i}", "").strip(), "education": d.get(f"education{i}", "").strip(),
            "experience": d.get(f"experience{i}", "").strip(), "public_office": d.get(f"office{i}", PartyPerson.OFFICE_NONE),
            "office_details": d.get(f"office_details{i}", "").strip(), "motivation": d.get(f"motivation{i}", "").strip(),
            "social_url": d.get(f"url{i}", "").strip(),
        }

    def rows(self):
        return [(n, [self[f"{k}{i}"] for k in ("occupation", "education", "experience", "office", "office_details", "motivation", "url")]) for i, n in self.names]


class VideosForm(forms.Form):
    """Έως 4 βίντεο YouTube με τίτλο. Κενή γραμμή = χωρίς βίντεο."""

    HOSTS = ("youtube.com", "youtu.be", "youtube-nocookie.com")

    def __init__(self, *args, party, **kwargs):
        super().__init__(*args, **kwargs)
        existing = list(party.videos.all())
        for i in range(PartyVideo.MAX):
            v = existing[i] if i < len(existing) else None
            self.fields[f"url{i}"] = forms.URLField(label="Σύνδεσμος βίντεο YouTube (https)", required=False, initial=v.url if v else "")
            self.fields[f"title{i}"] = forms.CharField(label="Τίτλος (έως 100 χαρακτήρες)", max_length=100, required=False, initial=v.title if v else "")

    def clean(self):
        from urllib.parse import urlparse

        data = super().clean()
        for i in range(PartyVideo.MAX):
            url = (data.get(f"url{i}") or "").strip()
            title = (data.get(f"title{i}") or "").strip()
            if not url and not title:
                continue
            host = (urlparse(url).hostname or "").lower()
            if not url or urlparse(url).scheme != "https" or not any(host == h or host.endswith("." + h) for h in self.HOSTS):
                self.add_error(f"url{i}", "Δώστε σύνδεσμο https από το YouTube.")
            if not title:
                self.add_error(f"title{i}", "Δώστε τίτλο για το βίντεο.")
        return data

    def items(self):
        out = []
        for i in range(PartyVideo.MAX):
            url = (self.cleaned_data.get(f"url{i}") or "").strip()
            title = (self.cleaned_data.get(f"title{i}") or "").strip()
            if url and title:
                out.append((url, title))
        return out

    def rows(self):
        return [(i + 1, self[f"url{i}"], self[f"title{i}"]) for i in range(PartyVideo.MAX)]
